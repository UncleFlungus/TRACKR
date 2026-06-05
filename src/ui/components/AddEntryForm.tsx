import { useEffect, useState } from 'react';
import { Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType } from '@/core/fields';
import { getDateFieldId } from '@/core/dateUtils';
import type { Field } from '@/core/types';

interface Props {
  trackerId: string;
  fields: Field[];
  /**
   * When provided, the calendar-eligible date field (if any) is pre-filled
   * with this date. If the tracker has no date field, createdAt is set to
   * this date on save instead.
   */
  initialDate?: Date;
  /** Render the form expanded immediately, no collapsed "+ New entry" toggle. */
  forceOpen?: boolean;
  /** Called when the form closes (cancel or save). */
  onClose?: () => void;
}

export default function AddEntryForm({
  trackerId,
  fields,
  initialDate,
  forceOpen,
  onClose,
}: Props) {
  const { addEntry, updateField } = useDataMutations();
  const dateFieldId = getDateFieldId(fields);

  // Initial values:
  //   - For the calendar's date field: use initialDate if provided
  //   - Else: use the field type's computeDefault (e.g. autoNow → now)
  //   - Else: f.defaultValue
  const initial = () =>
    Object.fromEntries(
      fields.map((f) => {
        if (initialDate && f.id === dateFieldId) {
          return [f.id, initialDate.getTime()];
        }
        const def = getFieldType(f.type);
        const computed = def.computeDefault
          ? def.computeDefault(f.config)
          : undefined;
        return [
          f.id,
          computed !== undefined ? computed : (f.defaultValue ?? null),
        ];
      }),
    );

  const [values, setValues] = useState<Record<string, unknown>>(initial());
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;

  // Reset whenever the field schema changes (added/removed/reordered),
  // the form opens, or the initialDate changes.
  useEffect(() => {
    if (isOpen) setValues(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialDate?.getTime(), fields.map((f) => f.id).join(',')]);

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

  function close() {
    setValues(initial());
    if (forceOpen) onClose?.();
    else setOpen(false);
  }

  async function submit() {
    // If the user picked a calendar date but the tracker has no time field,
    // we set createdAt explicitly so the entry lands on the right calendar day.
    const createdAtOverride =
      initialDate && !dateFieldId ? initialDate.getTime() : undefined;
    await addEntry({
      trackerId,
      values,
      ...(createdAtOverride !== undefined
        ? { createdAt: createdAtOverride }
        : {}),
    });
    close();
  }

  // Collapsed state (only when not forced open).
  if (!isOpen) {
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
                  onChange={(v) =>
                    setValues((cur) => ({ ...cur, [field.id]: v }))
                  }
                  config={field.config as any}
                  autoFocus={i === 0}
                  trackerId={trackerId}
                  fieldId={field.id}
                />
              </div>
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
          onClick={close}
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
