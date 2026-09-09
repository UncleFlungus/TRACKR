import { Plus, X } from 'lucide-react';
import type { FieldTypeDef } from '../types';

/**
 * A column definition. `id` is generated once and never changes, so renaming a
 * column doesn't orphan the data already stored against it.
 */
export interface TableColumn {
  id: string;
  name: string;
  type: 'number' | 'text';
  /** Rendered after the value: "60kg", "8 reps". Optional. */
  unit?: string;
}

export interface TableConfig {
  columns: TableColumn[];
  /** What one row is called, for the add button and row headers. */
  rowLabel?: string;
}

export type TableRow = Record<string, string | number | null>;

export function tableColumns(config: TableConfig | undefined): TableColumn[] {
  return Array.isArray(config?.columns) ? config.columns : [];
}

/** Not `value ?? []` — a value of the wrong shape must not reach .map(). */
export function tableRows(value: unknown): TableRow[] {
  return Array.isArray(value) ? (value as TableRow[]) : [];
}

export function newTableRow(columns: TableColumn[]): TableRow {
  const row: TableRow = {};
  for (const c of columns) row[c.id] = null;
  return row;
}

function cellText(row: TableRow, col: TableColumn): string {
  const v = row?.[col.id];
  if (v === null || v === undefined || v === '') return '—';
  return `${v}${col.unit ? col.unit : ''}`;
}

function TableInput({
  value,
  onChange,
  config,
}: {
  value: TableRow[] | null;
  onChange: (next: TableRow[] | null) => void;
  config: TableConfig;
}) {
  const columns = tableColumns(config);
  const rows = tableRows(value);
  const rowLabel = config?.rowLabel?.trim() || 'row';

  if (columns.length === 0) {
    return (
      <p className="text-grape-300 text-[13px] py-2 italic">
        No columns configured for this field yet.
      </p>
    );
  }

  function setCell(rowIndex: number, colId: string, raw: string, type: string) {
    const next = rows.map((r, i) => {
      if (i !== rowIndex) return r;
      if (raw === '') return { ...r, [colId]: null };
      if (type === 'number') {
        const parsed = Number(raw);
        return { ...r, [colId]: Number.isNaN(parsed) ? null : parsed };
      }
      return { ...r, [colId]: raw };
    });
    onChange(next);
  }

  return (
    <div className="py-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-7" />
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="text-left text-grape-400 text-[11px] font-semibold uppercase tracking-wide pb-1 px-1"
                >
                  {c.name}
                  {c.unit ? (
                    <span className="normal-case font-normal"> ({c.unit})</span>
                  ) : null}
                </th>
              ))}
              <th className="w-7" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="text-grape-300 text-[12px] tabular-nums pr-1 align-middle">
                  {i + 1}
                </td>
                {columns.map((c) => (
                  <td key={c.id} className="px-0.5 py-0.5">
                    <input
                      type={c.type === 'number' ? 'number' : 'text'}
                      inputMode={c.type === 'number' ? 'decimal' : undefined}
                      step="any"
                      value={
                        row?.[c.id] === null || row?.[c.id] === undefined
                          ? ''
                          : String(row[c.id])
                      }
                      onChange={(e) => setCell(i, c.id, e.target.value, c.type)}
                      className="w-full min-w-16 bg-grape-50 focus:bg-white border border-transparent focus:border-grape-300 rounded-md px-2 py-1 text-[14px] text-grape-900 tabular-nums focus:outline-none transition-colors"
                    />
                  </td>
                ))}
                <td className="align-middle">
                  <button
                    type="button"
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                    aria-label={`Remove ${rowLabel} ${i + 1}`}
                    className="p-1 text-grape-300 hover:text-rose-600 rounded-md transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, newTableRow(columns)])}
        className="mt-1.5 inline-flex items-center gap-1 text-grape-500 hover:text-grape-700 text-[13px] font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add {rowLabel}
      </button>
    </div>
  );
}

function TableDisplay({
  value,
  config,
}: {
  value: TableRow[] | null;
  config: TableConfig;
}) {
  const columns = tableColumns(config);
  const rows = tableRows(value);

  if (rows.length === 0 || columns.length === 0) {
    return <em className="text-grape-300 text-[15px]">empty</em>;
  }

  // One line per row, columns joined — compact enough to sit in an entry row
  // without turning it into a spreadsheet.
  return (
    <div className="space-y-0.5">
      {rows.map((row, i) => (
        <div key={i} className="text-grape-800 text-[14px] tabular-nums">
          <span className="text-grape-300 text-[12px] mr-1.5">{i + 1}</span>
          {columns.map((c, ci) => (
            <span key={c.id}>
              {ci > 0 && <span className="text-grape-300"> · </span>}
              {cellText(row, c)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Repeating rows inside a single entry — sets in a workout, courses in a meal.
 *
 * Stored as an array of objects keyed by column id. This is the one field type
 * whose value is structured rather than scalar, which is worth knowing because
 * the rest of the app reads values flatly: filtering skips it, and aggregation
 * can only count rows. Anything smarter (heaviest set, total volume) needs code
 * that understands the columns.
 *
 * Concurrency caveat: `merge_entry_values` merges at the top level, so two
 * people editing different rows of the same table field still overwrite each
 * other — the whole array is one key. Fine for a personal log; worth knowing
 * before two people edit one workout simultaneously.
 */
export const tableField: FieldTypeDef<TableConfig, TableRow[]> = {
  id: 'table',
  label: 'Table',
  icon: 'Table',
  defaultConfig: { columns: [], rowLabel: 'row' },
  defaultValue: [],
  validate: (value, config) => {
    if (value == null) return null;
    if (!Array.isArray(value)) return 'Expected rows';
    const numeric = tableColumns(config).filter((c) => c.type === 'number');
    for (const row of value as TableRow[]) {
      for (const c of numeric) {
        const v = row?.[c.id];
        if (v !== null && v !== undefined && typeof v !== 'number') {
          return `${c.name} must be a number`;
        }
      }
    }
    return null;
  },
  Input: TableInput as never,
  Display: TableDisplay as never,
};

/** Flattened text for search. Without this a table reads as "[object Object]". */
export function tableSearchText(value: unknown, config: TableConfig): string {
  const columns = tableColumns(config);
  return tableRows(value)
    .map((row) =>
      columns
        .map((c) => {
          const v = row?.[c.id];
          return v === null || v === undefined ? '' : `${v}${c.unit ?? ''}`;
        })
        .join(' '),
    )
    .join(' ');
}
