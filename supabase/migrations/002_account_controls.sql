-- Apply after schema.sql, including on projects that already have the Phase 1 schema.
-- Safe to re-run. No service-role key is needed in the application.
begin;

-- One RPC = one transaction. A bad shift/profile rolls the entire import back.
-- SECURITY INVOKER preserves table grants and per-user row-level security.
create or replace function public.fleet_import_record(records jsonb, imported_profile jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  item jsonb;
  saved jsonb;
  new_id uuid;
  added jsonb := '[]'::jsonb;
  skipped integer := 0;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if records is null or jsonb_typeof(records) <> 'array' then raise exception 'Expected a shift array'; end if;
  if jsonb_array_length(records) > 5000 or octet_length(records::text) > 5242880 then raise exception 'Import is too large'; end if;
  for item in select value from jsonb_array_elements(records) loop
    if jsonb_typeof(item) <> 'object' then raise exception 'Invalid shift object'; end if;
    new_id := gen_random_uuid();
    item := jsonb_set(item, '{id}', to_jsonb(new_id::text));
    saved := null;
    insert into public.shifts (id, user_id, data) values (new_id, owner_id, item)
      on conflict (user_id, (data->>'date'), (data->>'time'), (data->>'platform')) do nothing
      returning data into saved;
    if saved is null then skipped := skipped + 1;
    else added := added || jsonb_build_array(saved); end if;
  end loop;
  if imported_profile is not null then
    insert into public.profiles(id, data) values (owner_id, imported_profile)
      on conflict (id) do update set data = excluded.data;
  end if;
  return jsonb_build_object('added', added, 'skipped', skipped);
end;
$$;
revoke all on function public.fleet_import_record(jsonb, jsonb) from public, anon;
grant execute on function public.fleet_import_record(jsonb, jsonb) to authenticated;

-- Privileged account deletion. It accepts NO target user ID, uses an empty
-- search_path, requires the authenticated caller's recent PASSWORD proof from
-- the signed Supabase JWT, and deletes only that caller's auth.users row.
-- Auth/profile/shift cascades remove live data and refresh sessions atomically.
create or replace function public.fleet_delete_my_account(confirmation text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if confirmation is distinct from 'DELETE MY ACCOUNT' then raise exception 'Explicit confirmation required'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) as proof
    where proof->>'method' = 'password'
      and (proof->>'timestamp')::numeric between extract(epoch from now()) - 300 and extract(epoch from now()) + 30
  ) then raise exception 'Sign in with your password again before deleting your account'; end if;
  delete from auth.users where id = owner_id;
  if not found then raise exception 'Account no longer exists'; end if;
end;
$$;
revoke all on function public.fleet_delete_my_account(text) from public, anon;
grant execute on function public.fleet_delete_my_account(text) to authenticated;
commit;
