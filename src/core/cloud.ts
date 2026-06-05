import { supabase } from '@/lib/supabase';
import type {
  Entry,
  Field,
  FieldTypeId,
  Tracker,
  TrackerSettings,
} from './types';

// ============================================================
// Row types — match the Postgres schema exactly (snake_case)
// ============================================================

interface TrackerRow {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  settings: Record<string, unknown>;
  created_at: string; // ISO timestamp
}

interface FieldRow {
  id: string;
  user_id: string;
  tracker_id: string;
  name: string;
  type: FieldTypeId;
  config: Record<string, unknown>;
  default_value: unknown;
  order: number;
}

interface EntryRow {
  id: string;
  user_id: string;
  tracker_id: string;
  values: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// Mappers — convert between Postgres rows and app-level types.
// App types stay camelCase + epoch-millis to match Dexie schema,
// so callers don't know or care which backend the data came from.
// ============================================================

function rowToTracker(r: TrackerRow): Tracker {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    createdAt: new Date(r.created_at).getTime(),
    settings: (r.settings as TrackerSettings) ?? {},
  };
}

function rowToField(r: FieldRow): Field {
  return {
    id: r.id,
    trackerId: r.tracker_id,
    name: r.name,
    type: r.type,
    config: r.config,
    defaultValue: r.default_value,
    order: r.order,
  };
}

function rowToEntry(r: EntryRow): Entry {
  return {
    id: r.id,
    trackerId: r.tracker_id,
    values: r.values,
    createdAt: new Date(r.created_at).getTime(),
  };
}

// ============================================================
// Queries
// ============================================================

export async function fetchTrackers(): Promise<Tracker[]> {
  const { data, error } = await supabase
    .from('trackers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as TrackerRow[]).map(rowToTracker);
}

export async function fetchTracker(id: string): Promise<Tracker | undefined> {
  const { data, error } = await supabase
    .from('trackers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToTracker(data as TrackerRow) : undefined;
}

export async function fetchFields(trackerId: string): Promise<Field[]> {
  const { data, error } = await supabase
    .from('fields')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('order', { ascending: true });
  if (error) throw error;
  return (data as FieldRow[]).map(rowToField);
}

export async function fetchEntries(trackerId: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as EntryRow[]).map(rowToEntry);
}

// ============================================================
// Mutations — all require a userId to populate the user_id column.
// RLS would reject any insert with a user_id != auth.uid() anyway,
// but passing it explicitly makes the intent clear.
// ============================================================

export async function insertTracker(
  input: Omit<Tracker, 'id' | 'createdAt'>,
  userId: string,
): Promise<Tracker> {
  const row: Record<string, unknown> = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: input.name,
    icon: input.icon,
    color: input.color,
  };
  // Only set settings if the caller passed one — otherwise the column
  // default ('{}'::jsonb) takes over.
  if (input.settings !== undefined) {
    row.settings = input.settings;
  }
  const { data, error } = await supabase
    .from('trackers')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToTracker(data as TrackerRow);
}

export async function deleteTracker(id: string): Promise<void> {
  // Postgres ON DELETE CASCADE handles fields + entries cleanup.
  const { error } = await supabase.from('trackers').delete().eq('id', id);
  if (error) throw error;
}

export async function insertField(
  input: Omit<Field, 'id'>,
  userId: string,
): Promise<Field> {
  const { data, error } = await supabase
    .from('fields')
    .insert({
      id: crypto.randomUUID(),
      user_id: userId,
      tracker_id: input.trackerId,
      name: input.name,
      type: input.type,
      config: input.config,
      default_value: input.defaultValue,
      order: input.order,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToField(data as FieldRow);
}

export async function deleteField(id: string): Promise<void> {
  const { error } = await supabase.from('fields').delete().eq('id', id);
  if (error) throw error;
}

export async function insertEntry(
  input: Omit<Entry, 'id' | 'createdAt'> & { createdAt?: number },
  userId: string,
): Promise<Entry> {
  const row: Record<string, unknown> = {
    id: crypto.randomUUID(),
    user_id: userId,
    tracker_id: input.trackerId,
    values: input.values,
  };
  if (input.createdAt !== undefined) {
    row.created_at = new Date(input.createdAt).toISOString();
  }
  const { data, error } = await supabase
    .from('entries')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToEntry(data as EntryRow);
}

export async function updateEntry(
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .update({ values })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}
export async function updateField(
  id: string,
  patch: Partial<Omit<Field, 'id' | 'trackerId'>>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.config !== undefined) row.config = patch.config;
  if (patch.defaultValue !== undefined) row.default_value = patch.defaultValue;
  if (patch.order !== undefined) row.order = patch.order;
  const { error } = await supabase.from('fields').update(row).eq('id', id);
  if (error) throw error;
}

export async function updateTracker(
  id: string,
  patch: Partial<Omit<Tracker, 'id' | 'createdAt'>>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if ('name' in patch) row.name = patch.name;
  if ('icon' in patch) row.icon = patch.icon;
  if ('color' in patch) row.color = patch.color;
  if ('settings' in patch) row.settings = patch.settings;

  const { error } = await supabase.from('trackers').update(row).eq('id', id);
  if (error) throw error;
}
