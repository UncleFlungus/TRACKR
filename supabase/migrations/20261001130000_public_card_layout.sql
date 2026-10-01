-- Card layouts on public links
--
-- public_tracker() picks tracker settings out one by one, so a new display
-- setting stays private until it's added here. This adds cardLayout, which is
-- field ids and column widths only, so the embed draws cards the way the owner
-- set them up. The function is otherwise unchanged from 20261001120000.
--
-- Re-runnable. tests/08_public_links_test.sql still applies.

begin;

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
      'hideEmptyFields', t.settings -> 'hideEmptyFields',
      'cardLayout', t.settings -> 'cardLayout'
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

insert into public.schema_migrations (version)
values ('20261001130000_public_card_layout')
on conflict (version) do nothing;

commit;
