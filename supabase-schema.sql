-- FRESHERS'26 CIVIL — standalone Supabase schema
-- Run this ONLY in the NEW Civil Supabase project.

create extension if not exists pgcrypto;
create table if not exists public.registrations (
 id uuid primary key default gen_random_uuid(), reference_id text unique not null, full_name text not null,
 entry_number text not null, phone text not null, year text not null, email text not null, contribution numeric,
 payment_status text not null default 'pending' check(payment_status in('pending','submitted','verified','rejected')), created_at timestamptz not null default now()
);
create table if not exists public.payment_proofs (
 id uuid primary key default gen_random_uuid(), reference_id text not null references public.registrations(reference_id) on delete cascade,
 storage_path text not null, submitted_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid,
 status text not null default 'submitted' check(status in('submitted','verified','rejected'))
);
create table if not exists public.event_config (
 id boolean primary key default true, upi_id text not null default '', contribution numeric not null default 0,
 event_date text default 'To be announced', venue text default 'SMVDU Campus', support_text text default 'Contact Civil organizers', constraint one_config check(id=true)
);
insert into public.event_config(id) values(true) on conflict(id) do nothing;

alter table public.registrations enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.event_config enable row level security;

drop policy if exists "public can create civil registrations" on public.registrations;
create policy "public can create civil registrations" on public.registrations for insert to anon,authenticated with check(true);
drop policy if exists "organizers can view civil registrations" on public.registrations;
create policy "organizers can view civil registrations" on public.registrations for select to authenticated using(true);
drop policy if exists "organizers can update civil registrations" on public.registrations;
create policy "organizers can update civil registrations" on public.registrations for update to authenticated using(true) with check(true);

drop policy if exists "public can create civil proof rows" on public.payment_proofs;
create policy "public can create civil proof rows" on public.payment_proofs for insert to anon,authenticated with check(exists(select 1 from public.registrations r where r.reference_id=payment_proofs.reference_id));
drop policy if exists "organizers can view civil proofs" on public.payment_proofs;
create policy "organizers can view civil proofs" on public.payment_proofs for select to authenticated using(true);
drop policy if exists "organizers can update civil proofs" on public.payment_proofs;
create policy "organizers can update civil proofs" on public.payment_proofs for update to authenticated using(true) with check(true);

create policy "public can read civil event config" on public.event_config for select to anon,authenticated using(true);
drop policy if exists "organizers can update civil event config" on public.event_config;
create policy "organizers can update civil event config" on public.event_config for update to authenticated using(true) with check(true);

insert into storage.buckets(id,name,public) values('civil-payment-proofs','civil-payment-proofs',true) on conflict(id) do nothing;
drop policy if exists "public can upload civil payment proof" on storage.objects;
create policy "public can upload civil payment proof" on storage.objects for insert to anon,authenticated with check(bucket_id='civil-payment-proofs');
drop policy if exists "public can read civil payment proof" on storage.objects;
create policy "public can read civil payment proof" on storage.objects for select to anon,authenticated using(bucket_id='civil-payment-proofs');

create or replace function public.lookup_civil_pass(p_reference_id text)
returns table(reference_id text,full_name text,payment_status text,created_at timestamptz)
language sql security definer set search_path=public as $$
 select r.reference_id,r.full_name,coalesce((select pp.status from public.payment_proofs pp where pp.reference_id=r.reference_id order by pp.submitted_at desc limit 1),r.payment_status),r.created_at
 from public.registrations r where upper(r.reference_id)=upper(trim(p_reference_id)) limit 1;
$$;
grant execute on function public.lookup_civil_pass(text) to anon,authenticated;

create or replace function public.next_civil_reference() returns text language plpgsql security definer set search_path=public as $$
declare candidate text; begin loop candidate:='CIV-26-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)); exit when not exists(select 1 from public.registrations where reference_id=candidate); end loop; return candidate; end; $$;
grant execute on function public.next_civil_reference() to anon,authenticated;
