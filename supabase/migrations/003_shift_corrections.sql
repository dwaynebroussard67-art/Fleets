-- Apply after schema.sql and 002_account_controls.sql. Safe to re-run.
begin;

-- Keep direct table UPDATE revoked. Only this guarded RPC can correct a shift.
-- A complete snapshot is compared while holding a row lock, so two browser
-- sessions cannot silently replace one another's work. Old notes are not retained
-- in an audit table; users can deliberately correct or remove their private text.
create or replace function public.fleet_update_shift(shift_id uuid, expected_data jsonb, replacement_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_data jsonb;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  select data into current_data from public.shifts
    where id = shift_id and user_id = caller for update;
  if not found then raise exception 'FLEET_SHIFT_UNAVAILABLE'; end if;
  if jsonb_typeof(replacement_data) is distinct from 'object'
    or replacement_data->>'id' is distinct from shift_id::text
    then raise exception 'Invalid replacement shift'; end if;
  -- A retry after a lost response may already have saved this exact correction.
  if current_data = replacement_data then return current_data; end if;
  if current_data is distinct from expected_data then raise exception 'FLEET_SHIFT_CONFLICT'; end if;
  update public.shifts set data = replacement_data where id = shift_id and user_id = caller
    returning data into current_data;
  return current_data;
end;
$$;
revoke all on function public.fleet_update_shift(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.fleet_update_shift(uuid, jsonb, jsonb) to authenticated;
-- Defense in depth if a deployment's default grants were broader than Phase 1.
revoke update on public.shifts from authenticated, anon;
commit;
