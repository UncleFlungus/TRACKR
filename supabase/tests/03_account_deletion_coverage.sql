-- ============================================================
-- Does account deletion leave anything of the user behind?
--
-- Context: the previous delete_my_account was replaced before its source was
-- captured, so we cannot diff old against new. This test answers the question
-- that actually matters without needing the old body — it checks the END
-- STATE rather than the implementation.
--
-- The invariant: after delete_my_account, NO ROW ANYWHERE in the database
-- references the departed user's id.
--
-- It is enforced by walking pg_constraint for every foreign key that points at
-- auth.users(id) — across every schema, including tables this project has
-- never heard of and Supabase's own auth.* tables — and counting rows still
-- pointing at the deleted user. So if the old function cleaned up something
-- the new one doesn't, this fails and names the table.
--
-- Note that the invariant holds for both disposal styles:
--   ON DELETE CASCADE   the row is gone, so it cannot reference anyone
--   ON DELETE SET NULL  the row survives but no longer references the user
-- which is why entries (deliberately preserved, anonymised) still pass.
--
-- Run AS ONE UNIT. Same editor warnings as the other tests; "Run without RLS".
-- ============================================================

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

-- ------------------------------------------------------------
-- A user with data of every shape we know how to make: a private tracker
-- with a field and an entry, plus a membership and a contributed entry in
-- somebody else's tracker.
-- ------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   'dddddddd-0000-4000-8000-00000000000d',
   'authenticated', 'authenticated', 'residue@trackr.test', '', now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'eeeeeeee-0000-4000-8000-00000000000e',
   'authenticated', 'authenticated', 'host@trackr.test', '', now(), now());

insert into public.trackers (id, user_id, name, icon, color)
values ('dddddddd-0000-4000-8000-0000000000d1'::uuid,
        'dddddddd-0000-4000-8000-00000000000d'::uuid,
        'Mine', 'Box', 'grape');

insert into public.fields (
  id, user_id, tracker_id, name, type, config, default_value, "order"
)
values ('dddddddd-0000-4000-8000-0000000000d2'::uuid,
        'dddddddd-0000-4000-8000-00000000000d'::uuid,
        'dddddddd-0000-4000-8000-0000000000d1'::uuid,
        'Note', 'text', '{}'::jsonb, null, 0);

insert into public.entries (id, user_id, tracker_id, "values")
values ('dddddddd-0000-4000-8000-0000000000d3'::uuid,
        'dddddddd-0000-4000-8000-00000000000d'::uuid,
        'dddddddd-0000-4000-8000-0000000000d1'::uuid, '{}'::jsonb);

-- Somebody else's tracker, which this user contributes to.
insert into public.trackers (id, user_id, name, icon, color)
values ('eeeeeeee-0000-4000-8000-0000000000e1'::uuid,
        'eeeeeeee-0000-4000-8000-00000000000e'::uuid,
        'Theirs', 'Box', 'sky');

insert into public.tracker_members (tracker_id, user_id, role)
values ('eeeeeeee-0000-4000-8000-0000000000e1'::uuid,
        'dddddddd-0000-4000-8000-00000000000d'::uuid,
        'editor');

insert into public.entries (id, user_id, tracker_id, "values")
values ('eeeeeeee-0000-4000-8000-0000000000e2'::uuid,
        'dddddddd-0000-4000-8000-00000000000d'::uuid,
        'eeeeeeee-0000-4000-8000-0000000000e1'::uuid, '{"note": "theirs"}'::jsonb);

-- ------------------------------------------------------------
-- Delete, then sweep the whole schema for residue
-- ------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('dddddddd-0000-4000-8000-00000000000d'::uuid);
select public.delete_my_account();

reset role;

do $t$
declare
  v_user uuid := 'dddddddd-0000-4000-8000-00000000000d'::uuid;
  r      record;
  n      bigint;
  checked int := 0;
begin
  for r in
    select
      con.conrelid::regclass::text as tbl,
      att.attname::text            as col
    from pg_constraint con
    join pg_class ref       on ref.oid = con.confrelid
    join pg_namespace refn  on refn.oid = ref.relnamespace
    cross join lateral generate_subscripts(con.conkey, 1) as i
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = con.conkey[i]
    join pg_attribute refatt
      on refatt.attrelid = con.confrelid and refatt.attnum = con.confkey[i]
    where con.contype = 'f'
      and refn.nspname = 'auth'
      and ref.relname  = 'users'
      and refatt.attname = 'id'
    order by 1, 2
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col)
      into n
      using v_user;

    checked := checked + 1;

    if n <> 0 then
      insert into pg_temp.trackr_results (check_name, ok)
      values ('residue in ' || r.tbl || '.' || r.col, false);
      raise exception
        'FAIL: % row(s) still reference the deleted user in %.%',
        n, r.tbl, r.col;
    end if;

    perform pg_temp.pass('no residue in ' || r.tbl || '.' || r.col);
  end loop;

  -- If the introspection query matched nothing, the sweep proved nothing.
  if checked = 0 then
    raise exception
      'FAIL: found no foreign keys referencing auth.users — the sweep is broken, not clean';
  end if;

  perform pg_temp.pass(
    'swept ' || checked || ' foreign key column(s) referencing auth.users'
  );
end;
$t$;

-- The auth row itself.
do $t$
begin
  if exists (
    select 1 from auth.users
    where id = 'dddddddd-0000-4000-8000-00000000000d'::uuid
  ) then
    raise exception 'FAIL: the auth.users row survived';
  end if;
  perform pg_temp.pass('the auth.users row is gone');
end;
$t$;

-- And the deliberate survivor: the contributed entry is still in the other
-- user's tracker, just no longer attributable. This is the one thing that is
-- SUPPOSED to outlive the account, so assert it rather than let the sweep
-- above quietly pass because the row was deleted.
do $t$
begin
  if not exists (
    select 1 from public.entries
    where id = 'eeeeeeee-0000-4000-8000-0000000000e2'::uuid
      and user_id is null
  ) then
    raise exception
      'FAIL: the contributed entry did not survive as an anonymised row';
  end if;
  perform pg_temp.pass('contributed entry survives, anonymised, in the other tracker');
end;
$t$;

select seq, check_name, ok from pg_temp.trackr_results order by seq;

rollback;
