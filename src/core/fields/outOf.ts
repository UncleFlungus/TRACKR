// Shared helpers for the "out of N" field types, score and count.
//
// Both store a plain number with the denominator in `config.max`, which keeps
// them sortable, range-filterable and averageable, and lets a changed max
// re-render past entries without touching entry data. The common parts live
// here so the two can't drift.

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
 * A usable max from config, covering fields saved before the max was set and
 * maxes cleared to a non-positive number.
 */
export function resolveMax(config: OutOfConfig | undefined): number {
  const raw = config?.max;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_MAX;
  }
  return raw;
}

/**
 * Trim trailing zeros so 7 renders "7" and 7.5 renders "7.5", keeping at most
 * one decimal, which is what averages need.
 */
export function formatOutOf(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Is this value at (or past) the max? Used to mark counts complete. */
export function isComplete(value: number | null, max: number): boolean {
  return value != null && value >= max;
}
