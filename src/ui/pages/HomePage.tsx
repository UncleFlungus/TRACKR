import { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTrackers, useAllEntries, useDataMutations } from '@/core/data';
import { templates } from '@/core/templates';
import { getColorTheme } from '../colors';
import AuthModal from '../components/AuthModal';
import { useHideTemplates } from '@/lib/preferences';
import type { Tracker, Entry } from '@/core/types';

type SortMode = 'recent' | 'created';

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp =
    (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Box;
  return <Cmp className={className} />;
}

/**
 * Compute the most-recent activity timestamp per tracker.
 * Falls back to tracker.createdAt for trackers with no entries.
 */
function buildActivityMap(
  trackers: Tracker[],
  entries: Entry[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of trackers) map.set(t.id, t.createdAt);
  for (const e of entries) {
    const cur = map.get(e.trackerId) ?? 0;
    if (e.createdAt > cur) map.set(e.trackerId, e.createdAt);
  }
  return map;
}

export default function HomePage() {
  const trackers = useTrackers();
  const allEntries = useAllEntries();
  const { createFromTemplate, updateTracker } = useDataMutations();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [hideTemplates] = useHideTemplates();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  const isEmpty = trackers && trackers.length === 0;

  const [pinOverrides, setPinOverrides] = useState<Map<string, boolean>>(
    new Map(),
  );
  // Local optimistic value wins over the fetched value until a reload.
  const effectivePinned = useCallback(
    (t: Tracker) => pinOverrides.get(t.id) ?? t.pinned ?? false,
    [pinOverrides],
  );

  async function pickTemplate(templateId: string) {
    const newId = await createFromTemplate(templateId);
    navigate(`/t/${newId}`);
  }

  async function togglePin(tracker: Tracker) {
    const next = !effectivePinned(tracker);
    setPinOverrides((m) => new Map(m).set(tracker.id, next));
    try {
      await updateTracker(tracker.id, {
        pinned: next,
        pinnedAt: next ? Date.now() : null, // ← changed: was just { pinned: next }
      });
    } catch (err) {
      setPinOverrides((m) => {
        const copy = new Map(m);
        copy.delete(tracker.id);
        return copy;
      });
      console.error('pin toggle failed', err);
    }
  }

  // Filter + sort. Pinned always wins regardless of sort mode.
  // Within each pinned/unpinned group, sort by the chosen mode.
  const visibleTrackers = useMemo(() => {
    if (!trackers) return undefined;
    const activity = buildActivityMap(trackers, allEntries ?? []);
    const q = searchQuery.trim().toLowerCase();

    return trackers
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const aPinned = effectivePinned(a);
        const bPinned = effectivePinned(b);
        if (aPinned !== bPinned) return aPinned ? -1 : 1;
        // Both pinned → stable order by when pinned (earliest = top-left, fixed).
        if (aPinned && bPinned) {
          return (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0);
        }
        // Both unpinned → chosen sort mode.
        if (sortMode === 'recent') {
          return (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0);
        }
        return b.createdAt - a.createdAt;
      });
  }, [trackers, allEntries, searchQuery, sortMode]);

  const hasResults = (visibleTrackers?.length ?? 0) > 0;

  return (
    <div className="min-h-full max-w-3xl mx-auto px-6 py-10">
      <header className="flex items-center justify-between mb-12">
        <div className="flex items-center">
          <svg
            className="w-8 h-8 text-grape-500 -mt-2"
            viewBox="0 0 66 67"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="19.9129"
              cy="46.5419"
              r="18.9129"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="19.9128"
              cy="46.542"
              r="6.45646"
              stroke="currentColor"
              strokeWidth="7"
            />
            <circle
              cx="53.6724"
              cy="11.9478"
              r="10.9478"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="53.6724" cy="11.9478" r="5.97388" fill="currentColor" />
            <line
              x1="22.9752"
              y1="43.3287"
              x2="53.4948"
              y2="11.8728"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
          <span className="font-display font-semibold text-[20px] text-grape-900 -ml-1">
            trackr
          </span>
        </div>
        <button
          onClick={() => setAuthOpen(true)}
          aria-label={user ? 'Account' : 'Sign in'}
          className={
            user
              ? 'w-9 h-9 rounded-full bg-grape-500 text-white text-[14px] font-semibold flex items-center justify-center hover:bg-grape-600 transition-colors'
              : 'w-9 h-9 rounded-full bg-grape-100 text-grape-700 hover:bg-grape-200 flex items-center justify-center transition-colors'
          }
        >
          {user ? (
            (user.email?.[0] ?? '?').toUpperCase()
          ) : (
            <Icons.User className="w-4 h-4" />
          )}
        </button>
      </header>

      <h1 className="font-display font-semibold text-[28px] text-grape-900 mb-1">
        {isEmpty ? 'Welcome' : 'Your trackers'}
      </h1>
      <p className="text-grape-500 text-[15px] mb-6">
        {isEmpty
          ? 'Nothing to track yet — start fresh or pick a template.'
          : 'Tap one to open, or start a new tracker below.'}
      </p>

      {/* Search + sort controls (hidden in empty state) */}
      {!isEmpty && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-45">
            <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-grape-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search trackers..."
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
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="bg-white border border-grape-200 hover:border-grape-300 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-grape-700 cursor-pointer focus:outline-none focus:border-grape-400 transition-colors"
          >
            <option value="recent">Recently active</option>
            <option value="created">Date created</option>
          </select>
        </div>
      )}

      {isEmpty ? (
        <Link
          to="/new"
          className="block bg-grape-50 border-2 border-dashed border-grape-200 rounded-2xl py-14 px-6 text-center hover:bg-grape-100 transition-colors"
        >
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-grape-500 flex items-center justify-center">
            <Icons.Plus className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <p className="font-display font-semibold text-[17px] text-grape-800">
            New tracker
          </p>
          <p className="text-grape-500 text-[13px] mt-1">
            Set up your own fields
          </p>
        </Link>
      ) : !hasResults ? (
        <div className="text-center py-10 text-grape-400 text-[14px]">
          No trackers match "
          <span className="font-semibold">{searchQuery}</span>".
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {visibleTrackers!.map((t) => {
            const theme = getColorTheme(t.color);
            const isPinned = effectivePinned(t); // was: t.pinned ?? false
            return (
              <Link
                key={t.id}
                to={`/t/${t.id}`}
                className="group relative bg-white border border-grape-100 hover:border-grape-200 rounded-2xl p-4 transition-colors"
              >
                {/* Pin toggle — absolute, top-right. preventDefault on the
                    click so we don't navigate into the tracker. Icon is faded
                    when unpinned; solid grape when pinned. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePin(t);
                  }}
                  aria-label={isPinned ? 'Unpin tracker' : 'Pin tracker'}
                  className={`absolute top-2 right-2 p-1.5 rounded-md transition-all ${
                    isPinned
                      ? 'text-grape-600 opacity-100'
                      : 'text-grape-200 hover:text-grape-500 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Icons.Pin
                    className="w-3.5 h-3.5"
                    fill={isPinned ? 'currentColor' : 'none'}
                  />
                </button>

                <div
                  className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center ${theme.tileBg}`}
                >
                  <Icon name={t.icon} className={`w-5 h-5 ${theme.tileFg}`} />
                </div>
                <p
                  className="font-display font-semibold text-[15px] text-grape-900 truncate"
                  title={t.name}
                >
                  {t.name}
                </p>
                <p className="text-grape-400 text-[12px] mt-0.5">
                  {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </Link>
            );
          })}
          <Link
            to="/new"
            className="border-2 border-dashed border-grape-200 hover:border-grape-300 hover:bg-grape-50 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-colors min-h-27.5 text-grape-500"
          >
            <Icons.Plus className="w-6 h-6" strokeWidth={2} />
            <span className="text-[13px] font-medium">New</span>
          </Link>
        </div>
      )}

      {!hideTemplates && (
        <>
          <h2 className="font-display font-semibold text-grape-700 text-[14px] mt-12 mb-3">
            {isEmpty ? 'Or try a template' : 'Templates'}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
            {templates.map((t) => {
              const theme = getColorTheme(t.color);
              return (
                <button
                  key={t.id}
                  onClick={() => pickTemplate(t.id)}
                  className="bg-white border border-grape-100 hover:border-grape-300 rounded-xl px-3.5 py-3 flex items-center gap-2.5 text-left transition-colors"
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${theme.tileBg}`}
                  >
                    <Icon
                      name={t.icon}
                      className={`w-3.5 h-3.5 ${theme.tileFg}`}
                    />
                  </div>
                  <span className="text-[13px] font-semibold text-grape-800">
                    {t.name}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
