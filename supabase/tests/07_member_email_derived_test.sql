-- ============================================================
-- The roster email cannot be asserted by a caller.
-- Run AS ONE UNIT; rolls back.
-- ============================================================

begin;

create temp table trackr_results (
  seq   serial primary key,
  check_name text,
  ok    boolean
);

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
    raise exception 'FAIL: % — expected %, got %',
      p_label, coalesce(p_expected, 'null'), coalesce(p_actual, 'null');
  end if;
  insert into pg_temp.trackr_results (check_name, ok)
  values (p_label || ' (' || coalesce(p_actual, 'null') || ')', true);
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

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at, email_confirmed_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   '3a000000-0000-4000-8000-00000000003a',
   'authenticated', 'authenticated', 'owner@derived.test',
   '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '3b000000-0000-4000-8000-00000000003b',
   'authenticated', 'authenticated', 'member@derived.test',
   '', now(), now(), now());

insert into public.trackers (id, user_id, name, icon, color)
values ('3f000000-0000-4000-8000-00000000003f'::uuid,
        '3a000000-0000-4000-8000-00000000003a'::uuid,
        'Gym', 'Dumbbell', 'grape');

set local role authenticated;
select pg_temp.act_as('3a000000-0000-4000-8000-00000000003a'::uuid);

-- The owner adds a real member, but supplies an address of their choosing.
insert into public.tracker_members (tracker_id, user_id, role, email)
values ('3f000000-0000-4000-8000-00000000003f'::uuid,
        '3b000000-0000-4000-8000-00000000003b'::uuid,
        'editor',
        'someone.else@evil.test');

select pg_temp.check_text(
  'a supplied email is ignored on insert',
  (select email from public.tracker_members
   where user_id = '3b000000-0000-4000-8000-00000000003b'::uuid),
  'member@derived.test'
);

-- And cannot be rewritten afterwards either.
update public.tracker_members
set email = 'someone.else@evil.test'
where user_id = '3b000000-0000-4000-8000-00000000003b'::uuid;

select pg_temp.check_text(
  'and cannot be overwritten by a later update',
  (select email from public.tracker_members
   where user_id = '3b000000-0000-4000-8000-00000000003b'::uuid),
  'member@derived.test'
);

-- A legitimate role change still works and keeps the derived address.
update public.tracker_members
set role = 'viewer'
where user_id = '3b000000-0000-4000-8000-00000000003b'::uuid;

select pg_temp.check_text(
  'a role change leaves the derived address intact',
  (select role || ' ' || email from public.tracker_members
   where user_id = '3b000000-0000-4000-8000-00000000003b'::uuid),
  'viewer member@derived.test'
);

reset role;

select seq, check_name, ok from pg_temp.trackr_results order by seq;

rollback;
