-- SlupskMasterQuest hardening baseline for Supabase
-- Run this in Supabase SQL Editor.
-- IMPORTANT: This assumes profiles.id = auth.uid() for logged-in users.

begin;

-- Keep anon role from reading any table directly.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Helper functions used by RLS policies.
create or replace function public.app_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.app_my_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.team_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.app_is_organizer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.rola = 'organizator'
  )
$$;

create or replace function public.app_is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_leader, false) = true
  )
$$;

-- Enable Row Level Security on used tables.
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.tasks enable row level security;
alter table public.team_tasks enable row level security;
alter table public.chat_messages enable row level security;
alter table public.global_alerts enable row level security;

-- Force RLS so even table owner cannot bypass accidentally.
alter table public.profiles force row level security;
alter table public.teams force row level security;
alter table public.tasks force row level security;
alter table public.team_tasks force row level security;
alter table public.chat_messages force row level security;
alter table public.global_alerts force row level security;

-- Profiles policies.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select
on public.profiles
for select
to authenticated
using (
  public.app_is_organizer() or id = auth.uid()
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert
on public.profiles
for insert
to authenticated
with check (
  public.app_is_organizer() or id = auth.uid()
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update
on public.profiles
for update
to authenticated
using (
  public.app_is_organizer() or id = auth.uid()
)
with check (
  public.app_is_organizer() or id = auth.uid()
);

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete
on public.profiles
for delete
to authenticated
using (public.app_is_organizer());

-- Teams policies.
drop policy if exists teams_select on public.teams;
create policy teams_select
on public.teams
for select
to authenticated
using (
  public.app_is_organizer() or id = public.app_my_team_id()
);

drop policy if exists teams_insert on public.teams;
create policy teams_insert
on public.teams
for insert
to authenticated
with check (
  public.app_is_organizer() or public.app_is_leader()
);

drop policy if exists teams_update on public.teams;
create policy teams_update
on public.teams
for update
to authenticated
using (
  public.app_is_organizer() or id = public.app_my_team_id()
)
with check (
  public.app_is_organizer() or id = public.app_my_team_id()
);

drop policy if exists teams_delete on public.teams;
create policy teams_delete
on public.teams
for delete
to authenticated
using (public.app_is_organizer());

-- Tasks policies.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select
on public.tasks
for select
to authenticated
using (
  public.app_is_organizer() or coalesce(is_active, false) = true
);

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert
on public.tasks
for insert
to authenticated
with check (public.app_is_organizer());

drop policy if exists tasks_update on public.tasks;
create policy tasks_update
on public.tasks
for update
to authenticated
using (public.app_is_organizer())
with check (public.app_is_organizer());

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete
on public.tasks
for delete
to authenticated
using (public.app_is_organizer());

-- Team tasks policies.
drop policy if exists team_tasks_select on public.team_tasks;
create policy team_tasks_select
on public.team_tasks
for select
to authenticated
using (
  public.app_is_organizer() or team_id = public.app_my_team_id()
);

drop policy if exists team_tasks_insert on public.team_tasks;
create policy team_tasks_insert
on public.team_tasks
for insert
to authenticated
with check (
  public.app_is_organizer() or team_id = public.app_my_team_id()
);

drop policy if exists team_tasks_update on public.team_tasks;
create policy team_tasks_update
on public.team_tasks
for update
to authenticated
using (
  public.app_is_organizer() or team_id = public.app_my_team_id()
)
with check (
  public.app_is_organizer() or team_id = public.app_my_team_id()
);

drop policy if exists team_tasks_delete on public.team_tasks;
create policy team_tasks_delete
on public.team_tasks
for delete
to authenticated
using (public.app_is_organizer());

-- Chat policies.
drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select
on public.chat_messages
for select
to authenticated
using (
  public.app_is_organizer()
  or channel = (select p.rola from public.profiles p where p.id = auth.uid())
);

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert
on public.chat_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and (
    public.app_is_organizer()
    or channel = (select p.rola from public.profiles p where p.id = auth.uid())
  )
);

-- Global alerts policies.
drop policy if exists global_alerts_select on public.global_alerts;
create policy global_alerts_select
on public.global_alerts
for select
to authenticated
using (true);

drop policy if exists global_alerts_insert on public.global_alerts;
create policy global_alerts_insert
on public.global_alerts
for insert
to authenticated
with check (public.app_is_organizer());

-- Guard rail trigger: players cannot elevate privileges or rewrite identity fields.
create or replace function public.profiles_guard_non_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.app_is_organizer() then
    return new;
  end if;

  if old.id <> auth.uid() then
    raise exception 'forbidden';
  end if;

  if new.rola is distinct from old.rola then
    raise exception 'cannot change role';
  end if;

  if coalesce(new.is_leader, false) is distinct from coalesce(old.is_leader, false) then
    raise exception 'cannot change leader flag';
  end if;

  if new.login is distinct from old.login then
    raise exception 'cannot change login directly';
  end if;

  if new.haslo is distinct from old.haslo then
    raise exception 'cannot change password directly';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_non_organizer on public.profiles;
create trigger trg_profiles_guard_non_organizer
before update on public.profiles
for each row
execute function public.profiles_guard_non_organizer();

-- Guard rail trigger: members can only update team GPS for their own team.
create or replace function public.teams_guard_member_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.app_is_organizer() then
    return new;
  end if;

  if old.id <> public.app_my_team_id() then
    raise exception 'forbidden';
  end if;

  if new.nazwa is distinct from old.nazwa
    or new.kod_dolaczenia is distinct from old.kod_dolaczenia
    or coalesce(new.punkty, 0) is distinct from coalesce(old.punkty, 0)
    or new.aktywny_zestaw_id is distinct from old.aktywny_zestaw_id
    or coalesce(new.target_main_tasks, 0) is distinct from coalesce(old.target_main_tasks, 0)
  then
    raise exception 'only gps updates allowed';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_teams_guard_member_updates on public.teams;
create trigger trg_teams_guard_member_updates
before update on public.teams
for each row
execute function public.teams_guard_member_updates();

-- Guard rail trigger: members cannot self-award points or approved statuses.
create or replace function public.team_tasks_guard_member_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.app_is_organizer() then
    return new;
  end if;

  if new.team_id <> public.app_my_team_id() then
    raise exception 'forbidden';
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.przyznane_punkty, 0) <> 0 then
      raise exception 'cannot set points';
    end if;

    if new.status not in ('w_toku', 'do_oceny', 'pominiete') then
      raise exception 'invalid status for member';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.task_id <> old.task_id or new.team_id <> old.team_id then
      raise exception 'cannot rebind relation';
    end if;

    if coalesce(new.przyznane_punkty, 0) is distinct from coalesce(old.przyznane_punkty, 0) then
      raise exception 'cannot change points';
    end if;

    if coalesce(new.ile_razy_wykonano, 0) is distinct from coalesce(old.ile_razy_wykonano, 0) then
      raise exception 'cannot change execution count';
    end if;

    if new.status not in ('w_toku', 'do_oceny', 'pominiete', 'odrzucone') then
      raise exception 'invalid status for member';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_team_tasks_guard_member_updates on public.team_tasks;
