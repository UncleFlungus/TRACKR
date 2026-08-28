-- ============================================================
-- Tracker sharing — phase 3a: live updates
--
-- Adds the app's tables to the `supabase_realtime` publication so Postgres
-- streams their changes. Without this, subscribing from the client succeeds
-- and then silently receives nothing, which is a confusing way to fail.
--
-- Realtime applies RLS to the events it delivers, so a subscriber is only sent
-- changes to rows they could have selected. A non-member listening to a
-- tracker's channel receives nothing.
--
-- One documented limitation worth knowing: DELETE events are not RLS-filtered
-- the way inserts and updates are, so a subscriber can learn that a row id
-- disappeared from a tracker they cannot read. No content is exposed — the
-- payload is the primary key. It doesn't reach the app either way: the client
-- uses these events purely as a signal to refetch, and the refetch is itself
-- RLS-scoped, so a non-member's refetch still returns nothing.
--
-- Idempotent: re-running is a no-op rather than an "already member of
-- publication" error.
-- ============================================================

begin;

do $do$
declare
  t text;
begin
  foreach t in array array['trackers', 'fields', 'entries', 'tracker_members']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        t
      );
    end if;
  end loop;
end;
$do$;

commit;

-- Verify:
--   select schemaname, tablename
--   from pg_publication_tables
--   where pubname = 'supabase_realtime'
--   order by tablename;
-- Expect entries, fields, tracker_members and trackers to be listed.
