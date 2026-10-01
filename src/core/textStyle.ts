// Per-field text styling for text and longtext fields, stored as
// config.style. It applies to every entry's value for that field, so a Title
// field can be large and bold across all cards without styling each one.

export type TextSize = 'sm' | 'md' | 'lg' | 'xl';

export interface TextStyle {
  size?: TextSize;
  bold?: boolean;
  italic?: boolean;
  /** A COLOR_THEMES key, or unset for the default text color. */
  color?: string;
}

export const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Normal' },
  { id: 'lg', label: 'Large' },
  { id: 'xl', label: 'Extra large' },
];

// Full class names, so Tailwind's scanner finds them.
const SIZE_CLASS: Record<TextSize, string> = {
  sm: 'text-[13px]',
  md: 'text-[15px]',
  lg: 'text-[18px] leading-snug',
  xl: 'text-[22px] leading-tight',
};

export const TEXT_COLOR_CLASS: Record<string, string> = {
  grape: 'text-grape-600',
  sky: 'text-sky-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  rose: 'text-rose-700',
  slate: 'text-slate-700',
};

/** Tolerates a missing or malformed config.style, since config is free-form JSON. */
export function readTextStyle(config: unknown): TextStyle {
  const raw = (config as { style?: unknown } | null)?.style;
  if (!raw || typeof raw !== 'object') return {};
  const s = raw as Record<string, unknown>;
  return {
    size: TEXT_SIZES.some((t) => t.id === s.size)
      ? (s.size as TextSize)
      : undefined,
    bold: s.bold === true,
    italic: s.italic === true,
    color:
      typeof s.color === 'string' && s.color in TEXT_COLOR_CLASS
        ? s.color
        : undefined,
  };
}

export function textStyleClass(style: TextStyle): string {
  return [
    SIZE_CLASS[style.size ?? 'md'],
    style.color ? TEXT_COLOR_CLASS[style.color] : 'text-grape-800',
    style.bold ? 'font-semibold' : '',
    style.italic ? 'italic' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
