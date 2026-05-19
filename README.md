# trackr

A minimal, flexible personal tracker. Create a tracker for anything, define your own fields, log entries fast.

Local-first — your data lives in your browser via IndexedDB. No backend, no auth, nothing leaves your machine until you add it.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173.

Requires Node 20+.

## What's here

- **Vite + React + TypeScript + Tailwind v4** — fast iteration, no config bloat
- **Dexie** for IndexedDB persistence with reactive `useLiveQuery` hooks
- **React Router** for the three pages: home, create, tracker detail
- **Lucide** for icons
- **Fredoka + Nunito** from Google Fonts for the round/fluffy feel

## Project structure

```
src/
  core/                      ← Portable. Mobile-app safe. No React-DOM-specific code.
    types.ts                 ← Tracker, Field, Entry, FieldTypeDef
    db.ts                    ← Dexie schema + CRUD helpers
    templates.ts             ← Tracker templates (Wishlist, Meals, etc.)
    fields/
      index.ts               ← Field type registry
      text.tsx               ← Each field type is one self-contained module
      number.tsx
      currency.tsx
  ui/                        ← Web-specific. Replace this folder when going native.
    colors.ts                ← Theme lookup (so Tailwind can statically detect classes)
    pages/
      HomePage.tsx
      CreateTrackerPage.tsx
      TrackerPage.tsx
    components/
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
- **list** — array of items. Type and press Enter to add. Autocompletes from past entries in the same field. Three display layouts via `config.layout`: `'pills'` (default), `'commas'`, or `'bullets'`.
- **picture** — upload one or more photos. Stored as data URLs in IndexedDB. To enable mobile camera capture, add `capture="environment"` to the `<input type="file">` inside `picture.tsx`.

## How dynamic defaults work

A field type can opt into computed-at-open defaults by implementing `computeDefault`:

```ts
computeDefault?: (config: TConfig) => TValue | null;
```

The `time` field uses this to auto-populate with `Date.now()` when its `autoNow` config is true. This runs every time the entry form opens, so the value is always fresh.

You can use the same pattern for other "smart defaults":

```ts
// Always-default-to-Costco store field:
computeDefault: () => 'Costco'

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
    try { new URL(v); return null; } catch { return 'Invalid URL'; }
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
      <a href={value} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline text-[15px] truncate">
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

## Next steps to consider

- **More field types**: url with link preview (fetch Open Graph server-side), date, time, select, multiselect, rating, checkbox, photo
- **Drag-to-reorder fields**: `dnd-kit` is the cleanest option
- **Edit existing entries**: right now you can only add or delete — wire up an edit modal that reuses `AddEntryForm`
- **Field config UI**: let users customize the currency symbol, set min/max on numbers, etc.
- **Filtering/sorting entries**: simple controls above the entry list
- **CSV export**: trivial since every entry value is JSON-serializable
- **PWA**: add `vite-plugin-pwa` and you've got "add to home screen" + offline
- **Sync**: when you outgrow local-only, swap `core/db.ts` for a Supabase client. The rest of the app shouldn't have to change much because everything goes through `db.ts`

## Design notes

- The "round fluffy font" is Fredoka for headings, Nunito for body. Both loaded from Google Fonts in `index.html`.
- The pastel purple/blue palette lives in `src/index.css` under the Tailwind v4 `@theme` block. Edit there if you want to retheme.
- Tailwind v4 needs static class strings to detect them at build time. The `colors.ts` helper exists so we can map dynamic color keys (from a tracker's `color` field) to concrete class names Tailwind can see.
