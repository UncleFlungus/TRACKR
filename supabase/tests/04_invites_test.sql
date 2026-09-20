-- Tests for tracker invitations.
--
-- Same harness and rules as the other test files: run AS ONE UNIT, expect the
-- editor's two warnings, answer "Run without RLS". Reaching the results table
-- at the end means everything passed.
--
-- Cast of characters:
--   OWNER   owns the tracker and does the inviting
--   FRIEND  has an account, gets invited, claims
--   GHOST   invited before signing up (invite waits for them)
--   STRANGER  uninvited, must stay locked out throughout

begin;

create temp table trackr_results (
  seq   serial primary key,
  check_name text,
  ok    boolean
);

create or replace function pg_temp.pass(p_label text)
returns void
language plpgsql
security definer
as $fn$
begin
  insert into pg_temp.trackr_results (check_name, ok) values (p_label, true);
  raise notice 'pass: %', p_label;
end;
$fn$;

create or replace function pg_temp.act_as(p_user uuid)
returns void
language plpgsql
as $fn$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
end;
$fn$;

create or replace function pg_temp.check_eq(
  p_label text,
  p_actual bigint,
  p_expected bigint
)
returns void
language plpgsql
security definer
as $fn$
begin
  if p_actual is distinct from p_expected then
    insert into pg_temp.trackr_results (check_name, ok) values (p_label, false);
    raise exception 'FAIL: %: expected %, got %', p_label, p_expected, p_actual;
  end if;
  insert into pg_temp.trackr_results (check_name, ok)
  values (p_label || ' (' || p_actual || ')', true);
  raise notice 'pass: % (%)', p_label, p_actual;
end;
$fn$;

-- Fixtures

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at, email_confirmed_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   '0a000000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'owner@invites.test',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '0b000000-0000-4000-8000-00000000000b',
   'authenticated', 'authenticated', 'friend@invites.test',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '0c000000-0000-4000-8000-00000000000c',
   'authenticated', 'authenticated', 'stranger@invites.test',
   '', now(), now(), now());

insert into public.trackers (id, user_id, name, icon, color)
values ('0f000000-0000-4000-8000-00000000000f'::uuid,
        '0a000000-0000-4000-8000-00000000000a'::uuid,
        'Shared gym', 'Dumbbell', 'grape');

insert into public.entries (id, user_id, tracker_id, "values")
values ('0e000000-0000-4000-8000-00000000000e'::uuid,
        '0a000000-0000-4000-8000-00000000000a'::uuid,
        '0f000000-0000-4000-8000-00000000000f'::uuid, '{"reps": 5}'::jsonb);

-- The owner's membership row should have been given an email by the trigger.
select pg_temp.check_eq(
  'membership rows carry an email for the roster',
  (select count(*) from public.tracker_members
   where tracker_id = '0f000000-0000-4000-8000-00000000000f'::uuid
     and email = 'owner@invites.test'), 1
);

-- 1. Owner invites, messy casing and whitespace included

set local role authenticated;
select pg_temp.act_as('0a000000-0000-4000-8000-00000000000a'::uuid);

insert into public.tracker_invites (tracker_id, email, role, invited_by)
values ('0f000000-0000-4000-8000-00000000000f'::uuid,
        '  Friend@Invites.Test  ', 'editor',
        '0a000000-0000-4000-8000-00000000000a'::uuid);

select pg_temp.check_eq(
  'the invite is normalised to lowercase and trimmed',
  (select count(*) from public.tracker_invites
   where email = 'friend@invites.test'), 1
);

-- Inviting someone with no account is the same operation.
insert into public.tracker_invites (tracker_id, email, role, invited_by)
values ('0f000000-0000-4000-8000-00000000000f'::uuid,
        'ghost@invites.test', 'viewer',
        '0a000000-0000-4000-8000-00000000000a'::uuid);

select pg_temp.check_eq(
  'an invite can be addressed to someone with no account',
  (select count(*) from public.tracker_invites
   where email = 'ghost@invites.test'), 1
);

-- Inviting as owner is not a thing.
do $t$
begin
  begin
    insert into public.tracker_invites (tracker_id, email, role, invited_by)
    values ('0f000000-0000-4000-8000-00000000000f'::uuid,
            'usurper@invites.test', 'owner',
            '0a000000-0000-4000-8000-00000000000a'::uuid);
    raise exception 'FAIL: an invite granted ownership';
  exception
    when check_violation then
      perform pg_temp.pass('an invite cannot grant ownership');
  end;
