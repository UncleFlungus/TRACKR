import { useEffect, useState } from 'react';
import { Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType } from '@/core/fields';
import type { Field } from '@/core/types';

interface Props {
  trackerId: string;
  fields: Field[];
}

export default function AddEntryForm({ trackerId, fields }: Props) {
  const { addEntry, updateField } = useDataMutations();
  // Compute initial values: prefer the field type's computeDefault (for
  // dynamic defaults like "now") over the field's static defaultValue.
  const initial = () =>
    Object.fromEntries(
      fields.map((f) => {
        const def = getFieldType(f.type);
        const computed = def.computeDefault ? def.computeDefault(f.config) : undefined;
        return [f.id, computed !== undefined ? computed : f.defaultValue ?? null];
      })
    );
  const [values, setValues] = useState<Record<string, unknown>>(initial());
  const [open, setOpen] = useState(false);

  // Reset whenever the field schema changes (added/removed/reordered) or the
  // form opens, so dynamic defaults like "now" get a fresh value each time.
  useEffect(() => {
    if (open) setValues(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fields.map((f) => f.id).join(',')]);

  // Reorder is the same logic as in FieldEditor: swap order values between
  // adjacent fields. Two writes happen in parallel; brief inconsistency is
  // fine at this data scale.
  async function moveField(field: Field, direction: 'up' | 'down') {
    const sorted = [...fields].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((f) => f.id === field.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      updateField(field.id, { order: other.order }),
      updateField(other.id, { order: field.order }),
    ]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={fields.length === 0}
        className="w-full bg-grape-500 hover:bg-grape-600 disabled:bg-grape-200 disabled:cursor-not-allowed text-white font-display font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition-colors"
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} /> New entry
      </button>
    );
  }

  async function submit() {
    await addEntry({ trackerId, values });
    setValues(initial());
    setOpen(false);
  }

  // Sort here too so the up/down logic above matches what's rendered.
  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="bg-white border border-grape-200 rounded-2xl p-4">
      <div className="space-y-1 mb-3">
        {sortedFields.map((field, i) => {
          const def = getFieldType(field.type);
          const isFirst = i === 0;
          const isLast = i === sortedFields.length - 1;
          return (
            <div
              key={field.id}
              className="flex items-baseline gap-3 border-b border-grape-100 last:border-b-0 px-1"
            >
              <label className="text-grape-500 text-[12px] font-semibold w-24 shrink-0 py-2 uppercase tracking-wide">
                {field.name}
              </label>
              <div className="flex-1 min-w-0">
                <def.Input
                  value={values[field.id] as any}
                  onChange={(v) => setValues((cur) => ({ ...cur, [field.id]: v }))}
                  config={field.config as any}
                  autoFocus={i === 0}
                  trackerId={trackerId}
                  fieldId={field.id}
                />
              </div>
              {/*
                Reorder arrows. Calls updateField — this is the SAME ordering
                as the tracker uses everywhere else (entry list, modal, etc).
                Reordering here is just a faster path to the same setting.
              */}
              <div className="flex items-center gap-0.5 self-center">
                <button
                  type="button"
                  onClick={() => moveField(field, 'up')}
                  disabled={isFirst}
                  className="p-1 text-grape-300 hover:text-grape-600 disabled:opacity-30 disabled:hover:text-grape-300 rounded-md"
                  aria-label="Move field up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveField(field, 'down')}
                  disabled={isLast}
                  className="p-1 text-grape-300 hover:text-grape-600 disabled:opacity-30 disabled:hover:text-grape-300 rounded-md"
                  aria-label="Move field down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 border border-grape-200 hover:bg-grape-50 text-grape-600 text-[14px] font-semibold rounded-xl py-2.5 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className="flex-1 bg-grape-500 hover:bg-grape-600 text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
        >
          Save entry
        </button>
      </div>
    </div>
  );
}