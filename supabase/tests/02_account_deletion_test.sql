-- Tests for delete_my_account under shared trackers.
--
-- Same harness and same rules as 01_sharing_policies_test.sql:
--   * run AS ONE UNIT, it is a single transaction ending in ROLLBACK
--   * the editor's "destructive operations" / "table without RLS" warnings are
--     expected; answer "Run without RLS"
--   * a failure raises with FAIL in the message; reaching the results table at
--     the end means everything passed
--
-- The scenario: user A closes their account while holding
--   T1: a tracker A owns and shares with B, both having logged entries
--   T2: a private tracker only A is in
--   T3: B's tracker, which A contributes entries to

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
  encrypted_password, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   'aaaaaaaa-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'leaver@trackr.test', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'bbbbbbbb-0000-4000-8000-00000000000b',
   'authenticated', 'authenticated', 'stayer@trackr.test', '', now(), now());

-- T1: A owns, shared with B.
insert into public.trackers (id, user_id, name, icon, color)
values ('11111111-0000-4000-8000-000000000001'::uuid,
        'aaaaaaaa-0000-4000-8000-00000000000a'::uuid,
        'Shared gym', 'Dumbbell', 'grape');

insert into public.fields (
  id, user_id, tracker_id, name, type, config, default_value, "order"
)
values ('11111111-0000-4000-8000-0000000000f1'::uuid,
        'aaaaaaaa-0000-4000-8000-00000000000a'::uuid,
        '11111111-0000-4000-8000-000000000001'::uuid,
        'Reps', 'count', '{"max": 10}'::jsonb, '0'::jsonb, 0);

insert into public.tracker_members (tracker_id, user_id, role)
values ('11111111-0000-4000-8000-000000000001'::uuid,
        'bbbbbbbb-0000-4000-8000-00000000000b'::uuid,
        'editor');

insert into public.entries (id, user_id, tracker_id, "values")
values
  ('11111111-0000-4000-8000-0000000000e1'::uuid,
   'aaaaaaaa-0000-4000-8000-00000000000a'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid, '{"reps": 5}'::jsonb),
  ('11111111-0000-4000-8000-0000000000e2'::uuid,
   'bbbbbbbb-0000-4000-8000-00000000000b'::uuid,
   '11111111-0000-4000-8000-000000000001'::uuid, '{"reps": 8}'::jsonb);

-- T2: A's private tracker.
insert into public.trackers (id, user_id, name, icon, color)
values ('22222222-0000-4000-8000-000000000002'::uuid,
        'aaaaaaaa-0000-4000-8000-00000000000a'::uuid,
        'Private', 'Box', 'sky');

insert into public.entries (id, user_id, tracker_id, "values")
values ('22222222-0000-4000-8000-0000000000e3'::uuid,
        'aaaaaaaa-0000-4000-8000-00000000000a'::uuid,
        '22222222-0000-4000-8000-000000000002'::uuid, '{}'::jsonb);

-- T3: B owns, A contributes.
insert into public.trackers (id, user_id, name, icon, color)
values ('33333333-0000-4000-8000-000000000003'::uuid,
        'bbbbbbbb-0000-4000-8000-00000000000b'::uuid,
        'Their tracker', 'Box', 'emerald');

insert into public.tracker_members (tracker_id, user_id, role)
values ('33333333-0000-4000-8000-000000000003'::uuid,
        'aaaaaaaa-0000-4000-8000-00000000000a'::uuid,
        'editor');

insert into public.entries (id, user_id, tracker_id, "values")
values ('33333333-0000-4000-8000-0000000000e4'::uuid,
        'aaaaaaaa-0000-4000-8000-00000000000a'::uuid,
        '33333333-0000-4000-8000-000000000003'::uuid, '{"note": "mine"}'::jsonb);

-- Delete A's account, as A

set local role authenticated;
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-00000000000a'::uuid);
select public.delete_my_account();

-- Assertions run as postgres so they see ground truth rather than whatever
-- RLS would show a particular caller.
reset role;


