# Security

The security model, and how to check it. Most claims here come with the query that
confirms them. If you're reading the source and wondering where the access control is,
this is it.

## Threat model

The frontend talks straight to Supabase with the public `anon` key. There is no backend
server in between, so all access control lives in the database. That's why the queries
in `src/core/cloud.ts` don't filter by user: `fetchTracker(id)` is just `.eq('id', id)`,
and it's safe because row level security has already scoped the rows to whoever is
entitled to see them.

So the app is exactly as secure as its RLS policies and database functions. If a policy
were disabled or loosened the client would expose data, which makes the policies, not
the client, the thing to audit.

The `anon` key in the client bundle isn't a secret. It only permits what RLS allows.
The `service_role` key never appears in client code.

## Row Level Security

RLS is on for all four application tables (`trackers`, `fields`, `entries`,
`tracker_members`). Access follows membership of a tracker rather than ownership of a
row: `tracker_members` maps a user to a tracker with a role of `owner`, `editor` or
`viewer`, and every policy on the other three tables asks what your role is on that
row's tracker.

An insert trigger makes a tracker's creator its owner, so a private tracker is one whose
membership list has a single entry. Sharing lengthens that list without changing the
mechanism.

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

Expect 16 policies: four per table, one per command, all scoped to the `authenticated`
role. `anon` matches no policy at all, so an unauthenticated caller gets nothing
whatever the expression says. The expressions are built from the four helper functions
below.

| table | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| `trackers` | `user_id = auth.uid() or can_read_tracker(id)` | `user_id = auth.uid()` | `is_tracker_owner(id)` | `is_tracker_owner(id)` |
| `fields` | `can_read_tracker(tracker_id)` | `is_tracker_owner(tracker_id)` | `is_tracker_owner(tracker_id)` | `is_tracker_owner(tracker_id)` |
| `entries` | `can_read_tracker(tracker_id)` | `can_write_tracker(tracker_id) and user_id = auth.uid()` | `can_write_tracker(tracker_id)` | `is_tracker_owner(tracker_id) or user_id = auth.uid()` |
| `tracker_members` | `can_read_tracker(tracker_id)` | `is_tracker_owner(tracker_id)` | `is_tracker_owner(tracker_id)` | `is_tracker_owner(tracker_id) or user_id = auth.uid()` |

Four things that aren't obvious from the table:

- **`entries.user_id` means author, not owner.** The insert policy pins it to
  `auth.uid()`, so a member of a shared tracker can't log an entry attributed to someone
  else. `cloud.ts` passes `user_id` explicitly, but a spoofed value won't commit.
- **Fields are owner-only.** A field is the tracker's schema, and deleting one orphans
  that key in every entry's `values` map. Not something an invited editor should be able
  to do.
- **`tracker_members` has no self-service insert.** You can't add yourself to a tracker;
  only an existing owner can add members. Deleting your own row is allowed, which is how
  you leave.
- **The `trackers` select policy also accepts `user_id = auth.uid()`.** Less a second
  access path than a timing guard: `insert ... returning` checks the returned row against
  the select policy, and the trigger-created membership row may not be visible yet.

### Verifying the whole model

`supabase/tests/01_sharing_policies_test.sql` is every claim above as executable
assertions: 32 of them, in a transaction that ends in `ROLLBACK`. They cover a non-member
seeing zero rows across all four tables, each role's write limits, attempted authorship
forgery and leaving a tracker. It leaves nothing behind, so it can run against a live
database.

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

`tracker_role`, `is_tracker_owner`, `can_read_tracker` and `can_write_tracker` are what
the policies above are built from. All four are `SECURITY DEFINER`, and here that's
necessary rather than convenient: they read `tracker_members` from inside policies
attached to `tracker_members`, so a plain function would re-enter those policies and
recurse. Running as the RLS-exempt owner cuts the loop.

What keeps that safe:

- Each takes a tracker id and answers only about the current caller. The identity comes
  from `auth.uid()` inside the function and can't be passed in, so the elevated privilege
  can't be turned into a way to read someone else's rows. The most a caller learns is
  their own role on a tracker they name.
- Each pins `search_path = ''` with every reference schema-qualified, which closes the
  search-path injection route `SECURITY DEFINER` otherwise opens.
- `EXECUTE` is revoked from `public` and granted only to `authenticated` and
  `service_role`.
- `is_tracker_owner` counts `trackers.user_id` as ownership alongside the membership row,
  so a missing membership row can't lock someone out of data they created.

### `migrate_user_data(p_trackers, p_fields, p_entries)`

One-shot import of a signed-out user's IndexedDB data into the cloud on first signup.

- **Not `SECURITY DEFINER`** (`prosecdef = false`). It runs as the calling user, so RLS
  applies to every insert, including the implicit check that a `tracker_id` on an
  imported field or entry belongs to a tracker the caller owns. This is why the
  membership helpers count `trackers.user_id` as ownership: the import writes a tracker
  and its children in one transaction, and depending solely on the trigger-created
  membership row would leave it hostage to trigger ordering.
- Unauthenticated callers raise (`auth.uid()` is null).
- `user_id = auth.uid()` is forced on every inserted row, ignoring whatever the client
  payload says.
- Payload size is capped at 500 trackers and 50000 entries.
- `on conflict (id) do nothing` skips duplicate or malformed ids instead of aborting the
  whole import. Guessing another user's row id gets you a skipped no-op, not a write:
  RLS and the primary key both stand in the way.
- Returns per-table `{ sent, inserted }` counts, so the client can surface anything that
  was skipped.

