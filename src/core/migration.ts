import { supabase } from '@/lib/supabase';
import { db } from './db';

// One-shot import of local Dexie data into Supabase, run after the first
// signup when local data exists.
//
// Not used when signing in on a new device. That path shows cloud data and
// ignores local, so two devices holding unrelated local data never have to be
// merged.

const HANDLED_KEY = 'trackr:migration_handled';

export interface LocalDataSummary {
  trackers: number;
  fields: number;
  entries: number;
}

/** Counts only, for the "is there anything to import?" check. */
export async function getLocalDataSummary(): Promise<LocalDataSummary> {
  const [trackers, fields, entries] = await Promise.all([
    db.trackers.count(),
    db.fields.count(),
    db.entries.count(),
  ]);
  return { trackers, fields, entries };
}

/**
 * Pushes all Dexie data to the cloud in a single Postgres transaction, via the
 * migrate_user_data RPC, and marks the user handled on this device.
 *
 * Throws on RPC failure for the caller to surface. Nothing is half-imported:
 * Postgres rolls the whole transaction back.
 */
export async function migrateLocalToCloud(
  userId: string,
): Promise<LocalDataSummary> {
  const [trackers, fields, entries] = await Promise.all([
    db.trackers.toArray(),
    db.fields.toArray(),
    db.entries.toArray(),
  ]);

  const { error } = await supabase.rpc('migrate_user_data', {
    p_trackers: trackers,
    p_fields: fields,
    p_entries: entries,
  });

  if (error) throw error;

  markHandled(userId);
  return {
    trackers: trackers.length,
    fields: fields.length,
    entries: entries.length,
  };
}

// An array of user IDs already handled on this device, either by importing or
// by skipping. Keyed by user so people sharing a browser are prompted
// independently.

function loadHandled(): string[] {
  try {
    const raw = localStorage.getItem(HANDLED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function markHandled(userId: string): void {
  const list = loadHandled();
  if (!list.includes(userId)) {
    list.push(userId);
    localStorage.setItem(HANDLED_KEY, JSON.stringify(list));
  }
}

export function hasBeenHandled(userId: string): boolean {
  return loadHandled().includes(userId);
}
