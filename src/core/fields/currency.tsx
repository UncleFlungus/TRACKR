import { NumericFormat } from 'react-number-format';
import type { FieldTypeDef } from '../types';

interface CurrencyConfig {
  symbol: string; // '$', '€', '¥', etc.
  decimals: number; // typically 2
}

/**
 * Stores values as plain numbers (e.g. 99.99), NOT strings ('$99.99').
 * The symbol is rendered as a prefix inside the input by react-number-format.
 * This is what lets you sort and sum prices later.
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
      value={value ?? ''}
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
    if (value == null) return <em className="text-grape-300 text-[15px]">—</em>;
    return (
      <span className="text-grape-900 text-[15px] tabular-nums">
        {config.symbol}
        {value.toFixed(config.decimals)}
      </span>
    );
  },
};
