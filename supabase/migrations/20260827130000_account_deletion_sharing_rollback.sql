-- ============================================================
-- Rollback for 20260827130000_account_deletion_sharing.sql
--
-- Restores the pre-sharing account deletion behaviour: delete everything the
-- user owns, everywhere, and let the auth.users cascade take the rest.
--
-- The function body below is the ORIGINAL definition, recovered from the
-- conversation in which it was written (26 June 2026, commit 80061df
-- "Harden Supabase backend and field validation against abuse"). It was never
-- committed to this repo as SQL, so this file is now its only copy — which is
-- reason enough to keep it even if the rollback is never run.
--
-- Destructive: reverting the foreign key to ON DELETE CASCADE means a future
-- account deletion again removes that person's entries from trackers they
-- don't own, and destroys shared trackers they owned.
-- ============================================================

begin;

-- ---- 1. Entries die with their author again ----

alter table public.entries drop constraint if exists entries_user_id_fkey;
alter table public.entries add constraint entries_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- NOT NULL is deliberately NOT restored here. If any entry has already been
-- anonymised by the newer function, re-adding the constraint would fail. Check
-- first, and only then decide:
--
--   select count(*) from public.entries where user_id is null;
--   -- if 0:
--   alter table public.entries alter column user_id set not null;

-- ---- 2. The original delete_my_account, verbatim ----

drop function if exists public.delete_my_account();

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Application data first. RLS isn't bypassed here even with SECURITY DEFINER
  -- because we filter explicitly by uid. Cascading FKs would handle most of
  -- this, but being explicit is clearer and safer.
  delete from public.entries where user_id = uid;
  delete from public.fields where user_id = uid;
  delete from public.trackers where user_id = uid;

  -- Finally, the auth user. This requires SECURITY DEFINER because the
  -- authenticated role can't delete from auth.users directly — only the
  -- function-owner role (postgres) can.
  delete from auth.users where id = uid;
end;
$function$;

grant execute on function public.delete_my_account() to authenticated;

commit;
