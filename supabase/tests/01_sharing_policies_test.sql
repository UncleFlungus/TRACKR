-- ============================================================
-- Policy tests for tracker sharing.
--
-- Run AFTER the migration, in the Supabase SQL editor. The whole thing runs
-- inside a transaction that ends in ROLLBACK, so it creates two throwaway
-- auth users and a tracker, proves things about them, and leaves no trace.
--
-- >>> Unlike 00_preflight.sql, run this file AS ONE UNIT. <<<
-- It is a single transaction; splitting it apart breaks it.
--
-- The Supabase SQL editor will warn twice before running this. Both warnings
-- are expected, and the answer is "Run without RLS":
--
--   "destructive operations" — true as far as a static check can tell: this
--     inserts throwaway auth.users rows and deletes trackers, entries and
--     memberships. Every one of those is between the begin and the rollback
--     below, so nothing commits.
--   "creates a table without RLS" — that is trackr_results, which is a TEMP
--     table the linter doesn't recognise as one. Temp tables live in pg_temp
--     for a single session, so no anon/authenticated client can reach it, and
--     this one is dropped by the rollback regardless.
--
-- Reading the output: the second-to-last statement selects a table of every
-- check that ran, so if your client shows the last result set, you get a
-- readable pass/fail list. If it shows nothing (the editor may report only
-- the trailing ROLLBACK), that is still a pass — the real success condition
-- is "completed without raising", because the first failure raises an
-- exception with FAIL in the message and aborts, and errors are always shown.
--
-- No pgTAP needed. The mechanism is:
--   set local role authenticated  -> stop being the RLS-exempt superuser
--   set request.jwt.claims        -> make auth.uid() return whoever we want
-- and `reset role` to step back to postgres when seeding more data.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Harness (created as postgres, before we drop into RLS-land)
--
-- Results are recorded into a temp table as well as raised as notices,
-- because the Supabase SQL editor does not reliably surface NOTICE output.
-- The last statement before the rollback selects them back, so you get a
-- readable table either way. Failures still raise, which the editor always
-- shows — so "completed without an error" is the pass condition even if you
-- see no output at all.
-- ------------------------------------------------------------

create temp table trackr_results (
  seq   serial primary key,
  check_name text,
  ok    boolean
);

-- SECURITY DEFINER so recording still works after we drop into the
-- authenticated role, which has no grant on a postgres-owned temp table.
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
    true -- transaction-local
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
    raise exception 'FAIL: % — expected %, got %', p_label, p_expected, p_actual;
  end if;
  insert into pg_temp.trackr_results (check_name, ok)
  values (p_label || ' (' || p_actual || ')', true);
  raise notice 'pass: % (%)', p_label, p_actual;
end;
$fn$;

-- ------------------------------------------------------------
-- Fixtures
-- ------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner@trackr.test',
   '', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'friend@trackr.test',
   '', now(), now());

-- Tracker owned by A. The migration's trigger should give A an owner
-- membership row without us asking.
insert into public.trackers (id, user_id, name, icon, color)
values (
  'cccccccc-0000-4000-8000-000000000003'::uuid,
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'Gym', 'Dumbbell', 'grape'
);

insert into public.fields (
  id, user_id, tracker_id, name, type, config, default_value, "order"
)
values (
  'ddddddd0-0000-4000-8000-000000000004'::uuid,
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'cccccccc-0000-4000-8000-000000000003'::uuid,
  'Reps', 'count', '{"max": 10}'::jsonb, '0'::jsonb, 0
);

insert into public.entries (id, user_id, tracker_id, "values")
values (
  'eeeeeee0-0000-4000-8000-000000000005'::uuid,
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
  'cccccccc-0000-4000-8000-000000000003'::uuid,
  '{}'::jsonb
);

do $t$
begin
  if not exists (
    select 1 from public.tracker_members
    where tracker_id = 'cccccccc-0000-4000-8000-000000000003'::uuid
      and user_id = 'aaaaaaaa-0000-4000-8000-000000000001'::uuid
      and role = 'owner'
  ) then
    raise exception 'FAIL: insert trigger did not create the owner membership';
  end if;
  perform pg_temp.pass('new tracker got an owner membership row');
end;
$t$;

-- ------------------------------------------------------------
-- 1. Owner sees their own tracker (nothing regressed)
-- ------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001'::uuid);

select pg_temp.check_eq(
  'owner sees the tracker',
  (select count(*) from public.trackers), 1
);
select pg_temp.check_eq(
  'owner sees the field',
  (select count(*) from public.fields), 1
);
select pg_temp.check_eq(
  'owner sees the entry',
  (select count(*) from public.entries), 1
);

-- ------------------------------------------------------------
-- 2. THE ONE THAT MATTERS — a non-member sees nothing at all
--
-- Deliberately unfiltered counts: B owns no data, so anything other than
-- zero means a policy is leaking someone else's rows.
-- ------------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002'::uuid);

