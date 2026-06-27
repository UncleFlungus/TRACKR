import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { allFieldTypes } from '@/core/fields';
import type { FieldTypeId } from '@/core/types';
import type { LucideIcon } from 'lucide-react';
import { COLOR_THEMES, ALL_COLORS, getColorTheme } from '../colors';
import { ICON_OPTIONS } from '../icons';
type TimeDisplay = 'datetime' | 'date' | 'time';
type ViewMode = 'list' | 'grid' | 'calendar';

interface DraftField {
  name: string;
  type: FieldTypeId;
  /** Raw comma-separated options for select fields. */
  options?: string;
  /** Display mode for time fields. Ignored for other types. */
  display?: TimeDisplay;
  defaultValue?: unknown;
}

export default function CreateTrackerPage() {
  const navigate = useNavigate();
  const { createTracker, addField } = useDataMutations();
  const [name, setName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [drafts, setDrafts] = useState<DraftField[]>([
    { name: '', type: 'text' },
  ]);
  const [color, setColor] = useState('grape');
  const [icon, setIcon] = useState('Box');
  function updateDraft(i: number, patch: Partial<DraftField>) {
    setDrafts((cur) =>
      cur.map((d, idx) => {
        if (idx !== i) return d;
        const next = { ...d, ...patch };
        // If the user just switched field types, reset the default value to
        // that type's baseline so we don't carry a string into a currency etc.
        if (patch.type && patch.type !== d.type) {
          const def = allFieldTypes.find((t) => t.id === patch.type)!;
          next.defaultValue = def.defaultValue;
          // Default time display when first switching to time.
          if (patch.type === 'time' && !next.display) {
            next.display = 'datetime';
          }
        }
        return next;
      }),
    );
  }
  function addDraft() {
    setDrafts((cur) => [...cur, { name: '', type: 'text' }]);
  }
  function removeDraft(i: number) {
    setDrafts((cur) => cur.filter((_, idx) => idx !== i));
  }

  /**
   * Computes the field-type config for a draft. Centralized so the
   * default-value preview and the handleCreate submit path stay in sync.
   */
  function configForDraft(d: DraftField) {
    const def = allFieldTypes.find((t) => t.id === d.type)!;
    if (d.type === 'select') {
      return {
        options: (d.options ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }
    if (d.type === 'time') {
      return { ...def.defaultConfig, display: d.display ?? 'datetime' };
    }
    return def.defaultConfig;
  }

  async function handleCreate() {
    if (!name.trim()) return;
    const tracker = await createTracker({
      name: name.trim(),
      icon,
      color,
      settings: { viewMode },
    });
    await Promise.all(
      drafts
        .filter((d) => d.name.trim())
        .map((d, i) => {
          const def = allFieldTypes.find((t) => t.id === d.type)!;
          return addField({
            trackerId: tracker.id,
            name: d.name.trim(),
            type: d.type,
            config: configForDraft(d),
            defaultValue:
              d.defaultValue !== undefined ? d.defaultValue : def.defaultValue,
            order: i,
          });
        }),
    );
    navigate(`/t/${tracker.id}`);
  }

  const canCreate = name.trim().length > 0;

  return (
    <div className="min-h-full max-w-2xl mx-auto px-6 py-10">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-grape-500 hover:text-grape-700 text-[14px] mb-6"
      >
        <Icons.ChevronLeft className="w-4 h-4" /> Back
      </Link>

      <h1 className="font-display font-semibold text-[28px] text-grape-900 mb-8">
        New tracker
      </h1>

      <label className="block text-grape-700 text-[13px] font-semibold mb-2">
        Name
      </label>
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Wishlist"
        className="w-full bg-white border border-grape-200 focus:border-grape-400 rounded-xl px-4 py-3 text-[15px] text-grape-900 placeholder:text-grape-300 mb-6 transition-colors"
      />
      <div className="flex items-center gap-3 mb-6 px-1">
        {(() => {
          const theme = getColorTheme(color);
          const Cmp =
            (Icons as unknown as Record<string, LucideIcon>)[icon] ?? Icons.Box;
          return (
            <>
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${theme.tileBg}`}
              >
                <Cmp className={`w-6 h-6 ${theme.tileFg}`} />
              </div>
              <p className="text-grape-500 text-[13px]">Preview</p>
            </>
          );
        })()}
      </div>
      <label className="block text-grape-700 text-[13px] font-semibold mb-2">
        Icon
      </label>
      <div className="bg-white border border-grape-200 rounded-xl p-3 mb-6">
        <div className="grid grid-cols-10 sm:grid-cols-10 gap-1">
          {ICON_OPTIONS.map((iconName) => {
            const Cmp =
              (Icons as unknown as Record<string, LucideIcon>)[iconName] ??
              Icons.Box;
            const isSelected = icon === iconName;
            return (
              <button
                key={iconName}
                type="button"
                onClick={() => setIcon(iconName)}
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

      <label className="block text-grape-700 text-[13px] font-semibold mb-2">
        Color
      </label>
      <div className="flex items-center gap-2 mb-8">
        {ALL_COLORS.map((colorKey) => {
          const theme = COLOR_THEMES[colorKey];
          const isSelected = color === colorKey;
          return (
            <button
              key={colorKey}
              type="button"
              onClick={() => setColor(colorKey)}
              aria-label={theme.label}
              className={`w-8 h-8 rounded-full transition-all ${
                isSelected
                  ? 'ring-2 ring-offset-2 ring-grape-600 scale-110'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: theme.swatch }}
            />
          );
        })}
      </div>
      <label className="block text-grape-700 text-[13px] font-semibold mb-2">
        Default view
      </label>
      <select
        value={viewMode}
        onChange={(e) => setViewMode(e.target.value as ViewMode)}
        className="bg-grape-50 text-grape-700 text-[13px] font-semibold rounded-lg px-3 py-2 border-0 focus:outline-none cursor-pointer mb-8"
      >
        <option value="list">List</option>
        <option value="grid">Grid</option>
        <option value="calendar">Calendar</option>
      </select>

      <div className="flex items-center justify-between mb-3">
        <label className="text-grape-700 text-[13px] font-semibold">
          Fields
        </label>
        <span className="text-grape-400 text-[12px]">{drafts.length}</span>
      </div>
      <div className="space-y-2 mb-3">
        {drafts.map((d, i) => {
          const def = allFieldTypes.find((t) => t.id === d.type)!;
          const config = configForDraft(d);
          return (
            <div
              key={i}
              className="bg-white border border-grape-100 rounded-xl px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={d.name}
                  onChange={(e) => updateDraft(i, { name: e.target.value })}
                  placeholder="Field name"
                  className="flex-1 bg-transparent text-[15px] text-grape-900 placeholder:text-grape-300 py-1.5 focus:outline-none"
                />
                <select
                  value={d.type}
                  onChange={(e) =>
                    updateDraft(i, { type: e.target.value as FieldTypeId })
                  }
                  className="bg-grape-50 text-grape-700 text-[13px] font-semibold rounded-lg px-2.5 py-1.5 border-0 focus:outline-none cursor-pointer"
                >
                  {allFieldTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeDraft(i)}
                  className="p-1.5 text-grape-300 hover:text-grape-600 rounded-md"
                  aria-label="Remove field"
                >
                  <Icons.X className="w-4 h-4" />
                </button>
              </div>

              {d.type === 'select' && (
                <div className="mt-2 pt-2 border-t border-grape-100">
                  <input
                    type="text"
                    value={d.options ?? ''}
                    onChange={(e) =>
                      updateDraft(i, { options: e.target.value })
                    }
                    placeholder="Options, comma separated (e.g. Clothes, Tech, Home)"
                    className="w-full bg-grape-50 text-[14px] text-grape-900 placeholder:text-grape-300 rounded-md px-2.5 py-1.5 focus:outline-none"
                  />
                </div>
              )}

              {d.type === 'time' && (
                <div className="mt-2 pt-2 border-t border-grape-100 flex items-center gap-2">
                  <label className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
                    Show
                  </label>
                  <select
                    value={d.display ?? 'datetime'}
                    onChange={(e) =>
                      updateDraft(i, {
                        display: e.target.value as TimeDisplay,
                      })
                    }
                    className="bg-grape-50 text-grape-700 text-[12px] font-semibold rounded-md px-2 py-1 border-0 focus:outline-none cursor-pointer"
                  >
                    <option value="datetime">Date &amp; time</option>
                    <option value="date">Date only</option>
                    <option value="time">Time only</option>
                  </select>
                </div>
              )}

              {/*
                Default value picker — uses the field's own Input. Skipped for
                'picture' because an inline default thumbnail upload is more
                confusing than helpful for tracker setup.
              */}
              {/* {d.type !== 'picture' && (
                <div className="mt-2 pt-2 border-t border-grape-100">
                  <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
                    Default value{' '}
                    <span className="font-normal normal-case">(optional)</span>
                  </p>
                  <def.Input
                    value={(d.defaultValue ?? def.defaultValue) as any}
                    onChange={(v: unknown) =>
                      updateDraft(i, { defaultValue: v })
                    }
                    config={config as any}
                  />
                </div>
              )} */}
            </div>
          );
        })}
      </div>

      <button
        onClick={addDraft}
        className="w-full border border-dashed border-grape-200 hover:border-grape-300 hover:bg-grape-50 rounded-xl px-4 py-2.5 text-grape-500 text-[13px] font-medium flex items-center justify-center gap-1.5 transition-colors mb-10"
      >
        <Icons.Plus className="w-4 h-4" /> Add field
      </button>

      <button
        onClick={handleCreate}
        disabled={!canCreate}
        className="w-full bg-grape-500 hover:bg-grape-600 disabled:bg-grape-200 disabled:cursor-not-allowed text-white font-display font-semibold rounded-xl py-3.5 text-[16px] transition-colors"
      >
        Create tracker
      </button>
    </div>
  );
}
