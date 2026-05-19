import type { FieldTypeDef } from '../types';

interface LongtextConfig {
  placeholder?: string;
  rows?: number;
}

export const longtextField: FieldTypeDef<LongtextConfig, string> = {
  id: 'longtext',
  label: 'Long text',
  icon: 'AlignLeft',
  defaultConfig: { placeholder: '', rows: 2 },
  defaultValue: '',
  validate: () => null,
  Input: ({ value, onChange, config, autoFocus, placeholder }) => (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? config.placeholder ?? ''}
      autoFocus={autoFocus}
      rows={config.rows ?? 2}
      className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 resize-none focus:outline-none leading-snug"
    />
  ),
  Display: ({ value }) => {
    if (!value) return <em className="text-grape-300 text-[15px]">empty</em>;
    return <span className="text-grape-800 text-[15px] whitespace-pre-wrap">{value}</span>;
  },
};
