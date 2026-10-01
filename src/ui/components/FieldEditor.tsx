import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  X,
  Settings2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
} from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { allFieldTypes, getFieldType } from '@/core/fields';
import type { Field, FieldTypeId, Tracker } from '@/core/types';
import { availableAggregationsFor } from './EntryAggregations';
import { COLOR_THEMES, ALL_COLORS } from '../colors';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ICON_OPTIONS } from '../icons';
import { pruneOptionColors } from '@/core/selectColors';
import { DEFAULT_MAX, hasMaxConfig, resolveMax } from '@/core/fields/outOf';
import TableColumnsEditor from './TableColumnsEditor';
import TagManager from './TagManager';
import { tableColumns, type TableColumn } from '@/core/fields/table';

interface Props {
  tracker: Tracker;
  fields: Field[];
}

type TimeDisplay = 'datetime' | 'date' | 'time';

/**
 * Tracker editor: display settings, the field list (rename, reorder, delete,
 * type config, aggregations, default value, per-option select colors) and the
 * add-field form.
 *
 * Select options are the tracker's accent until someone picks a color, and only
 * then is one stored.
 */
export default function FieldEditor({ tracker, fields }: Props) {
  const { addField, deleteField, updateField, updateTracker } =
    useDataMutations();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FieldTypeId>('text');
  const [newOptions, setNewOptions] = useState('');
  const [newTimeDisplay, setNewTimeDisplay] = useState<TimeDisplay>('datetime');
  const [newMax, setNewMax] = useState<number | undefined>(DEFAULT_MAX);
  const [newColumns, setNewColumns] = useState<TableColumn[]>([]);
  const [newRowLabel, setNewRowLabel] = useState('row');
  const [newDefault, setNewDefault] = useState<unknown>(null);
  // Sparse color overrides for options in the add-field form.
  const [newOptionColors, setNewOptionColors] = useState<
    Record<string, string>
  >({});

  const [editingId, setEditingId] = useState<string | null>(null);

  const [draftName, setDraftName] = useState(tracker.name);
  useEffect(() => {
    setDraftName(tracker.name);
  }, [tracker.name]);

  async function commitName() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== tracker.name) {
      await updateTracker(tracker.id, { name: trimmed });
    } else {
      setDraftName(tracker.name);
    }
  }
  const newDef = useMemo(
    () => allFieldTypes.find((t) => t.id === newType)!,
    [newType],
  );

  const newOptionList = useMemo(
    () =>
      newOptions
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [newOptions],
  );

  const newConfig = useMemo(() => {
    if (newType === 'select') {
      // Keep only the overrides that were set, pruned to current options.
      return {
        options: newOptionList,
        optionColors: pruneOptionColors(newOptionList, newOptionColors),
      };
    }
    if (newType === 'time') {
      return { ...newDef.defaultConfig, display: newTimeDisplay };
    }
    if (hasMaxConfig(newType)) {
      return { ...newDef.defaultConfig, max: newMax ?? DEFAULT_MAX };
    }
    if (newType === 'table') {
      return { columns: newColumns, rowLabel: newRowLabel };
    }
    return newDef.defaultConfig;
  }, [
    newType,
    newOptionList,
    newOptionColors,
    newTimeDisplay,
    newMax,
    newColumns,
    newRowLabel,
    newDef,
  ]);

  /**
   * Changing the type has to change the default value in the same render.
   *
   * As a useEffect this ran after the render it reacted to, so for one frame
   * the new type's Input got the previous type's default. Switching text to
   * list handed '' to a component expecting an array, `'' ?? []` kept the empty
   * string because it isn't nullish, and .map() threw. With no error boundary
   * at the time, that blanked the app until a reload.
   */
  function changeNewType(nextType: FieldTypeId) {
    setNewType(nextType);
    setNewDefault(getFieldType(nextType).defaultValue);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    await addField({
      trackerId: tracker.id,
      name: newName.trim(),
      type: newType,
      config: newConfig,
      defaultValue: newDefault,
      order: fields.length,
    });
    setNewName('');
    changeNewType('text');
    setNewOptions('');
    setNewTimeDisplay('datetime');
    setNewMax(DEFAULT_MAX);
    setNewColumns([]);
    setNewRowLabel('row');
    setNewOptionColors({});
  }

  function setNewOptionColor(option: string, colorKey: string) {
    setNewOptionColors((cur) => ({ ...cur, [option]: colorKey }));
  }

  async function moveField(field: Field, direction: 'up' | 'down') {
    const sorted = [...fields].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((f) => f.id === field.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    // Renumber by position when two fields share an order value.
    if (field.order === other.order) {
      await Promise.all(sorted.map((f, i) => updateField(f.id, { order: i })));
      return;
    }
    await Promise.all([
      updateField(field.id, { order: other.order }),
      updateField(other.id, { order: field.order }),
    ]);
  }

  const hideEmpty = tracker.settings?.hideEmptyFields !== false;

  async function toggleHideEmpty() {
    await updateTracker(tracker.id, {
      settings: { ...tracker.settings, hideEmptyFields: !hideEmpty },
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-grape-500 hover:text-grape-700 text-[13px] font-semibold"
      >
        <Settings2 className="w-3.5 h-3.5" /> Edit tracker
      </button>
    );
  }

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="bg-grape-50 border border-grape-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-grape-700 text-[13px] font-semibold">Edit tracker</p>
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

      {/* ===== Display section ===== */}
      <SectionHeader label="Display" />
      <div className="bg-white border border-grape-100 rounded-lg px-3 py-2.5 mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-[14px] text-grape-700 w-16 shrink-0">
            Name
          </label>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDraftName(tracker.name);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="flex-1 bg-grape-50 text-[13px] text-grape-900 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-grape-300"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-[14px] text-grape-700">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={toggleHideEmpty}
            className="w-4 h-4 accent-grape-500 cursor-pointer"
          />
          Hide empty fields in entry list
        </label>

        <div className="flex items-center gap-2">
          <label className="text-[14px] text-grape-700 w-16 shrink-0">
            View
          </label>
          <select
            value={tracker.settings?.viewMode ?? 'list'}
            onChange={(e) =>
              updateTracker(tracker.id, {
                settings: {
                  ...tracker.settings,
                  viewMode: e.target.value as
                    'list' | 'grid' | 'table' | 'calendar',
                },
              })
            }
            className="bg-grape-50 text-grape-700 text-[13px] font-semibold rounded-md px-2 py-1 border-0 focus:outline-none cursor-pointer"
          >
            <option value="list">List</option>
            <option value="grid">Grid</option>
            <option value="table">Table</option>
            <option value="calendar">Calendar</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[14px] text-grape-700 w-16 shrink-0">
            Accent
          </label>
          <div className="flex items-center gap-1.5">
            {ALL_COLORS.map((colorKey) => {
              const theme = COLOR_THEMES[colorKey];
              const isSelected = tracker.color === colorKey;
              return (
                <button
                  key={colorKey}
                  type="button"
                  onClick={() => updateTracker(tracker.id, { color: colorKey })}
                  aria-label={theme.label}
                  className={`w-6 h-6 rounded-full transition-all ${
                    isSelected
                      ? 'ring-2 ring-offset-2 ring-grape-600 scale-110'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: theme.swatch }}
                />
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[14px] text-grape-700 mb-1.5">Icon</p>
          <div className="grid grid-cols-6 gap-1">
            {ICON_OPTIONS.map((iconName) => {
              const Cmp =
                (Icons as unknown as Record<string, LucideIcon>)[iconName] ??
                Icons.Box;
              const isSelected = tracker.icon === iconName;
              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => updateTracker(tracker.id, { icon: iconName })}
                  aria-label={iconName}
                  className={`p-2 rounded-md flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-grape-100 text-grape-700 ring-1 ring-grape-300'
                      : 'text-grape-500 hover:bg-grape-50'
                  }`}
                >
                  <Cmp className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== Fields section ===== */}
      <SectionHeader label="Fields" />
      <div className="space-y-1.5 mb-3">
        {sortedFields.map((f, i) => {
          const isFirst = i === 0;
          const isLast = i === sortedFields.length - 1;
          const isEditing = editingId === f.id;
          return (
            <FieldRow
              key={f.id}
              field={f}
              accentColor={tracker.color}
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
            onKeyDown={(e) =>
              e.key === 'Enter' && newType !== 'select' && handleAdd()
            }
            placeholder="Field name"
            className="flex-1 bg-transparent text-[14px] text-grape-900 placeholder:text-grape-300 focus:outline-none py-1"
          />
          <select
            value={newType}
            onChange={(e) => changeNewType(e.target.value as FieldTypeId)}
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
            {/* Per-option color pickers — default to accent until picked */}
            {newOptionList.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {newOptionList.map((opt) => {
                  const activeColor = newOptionColors[opt] ?? tracker.color;
                  return (
                    <div key={opt} className="flex items-center gap-2">
                      <span className="text-[13px] text-grape-700 w-24 truncate shrink-0">
                        {opt}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {ALL_COLORS.map((colorKey) => {
                          const theme = COLOR_THEMES[colorKey];
                          const isSelected = activeColor === colorKey;
                          return (
                            <button
                              key={colorKey}
                              type="button"
                              onClick={() => setNewOptionColor(opt, colorKey)}
                              aria-label={`${opt}: ${theme.label}`}
                              className={`w-5 h-5 rounded-full transition-all ${
                                isSelected
                                  ? 'ring-2 ring-offset-1 ring-grape-600 scale-110'
                                  : 'hover:scale-110'
                              }`}
                              style={{ backgroundColor: theme.swatch }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {newType === 'table' && (
          <TableColumnsEditor
            columns={newColumns}
            rowLabel={newRowLabel}
            onChange={setNewColumns}
            onRowLabelChange={setNewRowLabel}
          />
        )}

        {hasMaxConfig(newType) && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
              Out of
            </label>
            <input
              type="number"
              min={1}
              step="any"
              value={newMax ?? ''}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                const next =
                  e.target.value === '' || Number.isNaN(parsed)
                    ? undefined
                    : parsed;
                setNewMax(next);
                // Keep the default value inside the new range.
                if (
                  typeof newDefault === 'number' &&
                  next != null &&
                  newDefault > next
                ) {
                  setNewDefault(next);
                }
              }}
              className="w-20 bg-grape-50 text-[13px] text-grape-900 tabular-nums rounded-md px-2 py-1 focus:outline-none"
            />
          </div>
        )}

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
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1.5">
      {label}
    </p>
  );
}

function FieldRow({
  field,
  accentColor,
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
  accentColor: string;
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
      : '',
  );
  const [draftTimeDisplay, setDraftTimeDisplay] = useState<TimeDisplay>(
    field.type === 'time'
      ? ((field.config as { display?: TimeDisplay }).display ?? 'datetime')
      : 'datetime',
  );
  const [draftMax, setDraftMax] = useState<number | undefined>(
    hasMaxConfig(field.type)
      ? resolveMax(field.config as { max: number })
      : DEFAULT_MAX,
  );
  const [draftColumns, setDraftColumns] = useState<TableColumn[]>(
    tableColumns(field.config as never),
  );
  const [draftRowLabel, setDraftRowLabel] = useState<string>(
    (field.config as { rowLabel?: string }).rowLabel ?? 'row',
  );
  const [draftAggregations, setDraftAggregations] = useState<string[]>(
    (field.config as { aggregations?: string[] }).aggregations ?? [],
  );
  const [draftDefaultValue, setDraftDefaultValue] = useState<unknown>(
    field.defaultValue,
  );
  // Sparse per-option color overrides.
  const [draftOptionColors, setDraftOptionColors] = useState<
    Record<string, string>
  >(
    (field.config as { optionColors?: Record<string, string> }).optionColors ??
      {},
  );

  const draftConfig = useMemo(() => {
    if (field.type === 'select') {
      return {
        ...field.config,
        options: draftOptions
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        optionColors: draftOptionColors,
      };
    }
    if (field.type === 'time') {
      return { ...field.config, display: draftTimeDisplay };
    }
    if (hasMaxConfig(field.type)) {
      return { ...field.config, max: draftMax ?? DEFAULT_MAX };
    }
    if (field.type === 'table') {
      return {
        ...field.config,
        columns: draftColumns,
        rowLabel: draftRowLabel,
      };
    }
    return field.config;
  }, [
    field.type,
    field.config,
    draftOptions,
    draftTimeDisplay,
    draftMax,
    draftColumns,
    draftRowLabel,
    draftOptionColors,
  ]);

  useEffect(() => {
    if (isEditing) {
      setDraftName(field.name);
      if (field.type === 'select') {
        setDraftOptions(
          ((field.config as { options?: string[] }).options ?? []).join(', '),
        );
        setDraftOptionColors(
          (field.config as { optionColors?: Record<string, string> })
            .optionColors ?? {},
        );
      }
      if (field.type === 'time') {
        setDraftTimeDisplay(
          (field.config as { display?: TimeDisplay }).display ?? 'datetime',
        );
      }
      if (hasMaxConfig(field.type)) {
        setDraftMax(resolveMax(field.config as { max: number }));
      }
      if (field.type === 'table') {
        setDraftColumns(tableColumns(field.config as never));
        setDraftRowLabel(
          (field.config as { rowLabel?: string }).rowLabel ?? 'row',
        );
      }
      setDraftAggregations(
        (field.config as { aggregations?: string[] }).aggregations ?? [],
      );
      setDraftDefaultValue(field.defaultValue);
    }
  }, [isEditing, field.name, field.type, field.config, field.defaultValue]);

  const hasDefault =
    field.defaultValue !== null &&
    field.defaultValue !== undefined &&
    field.defaultValue !== '' &&
    !(Array.isArray(field.defaultValue) && field.defaultValue.length === 0);

  const availableAggs = availableAggregationsFor(field.type);

  const draftOptionList = useMemo(
    () =>
      draftOptions
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [draftOptions],
  );

  function setOptionColor(option: string, colorKey: string) {
    setDraftOptionColors((cur) => ({ ...cur, [option]: colorKey }));
  }

  async function handleSave() {
    const patch: Partial<Omit<Field, 'id' | 'trackerId'>> = {};
    if (draftName.trim() && draftName.trim() !== field.name) {
      patch.name = draftName.trim();
    }

    let nextConfig: Record<string, unknown> | null = null;

    // select: options plus the sparse per-option color overrides
    if (field.type === 'select') {
      const newOptions = draftOptions
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const existingOptions =
        (field.config as { options?: string[] }).options ?? [];
      const existingColors =
        (field.config as { optionColors?: Record<string, string> })
          .optionColors ?? {};

      // Keep overrides for surviving options only.
      const prunedColors = pruneOptionColors(newOptions, draftOptionColors);

      const optionsChanged =
        JSON.stringify(newOptions) !== JSON.stringify(existingOptions);
      const colorsChanged =
        JSON.stringify(prunedColors) !== JSON.stringify(existingColors);

      if (optionsChanged || colorsChanged) {
        nextConfig = {
          ...(nextConfig ?? field.config),
          options: newOptions,
          optionColors: prunedColors,
        };
      }
    }

    // time
    if (field.type === 'time') {
      const currentDisplay =
        (field.config as { display?: TimeDisplay }).display ?? 'datetime';
      if (draftTimeDisplay !== currentDisplay) {
        nextConfig = {
          ...(nextConfig ?? field.config),
          display: draftTimeDisplay,
        };
      }
    }

    // score and count: the shared "out of" max
    if (hasMaxConfig(field.type)) {
      const currentMax = resolveMax(field.config as { max: number });
      const nextMax = draftMax ?? DEFAULT_MAX;
      if (nextMax !== currentMax) {
        nextConfig = { ...(nextConfig ?? field.config), max: nextMax };
      }
    }

    // table columns
    if (field.type === 'table') {
      const existingCols = JSON.stringify(tableColumns(field.config as never));
      const existingLabel =
        (field.config as { rowLabel?: string }).rowLabel ?? 'row';
      if (
        JSON.stringify(draftColumns) !== existingCols ||
        draftRowLabel !== existingLabel
      ) {
        nextConfig = {
          ...(nextConfig ?? field.config),
          columns: draftColumns,
          rowLabel: draftRowLabel,
        };
      }
    }

    // aggregations
    const existingAggs =
      (field.config as { aggregations?: string[] }).aggregations ?? [];
    if (JSON.stringify(draftAggregations) !== JSON.stringify(existingAggs)) {
      nextConfig = {
        ...(nextConfig ?? field.config),
        aggregations: draftAggregations,
      };
    }

    if (nextConfig) patch.config = nextConfig;

    if (
      JSON.stringify(draftDefaultValue) !== JSON.stringify(field.defaultValue)
    ) {
      patch.defaultValue = draftDefaultValue;
    }

    await onSave(patch);
  }

  function toggleAggregation(key: string) {
    setDraftAggregations((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );
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
          <span className="flex-1 text-grape-900 text-[14px] truncate">
            {field.name}
          </span>
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

          {/* Per-option color pickers — accent until picked */}
          {draftOptionList.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {draftOptionList.map((opt) => {
                const activeColor = draftOptionColors[opt] ?? accentColor;
                return (
                  <div key={opt} className="flex items-center gap-2">
                    <span className="text-[13px] text-grape-700 w-24 truncate shrink-0">
                      {opt}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {ALL_COLORS.map((colorKey) => {
                        const theme = COLOR_THEMES[colorKey];
                        const isSelected = activeColor === colorKey;
                        return (
                          <button
                            key={colorKey}
                            type="button"
                            onClick={() => setOptionColor(opt, colorKey)}
                            aria-label={`${opt}: ${theme.label}`}
                            className={`w-5 h-5 rounded-full transition-all ${
                              isSelected
                                ? 'ring-2 ring-offset-1 ring-grape-600 scale-110'
                                : 'hover:scale-110'
                            }`}
                            style={{ backgroundColor: theme.swatch }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isEditing && field.type === 'table' && (
        <TableColumnsEditor
          columns={draftColumns}
          rowLabel={draftRowLabel}
          onChange={setDraftColumns}
          onRowLabelChange={setDraftRowLabel}
        />
      )}

      {isEditing && field.type === 'list' && <TagManager field={field} />}

      {isEditing && hasMaxConfig(field.type) && (
        <div className="mt-2 flex items-center gap-2">
          <label className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
            Out of
          </label>
          <input
            type="number"
            min={1}
            step="any"
            value={draftMax ?? ''}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              const next =
                e.target.value === '' || Number.isNaN(parsed)
                  ? undefined
                  : parsed;
              setDraftMax(next);
              // Keep the default value inside the new range.
              if (
                typeof draftDefaultValue === 'number' &&
                next != null &&
                draftDefaultValue > next
              ) {
                setDraftDefaultValue(next);
              }
            }}
            className="w-20 bg-grape-50 text-[13px] text-grape-900 tabular-nums rounded-md px-2 py-1 focus:outline-none"
          />
          <span className="text-grape-400 text-[11px]">
            Past entries re-render against the new max.
          </span>
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

      {isEditing && availableAggs.length > 0 && (
        <div className="mt-2 pt-2 border-t border-grape-50">
          <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
            Aggregations
          </p>
          {availableAggs.map((agg) => (
            <label
              key={agg.key}
              className="flex items-center gap-2 cursor-pointer text-[13px] text-grape-700 py-0.5"
            >
              <input
                type="checkbox"
                checked={draftAggregations.includes(agg.key)}
                onChange={() => toggleAggregation(agg.key)}
                className="w-3.5 h-3.5 accent-grape-500 cursor-pointer"
              />
              {agg.label}
            </label>
          ))}
        </div>
      )}

      {isEditing && (
        <div className="mt-2 pt-2 border-t border-grape-50">
          <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
            Default value{' '}
            <span className="font-normal normal-case">(optional)</span>
          </p>
          <def.Input
            value={draftDefaultValue as any}
            onChange={(v: unknown) => setDraftDefaultValue(v)}
            config={draftConfig as any}
          />
        </div>
      )}

      {!isEditing && hasDefault && (
        <div className="flex items-baseline gap-2 mt-1 pt-1 border-t border-grape-50">
          <span className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
            Default
          </span>
          <div className="flex-1 min-w-0 truncate text-[13px]">
            <def.Display
              value={field.defaultValue as any}
              config={field.config as any}
            />
          </div>
        </div>
      )}
    </div>
  );
}
