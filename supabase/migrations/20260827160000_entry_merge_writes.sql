-- Tracker sharing, phase 3b: writes that don't clobber each other
--
-- The problem, in one line: updating an entry replaced its whole `values` map
-- with whatever the browser last read, so two people editing one entry meant
-- last-write-wins across every field, not just the one that changed.
--
-- Two shapes of that bug:
--
--   Cross-field clobbering. You tap the rep counter while they edit Notes.
--   Your write carries your stale copy of Notes and silently reverts their
--   text. Fixed by merge_entry_values: a write touches only the keys it names.
--
--   Lost increments. You both tap + on a set sitting at 5. Both browsers
--   compute 6, both write 6, two taps count once. Merging doesn't fix that;
--   the arithmetic itself is the race. Fixed by increment_entry_value, where
--   the database reads and writes under one row lock, so the second update
--   re-reads the value the first one committed.
--
-- Neither is SECURITY DEFINER. They run as the caller so RLS still decides
-- who may write, exactly as a direct update would.

begin;

-- Merge a patch into an entry's values
--
-- `||` on jsonb is a shallow merge: keys in the patch win, keys absent from
-- it are left alone. Passing a whole map still behaves like a replace for
-- every key it contains, so existing callers need no changes. They simply stop
-- destroying keys they never knew about.
--
-- Returns the merged map so the caller can settle its cache without a refetch.

create or replace function public.merge_entry_values(
  p_entry_id uuid,
  p_patch    jsonb
)
returns jsonb
language plpgsql
as $fn$
declare
  v_values jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be a JSON object';
  end if;

  update public.entries e
  set "values" = coalesce(e."values", '{}'::jsonb) || p_patch
  where e.id = p_entry_id
  returning e."values" into v_values;

  -- Zero rows means the row is gone or RLS refused the write. Raising beats
  -- returning null, which a caller could mistake for an empty entry.
  if not found then
    raise exception 'Entry not found or not writable';
  end if;

  return v_values;
end;
$fn$;

-- Step a numeric field, atomically
--
-- The clamp and the addition both happen inside the UPDATE, so the value
-- being added to is the one in the row at write time, not one the client read
-- seconds ago. Under READ COMMITTED a concurrent update blocks on the row
-- lock and then re-evaluates against the committed version, which is what
-- makes two simultaneous taps count twice.
--
-- p_max mirrors the count field's configured maximum. It is passed in rather
-- than read from the field row because this needs to be one statement, and
-- because the clamp is a UI affordance rather than an integrity rule; the
-- field's own validate() is the real constraint.

create or replace function public.increment_entry_value(
  p_entry_id uuid,
  p_field_id text,
  p_delta    numeric,
  p_max      numeric
)
returns numeric
language plpgsql
as $fn$
declare
  v_new numeric;
begin
  update public.entries e
  set "values" = jsonb_set(
    coalesce(e."values", '{}'::jsonb),
    array[p_field_id],
    to_jsonb(
      least(
        p_max,
        greatest(
          0,
          -- Anything non-numeric in the slot counts as zero rather than
          -- aborting: a malformed value shouldn't make the button dead.
          case
            when jsonb_typeof(coalesce(e."values", '{}'::jsonb) -> p_field_id)
                 = 'number'
            then (e."values" ->> p_field_id)::numeric
            else 0
          end + p_delta
        )
      )
    ),
    true
  )
  where e.id = p_entry_id
  returning (e."values" ->> p_field_id)::numeric into v_new;

  if not found then
    raise exception 'Entry not found or not writable';
  end if;

  return v_new;
end;
$fn$;

revoke all on function public.merge_entry_values(uuid, jsonb) from public;
revoke all on function public.increment_entry_value(uuid, text, numeric, numeric)
  from public;

grant execute on function public.merge_entry_values(uuid, jsonb)
  to authenticated;
grant execute on function public.increment_entry_value(uuid, text, numeric, numeric)
  to authenticated;

commit;