end;
$t$;

-- 2. Nobody but the owner touches the invite list

select pg_temp.act_as('0c000000-0000-4000-8000-00000000000c'::uuid);

select pg_temp.check_eq(
  'a stranger cannot read the invite list',
  (select count(*) from public.tracker_invites), 0
);

do $t$
begin
  begin
    insert into public.tracker_invites (tracker_id, email, role, invited_by)
    values ('0f000000-0000-4000-8000-00000000000f'::uuid,
            'stranger@invites.test', 'editor',
            '0c000000-0000-4000-8000-00000000000c'::uuid);
    raise exception 'FAIL: a stranger invited themselves';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('a stranger cannot invite themselves');
  end;
end;
$t$;

-- An invitee cannot see their own invite either; claiming is the only path.
select pg_temp.act_as('0b000000-0000-4000-8000-00000000000b'::uuid);
select pg_temp.check_eq(
  'even the invitee cannot read the invite row',
  (select count(*) from public.tracker_invites), 0
);

-- 3. Claiming

select pg_temp.check_eq(
  'before claiming, the tracker is invisible to the invitee',
  (select count(*) from public.trackers), 0
);

select pg_temp.check_eq(
  'claiming reports one tracker joined',
  (select public.claim_my_invites())::bigint, 1
);

select pg_temp.check_eq(
  'the shared tracker now appears for the invitee',
  (select count(*) from public.trackers
   where id = '0f000000-0000-4000-8000-00000000000f'::uuid), 1
);
select pg_temp.check_eq(
  'and its entries come with it',
  (select count(*) from public.entries), 1
);
select pg_temp.check_eq(
  'the invitee joined with the role they were invited as',
  (select count(*) from public.tracker_members
   where tracker_id = '0f000000-0000-4000-8000-00000000000f'::uuid
     and user_id = '0b000000-0000-4000-8000-00000000000b'::uuid
     and role = 'editor'), 1
);
select pg_temp.check_eq(
  'their membership carries their email for the roster',
  (select count(*) from public.tracker_members
   where user_id = '0b000000-0000-4000-8000-00000000000b'::uuid
     and email = 'friend@invites.test'), 1
);

-- As an editor they can actually log something.
insert into public.entries (id, user_id, tracker_id, "values")
values ('0e000000-0000-4000-8000-0000000000e2'::uuid,
        '0b000000-0000-4000-8000-00000000000b'::uuid,
        '0f000000-0000-4000-8000-00000000000f'::uuid, '{"reps": 8}'::jsonb);
select pg_temp.check_eq(
  'the invitee can log an entry once joined',
  (select count(*) from public.entries), 2
);

-- Claiming again is a no-op, not a duplicate.
select pg_temp.check_eq(
  'claiming a second time joins nothing',
  (select public.claim_my_invites())::bigint, 0
);
select pg_temp.check_eq(
  'and leaves exactly one membership',
  (select count(*) from public.tracker_members
   where tracker_id = '0f000000-0000-4000-8000-00000000000f'::uuid
     and user_id = '0b000000-0000-4000-8000-00000000000b'::uuid), 1
);

-- 4. A claimed invite is consumed

select pg_temp.act_as('0a000000-0000-4000-8000-00000000000a'::uuid);

select pg_temp.check_eq(
  'the claimed invite is gone from the owner''s pending list',
  (select count(*) from public.tracker_invites
   where email = 'friend@invites.test'), 0
);
select pg_temp.check_eq(
  'the unclaimed one is still pending',
  (select count(*) from public.tracker_invites
   where email = 'ghost@invites.test'), 1
);
select pg_temp.check_eq(
  'the owner sees the new member in the roster',
  (select count(*) from public.tracker_members
   where tracker_id = '0f000000-0000-4000-8000-00000000000f'::uuid), 2
);

-- 5. The invite waits for someone who signs up later

reset role;
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at, email_confirmed_at
)
values ('00000000-0000-0000-0000-000000000000',
        '0d000000-0000-4000-8000-00000000000d',
        'authenticated', 'authenticated', 'ghost@invites.test',
        '', now(), now(), now());

