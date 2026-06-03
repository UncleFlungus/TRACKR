import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Settings2, ChevronUp, ChevronDown, Pencil, Check } from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { allFieldTypes, getFieldType } from '@/core/fields';
import type { Field, FieldTypeId } from '@/core/types';

interface Props {
  trackerId: string;
  fields: Field[];
}

type TimeDisplay = 'datetime' | 'date' | 'time';

export default function FieldEditor({ trackerId, fields }: Props) {
  const { addField, deleteField, updateField } = useDataMutations();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FieldTypeId>('text');
  const [newOptions, setNewOptions] = useState('');
  // Time-specific: which view mode to render (date / time / both).
  const [newTimeDisplay, setNewTimeDisplay] = useState<TimeDisplay>('datetime');
  const [newDefault, setNewDefault] = useState<unknown>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const newDef = useMemo(
    () => allFieldTypes.find((t) => t.id === newType)!,
    [newType]
  );

  const newConfig = useMemo(() => {
    if (newType === 'select') {
      return { options: newOptions.split(',').map((s) => s.trim()).filter(Boolean) };
    }
    if (newType === 'time') {
      // Start from the field type's defaults so format + autoNow still get
      // their sensible values; just override the display mode.
      return { ...newDef.defaultConfig, display: newTimeDisplay };
    }
    return newDef.defaultConfig;
  }, [newType, newOptions, newTimeDisplay, newDef]);

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
    setNewTimeDisplay('datetime');
    setNewDefault(null);
  }

  async function moveField(field: Field, direction: 'up' | 'down') {
    const sorted = [...fields].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((f) => f.id === field.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      updateField(field.id, { order: other.order }),
      updateField(other.id, { order: field.order }),
    ]);
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

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="bg-grape-50 border border-grape-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-grape-700 text-[13px] font-semibold">Fields</p>
        <button
          onClick={() => {
            setOpen(false);
            setEditingId(null);
          }}
          className="text-grape-500 hover:text-grape-700 text-[12px] font-semibold"
        >
          Done
        </button>
      </div>

      <div className="space-y-1.5 mb-3">
        {sortedFields.map((f, i) => {
          const isFirst = i === 0;
          const isLast = i === sortedFields.length - 1;
          const isEditing = editingId === f.id;
          return (
            <FieldRow
              key={f.id}
              field={f}
              isEditing={isEditing}
              isFirst={isFirst}
              isLast={isLast}
              onStartEdit={() => setEditingId(f.id)}
              onStopEdit={() => setEditingId(null)}
              onMoveUp={() => moveField(f, 'up')}
              onMoveDown={() => moveField(f, 'down')}
              onDelete={() => deleteField(f.id)}
              onSave={async (patch) => {
                await updateField(f.id, patch);
                setEditingId(null);
              }}
            />
          );
        })}
      </div>

      <div className="bg-white border border-dashed border-grape-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newType !== 'select' && handleAdd()}
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

        {/* Type-specific config: time field's display mode picker. */}
        {newType === 'time' && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
              Show
            </label>
            <select
              value={newTimeDisplay}
              onChange={(e) => setNewTimeDisplay(e.target.value as TimeDisplay)}
              className="bg-grape-50 text-grape-700 text-[12px] font-semibold rounded-md px-2 py-1 border-0 focus:outline-none cursor-pointer"
            >
              <option value="datetime">Date &amp; time</option>
              <option value="date">Date only</option>
              <option value="time">Time only</option>
            </select>
          </div>
        )}

        {newType !== 'picture' && (
          <div className="mt-2 pt-2 border-t border-grape-100">
            <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
              Default value <span className="font-normal normal-case">(optional)</span>
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

function FieldRow({
  field,
  isEditing,
  isFirst,
  isLast,
  onStartEdit,
  onStopEdit,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSave,
}: {
  field: Field;
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onSave: (patch: Partial<Omit<Field, 'id' | 'trackerId'>>) => Promise<void>;
}) {
  const def = getFieldType(field.type);
  const [draftName, setDraftName] = useState(field.name);
  const [draftOptions, setDraftOptions] = useState(
    field.type === 'select'
      ? ((field.config as { options?: string[] }).options ?? []).join(', ')
      : ''
  );
  // Time-specific: track the display mode while editing. Falls back to
  // 'datetime' for fields created before this option existed.
  const [draftTimeDisplay, setDraftTimeDisplay] = useState<TimeDisplay>(
    field.type === 'time'
      ? (((field.config as { display?: TimeDisplay }).display) ?? 'datetime')
      : 'datetime'
  );

  useEffect(() => {
    if (isEditing) {
      setDraftName(field.name);
      if (field.type === 'select') {
        setDraftOptions(((field.config as { options?: string[] }).options ?? []).join(', '));
      }
      if (field.type === 'time') {
        setDraftTimeDisplay(((field.config as { display?: TimeDisplay }).display) ?? 'datetime');
      }
    }
  }, [isEditing, field.name, field.type, field.config]);

  const hasDefault =
    field.defaultValue !== null &&
    field.defaultValue !== undefined &&
    field.defaultValue !== '' &&
    !(Array.isArray(field.defaultValue) && field.defaultValue.length === 0);

  async function handleSave() {
    const patch: Partial<Omit<Field, 'id' | 'trackerId'>> = {};
    if (draftName.trim() && draftName.trim() !== field.name) {
      patch.name = draftName.trim();
    }
    if (field.type === 'select') {
      const newOptions = draftOptions.split(',').map((s) => s.trim()).filter(Boolean);
      const existing = (field.config as { options?: string[] }).options ?? [];
      if (JSON.stringify(newOptions) !== JSON.stringify(existing)) {
        patch.config = { ...field.config, options: newOptions };
      }
    }
    if (field.type === 'time') {
      const currentDisplay = ((field.config as { display?: TimeDisplay }).display) ?? 'datetime';
      if (draftTimeDisplay !== currentDisplay) {
        patch.config = { ...field.config, display: draftTimeDisplay };
      }
    }
    await onSave(patch);
  }

  return (
    <div className="bg-white border border-grape-100 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        {isEditing ? (
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onStopEdit();
            }}
            autoFocus
            className="flex-1 bg-grape-50 text-[14px] text-grape-900 placeholder:text-grape-300 rounded-md px-2 py-1 focus:outline-none"
          />
        ) : (
          <span className="flex-1 text-grape-900 text-[14px] truncate">{field.name}</span>
        )}
        <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
          {field.type}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-grape-300 hover:text-grape-600 disabled:opacity-30 disabled:hover:text-grape-300 rounded-md"
            aria-label="Move up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-grape-300 hover:text-grape-600 disabled:opacity-30 disabled:hover:text-grape-300 rounded-md"
            aria-label="Move down"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          {isEditing ? (
            <button
              onClick={handleSave}
              className="p-1 text-grape-500 hover:text-grape-700 rounded-md"
              aria-label="Save"
            >
              <Check className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onStartEdit}
              className="p-1 text-grape-300 hover:text-grape-600 rounded-md"
              aria-label="Edit field"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 text-grape-300 hover:text-grape-600 rounded-md"
            aria-label="Remove field"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isEditing && field.type === 'select' && (
        <div className="mt-2">
          <input
            type="text"
            value={draftOptions}
            onChange={(e) => setDraftOptions(e.target.value)}
            placeholder="Options, comma separated"
            className="w-full bg-grape-50 text-[13px] text-grape-900 placeholder:text-grape-300 rounded-md px-2.5 py-1.5 focus:outline-none"
          />
          <p className="text-grape-400 text-[11px] mt-1">
            Removing an option hides it from existing entries that used it.
          </p>
        </div>
      )}

      {isEditing && field.type === 'time' && (
        <div className="mt-2 flex items-center gap-2">
          <label className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
            Show
          </label>
          <select
            value={draftTimeDisplay}
            onChange={(e) => setDraftTimeDisplay(e.target.value as TimeDisplay)}
            className="bg-grape-50 text-grape-700 text-[12px] font-semibold rounded-md px-2 py-1 border-0 focus:outline-none cursor-pointer"
          >
            <option value="datetime">Date &amp; time</option>
            <option value="date">Date only</option>
            <option value="time">Time only</option>
          </select>
        </div>
      )}

      {!isEditing && hasDefault && (
        <div className="flex items-baseline gap-2 mt-1 pt-1 border-t border-grape-50">
          <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
            Default
          </span>
          <div className="flex-1 min-w-0 truncate text-[13px]">
            <def.Display value={field.defaultValue as any} config={field.config as any} />
          </div>
        </div>
      )}
    </div>
  );
}