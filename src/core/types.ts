import type { ComponentType } from 'react';

export type FieldTypeId =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'time'
  | 'duration'
  | 'list'
  | 'picture'
  | 'select'
  | 'link'
  | 'checkmark';

export interface Tracker {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: number;
  /** Per-tracker UI/display preferences. Optional — defaults to {} at storage time. */
  settings?: TrackerSettings;
}

export interface TrackerSettings {
  /** If false, entry rows include fields with empty values. Default: undefined (= hide). */
  hideEmptyFields?: boolean;
}

export interface Field {
  id: string;
  trackerId: string;
  name: string;
  type: FieldTypeId;
  config: Record<string, unknown>;
  defaultValue: unknown;
  order: number;
}

export interface Entry {
  id: string;
  trackerId: string;
  createdAt: number;
  values: Record<string, unknown>;
}

export interface FieldInputProps<
  TConfig = Record<string, unknown>,
  TValue = unknown,
> {
  value: TValue | null;
  onChange: (next: TValue | null) => void;
  config: TConfig;
  autoFocus?: boolean;
  placeholder?: string;
  trackerId?: string;
  fieldId?: string;
}

export interface FieldDisplayProps<
  TConfig = Record<string, unknown>,
  TValue = unknown,
> {
  value: TValue | null;
  config: TConfig;
}

export interface FieldTypeDef<
  TConfig = Record<string, unknown>,
  TValue = unknown,
> {
  id: FieldTypeId;
  label: string;
  icon: string;
  defaultConfig: TConfig;
  defaultValue: TValue | null;
  computeDefault?: (config: TConfig) => TValue | null;
  validate: (value: TValue | null, config: TConfig) => string | null;
  Input: ComponentType<FieldInputProps<TConfig, TValue>>;
  Display: ComponentType<FieldDisplayProps<TConfig, TValue>>;
  /**
   * Optional override of the emptiness check. Receives both the value and
   * the field's current config — useful for types where "empty" depends on
   * config (e.g. select treats values not in the current options as empty).
   */
  isEmpty?: (value: TValue | null, config: TConfig) => boolean;
}
