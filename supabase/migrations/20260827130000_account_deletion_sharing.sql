-- Account deletion in a world with shared trackers
--
-- Before this, deleting an account deleted every tracker you owned, taking
-- shared trackers away from the people you shared them with, and every entry
-- you had ever logged, including entries in other people's trackers. Both were
-- side effects of ON DELETE CASCADE rather than deliberate choices.
--
-- After this:
--   * A tracker you own with NO other members is deleted, exactly as before.
--   * A tracker you own WITH other members is handed to the longest-standing
--     remaining member, who becomes its owner. Nobody loses a shared log
--     because someone else closed their account.
--   * Your entries in trackers you no longer own stay where they are, with
--     the author link removed. The contribution survives; the personal data
--     doesn't.
--
-- Depends on 20260827120000_tracker_sharing.sql.

begin;

-- 1. Entries outlive their author
--
-- entries_user_id_fkey was ON DELETE CASCADE, which is what deleted a
-- departing member's rows out of someone else's tracker. SET NULL keeps the
-- row and drops the attribution.
--
-- Safe against the policies from the previous migration:
--   insert  requires user_id = auth.uid(), so a client can never write a null
--           author itself, so nulls only arrive via this cascade
--   select
--   update  keyed off the tracker, unaffected by a null author
--   delete  "is_tracker_owner(tracker_id) or user_id = auth.uid()"; a null
--           user_id makes the second half null-not-true, so an authorless
--           entry is deletable by the tracker's owner alone. Correct: there
--           is no author left to grant that right to.

alter table public.entries alter column user_id drop not null;

alter table public.entries drop constraint if exists entries_user_id_fkey;
alter table public.entries add constraint entries_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- 2. delete_my_account
--
-- Dropped and recreated rather than replaced, because the return type may
-- differ from the previous definition. The only caller (AuthModal.tsx) checks
-- `error` and ignores the return value.
--
-- Still SECURITY DEFINER for the same reason as before: the authenticated
-- role cannot delete from auth.users, only the function owner can. The
-- search_path is pinned empty (was `public`) with every reference
-- schema-qualified, which is the stricter form of the same hardening.

drop function if exists public.delete_my_account();

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user     uuid := (select auth.uid());
  v_trackers uuid[];
  v_tracker  uuid;
  v_heir     uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  -- ON DELETE CASCADE carries the fields and entries with them, which is what
  -- we want here: the tracker is going away, so everything in it goes too.
  delete from public.trackers t
  where t.user_id = v_user
    and not exists (
      select 1
      from public.tracker_members m
      where m.tracker_id = t.id
        and m.user_id <> v_user
    );

  -- Snapshotted into an array first, because the loop body reassigns the very
  -- column the query filters on.
  select array_agg(t.id)
  into v_trackers
  from public.trackers t
  where t.user_id = v_user;

  foreach v_tracker in array coalesce(v_trackers, '{}'::uuid[])
  loop
    -- Prefer an existing co-owner, then the longest-standing member. user_id
    -- breaks ties so the choice is deterministic rather than plan-dependent.
    select m.user_id
    into v_heir
    from public.tracker_members m
    where m.tracker_id = v_tracker
      and m.user_id <> v_user
    order by
      case m.role when 'owner' then 0 when 'editor' then 1 else 2 end,
      m.created_at,
      m.user_id
    limit 1;

    if v_heir is null then
      -- Unreachable: the delete above removed every memberless tracker. But a
      -- tracker left pointing at an auth row we are about to delete would be
      -- cascade-deleted anyway, so make that explicit rather than incidental.
      delete from public.trackers where id = v_tracker;
      continue;
    end if;

    -- trackers.user_id is the creator fallback in is_tracker_owner AND an
    -- ON DELETE CASCADE reference to auth.users. Reassigning it is what
    -- actually saves the tracker from going down with the account.
    update public.trackers set user_id = v_heir where id = v_tracker;

    -- fields.user_id is vestigial for access control but carries the same
    -- cascade. Left pointing at the departing user, the tracker would survive
    -- and arrive with no fields at all.
    update public.fields set user_id = v_heir where tracker_id = v_tracker;

    insert into public.tracker_members (tracker_id, user_id, role)
    values (v_tracker, v_heir, 'owner')
    on conflict (tracker_id, user_id) do update set role = 'owner';

    delete from public.tracker_members
    where tracker_id = v_tracker
      and user_id = v_user;
  end loop;

  -- Memberships in other people's trackers cascade away. Entries authored in
  -- trackers we no longer own have their user_id set to null, so the rows
  -- survive without the person.
  delete from auth.users where id = v_user;
end;
$fn$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

commit;
