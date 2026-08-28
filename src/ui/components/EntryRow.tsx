import { Check } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType, isFieldEmpty } from '@/core/fields';
import InlineCounter from './InlineCounter';
import AuthorTag from './AuthorTag';
import type { AuthorMap } from '@/core/authors';
import { resolveMax } from '@/core/fields/outOf';
import type { Entry, Field } from '@/core/types';

interface Props {
  entry: Entry;
  fields: Field[];
  /** If true, hide fields whose value is empty for this entry. Default: true. */
  hideEmpty?: boolean;
  /**
   * Viewers on a shared tracker get plain values instead of the inline
   * checkmark and counter controls — the database would reject those writes,
   * so offering them would just be a button that lies.
   */
  readOnly?: boolean;
  /** Set on shared trackers only; null means "everyone here is you". */
  authors?: AuthorMap | null;
  onClick: () => void;
}

export default function EntryRow({
  entry,
  fields,
  hideEmpty = true,
  readOnly = false,
  authors = null,
  onClick,
}: Props) {
  const { updateEntry, incrementEntryValue } = useDataMutations();

  const visibleFields = hideEmpty
    ? fields.filter((f) => {
        const def = getFieldType(f.type);
        return !isFieldEmpty(def, entry.values[f.id], f.config);
      })
    : fields;

  async function toggleCheckmark(fieldId: string) {
    const current = entry.values[fieldId] as boolean | null;
    // Only the key that changed: updateEntry merges, so sending the whole map
    // would just risk reverting a co-member's edit to some other field.
    await updateEntry(entry.id, { [fieldId]: !current });
  }

  async function stepCount(fieldId: string, delta: number, max: number) {
    await incrementEntryValue(entry.id, fieldId, delta, max);
  }

  // Outer is a <div role="button"> rather than a real <button> so that the
  // inline checkmark toggle (a real button) can nest inside without breaking
  // a11y semantics. Keyboard activation handled manually for Enter/Space.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="w-full text-left bg-white border border-grape-100 rounded-xl px-4 py-3 hover:border-grape-300 hover:bg-grape-50/30 transition-colors cursor-pointer focus:outline-none focus:border-grape-400"
    >
      {visibleFields.length === 0 ? (
        <p className="text-grape-300 text-[13px] italic">
          No values yet — tap to edit
        </p>
      ) : (
        <div className="space-y-1.5">
          {authors && (
            <AuthorTag authors={authors} authorId={entry.authorId} />
          )}
          {visibleFields.map((field) => {
            const def = getFieldType(field.type);
            return (
              <div key={field.id} className="flex items-baseline gap-3">
                <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide w-24 shrink-0">
                  {field.name}
                </span>
                <div className="flex-1 min-w-0 truncate">
                  {readOnly ? (
                    <def.Display
                      value={entry.values[field.id] as any}
                      config={field.config as any}
                    />
                  ) : field.type === 'checkmark' ? (
                    <InlineCheckmark
                      checked={Boolean(entry.values[field.id])}
                      onToggle={() => toggleCheckmark(field.id)}
                    />
                  ) : field.type === 'count' ? (
                    <InlineCounter
                      value={entry.values[field.id] as number | null}
                      config={field.config as { max: number }}
                      onStep={(delta) =>
                        stepCount(
                          field.id,
                          delta,
                          resolveMax(field.config as { max: number }),
                        )
                      }
                    />
                  ) : (
                    <def.Display
                      value={entry.values[field.id] as any}
                      config={field.config as any}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InlineCheckmark({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="inline-flex items-center gap-1.5 text-[14px] hover:opacity-80 transition-opacity"
    >
      {checked ? (
        <>
          <span className="w-4 h-4 rounded bg-grape-500 text-white flex items-center justify-center">
            <Check className="w-3 h-3" strokeWidth={3} />
          </span>
          <span className="text-grape-700">Done</span>
        </>
      ) : (
        <>
          <span className="w-4 h-4 rounded border-2 border-grape-300 hover:border-grape-500 transition-colors" />
          <span className="text-grape-400">Not done</span>
        </>
      )}
    </button>
  );
}
