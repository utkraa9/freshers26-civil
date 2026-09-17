-- Civil Freshers'26 organizer access migration
-- Run this ONCE in the Civil Supabase SQL editor.
-- Main admin: pqdmshreeambasta@gmail.com

create table if not exists public.organizer_access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create unique index if not exists organizer_access_pending_email_idx
on public.organizer_access_requests(lower(email))
where status = 'pending';

alter table public.organizer_access_requests enable row level security;

create or replace function public.is_civil_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select lower(coalesce((select email from auth.users where id = auth.uid()), '')) = 'pqdmshreeambasta@gmail.com';
$$;

create or replace function public.request_civil_organizer(p_email text, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r public.organizer_access_requests;
begin
  if nullif(trim(p_email), '') is null then
    raise exception 'Email is required';
  end if;
  insert into public.organizer_access_requests(email, name)
  values (lower(trim(p_email)), nullif(trim(p_name), ''))
  on conflict (lower(email)) where status = 'pending'
  do update set name = excluded.name, requested_at = now()
  returning * into r;
  return jsonb_build_object('id', r.id, 'status', r.status);
end;
$$;

create or replace function public.list_civil_organizer_requests()
returns setof public.organizer_access_requests
language sql
security definer
set search_path = public
as $$
  select * from public.organizer_access_requests
  where public.is_civil_admin()
  order by case when status = 'pending' then 0 else 1 end, requested_at desc;
$$;

create or replace function public.approve_civil_organizer(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare r public.organizer_access_requests;
declare target_user uuid;
begin
  if not public.is_civil_admin() then raise exception 'Only the main admin can approve organizer access'; end if;
  select * into r from public.organizer_access_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Organizer request not found'; end if;
  select id into target_user from auth.users where lower(email) = lower(r.email) limit 1;
  if target_user is null then raise exception 'The organizer account has not been created yet'; end if;
  insert into public.organizers(user_id, active) values (target_user, true)
  on conflict (user_id) do update set active = true;
  update public.organizer_access_requests
  set status='approved', reviewed_at=now(), reviewed_by=auth.uid()
  where id=r.id;
  return true;
end;
$$;

create or replace function public.reject_civil_organizer(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_civil_admin() then raise exception 'Only the main admin can reject organizer access'; end if;
  update public.organizer_access_requests
  set status='rejected', reviewed_at=now(), reviewed_by=auth.uid()
  where id=p_request_id;
  return found;
end;
$$;

grant execute on function public.is_civil_admin() to anon, authenticated;
grant execute on function public.request_civil_organizer(text,text) to anon, authenticated;
grant execute on function public.list_civil_organizer_requests() to authenticated;
grant execute on function public.approve_civil_organizer(uuid) to authenticated;
grant execute on function public.reject_civil_organizer(uuid) to authenticated;

-- Refresh PostgREST so the new RPCs are visible immediately after this migration.
notify pgrst, 'reload schema';

-- Ensure the main admin is also an active Civil organizer and can verify payments.
insert into public.organizers(user_id, active)
select id, true from auth.users
where lower(email) = 'pqdmshreeambasta@gmail.com'
on conflict (user_id) do update set active = true;
