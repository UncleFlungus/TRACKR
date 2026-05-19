// Static class strings so Tailwind's compiler can see every variant.
// To add a new color, add it here AND make sure the color is in index.css under @theme.
export const colorThemes = {
  grape: {
    tileBg: 'bg-grape-100',
    tileFg: 'text-grape-600',
  },
  sky: {
    tileBg: 'bg-sky-100',
    tileFg: 'text-sky-600',
  },
} as const;

export type ColorKey = keyof typeof colorThemes;

export function getColorTheme(key: string) {
  return colorThemes[key as ColorKey] ?? colorThemes.grape;
}