### `delete_my_account()`

Permanent deletion of an account and its data.

- **`SECURITY DEFINER`**, because the `authenticated` role can't delete from
  `auth.users` and only the function owner can. The elevated privilege exists for that
  one reason.
- Unauthenticated callers are rejected.
- Every statement is scoped to `auth.uid()`'s own trackers and memberships, so the
  privilege can't reach another user's data.
- `EXECUTE` is granted only to `authenticated`.
- Pinned empty `search_path` and fully schema-qualified references, the standard
  hardening for a `SECURITY DEFINER` function.

What it does to each kind of tracker:

| | outcome |
| --- | --- |
| a tracker you own, no other members | deleted, with its fields and entries |
| a tracker you own, other members | transferred to the longest-standing remaining member |
| someone else's tracker you contributed to | untouched; your entries stay, anonymised |

Transfer reassigns both `trackers.user_id` and `fields.user_id` to the new owner. Both
are `ON DELETE CASCADE` references to `auth.users`, so a tracker still pointing at the
departing account would go with it, and one whose fields still pointed there would
survive with its whole schema missing.

`entries.user_id` is nullable with `ON DELETE SET NULL`, which is what lets a shared log
keep its history when a contributor leaves: the row stays, the link to the person goes.
A client can't write a null author itself, since the insert policy requires
`user_id = auth.uid()`, so nulls only arrive this way. Only the tracker's owner can
delete an authorless entry, because the "or you wrote it" half of the delete policy has
nobody left to grant.

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

The 20MB cap is per entry row in total. Individual text, longtext and list values
aren't capped separately, so a client-side `maxLength` would be a reasonable extra
guard, though nothing depends on it for safety.

## Link handling (stored-XSS prevention)

The `link` field type (`src/core/fields/link.tsx`) validates URLs against a scheme
allowlist of `http`, `https` and `mailto`. Anything else, `javascript:`, `data:`,
`vbscript:`, `file:` and the rest, is rejected and renders as plain text rather than a
clickable anchor. Validation runs again at display time, so values arriving by import
aren't trusted just because they're already stored.

Being an allowlist rather than a denylist, it fails closed on schemes nobody has thought
of yet.

## Link previews (SSRF)

`api/og.ts` fetches a URL the caller supplies and returns its title, which makes it the
one place in this project that forwards a request on someone else's behalf. Without
guards it would let anyone read `169.254.169.254` or an internal host through the
response.

It is deliberately unauthenticated. Trackr works signed out, and a link title is no more
of a cloud feature than the rest of a local tracker, so requiring a session would mean
previews that stop working for the people using the app the way it was built to be used.
That makes the guards below the whole defence rather than a second line. What the
endpoint refuses:

- **Schemes**, via the same `normalizeUrl` the link field uses. `core/url.ts` is shared
  by both, so a URL the client won't store is a URL the server won't fetch. Only `http`
  and `https` get past the endpoint's own check; `mailto` is storable but not fetchable.
- **Ports** other than 80 and 443. Anything else is far more likely to be an internal
  service than a page with a title.
- **Addresses** in the loopback, private, CGNAT, link-local, documentation, benchmark,
  multicast and reserved ranges, in both IPv4 and IPv6. IPv4-mapped IPv6 addresses are
  unwrapped and judged as IPv4, so `::ffff:169.254.169.254` is caught rather than slipping
  past the v6 checks. Anything that doesn't parse is treated as blocked.
- **Hostnames** that resolve to any of the above. A name is resolved with `all: true` and
  rejected if *any* address it answers with is blocked, since a name with several A
  records only has to point inward once. Single-label and `.local` names are rejected
  without a lookup.
- **Redirects** to somewhere the original URL wasn't. Redirects are handled manually,
  capped at three hops, and every hop goes through the full check again, so a public URL
  can't bounce the fetch to a private one.

Three limits on what a successful fetch can return: a 5 second timeout, at most 128KB
read from the body, and only HTML parsed at all (`text/html` or `application/xhtml+xml`;
anything else is dropped unread). The response is the page title and nothing else,
capped at 200 characters.

The residual risk is DNS rebinding, since the address is resolved once for the check and
again by `fetch`. Pinning the resolved address would close it; for now the exposure is
bounded by the same three limits, which cap a successful attack at 200 characters of a
document's `<title>`.

What remains is abuse rather than disclosure: anyone who finds the endpoint can make it
fetch public pages. It reads nothing from the database, holds no credentials and returns
nothing but a public page's title, so the cost is bandwidth. Two things bound it.
Successful lookups are cached publicly for a day, so repeated calls for the same URL are
served by the CDN and never reach the function at all. Beyond that it's capped at the
platform level with a Vercel spend limit, which is a blunt instrument but the right one:
it fails the feature rather than the bill, and it needs no rate-limiting store of its
own.

## Authentication

Supabase Auth, email and password. Configured in the Supabase dashboard rather than in
source, so verify it there:

- Password policy: at least 8 characters with a letter and a digit. The client checks
  length too, but the server is the enforcement point.
- Email confirmation is required before sign-in.
- Auth rate limits are at Supabase defaults.

## Transport

Production is served over HTTPS by Vercel, on an auto-issued certificate. That also
satisfies the secure-context requirement for `crypto.randomUUID()`, which generates ids
on the client.

## Reporting a vulnerability

If you find a security issue, please email me (jhkimuniversity@gmail.com) or a public
issue: open a [GitHub security advisory](https://github.com/jjhhkimm) on the repository
and I'll follow up there.
