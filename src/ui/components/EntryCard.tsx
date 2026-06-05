import { Check } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { getFieldType, isFieldEmpty } from '@/core/fields';
import type { Entry, Field } from '@/core/types';

interface Props {
  entry: Entry;
  fields: Field[];
  hideEmpty?: boolean;
  onClick: () => void;
}

/**
 * Card-shaped entry layout for the grid view. Shines for picture-heavy
 * trackers — the first picture (if any) renders at the top of the card.
 * For text-only trackers, the card collapses into a compact stacked layout.
 *
 * Click target opens the detail modal; the inline checkmark still works
 * (stopPropagation) so you can mark tasks done from the grid too.
 */
export default function EntryCard({
  entry,
  fields,
  hideEmpty = true,
  onClick,
}: Props) {
  const { updateEntry } = useDataMutations();

  const visibleFields = hideEmpty
    ? fields.filter((f) => {
        const def = getFieldType(f.type);
        return !isFieldEmpty(def, entry.values[f.id], f.config);
      })
    : fields;

  async function toggleCheckmark(fieldId: string) {
    const current = entry.values[fieldId] as boolean | null;
    await updateEntry(entry.id, { ...entry.values, [fieldId]: !current });
  }

  // First picture field across the tracker (cards are visually anchored on it).
  // The corresponding picture is hoisted above the field stack rather than
  // being rendered inline.
  const pictureField = fields.find((f) => f.type === 'picture');
  const pictureValues = pictureField
    ? (entry.values[pictureField.id] as string[] | undefined)
    : undefined;
  const firstPicture = pictureValues?.[0];

  const nonPictureVisibleFields = visibleFields.filter(
    (f) => f.id !== pictureField?.id,
  );

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
      {firstPicture && (
        <img
          src={firstPicture}
          alt=""
          className="w-full aspect-square object-cover"
        />
      )}
      <div className="p-3 space-y-1">
        {nonPictureVisibleFields.length === 0 && !firstPicture ? (
          <p className="text-grape-300 text-[12px] italic">No values yet</p>
        ) : (
          nonPictureVisibleFields.map((field) => {
            const def = getFieldType(field.type);
            return (
              <div key={field.id} className="min-w-0">
                <p className="text-grape-400 text-[10px] font-semibold uppercase tracking-wide">
                  {field.name}
                </p>
                <div className="text-[13px] truncate">
                  {field.type === 'checkmark' ? (
                    <InlineCheckmark
                      checked={Boolean(entry.values[field.id])}
                      onToggle={() => toggleCheckmark(field.id)}
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
