-- Public read-only links
--
-- An owner can publish a tracker under an unguessable token. Anyone holding the
-- token can read the tracker's name, fields and entries through
-- public_tracker(), and nothing else: no member list, no authors, no writes.
--
-- The token lives in its own table rather than as a column on trackers. The
-- trackers select policy is open to every member, and a viewer shouldn't be
-- able to read (and pass on) a link only the owner chose to create. A separate
-- table can be owner-only from top to bottom.
--
-- Revoking is deleting the row. Rotating is deleting it and inserting a fresh
-- one, which is what the client does; there is no update path, so a token never
-- changes in place.
--
-- Re-runnable. Apply after 20260827190000, then run tests/08_public_links_test.sql.

begin;

create table if not exists public.tracker_public_links (
  tracker_id uuid primary key
    references public.trackers (id) on delete cascade,
  -- 122 random bits from a v4 UUID, without the dashes so it reads as one
  -- opaque string in a URL.
  token text not null unique
    default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

alter table public.tracker_public_links enable row level security;

-- Insert is granted on tracker_id only, so the token always comes from the
-- default above. A caller-chosen token would let an owner pick something short
-- and guessable, and the whole scheme rests on tokens being unguessable.
revoke all on public.tracker_public_links from anon, authenticated;
grant select, delete on public.tracker_public_links to authenticated;
grant insert (tracker_id) on public.tracker_public_links to authenticated;
grant all on public.tracker_public_links to service_role;

do $do$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tracker_public_links'
  loop
    execute format('drop policy %I on public.tracker_public_links', pol.policyname);
  end loop;
end;
$do$;

create policy tracker_public_links_select on public.tracker_public_links
  for select to authenticated
  using (public.is_tracker_owner(tracker_id));

create policy tracker_public_links_insert on public.tracker_public_links
  for insert to authenticated
  with check (public.is_tracker_owner(tracker_id));

create policy tracker_public_links_delete on public.tracker_public_links
  for delete to authenticated
  using (public.is_tracker_owner(tracker_id));

-- The read path for everyone else. SECURITY DEFINER because anon has no access
-- to trackers, fields or entries at all, and shouldn't: this function is the
-- only door, and it only opens for a valid token.
--
-- What it returns is chosen field by field. Entries carry no user_id, the
-- tracker carries no owner, and of the settings only the two that affect how
-- entries are drawn. Entries are capped at the newest 500 so one public link
-- can't be used to pull an unbounded payload on every request.
--
-- Returns null for an unknown token, which the caller turns into a 404. An
-- unknown token and a revoked one look identical.
create or replace function public.public_tracker(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select jsonb_build_object(
    'tracker', jsonb_build_object(
      'name', t.name,
      'icon', t.icon,
      'color', t.color,
      'viewMode', t.settings -> 'viewMode',
      'hideEmptyFields', t.settings -> 'hideEmptyFields'
    ),
    'fields', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'name', f.name,
          'type', f.type,
          'config', f.config,
          'order', f."order"
        )
        order by f."order"
      )
      from public.fields f
      where f.tracker_id = t.id
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'createdAt', e.created_at,
          'values', e."values"
        )
        order by e.created_at desc
      )
      from (
        select e.id, e.created_at, e."values"
        from public.entries e
        where e.tracker_id = t.id
        order by e.created_at desc
        limit 500
      ) e
    ), '[]'::jsonb)
  )
  from public.tracker_public_links l
  join public.trackers t on t.id = l.tracker_id
  where l.token = p_token
$fn$;

revoke all on function public.public_tracker(text) from public;
grant execute on function public.public_tracker(text) to anon, authenticated, service_role;

insert into public.schema_migrations (version)
values ('20261001120000_public_links')
on conflict (version) do nothing;

commit;
