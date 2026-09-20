-- A record of what has been applied
--
-- Migrations here are run by hand in the SQL editor, so nothing anywhere
-- states which of them a given database has seen. That is survivable with one
-- database and one person, and stops being survivable the moment there is a
-- staging project, a second machine, or a six-month gap in memory.
--
-- This is not a migration runner. It is a ledger: each migration records its
-- own version as its last statement, so `select * from schema_migrations`
-- answers "what does this database have?".
--
-- The versions below are backfilled because they were applied before the
-- ledger existed. Every migration from here on ends with its own insert.

begin;

create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- Server-side bookkeeping. No client has any business reading or writing it,
-- and RLS with no policies denies everything by default.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

insert into public.schema_migrations (version) values
  ('20260827120000_tracker_sharing'),
  ('20260827130000_account_deletion_sharing'),
  ('20260827140000_tracker_invites'),
  ('20260827150000_realtime'),
  ('20260827160000_entry_merge_writes'),
  ('20260827170000_member_email_sync'),
  ('20260827180000_schema_migrations')
on conflict (version) do nothing;

commit;

-- Verify:
--   select version, applied_at from public.schema_migrations order by version;
