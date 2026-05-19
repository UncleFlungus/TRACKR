import type { FieldTypeDef } from '../types';

interface NumberConfig {
  suffix?: string;   // e.g. "kg", "reps"
  decimals?: number; // default 0
  min?: number;
  max?: number;
}

export const numberField: FieldTypeDef<NumberConfig, number> = {
  id: 'number',
  label: 'Number',
  icon: 'Hash',
  defaultConfig: { decimals: 0 },
  defaultValue: null,
  validate: (value, config) => {
    if (value == null) return null;
    if (typeof value !== 'number' || Number.isNaN(value)) return 'Must be a number';
    if (config.min != null && value < config.min) return `Must be at least ${config.min}`;
    if (config.max != null && value > config.max) return `Must be at most ${config.max}`;
    return null;
  },
  Input: ({ value, onChange, config, autoFocus, placeholder }) => (
    <div className="flex items-center gap-1 w-full">
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          const parsed = Number(raw);
          onChange(Number.isNaN(parsed) ? null : parsed);
        }}
        autoFocus={autoFocus}
        placeholder={placeholder ?? '0'}
        step={config.decimals ? Math.pow(10, -config.decimals).toString() : '1'}
        className="flex-1 bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
      />
      {config.suffix && (
        <span className="text-grape-400 text-[14px] select-none">{config.suffix}</span>
      )}
    </div>
  ),
  Display: ({ value, config }) => {
    if (value == null) return <em className="text-grape-300 text-[15px]">empty</em>;
    const formatted = config.decimals != null ? value.toFixed(config.decimals) : value.toString();
    return (
      <span className="text-grape-800 text-[15px] tabular-nums">
        {formatted}{config.suffix ? ` ${config.suffix}` : ''}
      </span>
    );
  },
};
