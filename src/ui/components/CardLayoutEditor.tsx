import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Plus,
  X,
} from 'lucide-react';
import {
  MAX_COLUMNS,
  defaultLayout,
  posterField,
  posterLeftLayout,
  posterTopLayout,
  unplacedFields,
  type CardLayout,
  type ColumnWidth,
} from '@/core/cardLayout';
import type { Field } from '@/core/types';

interface Props {
  layout: CardLayout | undefined;
  fields: Field[];
  /** undefined goes back to the standard one-stack card. */
  onChange: (next: CardLayout | undefined) => void;
  /** True in table and calendar views, which don't draw cards at all. */
  cardsHidden: boolean;
  onShowCards: () => void;
}

const WIDTH_LABELS: Record<ColumnWidth, string> = {
  narrow: 'Narrow',
  auto: 'Normal',
  wide: 'Wide',
};

/**
 * Presets to start from, then columns of fields to adjust. Every change saves
 * straight away, like the view picker above it.
 */
export default function CardLayoutEditor({
  layout,
  fields,
  onChange,
  cardsHidden,
  onShowCards,
}: Props) {
  const hasPoster = !!posterField(fields);
  const byId = new Map(fields.map((f) => [f.id, f]));

  function update(fn: (draft: CardLayout) => void) {
    if (!layout) return;
    const draft: CardLayout = {
      showLabels: layout.showLabels,
      columns: layout.columns.map((c) => ({ ...c, fields: [...c.fields] })),
    };
    fn(draft);
    onChange(draft);
  }

  function moveWithin(col: number, idx: number, delta: number) {
    update((d) => {
      const list = d.columns[col].fields;
      const to = idx + delta;
      if (to < 0 || to >= list.length) return;
      [list[idx], list[to]] = [list[to], list[idx]];
    });
  }

  function moveAcross(col: number, idx: number, delta: number) {
    update((d) => {
      const to = col + delta;
      if (to < 0 || to >= d.columns.length) return;
      const [id] = d.columns[col].fields.splice(idx, 1);
      d.columns[to].fields.push(id);
    });
  }

  const presetClass =
    'text-[12px] font-semibold rounded-md px-2.5 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const idle = `${presetClass} bg-grape-50 text-grape-700 hover:bg-grape-100`;
  const active = `${presetClass} bg-grape-500 text-white`;

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[14px] text-grape-700 w-16 shrink-0">
          Cards
        </label>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={layout ? idle : active}
        >
          Standard
        </button>
        <button
          type="button"
          disabled={!hasPoster}
          title={hasPoster ? undefined : 'Add an Image field first'}
          onClick={() => onChange(posterLeftLayout(fields) ?? undefined)}
          className={idle}
        >
          Poster left
        </button>
        <button
          type="button"
          disabled={!hasPoster}
          title={hasPoster ? undefined : 'Add an Image field first'}
          onClick={() => onChange(posterTopLayout(fields) ?? undefined)}
          className={idle}
        >
          Poster top
        </button>
        {!layout && (
          <button
            type="button"
            onClick={() => onChange(defaultLayout(fields))}
            className={idle}
          >
            Customize
          </button>
        )}
      </div>

      {cardsHidden && layout && (
        <p className="mt-2 sm:ml-18 bg-amber-50 text-amber-800 text-[12px] rounded-md px-2.5 py-1.5">
          This view doesn't use cards, so layouts won't show here.{' '}
          <button
            type="button"
            onClick={onShowCards}
            className="font-semibold underline underline-offset-2"
          >
            Switch to Grid
          </button>
        </p>
      )}

      {layout && (
        <div className="mt-2 sm:ml-18">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {layout.columns.map((col, ci) => {
              const unplaced = unplacedFields(layout, fields);
              const placed = col.fields.filter((id) => byId.has(id));
              return (
                <div
                  key={ci}
                  className="flex-1 min-w-40 bg-grape-50 rounded-lg p-2"
                >
                  <div className="flex items-center gap-1 mb-1.5">
                    <select
                      value={col.width}
                      onChange={(e) =>
                        update((d) => {
                          d.columns[ci].width = e.target.value as ColumnWidth;
                        })
                      }
                      aria-label={`Column ${ci + 1} width`}
                      className="bg-white text-grape-700 text-[12px] font-semibold rounded-md px-1.5 py-0.5 border-0 focus:outline-none cursor-pointer"
                    >
                      {(Object.keys(WIDTH_LABELS) as ColumnWidth[]).map((w) => (
                        <option key={w} value={w}>
                          {WIDTH_LABELS[w]}
                        </option>
                      ))}
                    </select>
                    <span className="flex-1" />
                    {layout.columns.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          update((d) => {
                            d.columns.splice(ci, 1);
                          })
                        }
                        aria-label={`Remove column ${ci + 1}`}
                        className="p-0.5 text-grape-300 hover:text-rose-600 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    {placed.map((id) => {
                      const field = byId.get(id)!;
                      const idx = col.fields.indexOf(id);
                      return (
                        <div
                          key={id}
                          className="flex items-center gap-0.5 bg-white rounded-md pl-2 pr-0.5 py-0.5"
                        >
                          <span className="flex-1 min-w-0 truncate text-[12px] text-grape-800">
                            {field.name}
                          </span>
                          <IconButton
                            label={`Move ${field.name} up`}
                            disabled={idx === 0}
                            onClick={() => moveWithin(ci, idx, -1)}
                          >
                            <ChevronUp className="w-3 h-3" />
                          </IconButton>
                          <IconButton
                            label={`Move ${field.name} down`}
                            disabled={idx === col.fields.length - 1}
                            onClick={() => moveWithin(ci, idx, 1)}
                          >
                            <ChevronDown className="w-3 h-3" />
                          </IconButton>
                          {layout.columns.length > 1 && (
                            <>
                              <IconButton
                                label={`Move ${field.name} to the previous column`}
                                disabled={ci === 0}
                                onClick={() => moveAcross(ci, idx, -1)}
                              >
                                <ChevronLeft className="w-3 h-3" />
                              </IconButton>
                              <IconButton
                                label={`Move ${field.name} to the next column`}
                                disabled={ci === layout.columns.length - 1}
                                onClick={() => moveAcross(ci, idx, 1)}
                              >
                                <ChevronRight className="w-3 h-3" />
                              </IconButton>
                            </>
                          )}
                          <IconButton
                            label={`Hide ${field.name} on cards`}
                            onClick={() =>
                              update((d) => {
                                d.columns[ci].fields.splice(idx, 1);
                              })
                            }
                          >
                            <X className="w-3 h-3" />
                          </IconButton>
                        </div>
                      );
                    })}
                  </div>

                  {unplaced.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id)
                          update((d) => {
                            d.columns[ci].fields.push(id);
                          });
                      }}
                      aria-label={`Add a field to column ${ci + 1}`}
                      className="mt-1.5 w-full bg-transparent text-grape-500 text-[12px] rounded-md px-1 py-0.5 border border-dashed border-grape-200 focus:outline-none cursor-pointer"
                    >
                      <option value="">+ Add field</option>
                      {unplaced.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}

            {layout.columns.length < MAX_COLUMNS && (
              <button
                type="button"
                onClick={() =>
                  update((d) => {
                    d.columns.push({ width: 'auto', fields: [] });
                  })
                }
                className="shrink-0 w-10 rounded-lg border border-dashed border-grape-200 text-grape-400 hover:text-grape-600 hover:border-grape-300 flex items-center justify-center"
                aria-label="Add column"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-[13px] text-grape-700 mt-2">
            <input
              type="checkbox"
              checked={layout.showLabels}
              onChange={() =>
                update((d) => {
                  d.showLabels = !d.showLabels;
                })
              }
              className="w-3.5 h-3.5 accent-grape-500 cursor-pointer"
            />
            Show field names on cards
          </label>
          <p className="text-grape-400 text-[11px] mt-1">
            Fields left off the cards still show when you open an entry. Applies
            to grid and list views.
          </p>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="p-0.5 text-grape-300 hover:text-grape-600 disabled:opacity-30 disabled:hover:text-grape-300 rounded"
    >
      {children}
    </button>
  );
}
