import { Check } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType, isFieldEmpty } from '@/core/fields';
import InlineCounter from './InlineCounter';
import AuthorTag from './AuthorTag';
import { useToast } from './Toast';
import type { AuthorMap } from '@/core/authors';
import { resolveMax } from '@/core/fields/outOf';
import type { Entry, Field } from '@/core/types';
import {
  resolveLayout,
  type CardLayout,
  type ColumnWidth,
} from '@/core/cardLayout';
import { ImagePreview, safeImageUrl } from '@/core/fields/image';

interface Props {
  entry: Entry;
  fields: Field[];
  hideEmpty?: boolean;
  /**
   * Viewers on a shared tracker get plain values instead of the inline
   * checkmark and counter controls. The database would reject those writes, so
   * offering them means shipping a button that lies.
   */
  readOnly?: boolean;
  /** Set on shared trackers only; null means "everyone here is you". */
  authors?: AuthorMap | null;
  /** Set when the tracker has a card layout; otherwise every field stacks. */
  layout?: CardLayout | null;
  onClick: () => void;
}

/**
 * Card layout for the grid view. The whole card opens the detail modal, but the
 * inline checkmark still works through it via stopPropagation, so tasks can be
 * ticked off straight from the grid.
 */
export default function EntryCard({
  entry,
  fields,
  hideEmpty = true,
  readOnly = false,
  authors = null,
  layout = null,
  onClick,
}: Props) {
  const { updateEntry, incrementEntryValue } = useDataMutations();
  const { notify } = useToast();

  const visible = (list: Field[]) =>
    hideEmpty
      ? list.filter((f) => {
          const def = getFieldType(f.type);
          return !isFieldEmpty(def, entry.values[f.id], f.config);
        })
      : list;
  const visibleFields = visible(fields);
  const resolved = layout ? resolveLayout(layout, fields) : null;

  async function toggleCheckmark(fieldId: string) {
    const current = entry.values[fieldId] as boolean | null;
    // Only the changed key. updateEntry merges, so sending the whole map risks
    // reverting a co-member's edit to a different field.
    try {
      await updateEntry(entry.id, { [fieldId]: !current });
    } catch {
      notify("Couldn't save that — check your connection.");
    }
  }

  async function stepCount(fieldId: string, delta: number, max: number) {
    try {
      await incrementEntryValue(entry.id, fieldId, delta, max);
    } catch {
      notify("Couldn't save that — check your connection.");
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="bg-white border border-grape-100 rounded-xl overflow-hidden hover:border-grape-300 hover:bg-grape-50/30 transition-colors cursor-pointer focus:outline-none focus:border-grape-400"
    >
      {resolved ? (
        // Columns sit side by side once the card is wide enough, and stack
        // below that, so a two-column layout doesn't squeeze on a phone.
        <div className="@container p-3">
          {authors && (
            <div className="mb-1.5">
              <AuthorTag
                authors={authors}
                authorId={entry.authorId}
                size="sm"
              />
            </div>
          )}
          <div className="flex flex-col gap-3 @2xs:flex-row">
            {resolved.columns.map((col, i) => (
              <div
                key={i}
                className={`min-w-0 space-y-1 @2xs:basis-0 ${GROW[col.width]}`}
              >
                {visible(col.fields).map((field) =>
                  renderField(field, resolved.showLabels, true),
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 space-y-1">
          {authors && (
            <AuthorTag authors={authors} authorId={entry.authorId} size="sm" />
          )}
          {visibleFields.length === 0 ? (
            <p className="text-grape-300 text-[12px] italic">No values yet</p>
          ) : (
            visibleFields.map((field) => renderField(field, true, false))
          )}
        </div>
      )}
    </div>
  );

  function renderField(field: Field, showLabel: boolean, inLayout: boolean) {
    const def = getFieldType(field.type);
    const value = entry.values[field.id];
    // In a layout an image fills its column, which is what makes a poster
    // column look like one.
    const image =
      inLayout && field.type === 'image' ? safeImageUrl(value) : null;
    return (
      <div key={field.id} className="min-w-0">
        {showLabel && (
          <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-wide">
            {field.name}
          </p>
        )}
        <div className={`text-[13px] ${cellClass(field.type)}`}>
          {image ? (
            <ImagePreview url={image} className="w-full max-h-96" />
          ) : readOnly ? (
            <def.Display value={value as any} config={field.config as any} />
          ) : field.type === 'checkmark' ? (
            <InlineCheckmark
              checked={Boolean(value)}
              onToggle={() => toggleCheckmark(field.id)}
            />
          ) : field.type === 'count' ? (
            <InlineCounter
              value={value as number | null}
              config={field.config as { max: number }}
              onStep={(delta) =>
                stepCount(
                  field.id,
                  delta,
                  resolveMax(field.config as { max: number }),
                )
              }
            />
          ) : (
            <def.Display value={value as any} config={field.config as any} />
          )}
        </div>
      </div>
    );
  }
}

/**
 * Columns for a grid of cards. Side-by-side layouts need wider cards, or the
 * details column ends up a few words wide.
 */
export function cardGridClass(layout: CardLayout | null | undefined): string {
  return layout && layout.columns.length > 1
    ? 'grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-2'
    : 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2';
}

/** Flex-grow per width, from a zero basis, so the gap never causes overflow. */
const GROW: Record<ColumnWidth, string> = {
  narrow: '@2xs:grow-[1]',
  auto: '@2xs:grow-[2]',
  wide: '@2xs:grow-[3]',
};

/** Long text gets three lines and an ellipsis; the full text is in the modal. */
function cellClass(type: Field['type']): string {
  if (type === 'longtext') return 'line-clamp-3';
  if (type === 'image') return '';
  return 'truncate';
}

function InlineCheckmark({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="inline-flex items-center gap-1.5 text-[13px] hover:opacity-80 transition-opacity"
    >
      {checked ? (
        <>
          <span className="w-4 h-4 rounded bg-grape-500 text-white flex items-center justify-center">
            <Check className="w-3 h-3" strokeWidth={3} />
          </span>
          <span className="text-grape-700">Done</span>
        </>
      ) : (
        <>
          <span className="w-4 h-4 rounded border-2 border-grape-300 hover:border-grape-500 transition-colors" />
          <span className="text-grape-400">Not done</span>
        </>
      )}
    </button>
  );
}
