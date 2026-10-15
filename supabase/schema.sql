-- GisingLang backend schema (Supabase / Postgres)
--
-- This is a documentation snapshot of the LIVE schema on the
-- "Gising_lang" Supabase project (zvlinehtobbxatpclahj), pulled directly
-- from the database on 2026-09-22 via introspection (pg_policies,
-- pg_get_functiondef, pg_get_triggerdef) - not from the older, now-stale
-- supabase_schema.sql / supabase_schema_contacts.sql files in the main
-- GisingLang repo, which predate several migrations (devices table,
-- sms_logs, the COMBINED-alert SMS trigger, and auto-linking to Supabase
-- Auth) and no longer match reality.
--
-- This file is NOT meant to be run against a fresh project as-is (Supabase
-- Auth's auth.users table and the vault secrets it references must exist
-- first). It exists so the schema is versioned and reviewable alongside
-- the driver PWA that depends on it, and so a fresh project can be
-- reconstructed by working through it top to bottom. Migration history
-- (in order) lives in Supabase itself:
--   20260821183937 link_auth_add_devices_and_rls
--   20260821184009 add_admin_role_policies
--   20260821195104 enable_realtime_on_events
--   20260821202809 add_sms_tracking
--   20260828053541 enable_pg_net_for_sms_trigger
--   20260828053603 combined_alert_sms_trigger
--   20260828064152 derive_event_owner_from_device
--
-- =============================================================================
-- TABLES
-- =============================================================================

-- Driver / Administrator profile, one row per Supabase Auth user.
-- New signups default to role='Driver' via the handle_new_user() trigger
-- below - promote someone to Administrator manually:
--   update users set role = 'Administrator' where user_id = '<uuid>';
create table public.users (
    user_id     uuid primary key default gen_random_uuid()
                references auth.users(id),
    role        text not null check (role in ('Driver', 'Administrator')),
    email       text unique,
    display_name varchar(255),
    created_at  timestamptz not null default now()
);

-- One row per physical Raspberry Pi unit. unit_label is what live_demo_pi.py
-- / cloud_logger.py send as device_id when logging events (NOT this table's
-- own uuid device_id) - see attach_event_owner() below for how the two are
-- reconciled.
create table public.devices (
    device_id        uuid primary key default gen_random_uuid(),
    unit_label       varchar unique not null,
    user_id          uuid references public.users(user_id),
    firmware_version varchar default 'v1.0.0',
    status           varchar default 'Active'
                     check (status in ('Active', 'Inactive', 'Pending')),
    last_seen_at     timestamptz,
    registered_at    timestamptz default now()
);

-- One row per classified frame event from the Pi (CloudLogger's payload).
-- user_id is nullable at insert time - the Pi only knows its own
-- unit_label, not which Supabase user that maps to; attach_event_owner()
-- fills it in from devices before the row lands.
create table public.drowsiness_events (
    id               uuid primary key default gen_random_uuid(),
    device_id        text not null,               -- the Pi's unit_label, not devices.device_id
    event_timestamp  timestamptz not null,
    alert_level      text not null
                     check (alert_level in ('NONE', 'LAYER1', 'LAYER2', 'COMBINED')),
    ear_value        numeric not null,
    perclos_value    numeric not null,
    pitch            numeric not null,
    yaw              numeric not null,
    roll             numeric not null,
    user_id          uuid references public.users(user_id),
    sms_sent         boolean not null default false,
    created_at       timestamptz not null default now()
);

-- FR10: per-driver emergency contacts, notified on COMBINED alerts.
create table public.emergency_contacts (
    contact_id    uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.users(user_id) on delete cascade,
    name          varchar(255) not null,
    phone_number  varchar(20) not null,
    relationship  varchar(100),
    created_at    timestamptz not null default now(),
    is_active     boolean not null default true
);

-- Audit trail for every SMS attempt the COMBINED-alert trigger fires,
-- regardless of outcome (sent / failed / skipped_stale / skipped_no_contacts).
create table public.sms_logs (
    sms_id               uuid primary key default gen_random_uuid(),
    event_id             uuid references public.drowsiness_events(id),
    contact_id           uuid references public.emergency_contacts(contact_id),
    phone_number         varchar not null,
    message              text not null,
    status               varchar not null default 'pending'
                         check (status in ('pending', 'sent', 'failed', 'skipped_stale', 'skipped_no_contacts', 'skipped_cooldown')),
    provider             varchar default 'semaphore',
    provider_message_id  varchar,
    provider_response    text,
    latency_ms           integer,
    created_at           timestamptz not null default now()
);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Every table is RLS-enabled. Two access paths exist throughout:
--   1. The Pi and the SMS edge function use the service_role key, which
--      bypasses RLS entirely - never ship that key in the PWA or dashboard.
--   2. The Driver PWA and Admin dashboard use the publishable/anon key and
--      go through these policies, keyed off auth.uid() and is_admin().

alter table public.users               enable row level security;
alter table public.devices             enable row level security;
alter table public.drowsiness_events   enable row level security;
alter table public.emergency_contacts  enable row level security;
alter table public.sms_logs            enable row level security;

create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.users
    where user_id = auth.uid() and role = 'Administrator'
  );
