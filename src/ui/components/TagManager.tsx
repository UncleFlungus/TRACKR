import { useMemo, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { useDataMutations, useEntriesForTracker } from '@/core/data';
import { collectPastTags, rewriteTags, tagKey } from '@/core/tags';
import { useToast } from './Toast';
import type { Field } from '@/core/types';

/**
 * Every tag a list field uses, with rename, remove and a one-click fix for
 * case duplicates. Unlike the rest of the field editor this writes straight
 * away, since it changes entries rather than the field's settings.
 *
 * Each write sends only this field's key, so a co-member's edit to another
 * field on the same entry survives.
 */
export default function TagManager({ field }: { field: Field }) {
  const entries = useEntriesForTracker(field.trackerId);
  const { updateEntry } = useDataMutations();
  const { notify } = useToast();
  const tags = useMemo(
    () => collectPastTags(entries, field.id),
    [entries, field.id],
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [progress, setProgress] = useState<string | null>(null);

  const caseDuplicates = tags.filter((t) => t.spellings.length > 1);

  async function apply(rename: Map<string, string | null>) {
    const changes = entries
      .map((e) => ({ id: e.id, next: rewriteTags(e.values[field.id], rename) }))
      .filter((c): c is { id: string; next: string[] } => c.next !== null);
    if (changes.length === 0) return;

    let done = 0;
    try {
      for (const c of changes) {
        setProgress(`Updating ${done + 1} of ${changes.length}…`);
        await updateEntry(c.id, { [field.id]: c.next });
        done++;
      }
    } catch {
      notify(
        `Stopped after ${done} of ${changes.length} entries. Check your connection and try again.`,
      );
    } finally {
      setProgress(null);
    }
  }

  async function commitRename(fromLabel: string) {
    setRenaming(null);
    const to = draft.trim();
    if (!to || to === fromLabel) return;
    // Renaming onto another tag merges them, in that tag's spelling unless the
    // new name differs only by case, which is a deliberate respelling.
    const target = tags.find(
      (t) =>
        tagKey(t.label) === tagKey(to) && tagKey(t.label) !== tagKey(fromLabel),
    );
    const finalLabel = target?.label ?? to;
    const rename = new Map<string, string | null>([
      [tagKey(fromLabel), finalLabel],
    ]);
    if (target) rename.set(tagKey(target.label), finalLabel);
    await apply(rename);
  }

  async function remove(label: string) {
    const tag = tags.find((t) => t.label === label);
    const n = tag?.count ?? 0;
    if (
      !confirm(
        `Remove "${label}" from ${n} ${n === 1 ? 'entry' : 'entries'}? This can't be undone.`,
      )
    )
      return;
    await apply(new Map([[tagKey(label), null]]));
  }

  async function fixCase() {
    await apply(
      new Map(caseDuplicates.map((t) => [tagKey(t.label), t.label] as const)),
    );
  }

  if (tags.length === 0) {
    return (
      <p className="text-grape-400 text-[12px] mt-2">
        No tags yet. They'll show up here once entries use them.
      </p>
    );
  }

  const busy = progress !== null;

  return (
    <div className="mt-2 pt-2 border-t border-grape-50">
      <div className="flex items-center justify-between mb-1">
        <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
          Tags
        </p>
        {progress && (
          <span className="text-grape-400 text-[11px]">{progress}</span>
        )}
      </div>

      {caseDuplicates.length > 0 && (
        <button
          type="button"
          onClick={fixCase}
          disabled={busy}
          className="w-full text-left bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-800 text-[12px] rounded-md px-2.5 py-1.5 mb-2 transition-colors"
        >
          {caseDuplicates.length === 1
            ? `1 tag is spelled more than one way`
            : `${caseDuplicates.length} tags are spelled more than one way`}
          . <span className="font-semibold">Merge them</span>
        </button>
      )}

      <div className="space-y-0.5 max-h-64 overflow-y-auto">
        {tags.map((t) => (
          <div key={t.label} className="flex items-center gap-2 py-0.5">
            {renaming === t.label ? (
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(t.label);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={() => setRenaming(null)}
                autoFocus
                className="flex-1 min-w-0 bg-grape-50 text-[13px] text-grape-900 rounded-md px-2 py-0.5 focus:outline-none"
              />
            ) : (
              <span className="flex-1 min-w-0 truncate text-[13px] text-grape-800">
                {t.label}
                {t.spellings.length > 1 && (
                  <span className="text-amber-600 text-[11px] ml-1.5">
                    also {t.spellings.filter((s) => s !== t.label).join(', ')}
                  </span>
                )}
              </span>
            )}
            <span className="text-grape-300 text-[12px] tabular-nums">
              {t.count}
            </span>
            <button
              type="button"
              onClick={() => {
                setRenaming(t.label);
                setDraft(t.label);
              }}
              disabled={busy}
              aria-label={`Rename ${t.label}`}
              className="p-1 text-grape-300 hover:text-grape-600 disabled:opacity-30 rounded-md"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => remove(t.label)}
              disabled={busy}
              aria-label={`Remove ${t.label} from all entries`}
              className="p-1 text-grape-300 hover:text-rose-600 disabled:opacity-30 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-grape-400 text-[11px] mt-1">
        Changes apply to entries straight away. Renaming a tag to one that
        already exists merges them.
      </p>
    </div>
  );
}
