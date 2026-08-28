import { Check } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType, isFieldEmpty } from '@/core/fields';
import InlineCounter from './InlineCounter';
import AuthorTag from './AuthorTag';
import type { AuthorMap } from '@/core/authors';
import { resolveMax } from '@/core/fields/outOf';
import type { Entry, Field } from '@/core/types';

interface Props {
  entry: Entry;
  fields: Field[];
  hideEmpty?: boolean;
  /**
   * Viewers on a shared tracker get plain values instead of the inline
   * checkmark and counter controls — the database would reject those writes,
   * so offering them would just be a button that lies.
   */
  readOnly?: boolean;
  /** Set on shared trackers only; null means "everyone here is you". */
  authors?: AuthorMap | null;
  onClick: () => void;
}

/**
 * Card-shaped entry layout for the grid view. Originally designed to anchor
 * each card on the entry's first picture, with field values stacked below.
 * The picture field is currently deprecated (see picture.tsx — pending
 * Supabase Storage migration), so the card renders fields-only for now.
 * Picture handling is preserved in commented form below so it can be
 * restored when picture support comes back.
 *
 * Click target opens the detail modal; the inline checkmark still works
 * (stopPropagation) so you can mark tasks done from the grid too.
 */
export default function EntryCard({
  entry,
  fields,
  hideEmpty = true,
  readOnly = false,
  authors = null,
  onClick,
}: Props) {
  const { updateEntry, incrementEntryValue } = useDataMutations();

  const visibleFields = hideEmpty
    ? fields.filter((f) => {
        const def = getFieldType(f.type);
        return !isFieldEmpty(def, entry.values[f.id], f.config);
      })
    : fields;

  async function toggleCheckmark(fieldId: string) {
    const current = entry.values[fieldId] as boolean | null;
    // Only the key that changed: updateEntry merges, so sending the whole map
    // would just risk reverting a co-member's edit to some other field.
    await updateEntry(entry.id, { [fieldId]: !current });
  }

  async function stepCount(fieldId: string, delta: number, max: number) {
    await incrementEntryValue(entry.id, fieldId, delta, max);
  }

  // ---------------------------------------------------------------
  // Picture handling — disabled while the picture field is deprecated.
  // Restore this block (and the <img> below) when picture support returns.
  //
  // const pictureField = fields.find((f) => f.type === 'picture');
  // const pictureValues = pictureField
  //   ? (entry.values[pictureField.id] as string[] | undefined)
  //   : undefined;
  // const firstPicture = pictureValues?.[0];
  //
  // const nonPictureVisibleFields = visibleFields.filter(
  //   (f) => f.id !== pictureField?.id,
  // );
  // ---------------------------------------------------------------

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
      {/* Picture hero — re-enable alongside the picture-handling block above.
      {firstPicture && (
        <img
          src={firstPicture}
          alt=""
          className="w-full aspect-square object-cover"
        />
      )}
      */}
      <div className="p-3 space-y-1">
        {authors && (
          <AuthorTag authors={authors} authorId={entry.authorId} size="sm" />
        )}
        {visibleFields.length === 0 ? (
          <p className="text-grape-300 text-[12px] italic">No values yet</p>
        ) : (
          visibleFields.map((field) => {
            const def = getFieldType(field.type);
            return (
              <div key={field.id} className="min-w-0">
                <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-wide">
                  {field.name}
                </p>
                <div className="text-[13px] truncate">
                  {readOnly ? (
                    <def.Display
                      value={entry.values[field.id] as any}
                      config={field.config as any}
                    />
                  ) : field.type === 'checkmark' ? (
                    <InlineCheckmark
                      checked={Boolean(entry.values[field.id])}
                      onToggle={() => toggleCheckmark(field.id)}
                    />
                  ) : field.type === 'count' ? (
                    <InlineCounter
                      value={entry.values[field.id] as number | null}
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
                    <def.Display
                      value={entry.values[field.id] as any}
                      config={field.config as any}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
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
