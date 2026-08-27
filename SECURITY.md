# Security

This document describes the security model of this app and how to verify it. Every
claim here is independently checkable — where possible, the exact query to confirm it
is included. If you're reviewing the source and wondering "where's the access control?",
this file is the answer.

## Threat model (read this first)

This is a **client-enforced-by-RLS** architecture. The frontend talks directly to
Supabase (Postgres) using the public `anon` key; there is no custom backend server in
between. That means **all access control lives in the database**, not in the client
code. You will notice that the data-access layer (`src/core/cloud.ts`) issues queries
that do *not* filter by user — e.g. `fetchTracker(id)` is just `.eq('id', id)`. This is
intentional and safe **only because** Postgres Row Level Security (RLS) scopes every row
to the people entitled to see it before the query ever sees it.

The security of the app therefore rests entirely on the RLS policies and the database
functions being correct. Those are documented and verifiable below. If the policies were
ever disabled or loosened, the client would expose data — so the policies, not the
client, are the thing to audit.

The publishable `anon` key shipped in the client bundle is **not** a secret; it only
permits operations that RLS allows. The `service_role` key is never present in client
code.

## Row Level Security

RLS is enabled on all four application tables (`trackers`, `fields`, `entries`,
`tracker_members`). Access is decided by **membership of a tracker**, not by row
ownership: `tracker_members` maps a user to a tracker with a role of `owner`, `editor`
or `viewer`, and every policy on the other three tables asks "what is your role on this
row's tracker?".

A tracker's creator is made an `owner` automatically by an insert trigger, so a private
tracker is simply one whose membership list has a single entry. Sharing widens that list;
it does not change the mechanism.

| | read | log entries | edit fields | delete tracker |
| --- | --- | --- | --- | --- |
| **owner** | yes | yes | yes | yes |
| **editor** | yes | yes | no | no |
| **viewer** | yes | no | no | no |

Verify RLS is enabled:

```sql
select relname, relrowsecurity
from pg_class
where relname in ('trackers', 'fields', 'entries', 'tracker_members');
-- relrowsecurity should be `true` for all four rows.
```

