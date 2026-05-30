import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { useDataMutations } from '@/core/data';
import { allFieldTypes } from '@/core/fields';
import type { FieldTypeId } from '@/core/types';

interface DraftField {
  name: string;
  type: FieldTypeId;
  options?: string; // raw comma-separated for select fields
  defaultValue?: unknown;
}

export default function CreateTrackerPage() {
  const navigate = useNavigate();
  const { createTracker, addField } = useDataMutations();
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<DraftField[]>([
    { name: '', type: 'text' },
  ]);

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
  async function handleCreate() {
    if (!name.trim()) return;
    const tracker = await createTracker({
      name: name.trim(),
      icon: 'Box',
      color: 'grape',
    });
    await Promise.all(
      drafts
        .filter((d) => d.name.trim())
        .map((d, i) => {
          const def = allFieldTypes.find((t) => t.id === d.type)!;
          const config =
            d.type === 'select'
              ? {
                  options: (d.options ?? '')
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }
              : def.defaultConfig;
          return addField({
            trackerId: tracker.id,
            name: d.name.trim(),
            type: d.type,
            config,
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
        className="w-full bg-white border border-grape-200 focus:border-grape-400 rounded-xl px-4 py-3 text-[15px] text-grape-900 placeholder:text-grape-300 mb-8 transition-colors"
      />

      <div className="flex items-center justify-between mb-3">
        <label className="text-grape-700 text-[13px] font-semibold">
          Fields
        </label>
        <span className="text-grape-400 text-[12px]">{drafts.length}</span>
      </div>
      <div className="space-y-2 mb-3">
        {drafts.map((d, i) => (
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
                  onChange={(e) => updateDraft(i, { options: e.target.value })}
                  placeholder="Options, comma separated (e.g. Clothes, Tech, Home)"
                  className="w-full bg-grape-50 text-[14px] text-grape-900 placeholder:text-grape-300 rounded-md px-2.5 py-1.5 focus:outline-none"
                />
              </div>
            )}
            {/*
      Default value picker — uses the field's own Input. Skipped for
      'picture' because an inline default thumbnail upload is more
      confusing than helpful for tracker setup.
    */}
            {d.type !== 'picture' &&
              (() => {
                const def = allFieldTypes.find((t) => t.id === d.type)!;
                const config =
                  d.type === 'select'
                    ? {
                        options: (d.options ?? '')
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }
                    : def.defaultConfig;
                return (
                  <div className="mt-2 pt-2 border-t border-grape-100">
                    <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
                      Default value{' '}
                      <span className="font-normal normal-case">
                        (optional)
                      </span>
                    </p>
                    <def.Input
                      value={(d.defaultValue ?? def.defaultValue) as any}
                      onChange={(v: unknown) =>
                        updateDraft(i, { defaultValue: v })
                      }
                      config={config as any}
                    />
                  </div>
                );
              })()}
          </div>
        ))}
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
