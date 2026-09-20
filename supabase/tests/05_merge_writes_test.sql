-- Tests for merge_entry_values and increment_entry_value.
--
-- Same harness and rules as the other test files. Run AS ONE UNIT.
--
-- What this cannot test: the actual race. Two genuinely concurrent writers
-- need two sessions, and everything here runs in one transaction. What it
-- does test is every property the fix depends on: that a merge leaves
-- untouched keys alone, that stepping starts from the stored value rather
-- than one supplied by the caller, that clamps hold, and that RLS still
-- decides who may write. The atomicity itself comes from doing the read and
-- the write in a single UPDATE, which is a property of the statement rather
-- than something a single-session test could observe.

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

create or replace function pg_temp.check_text(
  p_label text,
  p_actual text,
  p_expected text
)
returns void
language plpgsql
security definer
as $fn$
begin
  if p_actual is distinct from p_expected then
    insert into pg_temp.trackr_results (check_name, ok) values (p_label, false);
    raise exception 'FAIL: %: expected %, got %',
      p_label, coalesce(p_expected, 'null'), coalesce(p_actual, 'null');
  end if;
  insert into pg_temp.trackr_results (check_name, ok)
  values (p_label || ' (' || coalesce(p_actual, 'null') || ')', true);
  raise notice 'pass: % (%)', p_label, p_actual;
end;
$fn$;

-- Fixtures: a shared tracker, an owner, an editor and a viewer

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at, email_confirmed_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   '1a000000-0000-4000-8000-00000000001a',
   'authenticated', 'authenticated', 'owner@merge.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '1b000000-0000-4000-8000-00000000001b',
   'authenticated', 'authenticated', 'editor@merge.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '1c000000-0000-4000-8000-00000000001c',
   'authenticated', 'authenticated', 'viewer@merge.test', '', now(), now(), now());

insert into public.trackers (id, user_id, name, icon, color)
values ('1f000000-0000-4000-8000-00000000001f'::uuid,
        '1a000000-0000-4000-8000-00000000001a'::uuid,
        'Gym', 'Dumbbell', 'grape');

insert into public.tracker_members (tracker_id, user_id, role)
values
  ('1f000000-0000-4000-8000-00000000001f'::uuid,
   '1b000000-0000-4000-8000-00000000001b'::uuid, 'editor'),
  ('1f000000-0000-4000-8000-00000000001f'::uuid,
   '1c000000-0000-4000-8000-00000000001c'::uuid, 'viewer');

-- reps is the count field; notes is what the other person is editing.
insert into public.entries (id, user_id, tracker_id, "values")
values ('1e000000-0000-4000-8000-00000000001e'::uuid,
        '1a000000-0000-4000-8000-00000000001a'::uuid,
        '1f000000-0000-4000-8000-00000000001f'::uuid,
        '{"reps": 5, "notes": "felt good"}'::jsonb);

set local role authenticated;

-- 1. A merge leaves keys it did not name alone
--
-- This is the cross-field clobbering fix: the editor writes reps while the
-- notes they never saw survive untouched.

select pg_temp.act_as('1b000000-0000-4000-8000-00000000001b'::uuid);

select pg_temp.check_text(
  'merging reps returns the merged map',
  (select public.merge_entry_values(
     '1e000000-0000-4000-8000-00000000001e'::uuid,
     '{"reps": 9}'::jsonb
   ))::text,
  '{"reps": 9, "notes": "felt good"}'
);

select pg_temp.check_text(
  'the notes the writer never sent are still there',
  (select "values" ->> 'notes' from public.entries
   where id = '1e000000-0000-4000-8000-00000000001e'::uuid),
  'felt good'
);

-- A patch can introduce a new key without disturbing the rest.
select pg_temp.check_text(
  'merging adds a key it has not seen before',
  (select public.merge_entry_values(
     '1e000000-0000-4000-8000-00000000001e'::uuid,
     '{"weight": 60}'::jsonb
   )) ->> 'weight',
  '60'
);
select pg_temp.check_text(
  'and still leaves the others intact',
  (select "values" ->> 'reps' from public.entries
   where id = '1e000000-0000-4000-8000-00000000001e'::uuid),
  '9'
);

