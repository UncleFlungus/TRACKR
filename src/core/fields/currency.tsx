import { NumericFormat } from 'react-number-format';
import type { FieldTypeDef } from '../types';

interface CurrencyConfig {
  symbol: string; // '$', '€', '¥', etc.
  decimals: number; // typically 2
}

/**
 * Values are plain numbers (99.99), not strings ('$99.99'), so prices stay
 * sortable and summable. react-number-format renders the symbol as a prefix
 * inside the input.
 */
export const currencyField: FieldTypeDef<CurrencyConfig, number> = {
  id: 'currency',
  label: 'Currency',
  icon: 'DollarSign',
  defaultConfig: { symbol: '$', decimals: 2 },
  defaultValue: null,
  validate: (value) => {
    if (value == null) return null;
    if (typeof value !== 'number' || Number.isNaN(value))
      return 'Must be a number';
    if (value < 0) return 'Must be positive';
    return null;
  },
  Input: ({ value, onChange, config, autoFocus, placeholder }) => (
    <NumericFormat
      // react-number-format wants a number or a numeric string; anything else
      // throws while parsing.
      value={typeof value === 'number' ? value : ''}
      onValueChange={(values) => onChange(values.floatValue ?? null)}
      prefix={config.symbol}
      decimalScale={config.decimals}
      fixedDecimalScale
      thousandSeparator=","
      allowNegative={false}
      placeholder={
        placeholder ?? `${config.symbol}0.${'0'.repeat(config.decimals)}`
      }
      autoFocus={autoFocus}
      inputMode="decimal"
      className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 tabular-nums focus:outline-none"
    />
  ),
  Display: ({ value, config }) => {
    // `== null` isn't enough. A field whose type changed, or odd imported
    // data, reaches the formatter and throws, taking the whole render with it
    // rather than one cell.
    if (typeof value !== 'number' || Number.isNaN(value))
      return <em className="text-grape-300 text-[15px]">—</em>;
    return (
      <span className="text-grape-900 text-[15px] tabular-nums">
        {config.symbol}
        {value.toFixed(config.decimals)}
      </span>
    );
  },
};
