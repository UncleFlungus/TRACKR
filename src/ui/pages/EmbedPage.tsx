import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePublicTracker } from '@/core/data';
import { PUBLIC_TOKEN_PATTERN, toAppShapes } from '@/core/publicTracker';
import { getColorTheme } from '../colors';
import EntryCard, { cardGridClass } from '../components/EntryCard';
import EntryRow from '../components/EntryRow';
import EntryTable from '../components/EntryTable';
import EntryDetailsModal from '../components/EntryDetailsModal';

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp =
    (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Box;
  return <Cmp className={className} />;
}

type EmbedView = 'grid' | 'list' | 'table';

/**
 * A published tracker, read-only, for dropping into another site with an
 * iframe. Reads through public_tracker(), so it works signed out and shows
 * nothing the token doesn't grant.
 *
 * `?view=grid|list|table` overrides the owner's view. Calendar falls back to
 * grid, since a month grid needs more room than an embed usually gets.
 */
export default function EmbedPage() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const valid = !!token && PUBLIC_TOKEN_PATTERN.test(token);
  const { data, isPending, isError } = usePublicTracker(
    valid ? token : undefined,
  );
  const [openId, setOpenId] = useState<string | null>(null);

  const shapes = useMemo(() => (data ? toAppShapes(data) : null), [data]);

  if (valid && isPending) {
    return (
      <div className="min-h-full flex items-center justify-center text-grape-300 text-[14px]">
        Loading…
      </div>
    );
  }

  if (!valid || isError || !data || !shapes) {
    return (
      <div className="min-h-full flex items-center justify-center px-6 text-center text-grape-400 text-[14px]">
        {isError
          ? "Couldn't load this tracker."
          : "This tracker isn't public, or the link has been reset."}
      </div>
    );
  }

  const { tracker } = data;
  const { fields, entries } = shapes;
  const theme = getColorTheme(tracker.color);
  const hideEmpty = tracker.hideEmptyFields !== false;
  const cardLayout = tracker.cardLayout ?? null;

  const requested = params.get('view');
  const view: EmbedView =
    requested === 'grid' || requested === 'list' || requested === 'table'
      ? requested
      : tracker.viewMode === 'list' || tracker.viewMode === 'table'
        ? tracker.viewMode
        : 'grid';

  const open = openId ? entries.find((e) => e.id === openId) : undefined;

  return (
    <div className="min-h-full max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-1">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${theme.tileBg}`}
        >
          <Icon name={tracker.icon} className={`w-5 h-5 ${theme.tileFg}`} />
        </div>
        <h1 className="font-display font-semibold text-[22px] text-grape-900 flex-1 min-w-0 truncate">
          {tracker.name}
        </h1>
      </div>
      <p className="text-grape-400 text-[13px] mb-4">
        {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
      </p>

      {entries.length === 0 ? (
        <div className="text-center py-10 text-grape-400 text-[14px]">
          No entries yet.
        </div>
      ) : view === 'table' ? (
        <EntryTable
          entries={entries}
          fields={fields}
          readOnly
          onEntryClick={setOpenId}
        />
      ) : view === 'list' && cardLayout ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              fields={fields}
              hideEmpty={hideEmpty}
              readOnly
              layout={cardLayout}
              onClick={() => setOpenId(entry.id)}
            />
          ))}
        </div>
      ) : view === 'list' ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              fields={fields}
              hideEmpty={hideEmpty}
              readOnly
              onClick={() => setOpenId(entry.id)}
            />
          ))}
        </div>
      ) : (
        <div className={cardGridClass(cardLayout)}>
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              fields={fields}
              hideEmpty={hideEmpty}
              readOnly
              layout={cardLayout}
              onClick={() => setOpenId(entry.id)}
            />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-[12px] text-grape-300">
        Made with{' '}
        <a
          href={window.location.origin}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-grape-400 hover:text-grape-600"
        >
          trackr
        </a>
      </p>

      {open && (
        <EntryDetailsModal
          entry={open}
          fields={fields}
          accentColor={tracker.color}
          canEdit={false}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
