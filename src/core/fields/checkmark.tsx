import { Check } from 'lucide-react';
import type { FieldTypeDef } from '../types';

interface CheckmarkConfig {}

/**
 * Checkbox field stored as a boolean. Useful for to-do lists,
 * "completed?" markers, yes/no flags, etc.
 *
 * Note on emptiness: unlike most types, `false` is considered a meaningful
 * value here ("not done yet"), not empty. The override on isEmpty keeps
 * unchecked checkmarks visible in entry rows so the user can tick them
 * off inline without entering edit mode.
 */
export const checkmarkField: FieldTypeDef<CheckmarkConfig, boolean> = {
  id: 'checkmark',
  label: 'Checkmark',
  icon: 'CheckSquare',
  defaultConfig: {},
  defaultValue: false,
  validate: (value) => {
    if (value == null) return null;
    if (typeof value !== 'boolean') return 'Must be a checkmark';
    return null;
  },
  // A checkmark always counts as "having a value" — false is meaningful.
  // Without this, unchecked tasks would disappear from the row view.
  isEmpty: () => false,
  Input: ({ value, onChange }) => (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex items-center gap-2 py-2 text-grape-700 hover:text-grape-900 transition-colors"
    >
      {value ? (
        <span className="w-5 h-5 rounded-md bg-grape-500 text-white flex items-center justify-center">
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </span>
      ) : (
        <span className="w-5 h-5 rounded-md border-2 border-grape-300 hover:border-grape-500 transition-colors" />
      )}
      <span className="text-[14px]">{value ? 'Done' : 'Not done'}</span>
    </button>
  ),
  Display: ({ value }) =>
    value ? (
      <span className="inline-flex items-center gap-1.5 text-grape-700 text-[14px]">
        <span className="w-4 h-4 rounded bg-grape-500 text-white flex items-center justify-center">
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
        Done
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-grape-400 text-[14px]">
        <span className="w-4 h-4 rounded border-2 border-grape-300" />
        Not done
      </span>
    ),
};