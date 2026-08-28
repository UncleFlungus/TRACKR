import type { ComponentType } from 'react';

export type FieldTypeId =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'time'
  | 'duration'
  | 'list'
  //'picture'
  | 'select'
  | 'link'
  | 'checkmark'
  | 'score'
  | 'count';

export interface Tracker {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: number;
  /** Per-tracker UI/display preferences. Optional — defaults to {} at storage time. */
  settings?: TrackerSettings;
  pinned?: boolean;
  pinnedAt?: number | null;
  /**
   * Who owns this tracker (cloud only; undefined in the signed-out IndexedDB
   * world, where everything is yours). Present so ownership can be decided
   * from the tracker itself rather than waiting on the member list — the
   * difference between rendering the right controls immediately and flashing
   * the wrong ones.
   */
  ownerId?: string;
}

export interface TrackerSettings {
  /** If false, entry rows include fields with empty values. Default: undefined (= hide). */
  hideEmptyFields?: boolean;
  viewMode?: 'list' | 'grid' | 'calendar';
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

/**
 * A person's role on a tracker. Ownership is not handed out by invitation —
 * it transfers (see supabase/migrations/..._account_deletion_sharing.sql).
 */
export type TrackerRole = 'owner' | 'editor' | 'viewer';

/** Someone with access to a tracker. `email` is denormalised for the roster. */
export interface TrackerMember {
  trackerId: string;
  userId: string;
  role: TrackerRole;
  email: string | null;
  createdAt: number;
}

/**
 * An invitation addressed to an email, waiting to be claimed. Deliberately not
 * resolved to a user at invite time — see the migration for why.
 */
export interface TrackerInvite {
  id: string;
  trackerId: string;
  email: string;
  role: Exclude<TrackerRole, 'owner'>;
  createdAt: number;
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
