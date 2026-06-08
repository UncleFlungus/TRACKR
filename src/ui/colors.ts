// Per-tracker accent colors. The user picks one in Edit tracker; we use it
// for the tracker tile background, icon foreground, header accent, etc.
//
// To add a new color: add an entry to COLOR_THEMES below. The keys here
// are stored in tracker.color (string) so they must remain stable —
// renaming breaks existing trackers.

export interface ColorTheme {
  /** Label shown in pickers. */
  label: string;
  /** Background of the tile/avatar circle on home + tracker page header. */
  tileBg: string;
  /** Foreground (icon) color on the tile. */
  tileFg: string;
  /** Raw CSS color value for swatches in the picker. */
  swatch: string;
}

export const COLOR_THEMES: Record<string, ColorTheme> = {
  grape: {
    label: 'Grape',
    tileBg: 'bg-grape-100',
    tileFg: 'text-grape-600',
    swatch: '#7b6ee0',
  },
  sky: {
    label: 'Sky',
    tileBg: 'bg-sky-100',
    tileFg: 'text-sky-600',
    swatch: '#4a8ae0',
  },
  emerald: {
    label: 'Emerald',
    tileBg: 'bg-emerald-100',
    tileFg: 'text-emerald-600',
    swatch: '#10b981',
  },
  amber: {
    label: 'Amber',
    tileBg: 'bg-amber-100',
    tileFg: 'text-amber-600',
    swatch: '#d97706',
  },
  rose: {
    label: 'Rose',
    tileBg: 'bg-rose-100',
    tileFg: 'text-rose-600',
    swatch: '#e11d48',
  },
  slate: {
    label: 'Slate',
    tileBg: 'bg-slate-100',
    tileFg: 'text-slate-600',
    swatch: '#475569',
  },
};

export function getColorTheme(color: string): ColorTheme {
  return COLOR_THEMES[color] ?? COLOR_THEMES.grape;
}

export const ALL_COLORS = Object.keys(COLOR_THEMES);
