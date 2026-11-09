-- =============================================================================
-- Panel revisions (Nov 2026): adjustable alert strength + driver location in SMS
-- Run once in Supabase > SQL Editor (safe to run again).
-- =============================================================================

-- 1. Alert strength chosen in the driver app, read by the Pi's start-mode agent.
alter table public.devices
  add column if not exists vibration_level text not null default 'high'
      check (vibration_level in ('low','medium','high')),
  add column if not exists buzzer_level text not null default 'medium'
      check (buzzer_level in ('low','medium','high'));

create or replace function public.set_alert_levels(p_vibration text default null, p_buzzer text default null)
returns public.devices
language plpgsql security definer set search_path = public as $$
declare r public.devices;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_vibration is not null and p_vibration not in ('low','medium','high') then raise exception 'invalid vibration level'; end if;
  if p_buzzer is not null and p_buzzer not in ('low','medium','high') then raise exception 'invalid sound level'; end if;
  update public.devices
     set vibration_level = coalesce(p_vibration, vibration_level),
         buzzer_level    = coalesce(p_buzzer, buzzer_level)
   where user_id = auth.uid()
  returning * into r;
  if r.device_id is null then raise exception 'no device is assigned to this account'; end if;
  return r;
end $$;
revoke all on function public.set_alert_levels(text, text) from public, anon;
grant execute on function public.set_alert_levels(text, text) to authenticated;

-- 2. Location on each event. 'gps' = GPS module on the Pi, 'phone' = the driver
--    app's last shared phone location. Events are already driver-only (RLS), so
--    administrators never see locations.
alter table public.drowsiness_events
  add column if not exists latitude        double precision,
  add column if not exists longitude       double precision,
  add column if not exists location_at     timestamptz,
  add column if not exists location_source text check (location_source in ('gps','phone'));

-- 3. The phone's latest location, kept in its own driver-only table (NOT on
--    devices, which administrators can read).
create table if not exists public.driver_locations (
  user_id     uuid primary key references public.users(user_id) on delete cascade,
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  accuracy_m  double precision,
  updated_at  timestamptz not null default now()
);
alter table public.driver_locations enable row level security;
drop policy if exists "drivers manage own location" on public.driver_locations;
create policy "drivers manage own location" on public.driver_locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.update_phone_location(p_lat double precision, p_lng double precision, p_accuracy double precision default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.driver_locations (user_id, latitude, longitude, accuracy_m, updated_at)
  values (auth.uid(), p_lat, p_lng, p_accuracy, now())
  on conflict (user_id) do update
    set latitude = excluded.latitude, longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m, updated_at = now();
end $$;
revoke all on function public.update_phone_location(double precision, double precision, double precision) from public, anon;
grant execute on function public.update_phone_location(double precision, double precision, double precision) to authenticated;

-- 4. Fill an event's location from the phone when the Pi had no GPS fix.
--    Runs after set_event_owner (triggers fire in name order), so user_id is known.
--    Only locations shared in the last 30 minutes are used.
create or replace function public.attach_event_location()
returns trigger language plpgsql security definer set search_path = public as $$
declare loc public.driver_locations;
begin
  if new.latitude is null and new.user_id is not null then
    select * into loc from public.driver_locations
     where user_id = new.user_id and updated_at > now() - interval '30 minutes';
    if found then
      new.latitude := loc.latitude;
      new.longitude := loc.longitude;
      new.location_at := loc.updated_at;
      new.location_source := 'phone';
    end if;
  elsif new.latitude is not null and new.location_source is null then
    new.location_source := 'gps';
  end if;
  return new;
end $$;

drop trigger if exists set_event_owner_location on public.drowsiness_events;
create trigger set_event_owner_location
  before insert on public.drowsiness_events
  for each row execute function public.attach_event_location();
