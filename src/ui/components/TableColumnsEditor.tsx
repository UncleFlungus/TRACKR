import { Plus, X } from 'lucide-react';
import type { TableColumn } from '@/core/fields/table';

/**
 * Column editor for the table field, shared by the three places a field gets
 * configured: the create-tracker page, the add-field form and the per-field
 * edit row. One editor rather than three copies that drift, same as the "Out
 * of" input.
 *
 * Column ids are generated once and kept, so renaming a column keeps the data
 * stored under it.
 */
export default function TableColumnsEditor({
  columns,
  rowLabel,
  onChange,
  onRowLabelChange,
}: {
  columns: TableColumn[];
  rowLabel: string;
  onChange: (next: TableColumn[]) => void;
  onRowLabelChange: (next: string) => void;
}) {
  function update(id: string, patch: Partial<TableColumn>) {
    onChange(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function add() {
    onChange([
      ...columns,
      { id: crypto.randomUUID(), name: '', type: 'number' },
    ]);
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
          Each row is a
        </label>
        <input
          type="text"
          value={rowLabel}
          onChange={(e) => onRowLabelChange(e.target.value)}
          placeholder="set"
          className="w-24 bg-grape-50 text-[13px] text-grape-900 placeholder:text-grape-300 rounded-md px-2 py-1 focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        {columns.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5">
            <input
              type="text"
              value={c.name}
              onChange={(e) => update(c.id, { name: e.target.value })}
              placeholder="Column name"
              className="flex-1 min-w-0 bg-grape-50 text-[13px] text-grape-900 placeholder:text-grape-300 rounded-md px-2 py-1 focus:outline-none"
            />
            <input
              type="text"
              value={c.unit ?? ''}
              onChange={(e) => update(c.id, { unit: e.target.value })}
              placeholder="unit"
              className="w-16 bg-grape-50 text-[13px] text-grape-900 placeholder:text-grape-300 rounded-md px-2 py-1 focus:outline-none"
            />
            <select
              value={c.type}
              onChange={(e) =>
                update(c.id, { type: e.target.value as 'number' | 'text' })
              }
              className="bg-grape-50 text-grape-700 text-[12px] font-semibold rounded-md px-1.5 py-1 border-0 focus:outline-none cursor-pointer"
            >
              <option value="number">123</option>
              <option value="text">abc</option>
            </select>
            <button
              type="button"
              onClick={() => onChange(columns.filter((x) => x.id !== c.id))}
              aria-label={`Remove column ${c.name || 'unnamed'}`}
              className="p-1 text-grape-300 hover:text-rose-600 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 text-grape-500 hover:text-grape-700 text-[13px] font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add column
      </button>

      {columns.length > 0 && (
        <p className="text-grape-400 text-[11px]">
          Removing a column hides its values from existing entries but doesn't
          delete them.
        </p>
      )}
    </div>
  );
}
