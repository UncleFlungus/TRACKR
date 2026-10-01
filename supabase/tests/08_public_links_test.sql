-- Tests for public read-only links.
--
-- Same harness and rules as the other test files: run AS ONE UNIT, expect the
-- editor's two warnings, answer "Run without RLS". Reaching the results table
-- at the end means everything passed. Rolls back.
--
-- Cast of characters:
--   OWNER   owns the tracker and publishes it
--   VIEWER  a member with read access, who must not see or manage the link
--   anon    a signed-out visitor holding only the token

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

-- The token under test, carried between role switches.
create temp table trackr_token (token text);
grant all on trackr_token to anon, authenticated;

-- Fixtures

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at, email_confirmed_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   '4a000000-0000-4000-8000-00000000004a',
   'authenticated', 'authenticated', 'owner@public.test',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '4b000000-0000-4000-8000-00000000004b',
   'authenticated', 'authenticated', 'viewer@public.test',
   '', now(), now(), now());

insert into public.trackers (id, user_id, name, icon, color, settings)
values ('4f000000-0000-4000-8000-00000000004f'::uuid,
        '4a000000-0000-4000-8000-00000000004a'::uuid,
        'Ratings', 'Film', 'grape', '{"viewMode": "table"}'::jsonb);

insert into public.tracker_members (tracker_id, user_id, role)
values ('4f000000-0000-4000-8000-00000000004f'::uuid,
        '4b000000-0000-4000-8000-00000000004b'::uuid, 'viewer');

insert into public.fields (id, user_id, tracker_id, name, type, config, "order")
values ('4d000000-0000-4000-8000-00000000004d'::uuid,
        '4a000000-0000-4000-8000-00000000004a'::uuid,
        '4f000000-0000-4000-8000-00000000004f'::uuid,
        'Title', 'text', '{}'::jsonb, 0);

insert into public.entries (id, user_id, tracker_id, "values")
values
  ('4e000000-0000-4000-8000-00000000004e'::uuid,
   '4a000000-0000-4000-8000-00000000004a'::uuid,
   '4f000000-0000-4000-8000-00000000004f'::uuid,
   '{"4d000000-0000-4000-8000-00000000004d": "Steins Gate"}'::jsonb),
  ('4e000000-0000-4000-8000-00000000004c'::uuid,
   '4b000000-0000-4000-8000-00000000004b'::uuid,
   '4f000000-0000-4000-8000-00000000004f'::uuid,
   '{"4d000000-0000-4000-8000-00000000004d": "Exhuma"}'::jsonb);

-- 1. Only the owner manages the link

set local role authenticated;
select pg_temp.act_as('4b000000-0000-4000-8000-00000000004b'::uuid);

do $t$
begin
  begin
    insert into public.tracker_public_links (tracker_id)
    values ('4f000000-0000-4000-8000-00000000004f'::uuid);
    raise exception 'FAIL: a viewer published the tracker';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('a viewer cannot publish the tracker');
  end;
end;
$t$;

select pg_temp.act_as('4a000000-0000-4000-8000-00000000004a'::uuid);

do $t$
begin
  begin
    insert into public.tracker_public_links (tracker_id, token)
    values ('4f000000-0000-4000-8000-00000000004f'::uuid, 'guessable');
    raise exception 'FAIL: the owner chose their own token';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('a caller cannot choose the token');
  end;
end;
$t$;

insert into public.tracker_public_links (tracker_id)
values ('4f000000-0000-4000-8000-00000000004f'::uuid);

insert into trackr_token
select token from public.tracker_public_links
where tracker_id = '4f000000-0000-4000-8000-00000000004f'::uuid;

select pg_temp.check_eq(
  'the generated token is 32 hex characters',
  (select count(*) from trackr_token where token ~ '^[0-9a-f]{32}$'), 1
);

do $t$
begin
  begin
    update public.tracker_public_links set token = 'guessable';
    raise exception 'FAIL: a token was rewritten in place';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('a token cannot be rewritten in place');
  end;
end;
$t$;

select pg_temp.act_as('4b000000-0000-4000-8000-00000000004b'::uuid);

select pg_temp.check_eq(
  'a viewer cannot read the token',
  (select count(*) from public.tracker_public_links), 0
);

delete from public.tracker_public_links;

select pg_temp.check_eq(
  'a viewer cannot revoke the link',
  (select count(*) from trackr_token t
   where public.public_tracker(t.token) is not null), 1
);

-- 2. Anon reads through the function and nowhere else

reset role;
set local role anon;

do $t$
begin
  begin
    perform 1 from public.tracker_public_links;
    raise exception 'FAIL: anon read the links table';
  exception
    when insufficient_privilege then
      perform pg_temp.pass('anon cannot read the links table');
  end;
end;
$t$;

select pg_temp.check_eq(
  'anon gets both entries through the token',
  (select jsonb_array_length(public.public_tracker(t.token) -> 'entries')
   from trackr_token t), 2
);

select pg_temp.check_eq(
  'the payload carries the tracker name and view',
  (select count(*) from trackr_token t
   where public.public_tracker(t.token) -> 'tracker' ->> 'name' = 'Ratings'
     and public.public_tracker(t.token) -> 'tracker' ->> 'viewMode' = 'table'),
  1
);

select pg_temp.check_eq(
  'no author ids reach the payload',
  (select count(*) from trackr_token t
   where public.public_tracker(t.token)::text like '%4a000000-0000-4000-8000%'
      or public.public_tracker(t.token)::text like '%4b000000-0000-4000-8000%'),
  0
);

select pg_temp.check_eq(
  'an unknown token returns nothing',
  (select count(*) where public.public_tracker('0123456789abcdef0123456789abcdef') is null),
  1
);

-- 3. Revoking closes the door

reset role;
set local role authenticated;
select pg_temp.act_as('4a000000-0000-4000-8000-00000000004a'::uuid);

delete from public.tracker_public_links
where tracker_id = '4f000000-0000-4000-8000-00000000004f'::uuid;

reset role;
set local role anon;

select pg_temp.check_eq(
  'a revoked token returns nothing',
  (select count(*) from trackr_token t
   where public.public_tracker(t.token) is null), 1
);

reset role;

select seq, check_name, ok from pg_temp.trackr_results order by seq;

rollback;
