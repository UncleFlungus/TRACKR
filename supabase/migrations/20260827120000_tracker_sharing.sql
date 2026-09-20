-- Tracker sharing, phase 1: membership and RLS
--
-- Invisible to the app when applied on its own: every existing tracker gets
-- exactly one member (its creator, as owner), so every policy below resolves
-- the same way the old "user_id = auth.uid()" ones did. Nothing in the client
-- has to change. Phase 2 (share codes / join RPC) is what makes it visible.
--
-- Read this before running:
--   * It DROPS every existing policy on trackers, fields and entries and
--     writes a new set. Run tests/00_preflight.sql first and save the output.
--   * It assumes trackers/fields/entries each have user_id uuid -> auth.users,
--     and that fields/entries have tracker_id uuid -> trackers(id).
--   * It is re-runnable.
--
-- The permission model:
--   owner   creator of the tracker. Everything, including fields + deletion.
--   editor  read the tracker, add/edit entries. Cannot touch fields.
--   viewer  read only.
-- Entries carry the author's user_id, so entries.user_id stops meaning
-- "owner" and starts meaning "who logged this", which is what the attribution
-- UI reads.

begin;

-- 1. Membership

create table if not exists public.tracker_members (
  tracker_id uuid not null references public.trackers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (tracker_id, user_id)
);

-- The PK covers (tracker_id, ...) lookups; this covers "what am I a member of".
create index if not exists tracker_members_user_id_idx
  on public.tracker_members (user_id);

alter table public.tracker_members enable row level security;

-- Supabase sets default privileges for these roles on the public schema, but
-- being explicit means a missing grant can never masquerade as an RLS bug.
grant select, insert, update, delete on public.tracker_members to authenticated;
grant all on public.tracker_members to service_role;

-- 2. Backfill: every existing tracker's creator becomes its owner

insert into public.tracker_members (tracker_id, user_id, role)
select t.id, t.user_id, 'owner'
from public.trackers t
where t.user_id is not null
on conflict (tracker_id, user_id) do nothing;

-- 3. Role helpers
--
-- SECURITY DEFINER is required here, not a convenience. These are called from
-- policies that are themselves attached to tracker_members; a plain function
-- would re-enter that table's policies and recurse until Postgres gives up.
-- Running as the (RLS-exempt) owner cuts the loop.
--
-- The empty search_path is the matching safety measure: a SECURITY DEFINER
-- function with a mutable search_path can be hijacked by a caller-created
-- object shadowing an unqualified name, so every reference below is schema-
-- qualified.
--
-- auth.uid() is wrapped in a scalar subselect so the planner evaluates it
-- once per query rather than once per row.
--
-- Every one of these treats "created this tracker" as ownership in its own
-- right, independent of the membership table. That is deliberate, and it is
-- what keeps migrate_user_data working: that RPC is NOT security definer (see
-- SECURITY.md), so its inserts are checked by these policies, and it writes a
-- tracker and that tracker's fields and entries inside one transaction. Making
-- the write path depend solely on the membership row would make a one-shot
-- import hostage to trigger ordering. It also means a lost membership row can
-- never lock someone out of data they created.
--
-- Defined in dependency order: SQL function bodies are parsed at creation, so
-- a helper has to exist before another helper can call it.

