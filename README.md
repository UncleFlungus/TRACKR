# trackr

A minimal, flexible personal tracker. Create a tracker for anything, define your own fields, log entries fast.

Local-first, then optionally shared. Signed out, everything lives in your browser via IndexedDB and never leaves the machine. Sign in and the same app runs against Supabase instead, where a tracker can be shared with other people who log into it alongside you.

## Setup

```bash
npm install
npm run dev          # http://localhost:5173
```

Requires Node 20+.

`npm run dev` runs Vite only, which does not serve `api/`. Anything involving
link previews needs the Vercel CLI, which runs the function alongside the dev
server:

```bash
npx vercel dev       # http://localhost:3000
```

Signed-out use needs no configuration at all. For auth and sharing, add a
`.env.local` with the two values from Supabase Dashboard → Project Settings →
API:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Both are public values ([SECURITY.md](SECURITY.md) explains why). `api/og.ts`
needs no configuration of its own.

## What's here

- Vite + React + TypeScript + Tailwind v4
- Dexie for IndexedDB persistence, with reactive `useLiveQuery` hooks (signed out)
- Supabase for auth, Postgres and realtime (signed in), cached with React Query
- React Router for the three pages: home, create, tracker detail
- Lucide for icons
- Fredoka and Nunito from Google Fonts

## Two backends, one set of hooks

Every page reads through the hooks in `core/data.tsx`, which pick a backend
based on auth state: Dexie when signed out, Supabase when signed in. Pages
don't know which they're getting.

The cloud path never filters by user. `cloud.ts` selects everything and lets
Postgres row-level security decide what comes back, which is why sharing a
tracker needed no page changes at all. All access control lives in the
database. See [SECURITY.md](SECURITY.md) for the model and the queries that
verify it, and [supabase/](supabase/) for the migrations and their tests.

## Project structure

```
api/
  og.ts                      ← Serverless title lookup for the link field
src/
  core/                      ← Portable. Mobile-app safe. No React-DOM-specific code.
    types.ts                 ← Tracker, Field, Entry, FieldTypeDef
    db.ts                    ← Dexie schema + CRUD helpers
    templates.ts             ← Tracker templates (Wishlist, Meals, etc.)
    cloud.ts                 ← Supabase queries + mutations (mirrors db.ts)
    data.tsx                 ← The hooks that choose a backend
    authors.ts               ← Who logged what, on a shared tracker
    filtering.ts             ← Pure filter model for entries
    migration.ts             ← One-shot local → cloud import on first signup
    fields/
      index.ts               ← Field type registry
      outOf.ts               ← Shared "out of N" helpers (score, count)
      text.tsx               ← Each field type is one self-contained module
      number.tsx
      currency.tsx
  lib/
    auth.tsx                 ← Supabase session, sign in/up/out, password reset
    supabase.ts              ← Client
  ui/                        ← Web-specific. Replace this folder when going native.
    colors.ts                ← Theme lookup (so Tailwind can statically detect classes)
    pages/
      HomePage.tsx
      CreateTrackerPage.tsx
      TrackerPage.tsx
    components/
      ShareSheet.tsx         ← Invite by email, roster, roles
      AuthorTag.tsx          ← Who logged an entry
      FieldEditor.tsx
      AddEntryForm.tsx
      EntryRow.tsx
```

The `core/` and `ui/` split is deliberate: everything in `core/` would port to a
native build as-is, leaving only `ui/` to rewrite.

## Field types included

- **text**: single-line text.
- **longtext**: multi-line description, in a `<textarea>`.
- **number**: number input with an optional suffix and decimal places.
- **currency**: stored as a number, rendered with a symbol prefix.
- **time**: datetime picker. With `autoNow: true` it fills in the current time
  when the new-entry form opens.
- **duration**: a start/stop timer storing total seconds, with a manual-entry
  mode that parses `1:23:45`, `90` or `1h 20m`.
- **select**: one option from a configured list, rendered as pills. An option
  can carry its own colour; ones without fall back to the tracker's accent.
- **checkmark**: a boolean. `false` counts as a real value here rather than
  empty, so unchecked items stay visible in entry rows and can be ticked off
  without opening the entry.
- **link**: a URL with an optional title, validated against an `http`/`https`/
  `mailto` allowlist at both entry and display time. A stored `javascript:`
  value renders as plain text, never as an anchor. The title is fetched once on
  blur through `api/og.ts` and cached in the entry, so display costs no network.
  The favicon comes from Google's favicon service at render time, so a link
  still shows an icon and a host even when no title comes back.
- **list**: an array of items, added with Enter and autocompleted from past
  entries in the same field. Three layouts via `config.layout`: `'pills'`,
  `'commas'` or `'bullets'`.
- **score**: a rating out of a configurable max, like `7/10`. The stored value
  is the score itself, so it stays sortable, range-filterable and averageable,
  and changing the max re-renders past entries against the new denominator
  without touching entry data. Maxes of 10 or less get tap-to-pick pills,
  larger ones a number input. The "Average" aggregation shows `6.8/10` above
  the entry list.