set local role authenticated;
select pg_temp.act_as('0d000000-0000-4000-8000-00000000000d'::uuid);

select pg_temp.check_eq(
  'a late signup claims the invite that was waiting',
  (select public.claim_my_invites())::bigint, 1
);
select pg_temp.check_eq(
  'they joined as the viewer they were invited as',
  (select count(*) from public.tracker_members
   where tracker_id = '0f000000-0000-4000-8000-00000000000f'::uuid
     and user_id = '0d000000-0000-4000-8000-00000000000d'::uuid
     and role = 'viewer'), 1
);

-- Viewer really is read-only.
do $t$
begin
  begin
    insert into public.entries (id, user_id, tracker_id, "values")
    values (gen_random_uuid(),
            '0d000000-0000-4000-8000-00000000000d'::uuid,
            '0f000000-0000-4000-8000-00000000000f'::uuid, '{}'::jsonb);
    raise exception 'FAIL: a claimed viewer could write';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('a claimed viewer is still read-only');
  end;
end;
$t$;

-- 6. An unconfirmed address cannot harvest invites
--
-- The scenario this blocks: someone signs up as an address they don't
-- control, hoping to collect whatever was addressed to it.

reset role;
insert into public.tracker_invites (tracker_id, email, role, invited_by)
values ('0f000000-0000-4000-8000-00000000000f'::uuid,
        'unconfirmed@invites.test', 'editor',
        '0a000000-0000-4000-8000-00000000000a'::uuid);

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at, email_confirmed_at
)
values ('00000000-0000-0000-0000-000000000000',
        '00900000-0000-4000-8000-000000000009',
        'authenticated', 'authenticated', 'unconfirmed@invites.test',
        '', now(), now(), null);   -- never confirmed

set local role authenticated;
select pg_temp.act_as('00900000-0000-4000-8000-000000000009'::uuid);

select pg_temp.check_eq(
  'an unconfirmed address claims nothing',
  (select public.claim_my_invites())::bigint, 0
);

-- Read as postgres here. The unconfirmed caller cannot see the invite
-- list at all (it is owner-only for select), so asking them would return zero
-- whether the invite survived or was consumed. That's the policy talking, not
-- the behaviour under test.
reset role;
select pg_temp.check_eq(
  'and the invite is left pending for the real owner of the address',
  (select count(*) from public.tracker_invites
   where email = 'unconfirmed@invites.test'), 1
);
set local role authenticated;

-- 7. Revoking

select pg_temp.act_as('0a000000-0000-4000-8000-00000000000a'::uuid);

do $t$
declare
  n int;
begin
  delete from public.tracker_invites
  where email = 'unconfirmed@invites.test';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: the owner could not revoke a pending invite (% rows)', n;
  end if;
  perform pg_temp.pass('the owner can revoke a pending invite');
end;
$t$;

-- Revoked before it was claimed: nothing to claim afterwards.
select pg_temp.act_as('00900000-0000-4000-8000-000000000009'::uuid);
select pg_temp.check_eq(
  'a revoked invite cannot be claimed',
  (select public.claim_my_invites())::bigint, 0
);

-- 8. Removing a member takes their access away again

select pg_temp.act_as('0a000000-0000-4000-8000-00000000000a'::uuid);

do $t$
declare
  n int;
begin
  delete from public.tracker_members
  where tracker_id = '0f000000-0000-4000-8000-00000000000f'::uuid
    and user_id = '0b000000-0000-4000-8000-00000000000b'::uuid;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: the owner could not remove a member (% rows)', n;
  end if;
  perform pg_temp.pass('the owner can remove a member');
end;
$t$;

select pg_temp.act_as('0b000000-0000-4000-8000-00000000000b'::uuid);
select pg_temp.check_eq(
  'the removed member loses sight of the tracker',
  (select count(*) from public.trackers
   where id = '0f000000-0000-4000-8000-00000000000f'::uuid), 0
);
select pg_temp.check_eq(
  'and can no longer read its entries',
  (select count(*) from public.entries), 0
);

-- Their contribution is not deleted along with their access, though.
reset role;
select pg_temp.check_eq(
  'the entry they logged is still in the tracker',
  (select count(*) from public.entries
   where id = '0e000000-0000-4000-8000-0000000000e2'::uuid), 1
);

select seq, check_name, ok from pg_temp.trackr_results order by seq;

rollback;
