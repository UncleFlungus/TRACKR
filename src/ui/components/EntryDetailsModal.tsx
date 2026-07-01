import { useEffect, useState } from 'react';
import { X, Pencil, Trash2 } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType } from '@/core/fields';
import type { Entry, Field } from '@/core/types';
import InlineSelect from '../components/InlineSelect';

interface Props {
  entry: Entry;
  fields: Field[];
  accentColor: string; // tracker.color — passed to InlineSelect for option colors
  onClose: () => void;
}

/**
 * Centered modal showing an entry's full content.
 * - Opens in view mode (read-only Displays; select is inline-editable).
 * - "Edit" toggle swaps in the Input components.
 * - Save commits via updateEntry and returns to view mode.
 */
export default function EntryDetailsModal({
  entry,
  fields,
  accentColor,
  onClose,
}: Props) {
  const { updateEntry, deleteEntry } = useDataMutations();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editedValues, setEditedValues] = useState<Record<string, unknown>>(
    entry.values,
  );

  useEffect(() => {
    if (mode === 'view') setEditedValues(entry.values);
  }, [entry, mode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSave() {
    await updateEntry(entry.id, editedValues);
    setMode('view');
  }

  function handleCancel() {
    setEditedValues(entry.values);
    setMode('view');
  }

  async function handleDelete() {
    if (!confirm('Delete this entry?')) return;
    await deleteEntry(entry.id);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-grape-100 shrink-0">
          <p className="text-grape-400 text-[12px]">
            {new Date(entry.createdAt).toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            {mode === 'view' && (
              <>
                <button
                  onClick={() => setMode('edit')}
                  className="p-2 text-grape-400 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
                  aria-label="Edit entry"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 text-grape-400 hover:text-red-600 hover:bg-grape-50 rounded-md transition-colors"
                  aria-label="Delete entry"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 text-grape-400 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            {fields.map((field, i) => {
              const def = getFieldType(field.type);
              return (
                <div key={field.id} className="flex flex-col gap-1">
                  <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
                    {field.name}
                  </span>
                  <div className="min-w-0">
                    {mode === 'view' ? (
                      field.type === 'select' ? (
                        <InlineSelect
                          entryId={entry.id}
                          entryValues={entry.values}
                          field={field}
                          accentColor={accentColor}
                        />
                      ) : (
                        <def.Display
                          value={entry.values[field.id] as any}
                          config={field.config as any}
                        />
                      )
                    ) : (
                      <def.Input
                        value={editedValues[field.id] as any}
                        onChange={(v) =>
                          setEditedValues((cur) => ({ ...cur, [field.id]: v }))
                        }
                        config={field.config as any}
                        autoFocus={i === 0}
                        trackerId={entry.trackerId}
                        fieldId={field.id}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer — edit mode only */}
        {mode === 'edit' && (
          <div className="flex gap-2 px-5 py-4 border-t border-grape-100 shrink-0">
            <button
              onClick={handleCancel}
              className="flex-1 border border-grape-200 hover:bg-grape-50 text-grape-600 text-[14px] font-semibold rounded-xl py-2.5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 bg-grape-500 hover:bg-grape-600 text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
            >
              Save changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
