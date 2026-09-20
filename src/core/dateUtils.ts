import type { Entry, Field } from './types';
import { resolveMax } from './fields/outOf';

/**
 * Whether a field can supply an entry's calendar date. Only time fields with a
 * date-bearing display mode qualify; a time-only field carries no date.
 *
 * Legacy time fields had no `display` key and used `includeDate` instead, so
 * both shapes are accepted.
 */
function isCalendarDateField(field: Field): boolean {
  if (field.type !== 'time') return false;
  const cfg = field.config as { display?: string; includeDate?: boolean };
  if (cfg.display) return cfg.display === 'date' || cfg.display === 'datetime';
  // No `display`: fall back to the old `includeDate` flag. Fields with neither
  // key were datetime, hence the default of true.
  return cfg.includeDate !== false;
}

/**
 * The field that drives calendar placement, or null when the tracker has none
 * and createdAt is used instead. Ties go to the lowest field.order.
 */
export function getDateFieldId(fields: Field[]): string | null {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  for (const f of sorted) {
    if (isCalendarDateField(f)) return f.id;
  }
  return null;
}

/**
 * The day an entry should appear on in calendar and date-grouped views: the
 * first calendar-eligible time field if it has a value, else createdAt.
 */
export function getEntryDate(entry: Entry, fields: Field[]): Date {
  const dateFieldId = getDateFieldId(fields);
  if (dateFieldId) {
    const v = entry.values[dateFieldId];
    if (typeof v === 'number' && !Number.isNaN(v)) return new Date(v);
  }
  return new Date(entry.createdAt);
}

/**
 * The "yyyy-mm-dd" key entries are grouped by. Local time, not UTC: the
 * calendar is rendered in the user's timezone, not the server's.
 */
export function toDayKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Chip text for calendar cells. Picks something readable without pulling in
 * the field-type Display components and their JSX. Falls back to "Entry" when
 * the tracker has no obvious string content.
 */
export function getEntryChipText(entry: Entry, fields: Field[]): string {
  const sorted = [...fields].sort((a, b) => a.order - b.order);

  // Prefer text/longtext fields with a non-empty string.
  for (const f of sorted) {
    if (f.type !== 'text' && f.type !== 'longtext') continue;
    const v = entry.values[f.id];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // Then numbers/currency, bare value with no unit formatting.
  for (const f of sorted) {
    if (f.type !== 'number' && f.type !== 'currency') continue;
    const v = entry.values[f.id];
    if (typeof v === 'number') return String(v);
  }
  // Then scores/counts, denominator included so "7" doesn't read as a raw
  // count of something else.
  for (const f of sorted) {
    if (f.type !== 'score' && f.type !== 'count') continue;
    const v = entry.values[f.id];
    if (typeof v === 'number')
      return `${v}/${resolveMax(f.config as { max: number })}`;
  }
  // Then select values.
  for (const f of sorted) {
    if (f.type !== 'select') continue;
    const v = entry.values[f.id];
    if (typeof v === 'string') return v;
  }
  // Then list values.
  for (const f of sorted) {
    if (f.type !== 'list') continue;
    const v = entry.values[f.id];
    if (Array.isArray(v) && v.length > 0) return v.join(', ');
  }
  return 'Entry';
}
