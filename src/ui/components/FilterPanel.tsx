// src/ui/components/FilterPanel.tsx
//
// Filter icon → popover panel containing a control per filterable field, plus
// always-visible active-filter chips. Filter state lives in TrackerPage and is
// passed down; this component is purely presentational over that state.

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { Field } from '@/core/types';
import {
  type FieldFilter,
  type FilterState,
  filterableKind,
  isActive,
  summarize,
} from '@/core/filtering';

interface Props {
  fields: Field[];
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

export default function FilterPanel({ fields, filters, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const filterableFields = fields.filter(
    (f) => filterableKind(f.type) !== null,
  );

  const activeEntries = Object.entries(filters).filter(([, f]) => isActive(f));
  const activeCount = activeEntries.length;

  function setFieldFilter(fieldId: string, filter: FieldFilter | undefined) {
    const next = { ...filters };
    if (!filter || !isActive(filter)) {
      delete next[fieldId];
    } else {
      next[fieldId] = filter;
    }
    onChange(next);
  }

  function clearAll() {
    onChange({});
  }

  const fieldsById = new Map(fields.map((f) => [f.id, f]));

  return (
    <div className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Filter trigger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold border transition-colors ${
            activeCount > 0
              ? 'bg-grape-500 text-white border-grape-500 hover:bg-grape-600'
              : 'bg-white text-grape-700 border-grape-200 hover:border-grape-300'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filter
          {activeCount > 0 && (
            <span className="ml-0.5 bg-white/25 rounded-full px-1.5 text-[11px]">
              {activeCount}
            </span>
          )}
        </button>

        {/* Active chips */}
        {activeEntries.map(([fieldId, f]) => {
          const field = fieldsById.get(fieldId);
          if (!field) return null;
          return (
            <span
              key={fieldId}
              className="inline-flex items-center gap-1 bg-grape-100 text-grape-700 rounded-lg pl-2.5 pr-1 py-1 text-[12px]"
            >
              <span className="font-semibold">{field.name}:</span>
              <span className="truncate max-w-32">{summarize(f)}</span>
              <button
                type="button"
                onClick={() => setFieldFilter(fieldId, undefined)}
                aria-label={`Clear ${field.name} filter`}
                className="text-grape-400 hover:text-grape-700 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
      </div>

      {/* Popover */}
      {open && (
        <>
          {/* click-away backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 mt-2 z-20 w-72 max-h-96 overflow-y-auto bg-white border border-grape-200 rounded-xl shadow-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-grape-700 text-[13px] font-semibold">
                Filters
              </p>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-grape-500 hover:text-grape-700 text-[12px] font-semibold"
                >
                  Clear all
                </button>
              )}
            </div>

            {filterableFields.length === 0 ? (
              <p className="text-grape-400 text-[13px]">
                No filterable fields in this tracker.
              </p>
            ) : (
              filterableFields.map((field) => (
                <FieldControl
                  key={field.id}
                  field={field}
                  value={filters[field.id]}
                  onChange={(f) => setFieldFilter(field.id, f)}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-type filter controls. Each renders the right widget and reports a
// FieldFilter (or undefined to clear). Dispatched by filterableKind.
// ---------------------------------------------------------------------------

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: FieldFilter | undefined;
  onChange: (f: FieldFilter | undefined) => void;
}) {
  const kind = filterableKind(field.type);

  return (
    <div>
      <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-1">
        {field.name}
      </p>
      {kind === 'anyOf' && (
        <AnyOfControl field={field} value={value} onChange={onChange} />
      )}
      {kind === 'bool' && <BoolControl value={value} onChange={onChange} />}
      {kind === 'range' && <RangeControl value={value} onChange={onChange} />}
      {kind === 'text' && <TextControl value={value} onChange={onChange} />}
      {kind === 'dateRange' && (
        <DateRangeControl value={value} onChange={onChange} />
      )}
    </div>
  );
}

function AnyOfControl({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: FieldFilter | undefined;
  onChange: (f: FieldFilter | undefined) => void;
}) {
  // select fields define options in config.options. list fields are free-form,
  // so there's no fixed option set — fall back to a text-style note.
  const options =
    (field.config as { options?: string[] }).options ?? undefined;
  const selected = value?.kind === 'anyOf' ? value.values : [];

  if (!options) {
    return (
      <p className="text-grape-400 text-[12px]">
        Free-form list — filter by typing not yet supported here.
      </p>
    );
  }

  function toggle(opt: string) {
    const next = selected.includes(opt)
      ? selected.filter((v) => v !== opt)
      : [...selected, opt];
    onChange({ kind: 'anyOf', values: next });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`rounded-full px-2.5 py-1 text-[12px] border transition-colors ${
              on
                ? 'bg-grape-500 text-white border-grape-500'
                : 'bg-white text-grape-600 border-grape-200 hover:border-grape-300'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function BoolControl({
  value,
  onChange,
}: {
  value: FieldFilter | undefined;
  onChange: (f: FieldFilter | undefined) => void;
}) {
  // Tri-state: Any / Checked / Unchecked
  const current =
    value?.kind === 'bool' ? (value.value ? 'checked' : 'unchecked') : 'any';
  const opts: { key: string; label: string }[] = [
    { key: 'any', label: 'Any' },
    { key: 'checked', label: 'Checked' },
    { key: 'unchecked', label: 'Unchecked' },
  ];
  return (
    <div className="inline-flex rounded-lg border border-grape-200 overflow-hidden">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() =>
            onChange(
              o.key === 'any'
                ? undefined
                : { kind: 'bool', value: o.key === 'checked' },
            )
          }
          className={`px-2.5 py-1 text-[12px] font-semibold transition-colors ${
            current === o.key
              ? 'bg-grape-500 text-white'
              : 'bg-white text-grape-600 hover:bg-grape-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RangeControl({
  value,
  onChange,
}: {
  value: FieldFilter | undefined;
  onChange: (f: FieldFilter | undefined) => void;
}) {
  const r = value?.kind === 'range' ? value : { min: undefined, max: undefined };
  function update(patch: { min?: number; max?: number }) {
    const next = { kind: 'range' as const, ...r, ...patch };
    onChange(next);
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        placeholder="Min"
        value={r.min ?? ''}
        onChange={(e) =>
          update({ min: e.target.value === '' ? undefined : Number(e.target.value) })
        }
        className="w-20 bg-grape-50 text-[13px] rounded-md px-2 py-1 focus:outline-none"
      />
      <span className="text-grape-400 text-[12px]">to</span>
      <input
        type="number"
        placeholder="Max"
        value={r.max ?? ''}
        onChange={(e) =>
          update({ max: e.target.value === '' ? undefined : Number(e.target.value) })
        }
        className="w-20 bg-grape-50 text-[13px] rounded-md px-2 py-1 focus:outline-none"
      />
    </div>
  );
}

function TextControl({
  value,
  onChange,
}: {
  value: FieldFilter | undefined;
  onChange: (f: FieldFilter | undefined) => void;
}) {
  const q = value?.kind === 'text' ? value.query : '';
  return (
    <input
      type="text"
      placeholder="Contains…"
      value={q}
      onChange={(e) => onChange({ kind: 'text', query: e.target.value })}
      className="w-full bg-grape-50 text-[13px] rounded-md px-2 py-1 focus:outline-none"
    />
  );
}

function DateRangeControl({
  value,
  onChange,
}: {
  value: FieldFilter | undefined;
  onChange: (f: FieldFilter | undefined) => void;
}) {
  const r =
    value?.kind === 'dateRange'
      ? value
      : { after: undefined, before: undefined };
  const toInput = (t?: number) =>
    t == null ? '' : new Date(t).toISOString().slice(0, 10);
  const fromInput = (s: string) => (s === '' ? undefined : Date.parse(s));
  function update(patch: { after?: number; before?: number }) {
    onChange({ kind: 'dateRange', ...r, ...patch });
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={toInput(r.after)}
        onChange={(e) => update({ after: fromInput(e.target.value) })}
        className="bg-grape-50 text-[13px] rounded-md px-2 py-1 focus:outline-none"
      />
      <span className="text-grape-400 text-[12px]">to</span>
      <input
        type="date"
        value={toInput(r.before)}
        onChange={(e) => update({ before: fromInput(e.target.value) })}
        className="bg-grape-50 text-[13px] rounded-md px-2 py-1 focus:outline-none"
      />
    </div>
  );
}
