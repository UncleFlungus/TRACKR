import { supabase } from '@/lib/supabase';
import { db } from './db';

// ============================================================
// One-shot migration of local Dexie data → cloud Supabase.
//
// Triggered after the first signup when local data exists.
// Not used for routine signin on a new device — that path is
// "show cloud only, ignore local," to avoid merge ambiguity
// between two devices that both have unrelated local data.
// ============================================================

const HANDLED_KEY = 'trackr:migration_handled';

export interface LocalDataSummary {
  trackers: number;
  fields: number;
  entries: number;
}

/** Counts only. Cheap. Use this for the "do we need to prompt?" check. */
export async function getLocalDataSummary(): Promise<LocalDataSummary> {
  const [trackers, fields, entries] = await Promise.all([
    db.trackers.count(),
    db.fields.count(),
    db.entries.count(),
  ]);
  return { trackers, fields, entries };
}

/**
 * Reads all Dexie data and pushes it to the cloud as a single
 * Postgres transaction (via the migrate_user_data RPC).
 *
 * On success, marks this user as handled in localStorage so we
 * don't prompt again on this device.
 *
 * Throws on RPC failure. The caller should show the error.
 * Nothing is half-migrated on failure — Postgres rolled it all back.
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

// ============================================================
// localStorage tracking
// ------------------------------------------------------------
// Stored as an array of user IDs that have been "handled" on
// this device — either by importing, or by explicitly skipping.
// Keyed by user ID so multiple users sharing a browser each
// get prompted independently.
// ============================================================

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
