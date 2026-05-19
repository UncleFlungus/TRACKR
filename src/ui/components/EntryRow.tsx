import { Trash2 } from 'lucide-react';
import { getFieldType } from '@/core/fields';
import { deleteEntry } from '@/core/db';
import type { Entry, Field } from '@/core/types';

interface Props {
  entry: Entry;
  fields: Field[];
}

export default function EntryRow({ entry, fields }: Props) {
  return (
    <div className="group bg-white border border-grape-100 rounded-xl px-4 py-3 hover:border-grape-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          {fields.map((field) => {
            const def = getFieldType(field.type);
            return (
              <div key={field.id} className="flex items-baseline gap-3">
                <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide w-24 shrink-0">
                  {field.name}
                </span>
                <div className="flex-1 min-w-0">
                  <def.Display value={entry.values[field.id] as any} config={field.config as any} />
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => deleteEntry(entry.id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-grape-300 hover:text-grape-600 rounded-md transition-opacity"
          aria-label="Delete entry"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-grape-300 text-[11px] mt-2">
        {new Date(entry.createdAt).toLocaleString()}
      </p>
    </div>
  );
}
