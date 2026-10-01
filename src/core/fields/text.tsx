import type { FieldTypeDef } from '../types';
import { readTextStyle, textStyleClass, type TextStyle } from '../textStyle';

interface TextConfig {
  placeholder?: string;
  style?: TextStyle;
}

export const textField: FieldTypeDef<TextConfig, string> = {
  id: 'text',
  label: 'Text',
  icon: 'Type',
  defaultConfig: { placeholder: '' },
  defaultValue: '',
  validate: (value) => {
    // Permissive: empty is fine. Length limits could go in config later.
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
  Display: ({ value, config }) => (
    // Non-strings render as empty rather than reaching JSX, which throws on a
    // raw object and takes the whole render with it.
    <span className={textStyleClass(readTextStyle(config))}>
      {typeof value === 'string' && value ? (
        value
      ) : (
        <em className="text-grape-300">empty</em>
      )}
    </span>
  ),
};
