import type { FieldTypeDef } from '../types';
import { COLOR_THEMES, getColorTheme } from '@/ui/colors';

interface SelectConfig {
  options: string[];
  // Sparse per-option color overrides: option label -> color key.
  optionColors?: Record<string, string>;
}

// De-duplicate options defensively so repeated labels can't produce duplicate
// React keys (the source data should already be de-duped, but this guards the
// render path regardless).
function uniqueOptions(options: string[]): string[] {
  return Array.from(new Set(options));
}

// Theme for an option's override, or null if it has none. (Input/Display don't
// know the tracker accent, so an un-overridden option renders neutral here; the
// inline chip elsewhere applies the accent fallback.)
function overrideTheme(config: SelectConfig, opt: string) {
  const key = config.optionColors?.[opt];
  if (key && COLOR_THEMES[key]) return getColorTheme(key);
  return null;
}

function SelectInput({
  value,
  onChange,
  config,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  config: SelectConfig;
}) {
  const options = uniqueOptions(config.options ?? []);

  if (options.length === 0) {
    return (
      <p className="text-grape-300 text-[13px] py-2 italic">
        No options configured for this field yet.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 py-1">
      {options.map((opt) => {
        const selected = value === opt;
        const theme = overrideTheme(config, opt);
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(selected ? null : opt)}
            className={`text-[13px] font-medium rounded-full px-3 py-1 transition-colors ${
              selected
                ? theme
                  ? `${theme.tileBg} ${theme.tileFg}`
                  : 'bg-grape-500 text-white'
                : 'bg-white border border-grape-200 hover:border-grape-300 hover:bg-grape-50 text-grape-700'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function SelectDisplay({
  value,
  config,
}: {
  value: string | null;
  config: SelectConfig;
}) {
  // Treat values not in the current options as empty — happens when an option
  // was removed after entries were already logged against it.
  const orphan = value != null && !(config.options ?? []).includes(value);
  if (!value || orphan)
    return <em className="text-grape-300 text-[15px]">none</em>;

  const theme = overrideTheme(config, value);
  return (
    <span
      className={`inline-block text-[13px] font-medium rounded-full px-2.5 py-0.5 ${
        theme
          ? `${theme.tileBg} ${theme.tileFg}`
          : 'bg-grape-100 text-grape-800'
      }`}
    >
      {value}
    </span>
  );
}

export const selectField: FieldTypeDef<SelectConfig, string> = {
  id: 'select',
  label: 'Select',
  icon: 'CircleDot',
  defaultConfig: { options: [] },
  defaultValue: null,
  validate: (value, config) => {
    if (value == null) return null;
    if (typeof value !== 'string') return 'Invalid selection';
    if (config.options.length > 0 && !config.options.includes(value)) {
      return `"${value}" is not a valid option`;
    }
    return null;
  },
  isEmpty: (value, config) => {
    if (value == null || value === '') return true;
    return !(config.options ?? []).includes(value);
  },
  Input: SelectInput as any,
  Display: SelectDisplay as any,
};