select pg_temp.check_eq(
  'the auth user is gone',
  (select count(*) from auth.users
   where id = 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid), 0
);
select pg_temp.check_eq(
  'no memberships left anywhere for the departed user',
  (select count(*) from public.tracker_members
   where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid), 0
);


select pg_temp.check_eq(
  'the private tracker is deleted',
  (select count(*) from public.trackers
   where id = '22222222-0000-4000-8000-000000000002'::uuid), 0
);
select pg_temp.check_eq(
  'the private tracker''s entries go with it',
  (select count(*) from public.entries
   where tracker_id = '22222222-0000-4000-8000-000000000002'::uuid), 0
);


select pg_temp.check_eq(
  'the shared tracker survives',
  (select count(*) from public.trackers
   where id = '11111111-0000-4000-8000-000000000001'::uuid), 1
);
select pg_temp.check_eq(
  'the shared tracker is reassigned to the remaining member',
  (select count(*) from public.trackers
   where id = '11111111-0000-4000-8000-000000000001'::uuid
     and user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'::uuid), 1
);
select pg_temp.check_eq(
  'the remaining member is now its owner',
  (select count(*) from public.tracker_members
   where tracker_id = '11111111-0000-4000-8000-000000000001'::uuid
     and user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'::uuid
     and role = 'owner'), 1
);

-- The one that would silently break: fields.user_id also cascades, so a
-- transferred tracker can arrive with its schema missing.
select pg_temp.check_eq(
  'the transferred tracker keeps its fields',
  (select count(*) from public.fields
   where tracker_id = '11111111-0000-4000-8000-000000000001'::uuid), 1
);

select pg_temp.check_eq(
  'both entries survive in the transferred tracker',
  (select count(*) from public.entries
   where tracker_id = '11111111-0000-4000-8000-000000000001'::uuid), 2
);
select pg_temp.check_eq(
  'the departed author''s entry is kept but anonymised',
  (select count(*) from public.entries
   where id = '11111111-0000-4000-8000-0000000000e1'::uuid
     and user_id is null), 1
);
select pg_temp.check_eq(
  'the remaining member''s own entry keeps its author',
  (select count(*) from public.entries
   where id = '11111111-0000-4000-8000-0000000000e2'::uuid
     and user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'::uuid), 1
);


select pg_temp.check_eq(
  'the other user''s tracker is untouched',
  (select count(*) from public.trackers
   where id = '33333333-0000-4000-8000-000000000003'::uuid
     and user_id = 'bbbbbbbb-0000-4000-8000-00000000000b'::uuid), 1
);
select pg_temp.check_eq(
  'entries contributed to it survive, anonymised',
  (select count(*) from public.entries
   where id = '33333333-0000-4000-8000-0000000000e4'::uuid
     and user_id is null), 1
);


set local role authenticated;
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-00000000000b'::uuid);

select pg_temp.check_eq(
  'the heir can read the inherited tracker',
  (select count(*) from public.trackers
   where id = '11111111-0000-4000-8000-000000000001'::uuid), 1
);

do $t$
declare
  n int;
begin
  update public.trackers
  set name = 'Now mine'
  where id = '11111111-0000-4000-8000-000000000001'::uuid;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: heir cannot administer the inherited tracker';
  end if;
  perform pg_temp.pass('the heir has real ownership, not just visibility');
end;
$t$;

do $t$
begin
  insert into public.fields (
    id, user_id, tracker_id, name, type, config, default_value, "order"
  )
  values (
    gen_random_uuid(),
    'bbbbbbbb-0000-4000-8000-00000000000b'::uuid,
    '11111111-0000-4000-8000-000000000001'::uuid,
    'Sets', 'number', '{}'::jsonb, null, 1
  );
  perform pg_temp.pass('the heir can edit the inherited tracker''s fields');
end;
$t$;


do $t$
begin
  perform set_config('request.jwt.claims', null, true);
  begin
    perform public.delete_my_account();
    raise exception 'FAIL: delete_my_account ran without a caller';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then
        raise;
      end if;
      perform pg_temp.pass('delete_my_account rejects unauthenticated callers');
  end;
end;
$t$;


reset role;

select seq, check_name, ok from pg_temp.trackr_results order by seq;

rollback;
