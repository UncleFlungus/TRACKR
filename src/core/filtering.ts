// src/core/filtering.ts
//
// Filter model for tracker entries. One active constraint per field, keyed by
// field id. A field absent from FilterState means "not filtering on it." An
// entry is shown only if it passes EVERY active filter (AND across fields);
// within a multi-value filter the test is OR (any-of).
//
// Pure logic only — no React. matchesFilter is unit-testable in isolation.

import type { Field, FieldTypeId } from './types';

export type FieldFilter =
  | { kind: 'anyOf'; values: string[] } // select, list
  | { kind: 'bool'; value: boolean } // checkmark
  | { kind: 'range'; min?: number; max?: number } // number, currency, duration
  | { kind: 'dateRange'; after?: number; before?: number } // time
  | { kind: 'text'; query: string }; // text, longtext, link

export type FilterState = Record<string, FieldFilter>;

// Which filter kind (if any) a field type uses. null = not filterable.
// NOTE: verify these FieldTypeId strings match your actual union in types.ts.
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

// Pull a searchable string out of a value for the 'text' kind. The link field
// stores { url, title } (or a legacy bare string), so handle both.
function valueToSearchText(type: FieldTypeId, value: unknown): string {
  if (value == null) return '';
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
 * Does a single entry value satisfy a single field's filter?
 * `value` is entry.values[field.id], which may be undefined for entries
 * created before the field existed.
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
      // Missing/unset checkmark is treated as false, so "unchecked" matches
      // entries that never set it.
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
      const hay = valueToSearchText(field.type, value).toLowerCase();
      return hay.includes(filter.query.trim().toLowerCase());
    }

    default:
      return true;
  }
}

/**
 * Apply the whole FilterState to one entry's values map.
 * `fieldsById` lets us look up each field's type for the matcher.
 */
export function entryPasses(
  values: Record<string, unknown>,
  filters: FilterState,
  fieldsById: Map<string, Field>,
): boolean {
  return Object.entries(filters).every(([fieldId, filter]) => {
    const field = fieldsById.get(fieldId);
    if (!field) return true; // filter on a deleted field → ignore it
    return matchesFilter(field, filter, values?.[fieldId]);
  });
}

// True if a filter holds an actual constraint (vs. an empty/cleared one).
// Used to decide whether to show an active chip / count.
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

// Short human summary for the active-filter chip, e.g. "Clothes, Art" or "≥ 10".
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
