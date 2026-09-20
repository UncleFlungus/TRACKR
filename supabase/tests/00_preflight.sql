-- Preflight: snapshot the CURRENT schema before applying sharing.
--
-- >>> RUN THE THREE STATEMENTS BELOW ONE AT A TIME. <<<
--
-- The Supabase SQL editor only returns the result of the LAST statement in a
-- run. If you paste this whole file and hit Run, statements A and B are
-- executed and then thrown away, and you see only C. Select one statement at
-- a time and run it (the editor runs just the highlighted text).
--
--   A: current policies.   Save this output; it's the one that matters.
--   B: assumption checks.  One row per check, with an `ok` column.
--   C: constraints.        Confirms the cascade behaviour sharing relies on.
--
-- A matters most because the migration drops and recreates every policy on
-- these tables. SECURITY.md documents what they should be, and the rollback
-- script is written from that document, but this output is the ground truth if
-- the two ever disagree.


-- Statement A: current policies. Save this output.

select
  tablename,
  policyname,
  cmd,
  roles,
  qual          as using_expression,
  with_check    as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('trackers', 'fields', 'entries')
order by tablename, cmd, policyname;


-- Statement B: assumption checks
--
-- Every row should read ok = true. Failures sort to the top.
-- A false anywhere means stop and look before migrating.

with checks as (

  -- RLS has to already be on, or the "nothing changes" claim is false.
  select
    'RLS enabled on ' || c.relname                    as check_name,
    c.relrowsecurity::text                            as value,
    'true'                                            as expected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('trackers', 'fields', 'entries')

  union all

  -- The columns the migration's policies are written against.
  select
    'column type ' || table_name || '.' || column_name,
    data_type,
    'uuid'
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name in ('trackers', 'fields', 'entries') and column_name = 'user_id')
      or (table_name in ('fields', 'entries') and column_name = 'tracker_id')
    )

  union all

  -- Expected false on a first run. True means a previous apply got part-way
  -- through, and you should read the migration before re-running it.
  select
    'tracker_members already exists',
    exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'tracker_members'
    )::text,
    'false'

  union all

  -- Ownerless trackers get no membership row in the backfill, and would end up
  -- reachable by nobody.
  select
    'trackers with null user_id',
    (select count(*) from public.trackers where user_id is null)::text,
    '0'

  union all

  -- Rows whose visibility would CHANGE hands.
  --
  -- Today a field/entry is reachable when its OWN user_id matches the caller.
  -- Afterwards it is reachable when the caller is a member of its TRACKER.
  -- Those rules agree for every row where the child's user_id equals its
  -- tracker's user_id, which should be all of them, since cloud.ts stamps both
  -- from the same session.
  select
    'fields whose user_id differs from their tracker owner',
    (
      select count(*)
      from public.fields f
      join public.trackers t on t.id = f.tracker_id
      where f.user_id is distinct from t.user_id
    )::text,
    '0'

  union all

  select
    'entries whose user_id differs from their tracker owner',
    (
      select count(*)
      from public.entries e
      join public.trackers t on t.id = e.tracker_id
      where e.user_id is distinct from t.user_id
    )::text,
    '0'

  union all

  -- Orphans become permanently unreachable once access is derived from the
  -- tracker and there is no tracker. The FK should make this impossible.
  select
    'orphaned fields (tracker missing)',
    (
      select count(*)
      from public.fields f
      left join public.trackers t on t.id = f.tracker_id
      where t.id is null
    )::text,
    '0'

  union all

  select
    'orphaned entries (tracker missing)',
    (
      select count(*)
      from public.entries e
      left join public.trackers t on t.id = e.tracker_id
      where t.id is null
    )::text,
    '0'
)
select
  check_name,
  value,
  expected,
  (value = expected) as ok
from checks
order by ok, check_name;


-- Statement C: foreign keys and check constraints
--
-- Confirms fields.tracker_id / entries.tracker_id reference trackers(id)
-- with ON DELETE CASCADE, which is what tracker_members piggybacks on.

select
  rel.relname       as table_name,
  con.conname       as constraint_name,
  case con.contype when 'f' then 'foreign key' when 'c' then 'check' end as kind,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
  and rel.relname in ('trackers', 'fields', 'entries')
  and con.contype in ('f', 'c')
order by rel.relname, con.contype, con.conname;