$function$;

-- users
create policy "users can view own profile" on public.users
    for select using (auth.uid() = user_id);
create policy "users can update own profile" on public.users
    for update using (auth.uid() = user_id);
create policy "admins view all profiles" on public.users
    for select using (is_admin());

-- devices
create policy "drivers view own devices" on public.devices
    for select using (auth.uid() = user_id);
create policy "drivers update own devices" on public.devices
    for update using (auth.uid() = user_id);
create policy "admins manage all devices" on public.devices
    for all using (is_admin()) with check (is_admin());

-- drowsiness_events
create policy "drivers view own events" on public.drowsiness_events
    for select using (auth.uid() = user_id);
create policy "admins view all events" on public.drowsiness_events
    for select using (is_admin());

-- emergency_contacts
create policy "drivers manage own contacts" on public.emergency_contacts
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admins view all contacts" on public.emergency_contacts
    for select using (is_admin());

-- sms_logs
create policy "drivers view own sms logs" on public.sms_logs
    for select using (
        exists (
            select 1 from public.drowsiness_events e
            where e.id = sms_logs.event_id and e.user_id = auth.uid()
        )
    );
create policy "admins view all sms logs" on public.sms_logs
    for select using (is_admin());

-- =============================================================================
-- TRIGGERS / FUNCTIONS
-- =============================================================================

-- Every new Supabase Auth signup gets a matching public.users row,
-- defaulting to role='Driver'. Promote admins manually (see note above).
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.users (user_id, role, email)
  values (new.id, 'Driver', new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- The Pi only knows its own unit_label (drowsiness_events.device_id, a
-- text field), not the Supabase user_id that owns it. This fills in
-- user_id from devices.unit_label before the row is committed, which is
-- exactly why a Driver who signs in and sees no data usually means their
-- device isn't assigned to them yet in the devices table (see the driver
-- PWA's README, "Why a Driver account shows nothing at first").
create or replace function public.attach_event_owner()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.user_id is null and new.device_id is not null then
    select d.user_id into new.user_id
      from public.devices d
     where d.unit_label = new.device_id;
  end if;
  return new;
end;
$function$;

create trigger set_event_owner
    before insert on public.drowsiness_events
    for each row execute function public.attach_event_owner();

-- Fires the SMS edge function on every COMBINED-alert insert. The function
-- URL and a shared webhook secret are read from Supabase Vault
-- (gisinglang_sms_function_url, gisinglang_webhook_secret) rather than
-- hardcoded, so they can be rotated without a migration. A missing/
-- misconfigured secret logs a warning and lets the event insert succeed
-- anyway - losing the SMS is bad, losing the drowsiness record is worse.
create or replace function public.notify_combined_event()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  fn_url text;
  secret text;
begin
  if new.alert_level is distinct from 'COMBINED' then
    return new;
  end if;

  begin
    select decrypted_secret into fn_url
      from vault.decrypted_secrets where name = 'gisinglang_sms_function_url';
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'gisinglang_webhook_secret';
  exception when others then
    raise warning 'notify_combined_event: could not read vault secrets: %', sqlerrm;
    return new;
  end;

  if fn_url is null or secret is null then
    raise warning 'notify_combined_event: vault secrets not configured, skipping SMS';
    return new;
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', secret
               ),
    body    := jsonb_build_object('record', to_jsonb(new)),
    timeout_milliseconds := 8000
  );

  return new;
end;
$function$;

create trigger on_combined_event
    after insert on public.drowsiness_events
    for each row
    when (new.alert_level = 'COMBINED')
    execute function public.notify_combined_event();

-- =============================================================================
-- INDEXES
-- =============================================================================

create index idx_drowsiness_events_device_id
    on public.drowsiness_events (device_id, event_timestamp desc);

create index idx_emergency_contacts_user_id
    on public.emergency_contacts (user_id)
    where is_active = true;

-- Realtime is enabled on drowsiness_events (migration
-- enable_realtime_on_events) so the admin dashboard / driver PWA can
-- subscribe to new events live instead of polling.
