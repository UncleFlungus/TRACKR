-- ============================================================
-- Tracker sharing — phase 2: invitations
--
-- How it works, end to end:
--   1. An owner inserts a row into tracker_invites naming an email address.
--      No lookup happens. The invite is written whether or not that person
--      has an account.
--   2. The invitee opens the app. claim_my_invites() matches pending invites
--      against their own confirmed email and converts them into memberships.
--   3. The tracker appears on their home page — which needs no new code,
--      because useTrackers() never filtered by user and RLS already returns
--      anything they're a member of.
--
-- Why not resolve the email at invite time
--
-- Because "no such user" is an account-existence oracle: anyone could probe
-- arbitrary addresses and learn who has an account. Writing a pending invite
-- unconditionally means the response is identical either way, and inviting
-- someone who hasn't signed up yet works for free instead of being a separate
-- feature. The cost is that a member appears in the roster on their next app
-- load rather than instantly.
--
-- Deliberately NOT an RPC. Inviting is a plain insert, revoking a plain
-- delete, listing a plain select — all owner-scoped by the policies below.
-- The only thing needing elevated rights is the claim, because it reads
-- auth.users.
--
-- Depends on 20260827120000_tracker_sharing.sql.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Show a name, not a UUID
--
-- The share sheet has to render a member list, and without this the roster
-- reads "8f3a1c2e-… (editor)". A denormalised email on the membership row is
-- enough for that, and avoids standing up a profiles table purely to make one
-- list legible. Only co-members can read it, which is the same expectation as
-- any shared document.
--
-- It can go stale if someone changes their account email. Acceptable for a
-- roster label; when attribution lands and needs to be authoritative, that is
-- the point to introduce profiles properly.
-- ------------------------------------------------------------

alter table public.tracker_members
  add column if not exists email text;

create or replace function public.tracker_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.email is null then
    select lower(btrim(u.email))
    into new.email
    from auth.users u
    where u.id = new.user_id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists tracker_members_email on public.tracker_members;
create trigger tracker_members_email
  before insert on public.tracker_members
  for each row
  execute function public.tracker_member_email();

-- Backfill the rows that already exist.
update public.tracker_members m
set email = lower(btrim(u.email))
from auth.users u
where u.id = m.user_id
  and m.email is null;

-- ------------------------------------------------------------
-- 2. Pending invitations
-- ------------------------------------------------------------

create table if not exists public.tracker_invites (
  id          uuid primary key default gen_random_uuid(),
  tracker_id  uuid not null references public.trackers (id) on delete cascade,
  email       text not null,
  -- No 'owner' here: ownership transfers, it isn't handed out by invitation.
  role        text not null default 'editor'
    check (role in ('editor', 'viewer')),
  -- Kept if the inviter later deletes their account, so a pending invite to a
  -- transferred tracker still works.
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint tracker_invites_email_shape check (position('@' in email) > 1),
  unique (tracker_id, email)
);

create index if not exists tracker_invites_email_idx
  on public.tracker_invites (email);

alter table public.tracker_invites enable row level security;

grant select, insert, update, delete on public.tracker_invites to authenticated;
grant all on public.tracker_invites to service_role;

-- Normalising in the database, not the client: the claim matches on exact
-- equality, so a stray capital or trailing space would silently produce an
-- invite that can never be claimed.
create or replace function public.tracker_invite_normalise()
returns trigger
language plpgsql
as $fn$
begin
  new.email := lower(btrim(new.email));
  return new;
end;
$fn$;

drop trigger if exists tracker_invites_normalise on public.tracker_invites;
create trigger tracker_invites_normalise
  before insert or update on public.tracker_invites
  for each row
  execute function public.tracker_invite_normalise();

-- ------------------------------------------------------------
-- 3. Policies
--
-- Owner-only across the board, including SELECT: an invite list is a list of
-- other people's email addresses, so co-members have no business reading it.
-- The invitee never selects their own invite either — the claim below runs
-- with elevated rights and matches on their behalf.
-- ------------------------------------------------------------

do $do$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'tracker_invites'
  loop
    execute format('drop policy %I on public.tracker_invites', pol.policyname);
  end loop;
end;
$do$;

create policy tracker_invites_select on public.tracker_invites
  for select to authenticated
  using (public.is_tracker_owner(tracker_id));

create policy tracker_invites_insert on public.tracker_invites
  for insert to authenticated
  with check (
    public.is_tracker_owner(tracker_id)
    and invited_by = (select auth.uid())
  );

create policy tracker_invites_update on public.tracker_invites
  for update to authenticated
  using (public.is_tracker_owner(tracker_id))
  with check (public.is_tracker_owner(tracker_id));

create policy tracker_invites_delete on public.tracker_invites
  for delete to authenticated
  using (public.is_tracker_owner(tracker_id));

-- ------------------------------------------------------------
-- 4. Claiming
--
-- SECURITY DEFINER because it reads auth.users to learn the caller's own
-- email. It takes no arguments and derives everything from auth.uid(), so it
-- cannot be pointed at anyone else.
--
-- The email is read from auth.users rather than auth.email() deliberately:
-- that helper reads a JWT claim, which can be stale relative to the account,
-- and reading the table needs no assumption about which auth helpers this
-- project's Postgres version ships.
--
-- email_confirmed_at is the security-critical line. Invites are addressed to
-- an email, so claiming one must require having proven control of it —
-- otherwise signing up as someone else's address would harvest their invites.
-- Supabase is configured with email confirmation on (see SECURITY.md), which
-- already prevents unconfirmed sign-in; this makes the claim safe on its own
-- terms rather than dependent on that setting staying put.
-- ------------------------------------------------------------

create or replace function public.claim_my_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user  uuid := (select auth.uid());
  v_email text;
  v_count integer;
begin
  -- Called on every app load, including before sign-in completes. Returning
  -- zero is the honest answer there; raising would make callers handle an
  -- error that isn't one.
  if v_user is null then
    return 0;
  end if;

  select lower(btrim(u.email))
  into v_email
  from auth.users u
  where u.id = v_user
    and u.email_confirmed_at is not null;

  if v_email is null then
    return 0;
  end if;

  with claimed as (
    delete from public.tracker_invites i
    where i.email = v_email
    returning i.tracker_id, i.role
  ),
  granted as (
    insert into public.tracker_members (tracker_id, user_id, role)
    select c.tracker_id, v_user, c.role
    from claimed c
    -- Already a member: the invite is still consumed, the existing role wins.
    on conflict (tracker_id, user_id) do nothing
    returning 1
  )
  select count(*) into v_count from granted;

  return coalesce(v_count, 0);
end;
$fn$;

revoke all on function public.claim_my_invites() from public;
grant execute on function public.claim_my_invites() to authenticated;

commit;
