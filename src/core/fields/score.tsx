import type { FieldTypeDef } from '../types';
import type { OutOfConfig } from './outOf';
import { DEFAULT_MAX, formatOutOf, resolveMax } from './outOf';

/**
 * Score out of a configurable max. Stored as a plain number (the score
 * itself, e.g. 7), NOT a string like "7/10" — so it stays sortable,
 * filterable by range, and averageable. The max lives in config, which
 * means changing it later re-renders every past entry against the new
 * denominator without touching entry data.
 */
export const scoreField: FieldTypeDef<OutOfConfig, number> = {
  id: 'score',
  label: 'Score',
  icon: 'Star',
  defaultConfig: { max: DEFAULT_MAX },
  defaultValue: null,
  validate: (value, config) => {
    if (value == null) return null;
    if (typeof value !== 'number' || Number.isNaN(value))
      return 'Must be a number';
    if (value < 0) return 'Must be at least 0';
    const max = resolveMax(config);
    if (value > max) return `Must be at most ${max}`;
    return null;
  },
  Input: ({ value, onChange, config, autoFocus, placeholder }) => {
    const max = resolveMax(config);

    // Small integer maxes get tap-to-pick pills (the common 0–5 / 0–10 case);
    // anything larger falls back to typing a number.
    if (Number.isInteger(max) && max <= 10) {
      const steps = Array.from({ length: max + 1 }, (_, i) => i);
      return (
        <div className="flex flex-wrap items-center gap-1.5 py-1">
          {steps.map((n) => {
            const selected = value === n;
            return (
              <button
                type="button"
                key={n}
                onClick={() => onChange(selected ? null : n)}
                className={`text-[13px] font-medium tabular-nums rounded-full min-w-8 px-2.5 py-1 transition-colors ${
                  selected
                    ? 'bg-grape-500 text-white'
                    : 'bg-white border border-grape-200 hover:border-grape-300 hover:bg-grape-50 text-grape-700'
                }`}
              >
                {n}
              </button>
            );
          })}
          <span className="text-grape-400 text-[13px] select-none ml-0.5">
            / {max}
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1 w-full">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step="any"
          value={value ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(null);
            const parsed = Number(raw);
            onChange(Number.isNaN(parsed) ? null : parsed);
          }}
          autoFocus={autoFocus}
          placeholder={placeholder ?? '0'}
          className="flex-1 bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 tabular-nums focus:outline-none"
        />
        <span className="text-grape-400 text-[14px] select-none">/ {max}</span>
      </div>
    );
  },
  Display: ({ value, config }) => {
    if (value == null) return <em className="text-grape-300 text-[15px]">—</em>;
    const max = resolveMax(config);
    return (
      <span className="text-grape-900 text-[15px] tabular-nums">
        {formatOutOf(value)}
        <span className="text-grape-400">/{formatOutOf(max)}</span>
      </span>
    );
  },
};