select pg_temp.check_eq(
  'non-member sees no trackers',
  (select count(*) from public.trackers), 0
);
select pg_temp.check_eq(
  'non-member sees no fields',
  (select count(*) from public.fields), 0
);
select pg_temp.check_eq(
  'non-member sees no entries',
  (select count(*) from public.entries), 0
);
select pg_temp.check_eq(
  'non-member sees no memberships',
  (select count(*) from public.tracker_members), 0
);

-- ...and cannot write either.
do $t$
begin
  begin
    insert into public.entries (id, user_id, tracker_id, "values")
    values (
      gen_random_uuid(),
      'bbbbbbbb-0000-4000-8000-000000000002'::uuid,
      'cccccccc-0000-4000-8000-000000000003'::uuid,
      '{}'::jsonb
    );
    raise exception 'FAIL: non-member inserted an entry';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('non-member cannot insert an entry');
  end;
end;
$t$;

-- Nor add themselves to the tracker.
do $t$
begin
  begin
    insert into public.tracker_members (tracker_id, user_id, role)
    values (
      'cccccccc-0000-4000-8000-000000000003'::uuid,
      'bbbbbbbb-0000-4000-8000-000000000002'::uuid,
      'editor'
    );
    raise exception 'FAIL: non-member granted themselves membership';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('non-member cannot self-grant membership');
  end;
end;
$t$;

-- ------------------------------------------------------------
-- 3. Viewer: reads everything, writes nothing
-- ------------------------------------------------------------

reset role;
insert into public.tracker_members (tracker_id, user_id, role)
values (
  'cccccccc-0000-4000-8000-000000000003'::uuid,
  'bbbbbbbb-0000-4000-8000-000000000002'::uuid,
  'viewer'
);

set local role authenticated;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002'::uuid);

select pg_temp.check_eq(
  'viewer sees the shared tracker',
  (select count(*) from public.trackers), 1
);
select pg_temp.check_eq(
  'viewer sees the fields',
  (select count(*) from public.fields), 1
);
select pg_temp.check_eq(
  'viewer sees the entries',
  (select count(*) from public.entries), 1
);
select pg_temp.check_eq(
  'viewer sees the member roster',
  (select count(*) from public.tracker_members), 2
);

do $t$
begin
  begin
    insert into public.entries (id, user_id, tracker_id, "values")
    values (
      gen_random_uuid(),
      'bbbbbbbb-0000-4000-8000-000000000002'::uuid,
      'cccccccc-0000-4000-8000-000000000003'::uuid,
      '{}'::jsonb
    );
    raise exception 'FAIL: viewer inserted an entry';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('viewer cannot insert an entry');
  end;
end;
$t$;

-- ------------------------------------------------------------
-- 4. Editor: writes entries, but the tracker's shape is not theirs
-- ------------------------------------------------------------

reset role;
update public.tracker_members
set role = 'editor'
where tracker_id = 'cccccccc-0000-4000-8000-000000000003'::uuid
  and user_id = 'bbbbbbbb-0000-4000-8000-000000000002'::uuid;

set local role authenticated;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002'::uuid);

insert into public.entries (id, user_id, tracker_id, "values")
values (
  'fffffff0-0000-4000-8000-000000000006'::uuid,
  'bbbbbbbb-0000-4000-8000-000000000002'::uuid,
  'cccccccc-0000-4000-8000-000000000003'::uuid,
  '{"reps": 5}'::jsonb
);
select pg_temp.check_eq(
  'editor can log an entry',
  (select count(*) from public.entries), 2
);

-- Editing the other person's entry is allowed — that is the shared-log point.
do $t$
declare
  n int;
begin
  update public.entries
  set "values" = '{"reps": 6}'::jsonb
  where id = 'eeeeeee0-0000-4000-8000-000000000005'::uuid;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: editor could not update a co-member entry (% rows)', n;
  end if;
  perform pg_temp.pass('editor can update a co-member entry');
end;
$t$;

-- Cannot log an entry attributed to someone else.
do $t$
begin
  begin
    insert into public.entries (id, user_id, tracker_id, "values")
    values (
      gen_random_uuid(),
      'aaaaaaaa-0000-4000-8000-000000000001'::uuid, -- impersonating the owner
      'cccccccc-0000-4000-8000-000000000003'::uuid,
      '{}'::jsonb
    );
    raise exception 'FAIL: editor forged an entry as another user';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('editor cannot forge authorship');
  end;
end;
$t$;

-- Cannot add or remove fields.
do $t$
begin
  begin
    insert into public.fields (
      id, user_id, tracker_id, name, type, config, default_value, "order"
    )
    values (
      gen_random_uuid(),
      'bbbbbbbb-0000-4000-8000-000000000002'::uuid,
      'cccccccc-0000-4000-8000-000000000003'::uuid,
      'Sneaky', 'text', '{}'::jsonb, null, 1
    );
    raise exception 'FAIL: editor added a field';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('editor cannot add a field');
  end;
end;
$t$;

-- RLS blocks non-matching UPDATE/DELETE by matching zero rows rather than
-- erroring, so these assert on row_count instead of catching an exception.
do $t$
declare
  n int;
