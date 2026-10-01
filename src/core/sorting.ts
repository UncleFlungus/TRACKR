import { tableRows } from './fields/table';
import type { Entry, Field } from './types';

type SortKey = number | string | null;

/** A comparable key for one field value, or null when there is nothing to sort by. */
function sortKey(field: Field, value: unknown): SortKey {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'number':
    case 'currency':
    case 'score':
    case 'count':
    case 'time':
    case 'duration':
      return typeof value === 'number' ? value : null;
    case 'checkmark':
      return value ? 1 : 0;
    case 'list':
      return Array.isArray(value) && value.length > 0
        ? value.join(', ').toLowerCase()
        : null;
    case 'table': {
      const n = tableRows(value).length;
      return n > 0 ? n : null;
    }
    case 'link': {
      if (typeof value === 'string') return value.toLowerCase() || null;
      const v = value as { url?: string; title?: string };
      return (v.title || v.url || '').toLowerCase() || null;
    }
    default:
      return typeof value === 'string' && value !== ''
        ? value.toLowerCase()
        : null;
  }
}

/**
 * Sorts a copy of `entries` by one field. Empty values always go last, in
 * either direction, so flipping the sort doesn't bury the filled-in rows.
 */
export function sortEntries(
  entries: Entry[],
  field: Field,
  direction: 'asc' | 'desc',
): Entry[] {
  const sign = direction === 'asc' ? 1 : -1;
  const keyed = entries.map((e) => ({
    e,
    k: sortKey(field, e.values[field.id]),
  }));
  keyed.sort((a, b) => {
    if (a.k === null && b.k === null) return 0;
    if (a.k === null) return 1;
    if (b.k === null) return -1;
    if (typeof a.k === 'number' && typeof b.k === 'number')
      return (a.k - b.k) * sign;
    return (
      String(a.k).localeCompare(String(b.k), undefined, { numeric: true }) *
      sign
    );
  });
  return keyed.map((x) => x.e);
}
