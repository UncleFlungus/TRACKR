import type { Entry, Field } from './types';

/**
 * Returns true if a field is an eligible source for an entry's calendar date.
 * Only time fields with a date-bearing display mode qualify — a "time-only"
 * field doesn't carry meaningful date info.
 *
 * Includes legacy time fields (which had no `display` key and used
 * `includeDate: boolean` instead) so old data keeps working.
 */
function isCalendarDateField(field: Field): boolean {
  if (field.type !== 'time') return false;
  const cfg = field.config as { display?: string; includeDate?: boolean };
  if (cfg.display) return cfg.display === 'date' || cfg.display === 'datetime';
  // Legacy fallback: missing `display`, look at the old `includeDate` flag.
  // Default to true since old fields without either key were datetime.
  return cfg.includeDate !== false;
}

/**
 * Returns the field ID that drives entry placement on the calendar, or null
 * if the tracker has no eligible field (in which case createdAt is used).
 *
 * Ties broken by field.order (first eligible field wins).
 */
export function getDateFieldId(fields: Field[]): string | null {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  for (const f of sorted) {
    if (isCalendarDateField(f)) return f.id;
  }
  return null;
}

/**
 * Returns the effective date for an entry — i.e. the day it should appear on
 * in calendar / date-grouped views.
 *
 * Fallback ladder:
 * 1. Value of the first calendar-eligible time field, if non-null
 * 2. entry.createdAt
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
 * Local-time "yyyy-mm-dd" string used to group entries into calendar cells.
 * Crucially uses local-time, not UTC — we render the calendar in the user's
 * timezone, not the server's.
 */
export function toDayKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Cheap chip text for calendar cells. Tries to find something readable
 * without dragging in field-type Display components (which bring their own
 * JSX). Falls back to "Entry" for trackers with no obvious string content.
 */
export function getEntryChipText(entry: Entry, fields: Field[]): string {
  const sorted = [...fields].sort((a, b) => a.order - b.order);

  // Prefer text/longtext fields with a non-empty string.
  for (const f of sorted) {
    if (f.type !== 'text' && f.type !== 'longtext') continue;
    const v = entry.values[f.id];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // Then numbers/currency — bare value, no unit formatting.
  for (const f of sorted) {
    if (f.type !== 'number' && f.type !== 'currency') continue;
    const v = entry.values[f.id];
    if (typeof v === 'number') return String(v);
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
