-- Changing your account email updates it wherever co-members see it.
-- Run AS ONE UNIT; rolls back.

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
    raise exception 'FAIL: %: expected %, got %',
      p_label, coalesce(p_expected, 'null'), coalesce(p_actual, 'null');
  end if;
  insert into pg_temp.trackr_results (check_name, ok)
  values (p_label || ' (' || coalesce(p_actual, 'null') || ')', true);
end;
$fn$;

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at, email_confirmed_at
)
values ('00000000-0000-0000-0000-000000000000',
        '2a000000-0000-4000-8000-00000000002a',
        'authenticated', 'authenticated', 'before@sync.test',
        '', now(), now(), now());

insert into public.trackers (id, user_id, name, icon, color)
values ('2f000000-0000-4000-8000-00000000002f'::uuid,
        '2a000000-0000-4000-8000-00000000002a'::uuid,
        'Gym', 'Dumbbell', 'grape');

select pg_temp.check_text(
  'the membership starts with the original address',
  (select email from public.tracker_members
   where user_id = '2a000000-0000-4000-8000-00000000002a'::uuid),
  'before@sync.test'
);

-- The event this whole migration exists for.
update auth.users
set email = '  After@Sync.Test  '
where id = '2a000000-0000-4000-8000-00000000002a'::uuid;

select pg_temp.check_text(
  'changing the account email updates the roster, normalised',
  (select email from public.tracker_members
   where user_id = '2a000000-0000-4000-8000-00000000002a'::uuid),
  'after@sync.test'
);

-- A write that doesn't touch the email must not fire the trigger's update.
-- Nothing observable to assert beyond the value staying put, but this is the
-- case that would otherwise run on every single sign-in.
update auth.users
set last_sign_in_at = now()
where id = '2a000000-0000-4000-8000-00000000002a'::uuid;

select pg_temp.check_text(
  'an unrelated auth write leaves the roster alone',
  (select email from public.tracker_members
   where user_id = '2a000000-0000-4000-8000-00000000002a'::uuid),
  'after@sync.test'
);

select seq, check_name, ok from pg_temp.trackr_results order by seq;

rollback;
