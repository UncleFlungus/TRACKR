// Filter model for tracker entries: one constraint per field, keyed by field
// id. A field absent from FilterState isn't being filtered on. An entry shows
// only if it passes every active filter, but within one multi-value filter the
// test is any-of.
//
// No React in here, so matchesFilter can be tested on its own.

import type { Field, FieldTypeId } from './types';
import { tableSearchText } from './fields/table';

export type FieldFilter =
  | { kind: 'anyOf'; values: string[] } // select, list
  | { kind: 'bool'; value: boolean } // checkmark
  | { kind: 'range'; min?: number; max?: number } // number, currency, duration, score, count
  | { kind: 'dateRange'; after?: number; before?: number } // time
  | { kind: 'text'; query: string }; // text, longtext, link

export type FilterState = Record<string, FieldFilter>;

// Which filter kind a field type uses, or null when it isn't filterable.
export function filterableKind(type: FieldTypeId): FieldFilter['kind'] | null {
  switch (type) {
    case 'select':
    case 'list':
      return 'anyOf';
    case 'checkmark':
      return 'bool';
    case 'number':
    case 'currency':
    case 'duration':
    case 'score':
    case 'count':
      return 'range';
    case 'time':
      return 'dateRange';
    case 'text':
    case 'longtext':
    case 'link':
      return 'text';
    default:
      return null;
  }
}

// Pull a searchable string out of a value for the 'text' kind. Link fields
// store { url, title } or a legacy bare string, so both shapes are handled.
//
// Table values are arrays of row objects, and String() on one gives
// "[object Object]", so callers pass the field config to get the cells
// flattened. Every other type ignores that argument.
export function valueToSearchText(
  type: FieldTypeId,
  value: unknown,
  config?: Record<string, unknown>,
): string {
  if (value == null) return '';
  if (type === 'table') {
    return tableSearchText(value, (config ?? {}) as never);
  }
  if (type === 'link') {
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      const v = value as { url?: string; title?: string };
      return `${v.title ?? ''} ${v.url ?? ''}`;
    }
    return '';
  }
  return String(value);
}

/**
 * Does one entry value satisfy one field's filter? `value` is
 * entry.values[field.id], undefined for entries logged before the field
 * existed.
 */
export function matchesFilter(
  field: Field,
  filter: FieldFilter,
  value: unknown,
): boolean {
  switch (filter.kind) {
    case 'anyOf': {
      if (filter.values.length === 0) return true; // empty = no constraint
      // select → single string; list → array of strings.
      if (Array.isArray(value)) {
        return value.some((v) => filter.values.includes(String(v)));
      }
      return value != null && filter.values.includes(String(value));
    }

    case 'bool': {
      // An unset checkmark counts as false, so "unchecked" also matches
      // entries that never touched it.
      const b = value === true;
      return b === filter.value;
    }

    case 'range': {
      if (value == null || value === '') return false;
      const n = Number(value);
      if (Number.isNaN(n)) return false;
      if (filter.min != null && n < filter.min) return false;
      if (filter.max != null && n > filter.max) return false;
      return true;
    }

    case 'dateRange': {
      if (value == null || value === '') return false;
      const t = typeof value === 'number' ? value : Date.parse(String(value));
      if (Number.isNaN(t)) return false;
      if (filter.after != null && t < filter.after) return false;
      if (filter.before != null && t > filter.before) return false;
      return true;
    }

    case 'text': {
      if (!filter.query.trim()) return true; // empty = no constraint
      const hay = valueToSearchText(
        field.type,
        value,
        field.config,
      ).toLowerCase();
      return hay.includes(filter.query.trim().toLowerCase());
    }

    default:
      return true;
  }
}

/** Apply the whole FilterState to one entry. */
export function entryPasses(
  values: Record<string, unknown>,
  filters: FilterState,
  fieldsById: Map<string, Field>,
): boolean {
  return Object.entries(filters).every(([fieldId, filter]) => {
    const field = fieldsById.get(fieldId);
    if (!field) return true; // filter on a deleted field: ignore it
    return matchesFilter(field, filter, values?.[fieldId]);
  });
}

// True if a filter holds a real constraint rather than a cleared one. Decides
// whether an active chip shows.
export function isActive(filter: FieldFilter): boolean {
  switch (filter.kind) {
    case 'anyOf':
      return filter.values.length > 0;
    case 'text':
      return filter.query.trim().length > 0;
    case 'range':
      return filter.min != null || filter.max != null;
    case 'dateRange':
      return filter.after != null || filter.before != null;
    case 'bool':
      return true; // a bool filter is always a real constraint when present
    default:
      return false;
  }
}

// Text for the active-filter chip, e.g. "Clothes, Art" or "≥ 10".
export function summarize(filter: FieldFilter): string {
  switch (filter.kind) {
    case 'anyOf':
      return filter.values.join(', ');
    case 'bool':
      return filter.value ? 'Checked' : 'Unchecked';
    case 'range': {
      if (filter.min != null && filter.max != null)
        return `${filter.min}–${filter.max}`;
      if (filter.min != null) return `≥ ${filter.min}`;
      if (filter.max != null) return `≤ ${filter.max}`;
      return '';
    }
    case 'dateRange': {
      const fmt = (t: number) => new Date(t).toLocaleDateString();
      if (filter.after != null && filter.before != null)
        return `${fmt(filter.after)}–${fmt(filter.before)}`;
      if (filter.after != null) return `after ${fmt(filter.after)}`;
      if (filter.before != null) return `before ${fmt(filter.before)}`;
      return '';
    }
    case 'text':
      return `"${filter.query}"`;
    default:
      return '';
  }
}
