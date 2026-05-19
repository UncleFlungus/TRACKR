import type { FieldTypeDef } from '../types';

interface CurrencyConfig {
  symbol: string;    // '$', '€', '¥', etc.
  decimals: number;  // typically 2
}

/**
 * Stores values as plain numbers (e.g. 99.99), NOT strings ('$99.99').
 * The symbol is rendered inside the input on the left as a non-editable
 * affordance. This is what lets you sort and sum prices later.
 */
export const currencyField: FieldTypeDef<CurrencyConfig, number> = {
  id: 'currency',
  label: 'Currency',
  icon: 'DollarSign',
  defaultConfig: { symbol: '$', decimals: 2 },
  defaultValue: null,
  validate: (value) => {
    if (value == null) return null;
    if (typeof value !== 'number' || Number.isNaN(value)) return 'Must be a number';
    if (value < 0) return 'Must be positive';
    return null;
  },
  Input: ({ value, onChange, config, autoFocus, placeholder }) => (
    <div className="flex items-center w-full">
      <span className="text-grape-400 text-[15px] pr-1 select-none">{config.symbol}</span>
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
        placeholder={placeholder ?? '0.00'}
        step={Math.pow(10, -config.decimals).toString()}
        className="flex-1 bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 tabular-nums focus:outline-none"
      />
    </div>
  ),
  Display: ({ value, config }) => {
    if (value == null) return <em className="text-grape-300 text-[15px]">empty</em>;
    return (
      <span className="text-grape-800 text-[15px] tabular-nums">
        {config.symbol}{value.toFixed(config.decimals)}
      </span>
    );
  },
};
