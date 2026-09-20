// Per-option colors for select fields, stored as a sparse map of manual
// overrides: config.optionColors = { [optionLabel]: colorKey }.
//
// An option missing from that map has no explicit color and falls back to the
// tracker's accent at render time, so "default" is never stored. Nothing is
// auto-assigned; an option stays the accent until someone picks a color.

import { COLOR_THEMES, getColorTheme } from '@/ui/colors';

export interface SelectConfig {
  options?: string[];
  optionColors?: Record<string, string>;
}

/**
 * The manual override for an option if there is a valid one, else the fallback
 * passed in (the tracker's accent).
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

/** Full theme for an option, with the tracker's accent as the fallback. */
export function getOptionTheme(
  config: SelectConfig,
  option: string,
  fallbackColorKey: string,
) {
  return getColorTheme(getOptionColorKey(config, option, fallbackColorKey));
}

/**
 * Drop overrides for options that no longer exist, so the map doesn't collect
 * stale keys. Assigns nothing new: options without an override stay absent and
 * render as the accent.
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
