// src/core/selectColors.ts
//
// Per-option colors for select fields, stored as a SPARSE map of manual
// overrides only: config.optionColors = { [optionLabel]: colorKey }.
//
// An option with no entry in that map has NO explicit color — it falls back to
// the tracker's accent color at render time. So "default" is not stored; it's
// computed from the tracker. There is no auto-assignment: options are the
// tracker accent until the user deliberately picks a color.

import { COLOR_THEMES, getColorTheme } from '@/ui/colors';

export interface SelectConfig {
  options?: string[];
  optionColors?: Record<string, string>;
}

/**
 * The color key for an option:
 *  - the manual override, if one exists and is valid, else
 *  - the fallback color key passed in (the tracker's accent).
 */
export function getOptionColorKey(
  config: SelectConfig,
  option: string,
  fallbackColorKey: string,
): string {
  const explicit = config.optionColors?.[option];
  if (explicit && COLOR_THEMES[explicit]) return explicit;
  return fallbackColorKey;
}

/**
 * Full theme (tileBg/tileFg/swatch/label) for an option, given the tracker's
 * accent color as the fallback.
 */
export function getOptionTheme(
  config: SelectConfig,
  option: string,
  fallbackColorKey: string,
) {
  return getColorTheme(getOptionColorKey(config, option, fallbackColorKey));
}

/**
 * Drop overrides for options that no longer exist. Called on save so the map
 * doesn't accumulate stale keys. Does NOT assign any new colors — options
 * without an override simply stay absent (and thus render as the accent).
 */
export function pruneOptionColors(
  options: string[],
  existing: Record<string, string> = {},
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const opt of options) {
    if (existing[opt] && COLOR_THEMES[existing[opt]]) next[opt] = existing[opt];
  }
  return next;
}
