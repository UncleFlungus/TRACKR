import { supabase } from '@/lib/supabase';
import type {
  Entry,
  Field,
  FieldTypeId,
  Tracker,
  TrackerInvite,
  TrackerMember,
  TrackerRole,
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
  created_at: string;
  pinned?: boolean;
  pinned_at?: number | null;
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

function rowToTracker(row: TrackerRow): Tracker {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    createdAt: new Date(row.created_at).getTime(),
    settings: (row.settings as TrackerSettings) ?? {},
    pinned: row.pinned ?? false,
    pinnedAt: row.pinned_at ?? undefined,
    ownerId: row.user_id,
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
export async function fetchAllEntries(): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
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
    pinned: input.pinned ?? false,
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
  if ('pinned' in patch) row.pinned = patch.pinned;
  if ('pinnedAt' in patch) row.pinned_at = patch.pinnedAt;

  const { error } = await supabase.from('trackers').update(row).eq('id', id);
  if (error) throw error;
}

// ============================================================
// Sharing — members and invitations
//
// Cloud-only by nature: there is nobody to share with in the signed-out
// IndexedDB world, so unlike the rest of this file these have no Dexie
// counterpart. `data.tsx` gates them on an authenticated user.
//
// Note how little there is here. Inviting is a plain insert, revoking a plain
// delete, listing a plain select — RLS scopes all three to the tracker's owner.
// Only claiming needs an RPC, because it reads auth.users to learn the
// caller's own email.
// ============================================================

interface TrackerMemberRow {
  tracker_id: string;
  user_id: string;
  role: TrackerRole;
  email: string | null;
  created_at: string;
}

interface TrackerInviteRow {
  id: string;
  tracker_id: string;
  email: string;
  role: 'editor' | 'viewer';
  created_at: string;
}

function rowToMember(r: TrackerMemberRow): TrackerMember {
  return {
    trackerId: r.tracker_id,
    userId: r.user_id,
    role: r.role,
    email: r.email,
    createdAt: new Date(r.created_at).getTime(),
  };
}

function rowToInvite(r: TrackerInviteRow): TrackerInvite {
  return {
    id: r.id,
    trackerId: r.tracker_id,
    email: r.email,
    role: r.role,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function fetchMembers(trackerId: string): Promise<TrackerMember[]> {
  const { data, error } = await supabase
    .from('tracker_members')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TrackerMemberRow[]).map(rowToMember);
}

/**
 * Pending invitations for a tracker. Returns an empty list rather than
 * throwing for non-owners: the select policy is owner-only, so a member
 * simply sees nothing, which is the intended behaviour rather than an error.
 */
export async function fetchInvites(trackerId: string): Promise<TrackerInvite[]> {
  const { data, error } = await supabase
    .from('tracker_invites')
    .select('*')
    .eq('tracker_id', trackerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TrackerInviteRow[]).map(rowToInvite);
}

export async function inviteToTracker(
  trackerId: string,
  email: string,
  role: 'editor' | 'viewer',
  invitedBy: string,
): Promise<void> {
  const { error } = await supabase.from('tracker_invites').insert({
    tracker_id: trackerId,
    // Normalised again in the database by a trigger; doing it here too keeps
    // the optimistic UI consistent with what actually gets stored.
    email: email.trim().toLowerCase(),
    role,
    invited_by: invitedBy,
  });
  if (error) throw error;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from('tracker_invites')
    .delete()
    .eq('id', inviteId);
  if (error) throw error;
}

export async function updateMemberRole(
  trackerId: string,
  userId: string,
  role: TrackerRole,
): Promise<void> {
  const { error } = await supabase
    .from('tracker_members')
    .update({ role })
    .eq('tracker_id', trackerId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Removing someone else (owner only) and leaving yourself are the same row. */
export async function removeMember(
  trackerId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('tracker_members')
    .delete()
    .eq('tracker_id', trackerId)
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Converts any invitations addressed to the caller's confirmed email into
 * memberships. Returns how many trackers were joined, so callers know whether
 * anything needs refetching. Safe to call on every app load.
 */
export async function claimMyInvites(): Promise<number> {
  const { data, error } = await supabase.rpc('claim_my_invites');
  if (error) throw error;
  return (data as number) ?? 0;
}
