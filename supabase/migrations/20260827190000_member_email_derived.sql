-- ============================================================
-- tracker_members.email is derived, not asserted
--
-- The original trigger only filled the column when the caller left it null:
--
--   if new.email is null then ... end if;
--
-- so a supplied value won. Combined with the owner-scoped insert and update
-- policies on tracker_members, that let a tracker's owner write any address
-- they liked against a real member's row — and every co-member's roster and
-- author tag would then display it. Nothing escalates and no data leaks; it is
-- a display-spoofing hole inside a tracker you already control. But the column
-- exists to mirror auth.users, and a mirror that accepts overrides isn't one.
--
-- Now derived unconditionally, on insert and on update, so the value can only
-- ever come from auth.users. The update case matters as much as the insert:
-- without it an owner could simply UPDATE the column afterwards.
-- ============================================================

begin;

create or replace function public.tracker_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Ignores new.email entirely. Callers that pass one are not trusted, and
  -- callers that don't (the owner-membership trigger, claim_my_invites) never
  -- needed to.
  select lower(btrim(u.email))
  into new.email
  from auth.users u
  where u.id = new.user_id;

  return new;
end;
$fn$;

drop trigger if exists tracker_members_email on public.tracker_members;
create trigger tracker_members_email
  before insert or update on public.tracker_members
  for each row
  execute function public.tracker_member_email();

-- Repair anything already written by hand.
update public.tracker_members m
set email = lower(btrim(u.email))
from auth.users u
where u.id = m.user_id
  and m.email is distinct from lower(btrim(u.email));

insert into public.schema_migrations (version)
values ('20260827190000_member_email_derived')
on conflict (version) do nothing;

commit;
