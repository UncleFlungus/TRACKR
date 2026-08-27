# supabase/

SQL that lives outside the app. These are applied by hand in the Supabase SQL
editor — there's no CLI project wired up (no `config.toml`, no linked project),
which matches how the schema has been managed so far.

```
migrations/   schema changes, applied in filename order
tests/        scripts you run to check things, not part of the schema
```

## Tracker sharing — phase 1

`migrations/20260827120000_tracker_sharing.sql` adds a `tracker_members` table
and rewrites row-level security on `trackers`, `fields` and `entries` so access
is decided by membership rather than by `user_id = auth.uid()`.

Applied on its own it changes nothing observable: the backfill gives every
existing tracker exactly one member — its creator, as `owner` — so every policy
resolves the way it did before. The client needs no changes, because
[`cloud.ts`](../src/core/cloud.ts) never filtered by user in the first place; it
selects everything and lets RLS scope it.

### Run order

1. **`tests/00_preflight.sql`** — three statements, **run one at a time**. The
   SQL editor only returns the last statement of a run, so pasting the whole
   file shows you only the third result. Statement A is the policy dump —
   **save that output.** The migration drops every existing policy on the three
   tables, and there is no undo. Statement B should come back `ok = true` on
   every row.
2. **`migrations/20260827120000_tracker_sharing.sql`**
3. **`tests/01_sharing_policies_test.sql`** — run this one **as a single unit**
   (it's one transaction; splitting it breaks it). It seeds two throwaway users,
   asserts against them, and rolls back, leaving nothing behind. The editor
   warns about "destructive operations" and about a table created without RLS
   — both are expected and explained in the file's header; answer **Run
   without RLS**. It ends by selecting a table of every check that ran. If your
   client shows no output at all, that's still a pass: any failure raises an
   exception with `FAIL` in it and aborts, and errors always surface.
4. **`migrations/20260827130000_account_deletion_sharing.sql`** — account
   deletion under sharing (transfer instead of destroy). Same one-unit rules.
5. **`tests/02_account_deletion_test.sql`** — same harness and same editor
   warnings as step 3.
6. **`tests/03_account_deletion_coverage.sql`** — sweeps every foreign key in
   the database that references `auth.users` and asserts no row still points at
   a deleted user. Schema-driven, so it covers tables this project doesn't know
   about.

### Why there's a coverage test as well as a behaviour test

`delete_my_account` was replaced before its previous definition was captured in
this repo. It has since been recovered and is preserved verbatim in
`migrations/20260827130000_account_deletion_sharing_rollback.sql` — the diff is
clean, with every difference either a deliberate design change or a tightening
(`search_path` pinned empty, `execute` revoked from `public`).

Test `03` predates that recovery and is worth keeping regardless, because it
asks a better question than "did the old function do something extra?". It
asserts the end state directly: nothing anywhere in the database references a
deleted user, whichever function put it there. That stays true for functions
nobody has written yet.

The one deliberate exception is entries, which survive with `user_id` set to
null — and since a null no longer references the user, the same invariant
covers them. `03` asserts that survival explicitly so the case can't pass by
accident.

Steps 1 and 2 are safest run against a scratch/staging project first — the test
script can't be run before the migration, since it asserts on policies the
migration creates.

### The permission model

| | read | log entries | edit fields | delete tracker |
|---|---|---|---|---|
| **owner** | yes | yes | yes | yes |
| **editor** | yes | yes | no | no |
| **viewer** | yes | no | no | no |

Two deliberate choices worth knowing:

- **`entries.user_id` changes meaning.** It stops being "who owns this" and
  becomes "who logged this" — the insert policy pins it to the caller, so
  authorship can't be forged. That's the column a future attribution UI reads.
- **Fields are owner-only.** A field is the tracker's schema; deleting one
  silently orphans that key in every entry's `values` map, which isn't a thing
  an invited editor should be able to do by accident.

### Rolling back

`migrations/20260827120000_tracker_sharing_rollback.sql` restores the
single-owner policies documented in [SECURITY.md](../SECURITY.md) and drops the
sharing machinery. Check it against your saved preflight output first — it is
written from the doc, and if the live policies ever drifted from the doc, the
preflight is the truth.

It's destructive in one direction worth naming: dropping `tracker_members`
revokes and forgets every invitation. Entries logged by an invited member stay
in the tracker; they just become readable only by its owner.

### Interaction with the existing RPCs

Both functions in [SECURITY.md](../SECURITY.md) keep working, for different
reasons:

- **`migrate_user_data`** is *not* `SECURITY DEFINER`, so its inserts are
  checked by the new policies. It writes a tracker plus that tracker's fields
  and entries in one transaction, so the helpers deliberately treat "created
  this tracker" as ownership on its own, independent of the membership row —
  the import can't be hostage to trigger ordering. `tests/01` covers this shape
  directly.
- **`delete_my_account`** *is* `SECURITY DEFINER` and so bypasses RLS entirely;
  the new policies don't apply to it. It needs a product decision before
  sharing ships, though — see below.

### Account deletion — resolved by migration `..._account_deletion_sharing`

`migrations/20260827130000_account_deletion_sharing.sql` closes the gap described
below. Apply it after the sharing migration; verify with
`tests/02_account_deletion_test.sql`. Deleting your account now transfers any
shared tracker you own to its longest-standing remaining member, deletes only
the trackers nobody else is in, and keeps your entries in other people's
trackers with the author link removed.

<details>
<summary>The original gap, for context</summary>



`delete_my_account` deletes entries → fields → trackers filtered by
`auth.uid()`. Once trackers can be shared, that has two consequences nobody
signed up for:

1. Deleting your account **deletes any tracker you own out from under everyone
   you shared it with.** The `on delete cascade` on `tracker_members` keeps the
   database consistent, but the friend simply loses the tracker.
2. Your entries are deleted from trackers **you don't own** — a shared log
   develops holes.

Neither is wrong exactly, but both should be a deliberate choice (transfer
ownership? refuse to delete a shared tracker?).

Note that (2) is not only the RPC's doing: `entries_user_id_fkey` is
`ON DELETE CASCADE`, so removing the `auth.users` row deletes that person's
entries wherever they live, including in trackers they don't own. "Keep the
entries but forget who wrote them" is therefore a schema change — make
`entries.user_id` nullable and switch that FK to `ON DELETE SET NULL` — not
just an edit to the function.

Phase 1 doesn't change any of this, so nothing breaks today; the gap only
opens when phase 2 makes sharing reachable.

</details>

### What phase 1 doesn't do

No way to actually invite anyone yet — `tracker_members` has no self-service
insert, by design. Joining lands in phase 2 as a share code plus a
`SECURITY DEFINER` join RPC, the same shape as the existing
[`migrate_user_data`](../src/core/migration.ts) RPC. Phase 3 is Supabase
Realtime and an atomic `values` merge (today's
[`updateEntry`](../src/core/cloud.ts) replaces the whole map, so two people
editing one entry lose each other's writes). Phase 4 is profiles and
attribution.
