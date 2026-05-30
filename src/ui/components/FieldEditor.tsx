import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Settings2 } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { allFieldTypes, getFieldType } from '@/core/fields';
import type { Field, FieldTypeId } from '@/core/types';

interface Props {
  trackerId: string;
  fields: Field[];
}

export default function FieldEditor({ trackerId, fields }: Props) {
  const { addField, deleteField } = useDataMutations();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FieldTypeId>('text');
  const [newOptions, setNewOptions] = useState('');
  // The default value the user picks for the field they're currently adding.
  // It's typed as unknown because each field type uses its own value shape.
  const [newDefault, setNewDefault] = useState<unknown>(null);

  const newDef = useMemo(
    () => allFieldTypes.find((t) => t.id === newType)!,
    [newType],
  );

  // The config used both to save the field AND to render the default-value
  // input below. For select fields we recompute on every keystroke so the
  // option chips appear live as the user types comma-separated options.
  const newConfig = useMemo(() => {
    if (newType === 'select') {
      return {
        options: newOptions
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }
    return newDef.defaultConfig;
  }, [newType, newOptions, newDef]);

  // When the user switches field types, reset the default value to that
  // type's baseline. Otherwise selecting "currency" after typing into a text
  // default would leave a string in newDefault, which would then crash the
  // currency Input's number-formatting logic.
  useEffect(() => {
    setNewDefault(newDef.defaultValue);
  }, [newType, newDef.defaultValue]);

  async function handleAdd() {
    if (!newName.trim()) return;
    await addField({
      trackerId,
      name: newName.trim(),
      type: newType,
      config: newConfig,
      defaultValue: newDefault,
      order: fields.length,
    });
    setNewName('');
    setNewType('text');
    setNewOptions('');
    setNewDefault(null);
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
        {fields.map((f) => {
          const def = getFieldType(f.type);
          // Show a small inline preview of the default if there is one
          const hasDefault =
            f.defaultValue !== null &&
            f.defaultValue !== undefined &&
            f.defaultValue !== '' &&
            !(Array.isArray(f.defaultValue) && f.defaultValue.length === 0);
          return (
            <div
              key={f.id}
              className="bg-white border border-grape-100 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="flex-1 text-grape-900 text-[14px]">
                  {f.name}
                </span>
                <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
                  {f.type}
                </span>
                <button
                  onClick={() => deleteField(f.id)}
                  className="p-1 text-grape-300 hover:text-grape-600 rounded-md"
                  aria-label="Remove field"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {hasDefault && (
                <div className="flex items-baseline gap-2 mt-1 pt-1 border-t border-grape-50">
                  <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
                    Default
                  </span>
                  <div className="flex-1 min-w-0 truncate text-[13px]">
                    <def.Display
                      value={f.defaultValue as any}
                      config={f.config as any}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-dashed border-grape-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && newType !== 'select' && handleAdd()
            }
            placeholder="Field name"
            className="flex-1 bg-transparent text-[14px] text-grape-900 placeholder:text-grape-300 focus:outline-none py-1"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as FieldTypeId)}
            className="bg-grape-50 text-grape-700 text-[12px] font-semibold rounded-md px-2 py-1 border-0 focus:outline-none cursor-pointer"
          >
            {allFieldTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
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

        {newType === 'select' && (
          <div className="mt-2">
            <input
              type="text"
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
              placeholder="Options, comma separated (e.g. Clothes, Tech, Home)"
              className="w-full bg-grape-50 text-[13px] text-grape-900 placeholder:text-grape-300 rounded-md px-2.5 py-1.5 focus:outline-none"
            />
          </div>
        )}

        {/*
          Default value picker, rendered using the field's own Input component.
          We skip "picture" because making a thumbnail upload the inline default
          is more confusing than helpful — an empty picture default is fine.
        */}
        {newType !== 'picture' && (
          <div className="mt-2 pt-2 border-t border-grape-100">
            <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
              Default value{' '}
              <span className="font-normal normal-case">(optional)</span>
            </p>
            <newDef.Input
              value={newDefault as any}
              onChange={(v: unknown) => setNewDefault(v)}
              config={newConfig as any}
            />
          </div>
        )}
      </div>
    </div>
  );
}
