import { Bold, Italic } from 'lucide-react';
import {
  TEXT_SIZES,
  textStyleClass,
  type TextSize,
  type TextStyle,
} from '@/core/textStyle';
import { ALL_COLORS, COLOR_THEMES } from '../colors';

interface Props {
  style: TextStyle;
  onChange: (next: TextStyle) => void;
  /** Shown in the preview, so it reads like the real thing. */
  sample: string;
}

/** Size, bold, italic and colour for a text field, with a live preview. */
export default function TextStyleEditor({ style, onChange, sample }: Props) {
  const toggle = (on: boolean) =>
    `p-1 rounded-md transition-colors ${
      on
        ? 'bg-grape-500 text-white'
        : 'bg-grape-50 text-grape-600 hover:bg-grape-100'
    }`;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide">
          Style
        </label>
        <select
          value={style.size ?? 'md'}
          onChange={(e) =>
            onChange({ ...style, size: e.target.value as TextSize })
          }
          aria-label="Text size"
          className="bg-grape-50 text-grape-700 text-[12px] font-semibold rounded-md px-2 py-1 border-0 focus:outline-none cursor-pointer"
        >
          {TEXT_SIZES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange({ ...style, bold: !style.bold })}
          aria-label="Bold"
          aria-pressed={!!style.bold}
          className={toggle(!!style.bold)}
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...style, italic: !style.italic })}
          aria-label="Italic"
          aria-pressed={!!style.italic}
          className={toggle(!!style.italic)}
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ ...style, color: undefined })}
            aria-label="Text colour: default"
            className={`w-5 h-5 rounded-full border-2 bg-white transition-all ${
              !style.color
                ? 'border-grape-600 scale-110'
                : 'border-grape-200 hover:scale-110'
            }`}
          />
          {ALL_COLORS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ ...style, color: key })}
              aria-label={`Text colour: ${COLOR_THEMES[key].label}`}
              className={`w-5 h-5 rounded-full transition-all ${
                style.color === key
                  ? 'ring-2 ring-offset-1 ring-grape-600 scale-110'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: COLOR_THEMES[key].swatch }}
            />
          ))}
        </div>
      </div>
      <p className={`mt-1.5 truncate ${textStyleClass(style)}`}>{sample}</p>
    </div>
  );
}
