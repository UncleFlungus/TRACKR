import { Check, Minus, Plus } from 'lucide-react';
import type { FieldTypeDef } from '../types';
import type { OutOfConfig } from './outOf';
import {
  DEFAULT_MAX,
  formatOutOf,
  isComplete,
  resolveMax,
} from './outOf';

/**
 * A running count toward a target, e.g. reps in a set: "7/10".
 *
 * Stored like `score` (a plain number, denominator in config.max) but used
 * differently. A score is a verdict recorded once; a count is ticked up over
 * the life of the entry, so its Input is a minus/plus stepper and it shows a
 * checkmark at the max. Hence the default of 0 rather than null: a fresh entry
 * shows "0/10" with buttons ready.
 *
 * Values clamp to [0, max]. Overshooting isn't representable; raise the max
 * instead, and past entries re-render against it.
 */
export const countField: FieldTypeDef<OutOfConfig, number> = {
  id: 'count',
  label: 'Count',
  icon: 'Repeat',
  defaultConfig: { max: DEFAULT_MAX },
  defaultValue: 0,
  validate: (value, config) => {
    if (value == null) return null;
    if (typeof value !== 'number' || Number.isNaN(value))
      return 'Must be a number';
    if (value < 0) return 'Must be at least 0';
    const max = resolveMax(config);
    if (value > max) return `Must be at most ${max}`;
    return null;
  },
  Input: ({ value, onChange, config, autoFocus }) => {
    const max = resolveMax(config);
    const current = value ?? 0;
    const done = isComplete(current, max);
    const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;

    const step = (delta: number) =>
      onChange(Math.min(max, Math.max(0, current + delta)));

    return (
      <div className="py-1.5">
        <div className="flex items-center gap-2">
          <StepButton
            label="Decrease"
            disabled={current <= 0}
            onClick={() => step(-1)}
          >
            <Minus className="w-4 h-4" strokeWidth={3} />
          </StepButton>

          <div className="flex items-baseline gap-0.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={max}
              step="any"
              value={current}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') return onChange(0);
                const parsed = Number(raw);
                if (Number.isNaN(parsed)) return;
                onChange(Math.min(max, Math.max(0, parsed)));
              }}
              autoFocus={autoFocus}
              aria-label="Count"
              className="w-12 bg-transparent text-grape-900 text-[17px] font-semibold tabular-nums text-center py-1 focus:outline-none focus:bg-grape-50 rounded-md"
            />
            <span className="text-grape-400 text-[15px] tabular-nums select-none">
              /{formatOutOf(max)}
            </span>
          </div>

          <StepButton
            label="Increase"
            disabled={current >= max}
            onClick={() => step(1)}
          >
            <Plus className="w-4 h-4" strokeWidth={3} />
          </StepButton>

          {done && (
            <span className="inline-flex items-center gap-1 text-grape-600 text-[13px] font-semibold ml-0.5">
              <span className="w-4 h-4 rounded bg-grape-500 text-white flex items-center justify-center">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              Complete
            </span>
          )}
        </div>

        <div className="mt-2 h-1.5 w-full max-w-56 bg-grape-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-grape-500 rounded-full transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  },
  Display: ({ value, config }) => <CountDisplay value={value} config={config} />,
};

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-8 h-8 rounded-full flex items-center justify-center bg-white border border-grape-200 text-grape-600 hover:border-grape-300 hover:bg-grape-50 disabled:opacity-30 disabled:hover:bg-white disabled:hover:border-grape-200 transition-colors"
    >
      {children}
    </button>
  );
}

/**
 * Read-only "7/10", with a checkmark once complete. Exported so the inline
 * stepper in rows and cards renders the same thing next to its buttons.
 */
export function CountDisplay({
  value,
  config,
}: {
  value: number | null;
  config: OutOfConfig;
}) {
  if (value == null) return <em className="text-grape-300 text-[15px]">—</em>;
  const max = resolveMax(config);
  const done = isComplete(value, max);
  return (
    <span className="inline-flex items-center gap-1.5 text-[15px] tabular-nums">
      {done && (
        <span className="w-4 h-4 rounded bg-grape-500 text-white flex items-center justify-center shrink-0">
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      )}
      <span className={done ? 'text-grape-700 font-semibold' : 'text-grape-900'}>
        {formatOutOf(value)}
        <span className="text-grape-400 font-normal">/{formatOutOf(max)}</span>
      </span>
    </span>
  );
}
