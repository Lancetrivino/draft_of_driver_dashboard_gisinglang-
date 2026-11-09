-- =============================================================================
-- "Test alert" button: lets the driver feel/hear the chosen strength.
-- Run in Supabase > SQL Editor AFTER migration_panel_revisions.sql (safe to re-run).
-- =============================================================================
alter table public.devices
  add column if not exists test_kind text check (test_kind in ('vibration','sound')),
  add column if not exists test_requested_at timestamptz;

create or replace function public.request_alert_test(p_kind text)
returns public.devices
language plpgsql security definer set search_path = public as $$
declare r public.devices;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_kind not in ('vibration','sound') then raise exception 'invalid test'; end if;
  update public.devices
     set test_kind = p_kind, test_requested_at = now()
   where user_id = auth.uid()
  returning * into r;
  if r.device_id is null then raise exception 'no device is assigned to this account'; end if;
  return r;
end $$;
revoke all on function public.request_alert_test(text) from public, anon;
grant execute on function public.request_alert_test(text) to authenticated;
