import type { FieldTypeDef } from '../types';

interface SelectConfig {
  options: string[];
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
  const options = config.options ?? [];

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
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(selected ? null : opt)}
            className={
              selected
                ? 'bg-grape-500 text-white text-[13px] font-medium rounded-full px-3 py-1 transition-colors'
                : 'bg-white border border-grape-200 hover:border-grape-300 hover:bg-grape-50 text-grape-700 text-[13px] font-medium rounded-full px-3 py-1 transition-colors'
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function SelectDisplay({ value }: { value: string | null }) {
  if (!value) return <em className="text-grape-300 text-[15px]">none</em>;
  return (
    <span className="inline-block bg-grape-100 text-grape-800 text-[13px] font-medium rounded-full px-2.5 py-0.5">
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
  Input: SelectInput as any,
  Display: SelectDisplay as any,
};