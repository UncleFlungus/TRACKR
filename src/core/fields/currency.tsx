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
  Input: ({ value, onChange, config, autoFocus, placeholder }) => {
  const multiplier = Math.pow(10, config.decimals);

  // Convert the stored decimal value to a digit string for display.
  // e.g. 12.34 with 2 decimals → "1234", which we then format with a decimal point.
  const valueAsDigits = value == null ? '' : Math.round(value * multiplier).toString();

  const formatted =
    valueAsDigits === ''
      ? ''
      : (Number(valueAsDigits) / multiplier).toFixed(config.decimals);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Numeric keys 0-9: append to the digit string
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const nextDigits = (valueAsDigits + e.key).replace(/^0+(?=\d)/, ''); // strip leading zeros
      // Cap at a sensible max (e.g. 12 digits) to prevent absurd numbers
      if (nextDigits.length > 12) return;
      const nextValue = Number(nextDigits) / multiplier;
      onChange(nextValue);
      return;
    }

    // Backspace: remove the last digit
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (valueAsDigits === '') return;
      const nextDigits = valueAsDigits.slice(0, -1);
      if (nextDigits === '') return onChange(null);
      onChange(Number(nextDigits) / multiplier);
      return;
    }

    // Allow Tab, Enter, arrow keys, etc. — don't preventDefault
  }

  return (
    <div className="flex items-center w-full">
      <span className="text-grape-400 text-[15px] pr-1 select-none">{config.symbol}</span>
      <input
        type="text"
        inputMode="numeric"
        value={formatted}
        onKeyDown={handleKeyDown}
        onChange={() => {
          // All changes flow through onKeyDown above. This is a no-op handler,
          // but React requires it on controlled inputs.
        }}
        autoFocus={autoFocus}
        placeholder={placeholder ?? `0.${'0'.repeat(config.decimals)}`}
        className="flex-1 bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 tabular-nums focus:outline-none"
      />
    </div>
  );
},
Display: ({ value, config }) => {
    if (value == null) return <em className="text-grape-300 text-[15px]">empty</em>;
    return (
      <span className="text-grape-800 text-[15px] tabular-nums">
        {config.symbol}{value.toFixed(config.decimals)}
      </span>
    );
  },
};