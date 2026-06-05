import { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useTracker,
  useFieldsForTracker,
  useEntriesForTracker,
  useDataMutations,
} from '@/core/data';
import { getEntryDate, toDayKey } from '@/core/dateUtils';
import { getColorTheme } from '../colors';
import FieldEditor from '../components/FieldEditor';
import AddEntryForm from '../components/AddEntryForm';
import EntryRow from '../components/EntryRow';
import EntryCard from '../components/EntryCard';
import EntryDetailsModal from '../components/EntryDetailsModal';
import EntryFilters from '../components/EntryFilters';
import EntryAggregations from '../components/EntryAggregations';
import EntryCalendar from '../components/EntryCalendar';
import DayDetailsModal from '../components/DayDetailsModal';

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp =
    (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Box;
  return <Cmp className={className} />;
}

export default function TrackerPage() {
  const { trackerId } = useParams<{ trackerId: string }>();
  const navigate = useNavigate();
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [openDayDate, setOpenDayDate] = useState<Date | null>(null);
  const [filters, setFilters] = useState<Record<string, string | null>>({});

  const tracker = useTracker(trackerId);
  const fields = useFieldsForTracker(trackerId);
  const entries = useEntriesForTracker(trackerId);
  const { deleteTracker } = useDataMutations();

  async function handleDelete() {
    if (!trackerId) return;
    if (!confirm('Delete this tracker and all its entries?')) return;
    await deleteTracker(trackerId);
    navigate('/');
  }

  const editingEntry = editingEntryId
    ? (entries?.find((e) => e.id === editingEntryId) ?? null)
    : null;
  useEffect(() => {
    if (editingEntryId && entries && !editingEntry) {
      setEditingEntryId(null);
    }
  }, [editingEntryId, entries, editingEntry]);

  // Entries that fall on the currently-open day modal (or null if no modal).
  const dayModalEntries = useMemo(() => {
    if (!openDayDate || !entries) return [];
    const targetKey = toDayKey(openDayDate);
    return entries.filter(
      (e) => toDayKey(getEntryDate(e, fields)) === targetKey,
    );
  }, [openDayDate, entries, fields]);

  if (!tracker) {
    return (
      <div className="min-h-full max-w-2xl mx-auto px-6 py-10">
        <p className="text-grape-500">Loading…</p>
      </div>
    );
  }

  const theme = getColorTheme(tracker.color);

  const filteredEntries = entries?.filter((entry) =>
    Object.entries(filters).every(([fieldId, value]) =>
      value == null ? true : entry.values[fieldId] === value,
    ),
  );
  const isFiltered =
    filteredEntries !== undefined &&
    entries !== undefined &&
    filteredEntries.length !== entries.length;

  const viewMode = tracker.settings?.viewMode ?? 'list';

  return (
    <div className="min-h-full max-w-2xl mx-auto px-6 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-grape-500 hover:text-grape-700 text-[14px] mb-6"
      >
        <Icons.ChevronLeft className="w-4 h-4" /> All trackers
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${theme.tileBg}`}
        >
          <Icon name={tracker.icon} className={`w-6 h-6 ${theme.tileFg}`} />
        </div>
        <h1 className="font-display font-semibold text-[28px] text-grape-900 flex-1">
          {tracker.name}
        </h1>
        <button
          onClick={handleDelete}
          className="p-2 text-grape-300 hover:text-grape-600 rounded-md"
          aria-label="Delete tracker"
        >
          <Icons.Trash2 className="w-4 h-4" />
        </button>
      </div>

      <p className="text-grape-400 text-[13px] mb-6">
        {isFiltered
          ? `${filteredEntries!.length} of ${entries!.length} ${entries!.length === 1 ? 'entry' : 'entries'}`
          : `${entries?.length ?? 0} ${entries?.length === 1 ? 'entry' : 'entries'}`}
        {' · '}
        {fields?.length ?? 0} fields
      </p>

      <div className="mb-4">
        <FieldEditor tracker={tracker} fields={fields ?? []} />
      </div>

      <div className="mb-8">
        <AddEntryForm trackerId={tracker.id} fields={fields ?? []} />
      </div>

      <EntryFilters
        fields={fields ?? []}
        values={filters}
        onChange={setFilters}
      />

      <EntryAggregations
        fields={fields ?? []}
        entries={filteredEntries ?? []}
      />

      {viewMode === 'calendar' ? (
        // Calendar view ignores the filter-empty-state branching since the
        // grid is always meaningful even with zero entries — it just shows
        // an empty month. Filters still apply.
        <EntryCalendar
          entries={filteredEntries ?? []}
          fields={fields ?? []}
          onDayClick={(date) => setOpenDayDate(date)}
          onEntryClick={(entryId) => setEditingEntryId(entryId)}
        />
      ) : filteredEntries && filteredEntries.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filteredEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                fields={fields ?? []}
                hideEmpty={tracker.settings?.hideEmptyFields !== false}
                onClick={() => setEditingEntryId(entry.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                fields={fields ?? []}
                hideEmpty={tracker.settings?.hideEmptyFields !== false}
                onClick={() => setEditingEntryId(entry.id)}
              />
            ))}
          </div>
        )
      ) : entries && entries.length > 0 ? (
        <div className="text-center py-10 text-grape-400 text-[14px]">
          No entries match the current filters.
        </div>
      ) : (
        <div className="text-center py-10 text-grape-400 text-[14px]">
          No entries yet. Tap{' '}
          <span className="font-semibold text-grape-600">New entry</span> to add
          one.
        </div>
      )}

      {editingEntry && (
        <EntryDetailsModal
          entry={editingEntry}
          fields={fields ?? []}
          onClose={() => setEditingEntryId(null)}
        />
      )}

      {openDayDate && (
        <DayDetailsModal
          date={openDayDate}
          entries={dayModalEntries}
          fields={fields ?? []}
          tracker={tracker}
          onClose={() => setOpenDayDate(null)}
          onEntryClick={(entryId) => {
            // Close day modal first so the entry modal opens cleanly on top.
            setOpenDayDate(null);
            setEditingEntryId(entryId);
          }}
        />
      )}
    </div>
  );
}
