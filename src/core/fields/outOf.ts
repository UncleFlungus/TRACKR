// Shared helpers for "out of N" field types (score, count).
//
// Both store a plain number and keep the denominator in `config.max`, so they
// stay sortable, range-filterable and averageable, and changing the max later
// re-renders past entries without touching entry data. Everything they have in
// common lives here so the two can't drift apart.

import type { FieldTypeId } from '../types';

export interface OutOfConfig {
  /** Denominator, e.g. 10 for "7/10". */
  max: number;
}

export const DEFAULT_MAX = 10;

/** True for field types configured with an "Out of" max. */
export function hasMaxConfig(type: FieldTypeId): boolean {
  return type === 'score' || type === 'count';
}

/**
 * Resolve a usable max from config. Guards against fields saved before the
 * max was set, or a max that got cleared/corrupted to a non-positive number.
 */
export function resolveMax(config: OutOfConfig | undefined): number {
  const raw = config?.max;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_MAX;
  }
  return raw;
}

/**
 * Trim trailing zeros so 7 renders "7" and 7.5 renders "7.5" — but keep at
 * most one decimal, which is what averages need.
 */
export function formatOutOf(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Is this value at (or past) the max? Used to mark counts complete. */
export function isComplete(value: number | null, max: number): boolean {
  return value != null && value >= max;
}
