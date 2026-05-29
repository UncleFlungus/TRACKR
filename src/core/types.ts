// The shape of every field-type plugin.
// Add a new field type by creating a file in /core/fields and exporting one of these.
import type { ComponentType } from "react";

export type FieldTypeId =
  | "text"
  | "longtext"
  | "number"
  | "currency"
  | "time"
  | "duration"
  | "list"
  | "picture"
  | "select"
  | "link";
// extend the union when you add a new field type

export interface Tracker {
  id: string;
  name: string;
  icon: string; // lucide icon name
  color: string; // tailwind color key, e.g. 'grape'
  createdAt: number;
}

export interface Field {
  id: string;
  trackerId: string;
  name: string;
  type: FieldTypeId;
  config: Record<string, unknown>; // type-specific config
  defaultValue: unknown;
  order: number;
}

export interface Entry {
  id: string;
  trackerId: string;
  createdAt: number;
  // map of fieldId -> value. Storing as JSON keeps the schema flexible
  // without an EAV mess. If you later need cross-tracker queries on a
  // specific field value, add a denormalized table or move to Postgres.
  values: Record<string, unknown>;
}

// ---- Field type plugin contract ----

export interface FieldInputProps<
  TConfig = Record<string, unknown>,
  TValue = unknown,
> {
  value: TValue | null;
  onChange: (next: TValue | null) => void;
  config: TConfig;
  autoFocus?: boolean;
  placeholder?: string;
  // Optional context — available when the input is rendered inside a
  // known tracker. Field types can use these for things like
  // autocomplete from past entries. Most types can ignore them.
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
  label: string; // shown in the "add field" picker
  icon: string; // lucide icon name
  defaultConfig: TConfig;
  defaultValue: TValue | null;
  /**
   * Optional: compute the default value at entry-creation time instead of
   * using the static defaultValue. Used for things like "auto-set to now"
   * or "copy last entered value." Called when the new-entry form opens.
   */
  computeDefault?: (config: TConfig) => TValue | null;
  /** Returns an error message or null if the value is valid for this config. */
  validate: (value: TValue | null, config: TConfig) => string | null;
  Input: ComponentType<FieldInputProps<TConfig, TValue>>;
  Display: ComponentType<FieldDisplayProps<TConfig, TValue>>;
}
