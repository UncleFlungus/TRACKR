# trackr

A minimal, flexible personal tracker. Create a tracker for anything, define your own fields, log entries fast.

Local-first, then optionally shared. Signed out, everything lives in your browser via IndexedDB and never leaves the machine. Sign in and the same app runs against Supabase instead, where a tracker can be shared with other people who log into it alongside you.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173.

Requires Node 20+.

## What's here

- **Vite + React + TypeScript + Tailwind v4** — fast iteration, no config bloat
- **Dexie** for IndexedDB persistence with reactive `useLiveQuery` hooks (signed out)
- **Supabase** for auth, Postgres and realtime (signed in), with **React Query** caching
- **React Router** for the pages: home, create, tracker detail
- **Lucide** for icons
- **Fredoka + Nunito** from Google Fonts for the round/fluffy feel

## Two backends, one set of hooks

Every page reads through the hooks in `core/data.tsx`, which pick a backend
based on auth state: Dexie when signed out, Supabase when signed in. Pages
don't know which they're getting.

The cloud path never filters by user. `cloud.ts` selects everything and lets
Postgres row-level security decide what comes back — which is why sharing a
tracker needed no page changes at all. **All access control lives in the
database.** See [SECURITY.md](SECURITY.md) for the model and the queries to
verify it, and [supabase/](supabase/) for the migrations and their tests.

## Project structure

```
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

The `core/` vs `ui/` split is intentional. When you decide to ship native via Expo, everything in `core/` ports over as-is — only `ui/` gets rewritten.

## Field types included

- **text** — single-line text
- **longtext** — multi-line description (uses `<textarea>`)
- **number** — typed number input with optional suffix and decimals
- **currency** — stored as a number, rendered with a symbol prefix
- **time** — datetime picker; with `autoNow: true` in config, auto-populates with the current time when the new-entry form opens
- **duration** — start/stop timer. Tap once to start, tap again to stop. Stores total seconds.
- **select** — one option from a configured list, rendered as pills. Each option can carry its own colour (a sparse override map; unset options use the tracker's accent).
- **checkmark** — a boolean. Unlike other types, `false` counts as a real value rather than empty, so unchecked items stay visible in entry rows and can be ticked off inline.
- **link** — a URL with an optional title. Validated against an explicit `http`/`https`/`mailto` allowlist at both entry and display time, so a stored `javascript:` value renders as plain text rather than a clickable anchor.
- **list** — array of items. Type and press Enter to add. Autocompletes from past entries in the same field. Three display layouts via `config.layout`: `'pills'` (default), `'commas'`, or `'bullets'`.
- **score** — a rating out of a configurable max, e.g. `7/10`. Set the max ("Out of") when creating or editing the field; the value stored is the score itself (a plain number), so it stays sortable, range-filterable, and averageable. Changing the max later re-renders every past entry against the new denominator without touching entry data. A max of 10 or less renders as tap-to-pick pills; larger maxes get a number input. Opt into the "Average" aggregation in the field editor to show e.g. `6.8/10` above the entry list. Shares its max config with **count** via `core/fields/outOf.ts`.
- **count** — a running tally toward a target, e.g. reps: `7/10`. Same "out of" max as score, but built for a value that changes over the entry's life: minus/plus buttons step it, and it renders with a checkmark once it reaches the max, like a checkmark field. Steppers also appear inline in the entry list and grid, so you can tick reps up mid-workout without opening the entry. Defaults to `0` (not empty) so a fresh entry shows `0/10` with buttons ready. Values are clamped to `[0, max]` — to log more than the target, raise the max. Aggregations: "Average" and "Completed count" (`3 of 7 done`).
- **table** — repeating rows inside one entry, for sets in a workout or courses in a meal. Configure columns (name, unit, number/text) and what a row is called; the value is an array of row objects keyed by column id, so renaming a column keeps its data. The only field type whose value is structured rather than scalar, which is why filtering skips it and its only aggregation is a row count — anything that understands the columns (heaviest set, total volume) needs its own code.
- ~~**picture**~~ — **deprecated and unregistered.** Photos were stored as base64 data URLs inside the entry's `values` jsonb, which doesn't scale; the module is commented out of the registry pending a move to Supabase Storage.

## How dynamic defaults work

A field type can opt into computed-at-open defaults by implementing `computeDefault`:

```ts
computeDefault?: (config: TConfig) => TValue | null;
```

The `time` field uses this to auto-populate with `Date.now()` when its `autoNow` config is true. This runs every time the entry form opens, so the value is always fresh.

You can use the same pattern for other "smart defaults":

```ts
// Always-default-to-Costco store field:
computeDefault: () => 'Costco';

// Auto-increment counter field (would also need access to past entries — see below):
// requires extending the contract to pass entry history
```

To support "last used value" defaults, you'd extend the contract to pass the last entry's values into `computeDefault`. Easy change, just hasn't been done yet.

## How to add a new field type

The whole point of this architecture is that adding a field type is a small, contained change. Example: adding a `url` field with link preview.

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

That's it. The Create page picker, the Add Entry form, the Entry display, and the Field editor all pick it up automatically because they read from the registry.

## Sharing

Signed in, a tracker's owner invites an **email address** — no link to send.
Nothing is looked up at invite time, so the invitation is written whether or
not that person has an account; when they next open the app it becomes a
membership and the tracker appears on their home page. Roles are `owner`
(everything), `editor` (log entries) and `viewer` (read).

Entries record who wrote them, so a shared tracker shows names and colours per
author in the list, the calendar and the filters. Live updates arrive over
Supabase Realtime.

The reasoning behind each choice — why the email isn't resolved, why claiming
requires a confirmed address, what happens to a shared tracker when its owner
deletes their account — is in [supabase/README.md](supabase/README.md).

## Next steps to consider

- **Display names**: authors currently show the local part of their email. A
  `profiles` table is the point at which that becomes a real name.
- **JS tests**: there's no test framework. `filtering.ts`, `authors.ts`,
  `outOf.ts` and `dateUtils.ts` are pure and would be cheap to cover.
- **Drag-to-reorder fields**: `dnd-kit` is the cleanest option
- **CSV export**: trivial since every entry value is JSON-serializable
- **PWA**: add `vite-plugin-pwa` and you've got "add to home screen" + offline
- **Pictures**: the field is deprecated pending a move to Supabase Storage —
  base64 in a jsonb column doesn't scale

## Design notes

- The "round fluffy font" is Fredoka for headings, Nunito for body. Both loaded from Google Fonts in `index.html`.
- The pastel purple/blue palette lives in `src/index.css` under the Tailwind v4 `@theme` block. Edit there if you want to retheme.
- Tailwind v4 needs static class strings to detect them at build time. The `colors.ts` helper exists so we can map dynamic color keys (from a tracker's `color` field) to concrete class names Tailwind can see.
