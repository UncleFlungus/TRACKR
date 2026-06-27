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
to its owner before the query ever sees it.

The security of the app therefore rests entirely on the RLS policies and the two
database functions being correct. Those are documented and verifiable below. If the
policies were ever disabled or loosened, the client would expose data — so the policies,
not the client, are the thing to audit.

The publishable `anon` key shipped in the client bundle is **not** a secret; it only
permits operations that RLS allows. The `service_role` key is never present in client
code.

## Row Level Security

RLS is enabled on all three application tables (`trackers`, `fields`, `entries`), and
each has a single `ALL`-command policy that restricts every operation (select, insert,
update, delete) to rows the caller owns.

Verify RLS is enabled:

```sql
select relname, relrowsecurity
from pg_class
where relname in ('trackers', 'fields', 'entries');
-- relrowsecurity should be `true` for all three rows.
```

Verify the policy expressions:

```sql
select policyname, cmd, qual, with_check
from pg_policies
where tablename in ('trackers', 'fields', 'entries');
```

Expected — for every row, both `qual` (read/update/delete filter) and `with_check`
(insert/update guard) are `(auth.uid() = user_id)`:

| policyname                      | cmd | qual                   | with_check             |
| ------------------------------- | --- | ---------------------- | ---------------------- |
| Users access their own trackers | ALL | (auth.uid() = user_id) | (auth.uid() = user_id) |
| Users access their own fields   | ALL | (auth.uid() = user_id) | (auth.uid() = user_id) |
| Users access their own entries  | ALL | (auth.uid() = user_id) | (auth.uid() = user_id) |

The client passes `user_id` explicitly on inserts (`cloud.ts`), but a spoofed value
cannot commit: the `with_check` clause rejects any row whose `user_id` isn't the caller's
`auth.uid()`.

## Database functions

Two operations can't be expressed as ordinary table writes, so they live in RPC
functions. Inspect either with:

```sql
select proname, prosecdef, prosrc from pg_proc where proname = 'migrate_user_data';
select proname, prosecdef, prosrc from pg_proc where proname = 'delete_my_account';
```

### `migrate_user_data(p_trackers, p_fields, p_entries)`

One-shot import of a signed-out user's local (IndexedDB) data into the cloud on first
signup. Safety properties:

- **Not `SECURITY DEFINER`** (`prosecdef = false`). It runs as the calling user, so RLS
  still applies to every insert — including the implicit check that any `tracker_id` on
  an imported field or entry belongs to the caller.
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
- Every delete is filtered explicitly by `auth.uid()`, so the elevated privilege cannot
  be used to touch another user's rows.
- Deletes application data (entries → fields → trackers) before the auth row.
- `EXECUTE` is granted only to the `authenticated` role.
- Runs with a fixed `search_path = public` to prevent search-path injection — standard
  hardening for `SECURITY DEFINER` functions.

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