create or replace function public.tracker_role(p_tracker_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select m.role
  from public.tracker_members m
  where m.tracker_id = p_tracker_id
    and m.user_id = (select auth.uid())
$fn$;

create or replace function public.is_tracker_owner(p_tracker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    exists (
      select 1
      from public.trackers t
      where t.id = p_tracker_id
        and t.user_id = (select auth.uid())
    )
    or public.tracker_role(p_tracker_id) = 'owner'
$fn$;

create or replace function public.can_read_tracker(p_tracker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    public.is_tracker_owner(p_tracker_id)
    or public.tracker_role(p_tracker_id) is not null
$fn$;

create or replace function public.can_write_tracker(p_tracker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    public.is_tracker_owner(p_tracker_id)
    or public.tracker_role(p_tracker_id) = 'editor'
$fn$;

revoke all on function public.tracker_role(uuid) from public;
revoke all on function public.can_read_tracker(uuid) from public;
revoke all on function public.can_write_tracker(uuid) from public;
revoke all on function public.is_tracker_owner(uuid) from public;

grant execute on function public.tracker_role(uuid) to authenticated, service_role;
grant execute on function public.can_read_tracker(uuid) to authenticated, service_role;
grant execute on function public.can_write_tracker(uuid) to authenticated, service_role;
grant execute on function public.is_tracker_owner(uuid) to authenticated, service_role;

-- 4. New trackers get their owner membership automatically
--
-- Covers both the client insert path and the migrate_user_data RPC, so no
-- caller has to remember to write the membership row.

create or replace function public.tracker_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.user_id is not null then
    insert into public.tracker_members (tracker_id, user_id, role)
    values (new.id, new.user_id, 'owner')
    on conflict (tracker_id, user_id) do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trackers_owner_membership on public.trackers;
create trigger trackers_owner_membership
  after insert on public.trackers
  for each row
  execute function public.tracker_owner_membership();

-- 5. Policies
--
-- Dropped wholesale rather than patched: the old set was written against a
-- single-owner model and mixing the two would leave gaps that are very hard
-- to reason about. Everything below is scoped to authenticated, so anon gets
-- nothing, which matches the app: signed-out users are on IndexedDB.

do $do$
declare
  pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('trackers', 'fields', 'entries', 'tracker_members')
  loop
    execute format(
      'drop policy %I on public.%I',
      pol.policyname,
      pol.tablename
    );
  end loop;
end;
$do$;

alter table public.trackers enable row level security;
alter table public.fields   enable row level security;
alter table public.entries  enable row level security;

-- SELECT keeps a direct user_id check alongside membership so that
-- "insert ... returning" works: the RETURNING clause is checked against the
-- SELECT policy, and at that instant the AFTER-INSERT membership row may not
-- be visible yet.
create policy trackers_select on public.trackers
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_read_tracker(id)
  );

create policy trackers_insert on public.trackers
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy trackers_update on public.trackers
  for update to authenticated
  using (public.is_tracker_owner(id))
  with check (public.is_tracker_owner(id));

create policy trackers_delete on public.trackers
  for delete to authenticated
  using (public.is_tracker_owner(id));

-- Owner-only writes: a field is the tracker's schema, and letting an editor
-- delete one silently drops that key from every entry's values map.
create policy fields_select on public.fields
  for select to authenticated
  using (public.can_read_tracker(tracker_id));

create policy fields_insert on public.fields
  for insert to authenticated
  with check (public.is_tracker_owner(tracker_id));

create policy fields_update on public.fields
  for update to authenticated
  using (public.is_tracker_owner(tracker_id))
  with check (public.is_tracker_owner(tracker_id));

create policy fields_delete on public.fields
  for delete to authenticated
  using (public.is_tracker_owner(tracker_id));

-- INSERT pins user_id to the caller: you cannot log an entry as someone else.
-- UPDATE is open to any editor, since a shared tracker is a shared log and
-- editing each other's counts is the point. DELETE is owner-or-author, because
-- destructive and recoverable are different bars.
create policy entries_select on public.entries
  for select to authenticated
  using (public.can_read_tracker(tracker_id));

create policy entries_insert on public.entries
  for insert to authenticated
  with check (
    public.can_write_tracker(tracker_id)
    and user_id = (select auth.uid())
  );

create policy entries_update on public.entries
  for update to authenticated
  using (public.can_write_tracker(tracker_id))
  with check (public.can_write_tracker(tracker_id));

create policy entries_delete on public.entries
  for delete to authenticated
  using (
    public.is_tracker_owner(tracker_id)
    or user_id = (select auth.uid())
  );

-- No self-service INSERT: joining happens through the phase-2 join RPC, which
-- validates a share code. Owners can add members directly; anyone can remove
-- their own row, which is "leave this tracker".
create policy tracker_members_select on public.tracker_members
  for select to authenticated
  using (public.can_read_tracker(tracker_id));

create policy tracker_members_insert on public.tracker_members
  for insert to authenticated
  with check (public.is_tracker_owner(tracker_id));

create policy tracker_members_update on public.tracker_members
  for update to authenticated
  using (public.is_tracker_owner(tracker_id))
  with check (public.is_tracker_owner(tracker_id));

create policy tracker_members_delete on public.tracker_members
  for delete to authenticated
  using (
    public.is_tracker_owner(tracker_id)
    or user_id = (select auth.uid())
  );

commit;
