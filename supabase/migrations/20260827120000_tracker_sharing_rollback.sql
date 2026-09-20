-- Rollback for 20260827120000_tracker_sharing.sql
--
-- Restores the pre-sharing model: one ALL-command policy per table, scoped to
-- auth.uid() = user_id. The policy names and expressions below are taken from
-- SECURITY.md's expected-output table, which documents the state this reverts
-- to. Confirm them against your saved preflight output before running: if the
-- live policies ever drifted from that document, the preflight is the truth
-- and this file is not.
--
-- Destructive: drops tracker_members and every membership in it. If anyone has
-- been invited to a tracker, running this revokes their access and forgets
-- that they ever had it. Their entries are not deleted; those stay in the
-- tracker, now readable only by its owner.

begin;


do $do$
declare
  pol record;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('trackers', 'fields', 'entries', 'tracker_members')
  loop
    execute format(
      'drop policy %I on public.%I',
      pol.policyname,
      pol.tablename
    );
  end loop;
end;
$do$;


create policy "Users access their own trackers" on public.trackers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users access their own fields" on public.fields
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users access their own entries" on public.entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


drop trigger if exists trackers_owner_membership on public.trackers;
drop function if exists public.tracker_owner_membership();

drop function if exists public.can_write_tracker(uuid);
drop function if exists public.can_read_tracker(uuid);
drop function if exists public.is_tracker_owner(uuid);
drop function if exists public.tracker_role(uuid);

drop table if exists public.tracker_members;

commit;
