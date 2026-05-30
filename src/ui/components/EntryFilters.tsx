import type { Field } from '@/core/types';

interface Props {
  fields: Field[];
  /** fieldId → selected option value, or null/missing means "All". */
  values: Record<string, string | null>;
  onChange: (next: Record<string, string | null>) => void;
}

/**
 * Filter bar that renders a chip row per select field in the tracker.
 * Chips are mutually exclusive within a field (one selection per field);
 * across fields the filters AND together. "All" clears that field's filter.
 *
 * Returns null when there are no select fields, so the caller doesn't need
 * to guard rendering.
 */
export default function EntryFilters({ fields, values, onChange }: Props) {
  const selectFields = fields.filter((f) => f.type === 'select');
  if (selectFields.length === 0) return null;

  // Skip select fields whose options haven't been configured yet — filtering
  // by them would offer nothing.
  const usable = selectFields.filter((f) => {
    const opts = (f.config as { options?: string[] }).options;
    return opts && opts.length > 0;
  });
  if (usable.length === 0) return null;

  function setFilter(fieldId: string, value: string | null) {
    onChange({ ...values, [fieldId]: value });
  }

  return (
    <div className="space-y-2.5 mb-4">
      {usable.map((field) => {
        const options = (field.config as { options: string[] }).options;
        const active = values[field.id] ?? null;
        return (
          <div key={field.id}>
            <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1.5">
              {field.name}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                selected={active === null}
                onClick={() => setFilter(field.id, null)}
              >
                All
              </Chip>
              {options.map((opt) => (
                <Chip
                  key={opt}
                  selected={active === opt}
                  onClick={() => setFilter(field.id, opt)}
                >
                  {opt}
                </Chip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? 'bg-grape-500 text-white text-[13px] font-medium rounded-full px-3 py-1 transition-colors'
          : 'bg-white border border-grape-200 hover:border-grape-300 hover:bg-grape-50 text-grape-600 text-[13px] font-medium rounded-full px-3 py-1 transition-colors'
      }
    >
      {children}
    </button>
  );
}
