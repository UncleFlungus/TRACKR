import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useEntriesForTracker } from '../data';
import { collectPastTags } from '../tags';
import type { FieldTypeDef } from '../types';

interface ListConfig {
  layout: 'pills' | 'commas' | 'bullets';
}

const MAX_SUGGESTIONS = 8;

function ListInput({
  value,
  onChange,
  autoFocus,
  trackerId,
  fieldId,
}: {
  value: string[] | null;
  onChange: (v: string[] | null) => void;
  autoFocus?: boolean;
  trackerId?: string;
  fieldId?: string;
}) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  // Not `value ?? []`: only null and undefined are nullish, so another field
  // type's default used to reach .map() and take the render down. Items are
  // filtered too, since a table value is an array of objects and rendering one
  // as a React child throws just as hard.
  const items = Array.isArray(value)
    ? value.filter((i): i is string => typeof i === 'string')
    : [];

  // Goes through the same hook as the tracker page, so it reads whichever
  // backend is active and reuses entries already loaded.
  const entries = useEntriesForTracker(trackerId || undefined);
  const pastTags = useMemo(
    () => collectPastTags(entries, fieldId),
    [entries, fieldId],
  );

  const chosen = new Set(items.map((i) => i.toLowerCase()));
  const query = draft.trim().toLowerCase();
  const available = pastTags.filter((t) => !chosen.has(t.label.toLowerCase()));
  // Empty draft: the most used tags, so you can pick without remembering them.
  // Otherwise matches, with ones that start with the draft first.
  const suggestions = (
    query
      ? available
          .filter((t) => t.label.toLowerCase().includes(query))
          .sort(
            (a, b) =>
              Number(b.label.toLowerCase().startsWith(query)) -
              Number(a.label.toLowerCase().startsWith(query)),
          )
      : available
  ).slice(0, MAX_SUGGESTIONS);

  function addItem(raw: string) {
    const t = raw.trim();
    setDraft('');
    if (!t || chosen.has(t.toLowerCase())) return;
    // An existing tag in different case wins, so the spelling stays consistent.
    const existing = pastTags.find(
      (p) => p.label.toLowerCase() === t.toLowerCase(),
    );
    onChange([...items, existing?.label ?? t]);
  }

  function commitDraftOnEnter() {
    if (!query) return;
    // Enter completes to the best match that starts with what's typed, or adds
    // the draft as a new tag if nothing does.
    const prefixMatch = suggestions.find((s) =>
      s.label.toLowerCase().startsWith(query),
    );
    addItem(prefixMatch?.label ?? draft);
  }

  function removeAt(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    // Focus is tracked on the wrapper so tabbing onto a suggestion doesn't
    // count as leaving the field.
    <div
      className="py-1"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      <div className="flex flex-wrap gap-1.5 items-center">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="inline-flex items-center gap-1 bg-grape-100 text-grape-800 text-[13px] font-medium rounded-md pl-2 pr-1 py-0.5"
          >
            {item}
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="text-grape-500 hover:text-grape-800"
              aria-label={`Remove ${item}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraftOnEnter();
            } else if (
              e.key === 'Backspace' &&
              draft === '' &&
              items.length > 0
            ) {
              removeAt(items.length - 1);
            }
          }}
          autoFocus={autoFocus}
          placeholder={
            items.length === 0 ? 'Type and press Enter…' : 'Add another…'
          }
          className="flex-1 min-w-[140px] bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-1 focus:outline-none"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-grape-400 text-[11px] uppercase tracking-wide font-semibold pt-1">
            {query ? 'Matches:' : 'Used before:'}
          </span>
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.label}
              // Keeps focus in the input on mouse clicks, so typing can carry on.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addItem(s.label)}
              className="text-grape-600 hover:text-grape-900 bg-grape-50 hover:bg-grape-100 text-[12px] rounded px-1.5 py-0.5"
            >
              {s.label}
              <span className="text-grape-300 ml-1">{s.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ListDisplay({
  value,
  config,
}: {
  value: string[] | null;
  config: ListConfig;
}) {
  const items = Array.isArray(value)
    ? value.filter((i): i is string => typeof i === 'string')
    : [];
  if (items.length === 0)
    return <em className="text-grape-300 text-[15px]">empty</em>;

  const layout = config?.layout ?? 'pills';

  if (layout === 'commas') {
    return (
      <span className="text-grape-800 text-[15px]">{items.join(', ')}</span>
    );
  }
  if (layout === 'bullets') {
    return (
      <ul className="list-disc list-inside text-grape-800 text-[15px] space-y-0.5">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <span
          key={i}
          className="bg-grape-100 text-grape-800 text-[13px] font-medium rounded-md px-2 py-0.5"
        >
          {it}
        </span>
      ))}
    </div>
  );
}

export const listField: FieldTypeDef<ListConfig, string[]> = {
  id: 'list',
  label: 'List',
  icon: 'List',
  defaultConfig: { layout: 'pills' },
  defaultValue: [],
  validate: (value) => {
    if (value == null) return null;
    if (!Array.isArray(value)) return 'Expected a list';
    return null;
  },
  Input: ListInput as any,
  Display: ListDisplay as any,
};