create trigger trg_team_tasks_guard_member_updates
before insert or update on public.team_tasks
for each row
execute function public.team_tasks_guard_member_updates();

-- Secure RPC function used by judges.
create or replace function public.increment_team_points(team_id uuid, amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.app_is_organizer() then
    raise exception 'forbidden';
  end if;

  update public.teams
  set punkty = coalesce(punkty, 0) + amount
  where id = team_id;
end;
$$;

revoke all on function public.increment_team_points(uuid, integer) from public;
grant execute on function public.increment_team_points(uuid, integer) to authenticated;

-- Storage hardening for evidence bucket.
-- If bucket is public, URLs stay publicly reachable; switch bucket to private in dashboard.
alter table storage.objects enable row level security;

-- Remove old policies if present.
drop policy if exists evidence_read on storage.objects;
drop policy if exists evidence_write on storage.objects;
drop policy if exists evidence_update on storage.objects;
drop policy if exists evidence_delete on storage.objects;

create policy evidence_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'evidence'
  and (
    public.app_is_organizer()
    or name like (public.app_my_team_id()::text || '/%')
  )
);

create policy evidence_write
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'evidence'
  and (
    public.app_is_organizer()
    or name like (public.app_my_team_id()::text || '/%')
  )
);

create policy evidence_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'evidence'
  and (
    public.app_is_organizer()
    or name like (public.app_my_team_id()::text || '/%')
  )
)
with check (
  bucket_id = 'evidence'
  and (
    public.app_is_organizer()
    or name like (public.app_my_team_id()::text || '/%')
  )
);

create policy evidence_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'evidence'
  and (
    public.app_is_organizer()
    or name like (public.app_my_team_id()::text || '/%')
  )
);

commit;
