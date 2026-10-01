import type { ComponentType } from 'react';
import type { CardLayout } from './cardLayout';

export type FieldTypeId =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'time'
  | 'duration'
  | 'list'
  | 'select'
  | 'link'
  | 'image'
  | 'checkmark'
  | 'score'
  | 'count'
  | 'table';

export interface Tracker {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: number;
  /** Per-tracker display preferences. Defaults to {} at storage time. */
  settings?: TrackerSettings;
  pinned?: boolean;
  pinnedAt?: number | null;
  /**
   * Cloud only; undefined while signed out, where everything is yours. Kept on
   * the tracker so ownership is known on first render: deriving it from the
   * member list instead flashes the wrong controls while that list loads.
   */
  ownerId?: string;
}

export interface TrackerSettings {
  /** If false, entry rows include fields with empty values. Default: undefined (= hide). */
  hideEmptyFields?: boolean;
  viewMode?: 'list' | 'grid' | 'table' | 'calendar';
  /** How grid and list cards arrange fields. Unset means one stack of every field. */
  cardLayout?: CardLayout;
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
 * A person's role on a tracker. Ownership isn't handed out by invitation, it
 * transfers (see the account_deletion_sharing migration).
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
 * An invitation addressed to an email, waiting to be claimed. Not resolved to a
 * user at invite time; the tracker_invites migration explains why.
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
  /**
   * Who logged this, cloud only. Null once the author deletes their account,
   * since the entry outlives them. Undefined offline, where there is only ever
   * one author.
   */
  authorId?: string | null;
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
   * Override the emptiness check. Gets the config as well as the value, for
   * types where "empty" depends on it: select treats values that are no longer
   * options as empty.
   */
  isEmpty?: (value: TValue | null, config: TConfig) => boolean;
}