-- 2. Stepping starts from the stored value, not one the caller supplies
--
-- The signature has no "current value" parameter, which is the point:
-- there is no stale number for a caller to pass in.

select pg_temp.check_text(
  'stepping up reads the stored value and adds to it',
  (select public.increment_entry_value(
     '1e000000-0000-4000-8000-00000000001e'::uuid, 'reps', 1, 10
   ))::text,
  '10'
);

select pg_temp.check_text(
  'the clamp holds at the maximum',
  (select public.increment_entry_value(
     '1e000000-0000-4000-8000-00000000001e'::uuid, 'reps', 1, 10
   ))::text,
  '10'
);

select pg_temp.check_text(
  'stepping down works too',
  (select public.increment_entry_value(
     '1e000000-0000-4000-8000-00000000001e'::uuid, 'reps', -3, 10
   ))::text,
  '7'
);

select pg_temp.check_text(
  'and cannot go below zero',
  (select public.increment_entry_value(
     '1e000000-0000-4000-8000-00000000001e'::uuid, 'reps', -99, 10
   ))::text,
  '0'
);

-- A missing key starts at zero rather than failing.
select pg_temp.check_text(
  'stepping a field that has no value yet starts from zero',
  (select public.increment_entry_value(
     '1e000000-0000-4000-8000-00000000001e'::uuid, 'sets', 1, 5
   ))::text,
  '1'
);

-- So does a slot holding something that isn't a number.
select public.merge_entry_values(
  '1e000000-0000-4000-8000-00000000001e'::uuid,
  '{"junk": "not a number"}'::jsonb
);
select pg_temp.check_text(
  'a non-numeric value counts as zero instead of erroring',
  (select public.increment_entry_value(
     '1e000000-0000-4000-8000-00000000001e'::uuid, 'junk', 2, 10
   ))::text,
  '2'
);

-- Stepping must not disturb neighbouring keys either.
select pg_temp.check_text(
  'stepping leaves other fields alone',
  (select "values" ->> 'notes' from public.entries
   where id = '1e000000-0000-4000-8000-00000000001e'::uuid),
  'felt good'
);

-- 3. RLS still decides who may write
--
-- Neither function is SECURITY DEFINER, so a viewer gets nowhere. The update
-- simply matches no rows, which surfaces as the not-found exception.

select pg_temp.act_as('1c000000-0000-4000-8000-00000000001c'::uuid);

do $t$
begin
  begin
    perform public.merge_entry_values(
      '1e000000-0000-4000-8000-00000000001e'::uuid,
      '{"reps": 999}'::jsonb
    );
    raise exception 'FAIL: a viewer merged into an entry';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.pass('a viewer cannot merge into an entry');
  end;
end;
$t$;

do $t$
begin
  begin
    perform public.increment_entry_value(
      '1e000000-0000-4000-8000-00000000001e'::uuid, 'reps', 1, 10
    );
    raise exception 'FAIL: a viewer stepped a counter';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.pass('a viewer cannot step a counter');
  end;
end;
$t$;

-- And a stranger to the tracker gets the same treatment.
select pg_temp.act_as('00000000-0000-4000-8000-000000000000'::uuid);

do $t$
begin
  begin
    perform public.increment_entry_value(
      '1e000000-0000-4000-8000-00000000001e'::uuid, 'reps', 1, 10
    );
    raise exception 'FAIL: a stranger stepped a counter';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.pass('a stranger cannot step a counter');
  end;
end;
$t$;

-- Nothing they attempted took effect.
reset role;
select pg_temp.check_text(
  'the entry is unchanged after the refused writes',
  (select "values" ->> 'reps' from public.entries
   where id = '1e000000-0000-4000-8000-00000000001e'::uuid),
  '0'
);

-- 4. Rubbish in the patch is refused

set local role authenticated;
select pg_temp.act_as('1b000000-0000-4000-8000-00000000001b'::uuid);

do $t$
begin
  begin
    perform public.merge_entry_values(
      '1e000000-0000-4000-8000-00000000001e'::uuid,
      '"just a string"'::jsonb
    );
    raise exception 'FAIL: a non-object patch was accepted';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
      perform pg_temp.pass('a non-object patch is refused');
  end;
end;
$t$;

reset role;

select seq, check_name, ok from pg_temp.trackr_results order by seq;

rollback;
