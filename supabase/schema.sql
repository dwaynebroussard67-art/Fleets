-- Run once in a new Supabase project's SQL editor.
-- Then apply migrations/002_account_controls.sql and 003_shift_corrections.sql in order.
-- Existing projects only need migrations not already applied.
-- Only the public (anon/publishable) key belongs in the browser. No service key needed.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  constraint profile_required check (data ?& array['name','city','bio','reliability','safety','rating','contributions','priorDeliveries']),
  constraint profile_types check (
    jsonb_typeof(data->'name') = 'string' and jsonb_typeof(data->'city') = 'string' and jsonb_typeof(data->'bio') = 'string'
    and jsonb_typeof(data->'reliability') in ('number','null') and jsonb_typeof(data->'safety') in ('number','null')
    and jsonb_typeof(data->'rating') in ('number','null') and jsonb_typeof(data->'contributions') = 'number'
    and jsonb_typeof(data->'priorDeliveries') = 'number'
  ),
  constraint profile_name check (length(trim(data->>'name')) between 1 and 60),
  constraint profile_reliability check ((data->>'reliability')::numeric between 0 and 100),
  constraint profile_safety check ((data->>'safety')::numeric between 0 and 100),
  constraint profile_rating check ((data->>'rating')::numeric between 0 and 5),
  constraint profile_contributions check ((data->>'contributions')::numeric between 0 and 100000 and (data->>'contributions')::numeric = trunc((data->>'contributions')::numeric)),
  constraint profile_experience check ((data->>'priorDeliveries')::numeric between 0 and 1000000 and (data->>'priorDeliveries')::numeric = trunc((data->>'priorDeliveries')::numeric)),
  constraint profile_city check (length(data->>'city') <= 80),
  constraint profile_bio check (length(data->>'bio') <= 500)
);

create table public.shifts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  constraint shift_id_matches check (data->>'id' = id::text),
  constraint shift_fields_required check (data ?& array['id','date','time','platform','duration','deliveries','earnings','note','recognition']),
  constraint shift_types check (
    jsonb_typeof(data->'id') = 'string' and jsonb_typeof(data->'date') = 'string' and jsonb_typeof(data->'time') = 'string'
    and jsonb_typeof(data->'platform') = 'string' and jsonb_typeof(data->'duration') = 'number'
    and jsonb_typeof(data->'deliveries') = 'number' and jsonb_typeof(data->'earnings') = 'number'
    and jsonb_typeof(data->'note') = 'string' and jsonb_typeof(data->'recognition') = 'string'
  ),
  constraint shift_real_date check ((data->>'date')::date <= current_date + 1),
  constraint shift_platform check (data->>'platform' in ('DoorDash','Uber Eats','Instacart','Uber','Lyft','Other')),
  constraint shift_duration check ((data->>'duration')::numeric between 0.25 and 24),
  constraint shift_deliveries check ((data->>'deliveries')::numeric between 0 and 300 and (data->>'deliveries')::numeric = trunc((data->>'deliveries')::numeric)),
  constraint shift_earnings check ((data->>'earnings')::numeric between 0 and 10000),
  constraint shift_note_length check (length(data->>'note') <= 5000),
  constraint shift_recognition_length check (length(data->>'recognition') <= 1200),
  constraint shift_date check ((data->>'date') ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint shift_time check ((data->>'time') ~ '^([01]\d|2[0-3]):[0-5]\d$')
);
create index shifts_user_id_idx on public.shifts(user_id);
create unique index shifts_no_duplicate on public.shifts(user_id, (data->>'date'), (data->>'time'), (data->>'platform'));

alter table public.profiles enable row level security;
alter table public.shifts enable row level security;

create policy "Drivers read only their own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Drivers create only their own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Drivers update only their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Drivers delete only their own profile" on public.profiles for delete to authenticated using ((select auth.uid()) = id);
create policy "Drivers read only their own shifts" on public.shifts for select to authenticated using ((select auth.uid()) = user_id);
create policy "Drivers create only their own shifts" on public.shifts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Drivers delete only their own shifts" on public.shifts for delete to authenticated using ((select auth.uid()) = user_id);
-- Direct UPDATE stays forbidden. Migration 003 adds a guarded correction RPC.

revoke all on public.profiles, public.shifts from anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, delete on public.shifts to authenticated;
revoke update on public.shifts from authenticated;

create function public.fleet_profile_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger fleet_profile_timestamp before update on public.profiles for each row execute function public.fleet_profile_updated_at();
commit;
