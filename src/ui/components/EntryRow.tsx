import { Check } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType, isFieldEmpty } from '@/core/fields';
import type { Entry, Field } from '@/core/types';

interface Props {
  entry: Entry;
  fields: Field[];
  /** If true, hide fields whose value is empty for this entry. Default: true. */
  hideEmpty?: boolean;
  onClick: () => void;
}

export default function EntryRow({ entry, fields, hideEmpty = true, onClick }: Props) {
  const { updateEntry } = useDataMutations();

  const visibleFields = hideEmpty
    ? fields.filter((f) => {
        const def = getFieldType(f.type);
        return !isFieldEmpty(def, entry.values[f.id], f.config);
      })
    : fields;

  async function toggleCheckmark(fieldId: string) {
    const current = entry.values[fieldId] as boolean | null;
    await updateEntry(entry.id, { ...entry.values, [fieldId]: !current });
  }

  // Note: outer is a <div role="button"> rather than a real <button>. Real
  // buttons can't nest other buttons (we need a tappable checkmark inside),
  // and the div + role pattern still gets us keyboard activation + a11y
  // semantics. onKeyDown handles Enter/Space the way a button would.
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
        <p className="text-grape-300 text-[13px] italic">No values yet — tap to edit</p>
      ) : (
        <div className="space-y-1.5">
          {visibleFields.map((field) => {
            const def = getFieldType(field.type);
            return (
              <div key={field.id} className="flex items-baseline gap-3">
                <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide w-24 shrink-0">
                  {field.name}
                </span>
                <div className="flex-1 min-w-0 truncate">
                  {field.type === 'checkmark' ? (
                    <InlineCheckmark
                      checked={Boolean(entry.values[field.id])}
                      onToggle={() => toggleCheckmark(field.id)}
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
      <p className="text-grape-300 text-[11px] mt-2">
        {new Date(entry.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

/**
 * Tappable checkmark rendered inline in an EntryRow. Stops propagation so
 * that toggling doesn't also open the entry's detail modal.
 */
function InlineCheckmark({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
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