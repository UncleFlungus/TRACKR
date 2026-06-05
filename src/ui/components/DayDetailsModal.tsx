import { useEffect, useState } from 'react';
import { X, Plus, ArrowLeft } from 'lucide-react';
import type { Entry, Field, Tracker } from '@/core/types';
import EntryRow from './EntryRow';
import AddEntryForm from './AddEntryForm';

interface Props {
  date: Date;
  entries: Entry[];
  fields: Field[];
  tracker: Tracker;
  onClose: () => void;
  onEntryClick: (entryId: string) => void;
}

/**
 * Modal that opens when the user clicks a day cell in the calendar.
 *
 * Two views inside the same modal shell:
 *  - 'list' — shows all entries for that day, with an "Add entry" button up top
 *  - 'add'  — embeds the AddEntryForm with the day pre-filled as the date
 *
 * After saving from the add view, we drop back to the list so the user can
 * see the new entry in context without losing the calendar day they're on.
 */
export default function DayDetailsModal({
  date,
  entries,
  fields,
  tracker,
  onClose,
  onEntryClick,
}: Props) {
  const [view, setView] = useState<'list' | 'add'>('list');

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

  const dateLabel = new Intl.DateTimeFormat('default', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);

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
          <div className="flex items-center gap-2">
            {view === 'add' && (
              <button
                onClick={() => setView('list')}
                className="p-1 text-grape-400 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
                aria-label="Back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <p className="text-grape-900 text-[14px] font-semibold">
              {view === 'add' ? `New entry for ${dateLabel}` : dateLabel}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {view === 'list' && (
              <button
                onClick={() => setView('add')}
                className="inline-flex items-center gap-1 text-grape-700 hover:text-grape-900 text-[13px] font-semibold px-2 py-1 hover:bg-grape-50 rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add entry
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-grape-400 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {view === 'add' ? (
            <AddEntryForm
              trackerId={tracker.id}
              fields={fields}
              initialDate={date}
              forceOpen
              onClose={() => setView('list')}
            />
          ) : entries.length === 0 ? (
            <p className="text-grape-400 text-[14px] py-6 text-center italic">
              No entries for this day yet.
            </p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  fields={fields}
                  hideEmpty={tracker.settings?.hideEmptyFields !== false}
                  onClick={() => onEntryClick(entry.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
