import type { FieldTypeDef } from '../types';

interface TextConfig {
  placeholder?: string;
}

export const textField: FieldTypeDef<TextConfig, string> = {
  id: 'text',
  label: 'Text',
  icon: 'Type',
  defaultConfig: { placeholder: '' },
  defaultValue: '',
  validate: (value) => {
    // text is permissive — empty is fine. Add length limits in config later if needed.
    if (value != null && typeof value !== 'string') return 'Expected text';
    return null;
  },
  Input: ({ value, onChange, config, autoFocus, placeholder }) => (
    <input
      type="text"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? config.placeholder ?? ''}
      autoFocus={autoFocus}
      className="w-full bg-transparent text-grape-900 placeholder:text-grape-300 text-[15px] py-2 focus:outline-none"
    />
  ),
  Display: ({ value }) => (
    <span className="text-grape-800 text-[15px]">{value || <em className="text-grape-300">empty</em>}</span>
  ),
};
