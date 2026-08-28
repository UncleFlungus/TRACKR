-- ============================================================
-- Keep tracker_members.email current
--
-- That column is denormalised from auth.users so the share sheet and the
-- author tags can show people rather than UUIDs. It was written once, at
-- insert, which meant changing your account email left co-members looking at
-- your old one indefinitely.
--
-- Deliberately not a profiles table. A profiles table earns its place when
-- there is something to store that auth.users doesn't have — a display name,
-- an avatar — and it brings an RLS surface that has to be got right, since
-- "who can read which profile" is the same enumeration question as everywhere
-- else. The actual defect here is staleness, and staleness is fixed by
-- propagating the change.
-- ============================================================

begin;

create or replace function public.sync_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.tracker_members
  set email = lower(btrim(new.email))
  where user_id = new.id;
  return new;
end;
$fn$;

-- `of email` so this only fires on the column that matters — auth.users is
-- written on every sign-in (last_sign_in_at, tokens), and running an update
-- against tracker_members each time would be pure waste.
drop trigger if exists auth_user_email_sync on auth.users;
create trigger auth_user_email_sync
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.sync_member_email();

-- Catch up anything that already drifted.
update public.tracker_members m
set email = lower(btrim(u.email))
from auth.users u
where u.id = m.user_id
  and m.email is distinct from lower(btrim(u.email));

commit;
