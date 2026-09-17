-- Run this AFTER supabase-schema.sql in the NEW Civil Supabase project.
-- Then create the organizer's Auth email/password in Supabase Authentication.
-- Finally insert that Auth user's UUID into public.organizers.

create table if not exists public.organizers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.organizers enable row level security;

drop policy if exists "organizers can view own organizer record" on public.organizers;
create policy "organizers can view own organizer record" on public.organizers
for select to authenticated using (user_id = auth.uid() and active = true);

-- Replace the original broad authenticated policies with organizer-only policies.
drop policy if exists "organizers can view civil registrations" on public.registrations;
drop policy if exists "organizers can update civil registrations" on public.registrations;
create policy "organizers can view civil registrations" on public.registrations
for select to authenticated using (exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active));
create policy "organizers can update civil registrations" on public.registrations
for update to authenticated using (exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active))
with check (exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active));

drop policy if exists "organizers can view civil proofs" on public.payment_proofs;
drop policy if exists "organizers can update civil proofs" on public.payment_proofs;
create policy "organizers can view civil proofs" on public.payment_proofs
for select to authenticated using (exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active));
create policy "organizers can update civil proofs" on public.payment_proofs
for update to authenticated using (exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active))
with check (exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active));

drop policy if exists "organizers can update civil event config" on public.event_config;
create policy "organizers can update civil event config" on public.event_config
for update to authenticated using (exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active))
with check (exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active));

-- Payment proofs contain sensitive screenshots, so make the bucket private.
update storage.buckets set public = false where id = 'civil-payment-proofs';
drop policy if exists "public can read civil payment proof" on storage.objects;
create policy "organizers can read civil payment proof" on storage.objects
for select to authenticated using (
  bucket_id = 'civil-payment-proofs'
  and exists(select 1 from public.organizers o where o.user_id = auth.uid() and o.active)
);
