import { Link, useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { db, deleteTracker } from '@/core/db';
import { getColorTheme } from '../colors';
import FieldEditor from '../components/FieldEditor';
import AddEntryForm from '../components/AddEntryForm';
import EntryRow from '../components/EntryRow';

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Box;
  return <Cmp className={className} />;
}

export default function TrackerPage() {
  const { trackerId } = useParams<{ trackerId: string }>();
  const navigate = useNavigate();

  const tracker = useLiveQuery(
    () => (trackerId ? db.trackers.get(trackerId) : undefined),
    [trackerId]
  );
  const fields = useLiveQuery(
    async () => {
      if (!trackerId) return [];
      const list = await db.fields.where('trackerId').equals(trackerId).toArray();
      return list.sort((a, b) => a.order - b.order);
    },
    [trackerId],
    []
  );
  const entries = useLiveQuery(
    async () => {
      if (!trackerId) return [];
      const list = await db.entries.where('trackerId').equals(trackerId).toArray();
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    [trackerId],
    []
  );

  async function handleDelete() {
    if (!trackerId) return;
    if (!confirm('Delete this tracker and all its entries?')) return;
    await deleteTracker(trackerId);
    navigate('/');
  }

  if (!tracker) {
    return (
      <div className="min-h-full max-w-2xl mx-auto px-6 py-10">
        <p className="text-grape-500">Loading…</p>
      </div>
    );
  }

  const theme = getColorTheme(tracker.color);

  return (
    <div className="min-h-full max-w-2xl mx-auto px-6 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-grape-500 hover:text-grape-700 text-[14px] mb-6"
      >
        <Icons.ChevronLeft className="w-4 h-4" /> All trackers
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${theme.tileBg}`}>
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
        {entries?.length ?? 0} {entries?.length === 1 ? 'entry' : 'entries'} · {fields?.length ?? 0} fields
      </p>

      <div className="mb-4">
        <FieldEditor trackerId={tracker.id} fields={fields ?? []} />
      </div>

      <div className="mb-8">
        <AddEntryForm trackerId={tracker.id} fields={fields ?? []} />
      </div>

      {entries && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} fields={fields ?? []} />
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-grape-400 text-[14px]">
          No entries yet. Tap <span className="font-semibold text-grape-600">New entry</span> to add one.
        </div>
      )}
    </div>
  );
}
