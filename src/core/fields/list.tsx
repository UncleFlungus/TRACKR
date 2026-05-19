import { useState } from 'react';
import { X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { FieldTypeDef } from '../types';

interface ListConfig {
  layout: 'pills' | 'commas' | 'bullets';
}

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
  const items = value ?? [];

  // Pull every value this field has ever held across past entries in this
  // tracker. Powers the autocomplete: as you type, we suggest past items.
  const pastValues = useLiveQuery(
    async () => {
      if (!trackerId || !fieldId) return [] as string[];
      const entries = await db.entries.where('trackerId').equals(trackerId).toArray();
      const seen = new Set<string>();
      for (const e of entries) {
        const v = e.values[fieldId];
        if (Array.isArray(v)) {
          for (const item of v) if (typeof item === 'string') seen.add(item);
        }
      }
      return Array.from(seen);
    },
    [trackerId, fieldId],
    [] as string[]
  );

  const trimmed = draft.trim().toLowerCase();
  const suggestions = trimmed
    ? pastValues
        .filter((p) => p.toLowerCase().includes(trimmed) && !items.includes(p))
        .slice(0, 5)
    : [];

  function addItem(item: string) {
    const t = item.trim();
    if (!t) return;
    if (items.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...items, t]);
    setDraft('');
  }

  function commitDraftOnEnter() {
    // Enter behavior: if a past value starts with what's typed, auto-complete
    // to that past value. Otherwise add the raw draft. This is the
    // "press Enter to autocomplete from history" UX.
    const prefixMatch = pastValues.find(
      (p) => p.toLowerCase().startsWith(trimmed) && p.toLowerCase() !== trimmed
    );
    addItem(prefixMatch ?? draft);
  }

  function removeAt(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div className="py-1">
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
            } else if (e.key === 'Backspace' && draft === '' && items.length > 0) {
              removeAt(items.length - 1);
            }
          }}
          autoFocus={autoFocus}
          placeholder={items.length === 0 ? 'Type and press Enter…' : 'Add another…'}
          className="flex-1 min-w-[140px] bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-1 focus:outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-grape-400 text-[11px] uppercase tracking-wide font-semibold pt-1">
            Past:
          </span>
          {suggestions.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => addItem(s)}
              className="text-grape-600 hover:text-grape-900 hover:bg-grape-50 text-[12px] rounded px-1.5 py-0.5"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ListDisplay({ value, config }: { value: string[] | null; config: ListConfig }) {
  const items = value ?? [];
  if (items.length === 0) return <em className="text-grape-300 text-[15px]">empty</em>;

  const layout = config.layout ?? 'pills';

  if (layout === 'commas') {
    return <span className="text-grape-800 text-[15px]">{items.join(', ')}</span>;
  }
  if (layout === 'bullets') {
    return (
      <ul className="list-disc list-inside text-grape-800 text-[15px] space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
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