- **count**: a running tally toward the same kind of max, like reps: `7/10`.
  Built for a value that changes over the entry's life, so minus/plus buttons
  step it and it shows a checkmark at the max. The steppers appear inline in
  the list and grid too, for ticking reps up mid-workout. Defaults to `0` so a
  fresh entry reads `0/10` with buttons ready, and clamps to `[0, max]`; to log
  more than the target, raise the max. Aggregates as "Average" and "Completed
  count". Shares its max config with score through `core/fields/outOf.ts`.
- **table**: repeating rows inside one entry, for sets in a workout or courses
  in a meal. Columns are configurable and the value is an array of row objects
  keyed by column id, so renaming a column keeps its data. It's the only field
  type whose value is structured rather than scalar, which is why filtering
  skips it and its only aggregation is a row count.

## Dynamic defaults

A field type can compute its default when the form opens, rather than declaring
a fixed one:

```ts
computeDefault?: (config: TConfig) => TValue | null;
```

`time` uses it to fill in `Date.now()` when `autoNow` is set. It runs on every
open, so the value is never stale.

Anything that depends on past entries, like "last used value" or an
auto-incrementing counter, needs the contract widened to pass entry history in.
That hasn't been needed yet.

## Adding a field type

Adding a field type is a contained change. Say you wanted a bare `url` field:

### 1. Create the field module

`src/core/fields/url.tsx`:

```tsx
import type { FieldTypeDef } from '../types';

interface UrlConfig {}

export const urlField: FieldTypeDef<UrlConfig, string> = {
  id: 'url',
  label: 'URL',
  icon: 'Link',
  defaultConfig: {},
  defaultValue: '',
  validate: (v) => {
    if (!v) return null;
    try {
      new URL(v);
      return null;
    } catch {
      return 'Invalid URL';
    }
  },
  Input: ({ value, onChange, autoFocus }) => (
    <input
      type="url"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      placeholder="https://..."
      className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
    />
  ),
  Display: ({ value }) => {
    if (!value) return <em className="text-grape-300 text-[15px]">empty</em>;
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        className="text-sky-600 hover:underline text-[15px] truncate"
      >
        {value}
      </a>
    );
  },
};
```

### 2. Add it to the union and registry

In `src/core/types.ts`:

```ts
export type FieldTypeId = 'text' | 'number' | 'currency' | 'url';
```

In `src/core/fields/index.ts`:

```ts
import { urlField } from './url';

export const fieldRegistry: Record<FieldTypeId, FieldTypeDef<any, any>> = {
  text: textField,
  number: numberField,
  currency: currencyField,
  url: urlField,
};
```

That's it. The create-tracker picker, the add-entry form, the entry display and
the field editor all read from the registry, so they pick it up on their own.

## Link previews

The browser can't read a third-party page to get its title, so `api/og.ts` does
it server-side and returns `{ title }`. It's a Vercel function on the Node
runtime, and the only piece of the app that isn't either the client or Postgres.

It's deliberately unauthenticated, so previews work signed out like the rest of
the app. Abuse is bounded by a day of public CDN caching and a Vercel spend
limit rather than a rate limiter, which would need a store this project doesn't
otherwise have.

Because it fetches a URL the caller supplies, it's the one genuine SSRF surface
here. [SECURITY.md](SECURITY.md#link-previews-ssrf) covers what it refuses. It
shares `core/url.ts` with the client, so a scheme the link field won't store is
one the endpoint won't fetch.

## Sharing

Signed in, a tracker's owner invites an email address. There's no link to send.
Nothing is looked up at invite time, so the invitation is written whether or not
that person has an account; when they next open the app it becomes a membership
and the tracker appears on their home page. Roles are `owner` (everything),
`editor` (log entries) and `viewer` (read).

Entries record who wrote them, so a shared tracker shows names and colours per
author in the list, the calendar and the filters. Live updates arrive over
Supabase Realtime.

[supabase/README.md](supabase/README.md) covers the reasoning: why the email
isn't resolved at invite time, why claiming requires a confirmed address, and
what happens to a shared tracker when its owner deletes their account.

## Next steps to consider

- **Display names**: authors show the local part of their email. A `profiles`
  table is the point at which that becomes a real name.
- **JS tests**: there's no test framework yet. `filtering.ts`, `authors.ts`,
  `outOf.ts` and `dateUtils.ts` are pure and would be cheap to cover.
- **Drag-to-reorder fields**, most likely with `dnd-kit`.
- **CSV export**, which is easy since every entry value is JSON-serializable.
- **PWA**: `vite-plugin-pwa` gets "add to home screen" and offline.
- **Pictures**: needs Supabase Storage. Base64 in a jsonb column doesn't
  scale, which is why there's no picture field.

## Design notes

- Fredoka throughout, headings and body alike, loaded from Google Fonts by the
  `<link>` in `index.html`. The `font-mono` utility falls back to Tailwind's
  default system stack, so the few monospaced labels cost no extra download.
- The pastel palette lives in `src/index.css` under the Tailwind v4 `@theme`
  block. Retheme there.
- Tailwind v4 only detects static class strings at build time, so `colors.ts`
  maps a tracker's `color` key to concrete class names it can see.
