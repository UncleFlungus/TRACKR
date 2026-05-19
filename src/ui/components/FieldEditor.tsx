import { useState } from 'react';
import { Plus, X, Settings2 } from 'lucide-react';
import { addField, deleteField } from '@/core/db';
import { allFieldTypes } from '@/core/fields';
import type { Field, FieldTypeId } from '@/core/types';

interface Props {
  trackerId: string;
  fields: Field[];
}

export default function FieldEditor({ trackerId, fields }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FieldTypeId>('text');

  async function handleAdd() {
    if (!newName.trim()) return;
    const def = allFieldTypes.find((t) => t.id === newType)!;
    await addField({
      trackerId,
      name: newName.trim(),
      type: newType,
      config: def.defaultConfig,
      defaultValue: def.defaultValue,
      order: fields.length,
    });
    setNewName('');
    setNewType('text');
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-grape-500 hover:text-grape-700 text-[13px] font-semibold"
      >
        <Settings2 className="w-3.5 h-3.5" /> Edit fields
      </button>
    );
  }

  return (
    <div className="bg-grape-50 border border-grape-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-grape-700 text-[13px] font-semibold">Fields</p>
        <button
          onClick={() => setOpen(false)}
          className="text-grape-500 hover:text-grape-700 text-[12px] font-semibold"
        >
          Done
        </button>
      </div>

      <div className="space-y-1.5 mb-3">
        {fields.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2 bg-white border border-grape-100 rounded-lg px-3 py-2"
          >
            <span className="flex-1 text-grape-900 text-[14px]">{f.name}</span>
            <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">{f.type}</span>
            <button
              onClick={() => deleteField(f.id)}
              className="p-1 text-grape-300 hover:text-grape-600 rounded-md"
              aria-label="Remove field"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-white border border-dashed border-grape-200 rounded-lg px-3 py-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Field name"
          className="flex-1 bg-transparent text-[14px] text-grape-900 placeholder:text-grape-300 focus:outline-none py-1"
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as FieldTypeId)}
          className="bg-grape-50 text-grape-700 text-[12px] font-semibold rounded-md px-2 py-1 border-0 focus:outline-none cursor-pointer"
        >
          {allFieldTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="bg-grape-500 hover:bg-grape-600 disabled:bg-grape-200 text-white rounded-md p-1.5 transition-colors"
          aria-label="Add field"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
