-- CIVIL FRESHERS'26 — organizer security patch
-- Run this in the NEW Civil Supabase project after supabase-schema.sql.
-- Safe to run more than once.

create table if not exists public.organizers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.organizers enable row level security;

-- Security-definer helper avoids an RLS self-reference/visibility problem when
-- the browser checks whether the currently signed-in Auth user is an organizer.
create or replace function public.is_civil_organizer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizers
    where user_id = auth.uid()
      and active = true
  );
$$;

revoke all on function public.is_civil_organizer() from public;
grant execute on function public.is_civil_organizer() to authenticated;

drop policy if exists "organizers can view own organizer record" on public.organizers;
create policy "organizers can view own organizer record" on public.organizers
for select to authenticated
using (user_id = auth.uid() and active = true);

-- Replace broad authenticated policies with organizer-only policies.
drop policy if exists "organizers can view civil registrations" on public.registrations;
drop policy if exists "organizers can update civil registrations" on public.registrations;
create policy "organizers can view civil registrations" on public.registrations
for select to authenticated using (public.is_civil_organizer());
create policy "organizers can update civil registrations" on public.registrations
for update to authenticated
using (public.is_civil_organizer())
with check (public.is_civil_organizer());

drop policy if exists "organizers can view civil proofs" on public.payment_proofs;
drop policy if exists "organizers can update civil proofs" on public.payment_proofs;
create policy "organizers can view civil proofs" on public.payment_proofs
for select to authenticated using (public.is_civil_organizer());
create policy "organizers can update civil proofs" on public.payment_proofs
for update to authenticated
using (public.is_civil_organizer())
with check (public.is_civil_organizer());

drop policy if exists "organizers can update civil event config" on public.event_config;
create policy "organizers can update civil event config" on public.event_config
for update to authenticated
using (public.is_civil_organizer())
with check (public.is_civil_organizer());

-- Explicit table privileges are required in addition to RLS.
-- Students may create registrations/proof rows, but cannot directly read or update them.
grant insert on table public.registrations to anon, authenticated;
grant select, update on table public.registrations to authenticated;
grant insert on table public.payment_proofs to anon, authenticated;
grant select, update on table public.payment_proofs to authenticated;
grant select on table public.event_config to anon, authenticated;
grant update on table public.event_config to authenticated;

-- Payment proofs are sensitive, so the bucket is private.
update storage.buckets set public = false where id = 'civil-payment-proofs';
drop policy if exists "public can read civil payment proof" on storage.objects;
drop policy if exists "organizers can read civil payment proof" on storage.objects;
create policy "organizers can read civil payment proof" on storage.objects
for select to authenticated
using (
  bucket_id = 'civil-payment-proofs'
  and public.is_civil_organizer()
);