begin
  update public.trackers
  set name = 'Renamed by an editor'
  where id = 'cccccccc-0000-4000-8000-000000000003'::uuid;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: editor renamed the tracker';
  end if;
  perform pg_temp.pass('editor cannot rename the tracker');
end;
$t$;

do $t$
declare
  n int;
begin
  delete from public.trackers
  where id = 'cccccccc-0000-4000-8000-000000000003'::uuid;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: editor deleted the tracker';
  end if;
  perform pg_temp.pass('editor cannot delete the tracker');
end;
$t$;

do $t$
declare
  n int;
begin
  delete from public.entries
  where id = 'eeeeeee0-0000-4000-8000-000000000005'::uuid; -- owner's entry
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: editor deleted someone else''s entry';
  end if;
  perform pg_temp.pass('editor cannot delete a co-member entry');
end;
$t$;

-- ------------------------------------------------------------
-- 5. Owner sees the friend's entry (and the friend is its author)
-- ------------------------------------------------------------

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001'::uuid);

select pg_temp.check_eq(
  'owner sees both entries',
  (select count(*) from public.entries), 2
);
select pg_temp.check_eq(
  'the friend is recorded as author of their own entry',
  (select count(*) from public.entries
   where id = 'fffffff0-0000-4000-8000-000000000006'::uuid
     and user_id = 'bbbbbbbb-0000-4000-8000-000000000002'::uuid),
  1
);

-- ------------------------------------------------------------
-- 6. Leaving: removing your own membership revokes your access
-- ------------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002'::uuid);

do $t$
declare
  n int;
begin
  delete from public.tracker_members
  where tracker_id = 'cccccccc-0000-4000-8000-000000000003'::uuid
    and user_id = 'bbbbbbbb-0000-4000-8000-000000000002'::uuid;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: member could not leave the tracker (% rows)', n;
  end if;
  perform pg_temp.pass('a member can leave');
end;
$t$;

select pg_temp.check_eq(
  'after leaving, the tracker is invisible again',
  (select count(*) from public.trackers), 0
);
select pg_temp.check_eq(
  'after leaving, the entries are invisible again',
  (select count(*) from public.entries), 0
);

-- ------------------------------------------------------------
-- 7. The owner cannot be locked out by losing their membership row
--    (the creator fallback in is_tracker_owner)
-- ------------------------------------------------------------

reset role;
delete from public.tracker_members
where tracker_id = 'cccccccc-0000-4000-8000-000000000003'::uuid;

set local role authenticated;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001'::uuid);

select pg_temp.check_eq(
  'creator still sees their tracker with no membership row',
  (select count(*) from public.trackers), 1
);

do $t$
declare
  n int;
begin
  update public.trackers
  set name = 'Still mine'
  where id = 'cccccccc-0000-4000-8000-000000000003'::uuid;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: creator locked out of their own tracker';
  end if;
  perform pg_temp.pass('creator retains ownership without a membership row');
end;
$t$;

-- ------------------------------------------------------------
-- 8. The migrate_user_data write shape still works under RLS
--
-- That RPC is not SECURITY DEFINER (SECURITY.md), so its inserts are checked
-- by the policies above: a fresh user creating a tracker and then that
-- tracker's fields and entries inside one transaction. This is the regression
-- test for making the write path depend on membership rows.
-- ------------------------------------------------------------

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002'::uuid);

do $t$
declare
  v_tracker uuid := '99999999-0000-4000-8000-000000000009'::uuid;
  v_user    uuid := 'bbbbbbbb-0000-4000-8000-000000000002'::uuid;
begin
  insert into public.trackers (id, user_id, name, icon, color)
  values (v_tracker, v_user, 'Imported', 'Box', 'sky');

  insert into public.fields (
    id, user_id, tracker_id, name, type, config, default_value, "order"
  )
  values (
    gen_random_uuid(), v_user, v_tracker,
    'Note', 'text', '{}'::jsonb, null, 0
  );

  insert into public.entries (id, user_id, tracker_id, "values")
  values (gen_random_uuid(), v_user, v_tracker, '{}'::jsonb);

  perform pg_temp.pass('migrate_user_data write shape succeeds under the new policies');
end;
$t$;

select pg_temp.check_eq(
  'the importing user can read back what they imported',
  (select count(*) from public.trackers
   where id = '99999999-0000-4000-8000-000000000009'::uuid),
  1
);

-- ...and the other user still cannot see any of it.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001'::uuid);
select pg_temp.check_eq(
  'imported tracker is invisible to everyone else',
  (select count(*) from public.trackers
   where id = '99999999-0000-4000-8000-000000000009'::uuid),
  0
);

-- ------------------------------------------------------------

reset role;

do $t$
begin
  raise notice '=======================';
  raise notice ' ALL TESTS PASSED';
  raise notice '=======================';
end;
$t$;

-- The visible artifact: one row per check, in the order they ran. Reaching
-- this table at all means nothing raised, which is the real pass condition.
select seq, check_name, ok from pg_temp.trackr_results order by seq;

rollback;
