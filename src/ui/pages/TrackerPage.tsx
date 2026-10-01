import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useTrackerResult,
  useFieldsForTracker,
  useEntriesForTracker,
  useDataMutations,
  useMyRole,
  useRealtimeTracker,
  useTrackerMembers,
} from '@/core/data';
import { buildAuthorMap } from '@/core/authors';
import { useAuth } from '@/lib/auth';
import { getEntryDate, toDayKey } from '@/core/dateUtils';
import { getColorTheme } from '../colors';
import FieldEditor from '../components/FieldEditor';
import AddEntryForm from '../components/AddEntryForm';
import EntryRow from '../components/EntryRow';
import EntryCard, { cardGridClass } from '../components/EntryCard';
import EntryTable from '../components/EntryTable';
import EntryDetailsModal from '../components/EntryDetailsModal';
import EntryAggregations from '../components/EntryAggregations';
import EntryCalendar from '../components/EntryCalendar';
import DayDetailsModal from '../components/DayDetailsModal';
import ShareSheet from '../components/ShareSheet';
import FilterPanel from '@/ui/components/FilterPanel';
import {
  entryPasses,
  valueToSearchText,
  type FilterState,
} from '@/core/filtering';

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
  // The day whose modal opened the entry modal, if any. The day modal closes
  // itself first so the two never stack, and this is what lets dismissal walk
  // back a level instead of all the way out to the calendar.
  const [returnToDay, setReturnToDay] = useState<Date | null>(null);
  const [filters, setFilters] = useState<FilterState>({});
  const [shareOpen, setShareOpen] = useState(false);
  // Out of FilterState: an author is a property of the entry, not a field.
  const [authorFilter, setAuthorFilter] = useState<string[]>([]);

  const { tracker, loading: trackerLoading } = useTrackerResult(trackerId);
  const fields = useFieldsForTracker(trackerId);
  const entries = useEntriesForTracker(trackerId);
  const { deleteTracker } = useDataMutations();
  const { user } = useAuth();

  // Co-members' writes land without a reload.
  useRealtimeTracker(trackerId);

  // Only once there's someone to attribute to. On a tracker of one every entry
  // has the same author, so labelling them all is noise.
  const members = useTrackerMembers(trackerId);
  const authors = useMemo(
    () =>
      members.length > 1 && tracker
        ? buildAuthorMap(members, tracker.color)
        : null,
    [members, tracker],
  );

  // Role gating decides what to offer; RLS decides what is permitted. The two
  // agree, but the database is the one that matters.
  //
  // Ownership comes off the tracker so it's known on first render. Deriving it
  // from the member list would flash the owner's controls at a viewer while
  // that list loads. Signed out means Dexie, where everything is yours.
  const myRole = useMyRole(trackerId);
  const isOwner = !user || tracker?.ownerId === user.id || myRole === 'owner';
  const canLog = isOwner || myRole === 'editor';

  async function handleDelete() {
    if (!trackerId) return;
    if (!confirm('Delete this tracker and all its entries?')) return;
    await deleteTracker(trackerId);
    navigate('/');
  }

  const editingEntry = editingEntryId
    ? (entries?.find((e) => e.id === editingEntryId) ?? null)
    : null;

  /**
   * Dismiss the entry modal, stepping back to the calendar's day modal if that
   * is where it was opened from.
   */
  const closeEntryModal = useCallback(() => {
    setEditingEntryId(null);
    if (returnToDay) {
      setOpenDayDate(returnToDay);
      setReturnToDay(null);
    }
  }, [returnToDay]);

  // The open entry vanished, deleted here or synced away elsewhere. Tear the
  // modal down the way an explicit close would, so a delete inside the calendar
  // flow still lands back on the day.
  useEffect(() => {
    if (editingEntryId && entries && !editingEntry) {
      closeEntryModal();
    }
  }, [editingEntryId, entries, editingEntry, closeEntryModal]);

  // Entries on the day whose modal is open, or null if none is.
  const dayModalEntries = useMemo(() => {
    if (!openDayDate || !entries) return [];
    const targetKey = toDayKey(openDayDate);
    return entries.filter(
      (e) => toDayKey(getEntryDate(e, fields)) === targetKey,
    );
  }, [openDayDate, entries, fields]);

  const fieldsById = useMemo(
    () => new Map((fields ?? []).map((f) => [f.id, f])),
    [fields],
  );

  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntries = entries?.filter((entry) => {
    if (!entryPasses(entry.values, filters, fieldsById)) return false;
    if (authorFilter.length > 0) {
      // Entries whose author deleted their account have no id to match, so
      // they only show when no author filter is active.
      if (!entry.authorId || !authorFilter.includes(entry.authorId)) {
        return false;
      }
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return fields.some((f) => {
      const text = valueToSearchText(f.type, entry.values[f.id]);
      return text.toLowerCase().includes(q);
    });
  });
  if (trackerLoading) {
    return (
      <div className="min-h-full max-w-2xl mx-auto px-6 py-10">
        <p className="text-grape-500">Loading…</p>
      </div>
    );
  }

  // Not loading and still nothing: it never existed, or the owner deleted it
  // while a co-member had it open.
  if (!tracker) {
    return (
      <div className="min-h-full max-w-2xl mx-auto px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-grape-500 hover:text-grape-700 text-[14px] mb-6"
        >
          <Icons.ChevronLeft className="w-4 h-4" /> All trackers
        </Link>
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-2xl bg-grape-50 flex items-center justify-center mx-auto mb-4">
            <Icons.SearchX className="w-7 h-7 text-grape-300" />
          </div>
          <h1 className="font-display font-semibold text-[20px] text-grape-900 mb-1">
            This tracker isn't here
          </h1>
          <p className="text-grape-500 text-[14px]">
            It may have been deleted, or you no longer have access to it.
          </p>
        </div>
      </div>
    );
  }

  const theme = getColorTheme(tracker.color);

  const isFiltered =
    filteredEntries !== undefined &&
    entries !== undefined &&
    filteredEntries.length !== entries.length;

  const viewMode = tracker.settings?.viewMode ?? 'list';
  const cardLayout = tracker.settings?.cardLayout ?? null;

  // Grid and table fill whatever width they get, so they get a wider page.
  // List rows and the calendar read better kept narrow.
  const pageWidth =
    viewMode === 'grid' || viewMode === 'table' ? 'max-w-6xl' : 'max-w-2xl';

  return (
    <div className={`min-h-full ${pageWidth} mx-auto px-6 py-10`}>
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
        {user && (
          <button
            onClick={() => setShareOpen(true)}
            className="p-2 text-grape-300 hover:text-grape-600 rounded-md"
            aria-label="Share tracker"
          >
            <Icons.Users className="w-4 h-4" />
          </button>
        )}
        {isOwner && (
          <button
            onClick={handleDelete}
            className="p-2 text-grape-300 hover:text-grape-600 rounded-md"
            aria-label="Delete tracker"
          >
            <Icons.Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <p className="text-grape-400 text-[13px] mb-6">
        {isFiltered
          ? `${filteredEntries!.length} of ${entries!.length} ${entries!.length === 1 ? 'entry' : 'entries'}`
          : `${entries?.length ?? 0} ${entries?.length === 1 ? 'entry' : 'entries'}`}
        {' · '}
        {fields?.length ?? 0} fields
      </p>

      {/* A tracker's fields are its schema — shared members read them, only
          the owner changes them. */}
      {isOwner && (
        <div className="mb-4">
          <FieldEditor tracker={tracker} fields={fields ?? []} />
        </div>
      )}

      {canLog && (
        <div className="mb-8">
          <AddEntryForm trackerId={tracker.id} fields={fields ?? []} />
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-45">
          <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-grape-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search entries..."
            className="w-full bg-white border border-grape-200 focus:border-grape-400 rounded-lg pl-8 pr-2.5 py-1.5 text-[13px] text-grape-900 placeholder:text-grape-300 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-grape-300 hover:text-grape-600 p-1"
            >
              <Icons.X className="w-3 h-3" />
            </button>
          )}
        </div>
        <FilterPanel
          fields={fields ?? []}
          filters={filters}
          onChange={setFilters}
          authors={authors}
          authorFilter={authorFilter}
          onAuthorFilterChange={setAuthorFilter}
        />
      </div>
      <EntryAggregations
        fields={fields ?? []}
        entries={filteredEntries ?? []}
      />

      {viewMode === 'calendar' ? (
        // No empty-state branching here: a month grid still means something
        // with zero entries in it. Filters apply either way.
        <EntryCalendar
          entries={filteredEntries ?? []}
          fields={fields ?? []}
          authors={authors}
          onDayClick={(date) => setOpenDayDate(date)}
          onEntryClick={(entryId) => {
            // Opened straight off the grid rather than through a day modal, so
            // closing lands back on the calendar.
            setReturnToDay(null);
            setEditingEntryId(entryId);
          }}
        />
      ) : filteredEntries && filteredEntries.length > 0 ? (
        viewMode === 'table' ? (
          <EntryTable
            entries={filteredEntries}
            fields={fields ?? []}
            readOnly={!canLog}
            authors={authors}
            onEntryClick={(entryId) => setEditingEntryId(entryId)}
          />
        ) : viewMode === 'grid' ? (
          <div className={cardGridClass(cardLayout)}>
            {filteredEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                fields={fields ?? []}
                hideEmpty={tracker.settings?.hideEmptyFields !== false}
                readOnly={!canLog}
                authors={authors}
                layout={cardLayout}
                onClick={() => setEditingEntryId(entry.id)}
              />
            ))}
          </div>
        ) : cardLayout ? (
          // A layout replaces the label-and-value rows: the list view becomes
          // full-width cards drawn from it.
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                fields={fields ?? []}
                hideEmpty={tracker.settings?.hideEmptyFields !== false}
                readOnly={!canLog}
                authors={authors}
                layout={cardLayout}
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
                readOnly={!canLog}
                authors={authors}
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
          accentColor={tracker.color}
          canEdit={canLog}
          authors={authors}
          backTo={
            returnToDay
              ? returnToDay.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : undefined
          }
          onClose={closeEntryModal}
        />
      )}

      {shareOpen && (
        <ShareSheet tracker={tracker} onClose={() => setShareOpen(false)} />
      )}

      {openDayDate && (
        <DayDetailsModal
          date={openDayDate}
          entries={dayModalEntries}
          fields={fields ?? []}
          tracker={tracker}
          readOnly={!canLog}
          authors={authors}
          onClose={() => setOpenDayDate(null)}
          onEntryClick={(entryId) => {
            // Close the day modal first so the entry opens cleanly, but
            // remember the day so closing the entry comes back here.
            setReturnToDay(openDayDate);
            setOpenDayDate(null);
            setEditingEntryId(entryId);
          }}
        />
      )}
    </div>
  );
}
