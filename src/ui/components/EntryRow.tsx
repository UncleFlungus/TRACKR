import { getFieldType } from '@/core/fields';
import type { Entry, Field } from '@/core/types';

interface Props {
  entry: Entry;
  fields: Field[];
  onClick: () => void;
}

export default function EntryRow({ entry, fields, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      // <button> is used so keyboard activation (Enter/Space) works for free.
      // The element styled like a row.
      className="w-full text-left bg-white border border-grape-100 rounded-xl px-4 py-3 hover:border-grape-300 hover:bg-grape-50/30 transition-colors cursor-pointer"
    >
      <div className="space-y-1.5">
        {fields.map((field) => {
          const def = getFieldType(field.type);
          return (
            <div key={field.id} className="flex items-baseline gap-3">
              <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide w-24 shrink-0">
                {field.name}
              </span>
              {/*
                The truncating wrapper:
                - min-w-0 lets flex children shrink below their content width,
                  which is required for truncate to actually clip.
                - truncate = overflow-hidden + text-overflow-ellipsis + whitespace-nowrap.
                  Works great for text/link/number/etc. For multi-element Displays
                  (e.g. list chips), overflow-hidden still keeps the row from breaking
                  the layout — chips beyond the edge are clipped.
              */}
              <div className="flex-1 min-w-0 truncate">
                <def.Display
                  value={entry.values[field.id] as any}
                  config={field.config as any}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-grape-300 text-[11px] mt-2">
        {new Date(entry.createdAt).toLocaleString()}
      </p>
    </button>
  );
}