Verify the policies:

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where tablename in ('trackers', 'fields', 'entries', 'tracker_members')
order by tablename, cmd;
```

Expected: 16 policies — four per table, one per command, all scoped to the
`authenticated` role (`anon` matches no policy at all, so an unauthenticated caller gets
nothing regardless of expression). The expressions are compositions of the four helper
functions documented below:

| table | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `trackers` | `user_id = auth.uid() or can_read_tracker(id)` | `user_id = auth.uid()` | `is_tracker_owner(id)` | `is_tracker_owner(id)` |
| `fields` | `can_read_tracker(tracker_id)` | `is_tracker_owner(tracker_id)` | `is_tracker_owner(tracker_id)` | `is_tracker_owner(tracker_id)` |
| `entries` | `can_read_tracker(tracker_id)` | `can_write_tracker(tracker_id) and user_id = auth.uid()` | `can_write_tracker(tracker_id)` | `is_tracker_owner(tracker_id) or user_id = auth.uid()` |
| `tracker_members` | `can_read_tracker(tracker_id)` | `is_tracker_owner(tracker_id)` | `is_tracker_owner(tracker_id)` | `is_tracker_owner(tracker_id) or user_id = auth.uid()` |

Four properties worth calling out explicitly:

- **`entries.user_id` means "author", not "owner".** The insert policy pins it to
  `auth.uid()`, so a member of a shared tracker cannot log an entry attributed to someone
  else. The client passes `user_id` explicitly on inserts (`cloud.ts`), but a spoofed
  value cannot commit.
- **Fields are owner-only.** A field is the tracker's schema; deleting one orphans that
  key in every entry's `values` map, which is not something an invited editor should be
  able to do.
- **`tracker_members` has no self-service insert.** You cannot add yourself to a tracker.
  Only an existing owner can add members. Deleting *your own* row is permitted — that is
  "leave this tracker".
- **The `trackers` select policy also accepts `user_id = auth.uid()` directly.** This is
  not a second access path so much as a timing guard: `insert ... returning` checks the
  returned row against the select policy, and at that instant the trigger-created
  membership row may not yet be visible.

### Verifying the whole model

`supabase/tests/01_sharing_policies_test.sql` is an executable version of every claim
above: 32 assertions run inside a transaction that ends in `ROLLBACK`, covering a
non-member seeing zero rows across all four tables, each role's write limits, authorship
forgery, and leaving a tracker. It leaves no trace and can be run against a live database.

## Database functions

Inspect any of them with:

```sql
select proname, prosecdef, prosrc from pg_proc
where proname in (
  'migrate_user_data', 'delete_my_account',
  'tracker_role', 'is_tracker_owner', 'can_read_tracker', 'can_write_tracker'
);
```

### Membership helpers

`tracker_role`, `is_tracker_owner`, `can_read_tracker` and `can_write_tracker` are the
expressions the policies above are built from. All four are `SECURITY DEFINER`, which
here is load-bearing rather than a convenience: they read `tracker_members` from inside
policies that are themselves attached to `tracker_members`, and a plain function would
re-enter those policies and recurse. Running as the (RLS-exempt) owner cuts the loop.

Their safety properties:

- Each takes a tracker id and answers only about **the current caller** — the identity
  always comes from `auth.uid()` inside the function and can't be passed in. The
  elevated privilege therefore can't be turned into a way to read someone else's rows;
  the most a caller learns is their own role on a tracker they name.
- Each pins `search_path = ''` with every reference schema-qualified, closing the
  search-path injection route that `SECURITY DEFINER` otherwise opens.
- `EXECUTE` is revoked from `public` and granted only to `authenticated` and
  `service_role`.
- `is_tracker_owner` treats "created this tracker" (`trackers.user_id`) as ownership
  alongside the membership row, so a missing membership row can never lock someone out
  of data they created.

### `migrate_user_data(p_trackers, p_fields, p_entries)`

One-shot import of a signed-out user's local (IndexedDB) data into the cloud on first
signup. Safety properties:

- **Not `SECURITY DEFINER`** (`prosecdef = false`). It runs as the calling user, so RLS
  still applies to every insert — including the implicit check that any `tracker_id` on
  an imported field or entry belongs to a tracker the caller owns. This is why the
  membership helpers count "created this tracker" as ownership: the import writes a
  tracker and that tracker's children in one transaction, and making the write path
  depend solely on the trigger-created membership row would leave the import hostage to
  trigger ordering.
- Rejects unauthenticated callers (`auth.uid()` null → exception).
- Forces `user_id = auth.uid()` on every inserted row, ignoring any `user_id` in the
  client payload.
- Caps payload size (max 500 trackers, max 50000 entries) to prevent abuse.
- Uses `on conflict (id) do nothing`, so duplicate or malformed ids are skipped rather
  than aborting the whole migration. A client cannot overwrite another user's row by
  guessing its id — RLS plus the primary key make that a skipped no-op, not a write.
- Returns per-table `{ sent, inserted }` counts so the client can detect and surface any
  skipped rows.

### `delete_my_account()`

Permanent account + data deletion. Safety properties:

- **`SECURITY DEFINER`** — required because the `authenticated` role cannot delete from
  `auth.users`; only the function owner can. The elevated privilege is therefore scoped
  to exactly this need.
- Rejects unauthenticated callers.
- Every statement is scoped to `auth.uid()`'s own trackers and memberships, so the
  elevated privilege cannot be used to touch another user's data.
- `EXECUTE` is granted only to the `authenticated` role.
- Runs with a pinned empty `search_path` and fully schema-qualified references, to
  prevent search-path injection — standard hardening for `SECURITY DEFINER` functions.

What it does to each kind of tracker:

| | outcome |
| --- | --- |
| a tracker you own, no other members | deleted, with its fields and entries |
| a tracker you own, other members | transferred — the longest-standing remaining member becomes owner |
| someone else's tracker you contributed to | untouched; your entries stay, anonymised |

The transfer path reassigns `trackers.user_id` **and** `fields.user_id` to the new owner.
Both columns are `ON DELETE CASCADE` references to `auth.users`, so a tracker left
pointing at a departing account would be destroyed with it, and a tracker whose fields
still pointed there would survive with its entire schema missing.

`entries.user_id` is nullable and its foreign key is `ON DELETE SET NULL`. That is what
lets a shared log keep its history when a contributor leaves: the row stays, the link to
the person goes. A client can never write a null author itself — the insert policy
requires `user_id = auth.uid()` — so nulls only ever arrive by this route. An entry with
no author can be deleted by its tracker's owner alone, since the "or you wrote it" half
of the delete policy has nobody left to grant.

## Input limits

Enforced at the database level (cannot be bypassed by a modified client):

```sql
-- per-entry payload cap (~20MB), guards the values jsonb column
alter table entries add constraint entries_values_size_check
  check (octet_length(values::text) < 20 * 1024 * 1024);

-- name length caps
alter table trackers add constraint trackers_name_length check (char_length(name) <= 200);
alter table fields   add constraint fields_name_length   check (char_length(name) <= 200);
```

Note: the 20MB cap is per-entry-row total. Individual text/longtext/list values are not
separately capped beyond that, so a future client-side `maxLength` is a reasonable
additional guard but not required for safety.

## Link handling (stored-XSS prevention)

The `link` field type (`src/core/fields/link.tsx`) validates URLs against an explicit
scheme allowlist of `http`, `https`, and `mailto`. Any other scheme — `javascript:`,
`data:`, `vbscript:`, `file:`, etc. — is rejected and the value renders as plain text,
never as a clickable anchor. Validation runs again at display time, so values introduced
by import or migration are subject to the same allowlist rather than trusting whatever
was stored.

This is an explicit allowlist, not a denylist or a side effect of URL mangling, so it
fails closed for unknown schemes.

## Authentication

Authentication is handled by Supabase Auth (email + password). Configured in the Supabase
dashboard (not in source, so verify there):

- Server-side password policy: minimum 8 characters, at least one letter and one digit.
  The client also checks length, but the server is the enforcement point.
- Email confirmation is enabled; users must confirm before they can sign in.
- Auth rate limits are at Supabase defaults.

## Transport

Production is served over HTTPS (Vercel, auto-issued certificate). This also satisfies
the secure-context requirement for `crypto.randomUUID()`, used for client-side id
generation.

## Reporting a vulnerability

If you find a security issue, please report it privately to **<your-contact-email>**
rather than opening a public issue. We'll acknowledge receipt and aim to respond within
a reasonable timeframe.
