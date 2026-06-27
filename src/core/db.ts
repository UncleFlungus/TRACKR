import Dexie, { type Table } from 'dexie';
import type { Tracker, Field, Entry, TrackerSettings } from './types';

class TrackrDB extends Dexie {
  trackers!: Table<Tracker, string>;
  fields!: Table<Field, string>;
  entries!: Table<Entry, string>;

  constructor() {
    super('trackr');
    this.version(1).stores({
      // primary key first, then indexed fields after &
      trackers: 'id, createdAt',
      fields: 'id, trackerId, order',
      entries: 'id, trackerId, createdAt',
    });
  }
}

export const db = new TrackrDB();

// ---- Small helpers so pages don't have to know about Dexie's API ----

export function newId(): string {
  return crypto.randomUUID();
}

export async function createTracker(
  input: Omit<Tracker, 'id' | 'createdAt'>,
): Promise<Tracker> {
  const tracker: Tracker = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    settings: input.settings ?? {},
  };
  await db.trackers.add(tracker);
  return tracker;
}

export async function deleteTracker(trackerId: string) {
  await db.transaction('rw', db.trackers, db.fields, db.entries, async () => {
    await db.trackers.delete(trackerId);
    await db.fields.where('trackerId').equals(trackerId).delete();
    await db.entries.where('trackerId').equals(trackerId).delete();
  });
}

export async function addField(input: Omit<Field, 'id'>) {
  const field: Field = { ...input, id: newId() };
  await db.fields.add(field);
  return field;
}

export async function deleteField(fieldId: string) {
  await db.fields.delete(fieldId);
}

export async function renameField(fieldId: string, name: string) {
  await db.fields.update(fieldId, { name });
}
export async function addEntry(
  input: Omit<Entry, 'id' | 'createdAt'> & { createdAt?: number },
): Promise<Entry> {
  // Spread input first so the computed id/createdAt below always win.
  // The previous order let an explicit `createdAt: undefined` from a caller
  // clobber the `?? Date.now()` fallback.
  const entry: Entry = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? Date.now(),
  };
  await db.entries.add(entry);
  return entry;
}

export async function updateEntry(
  entryId: string,
  values: Record<string, unknown>,
) {
  // Only the values map is mutable. id, trackerId, and createdAt are immutable
  // — createdAt in particular should reflect when the entry was logged, not edited.
  await db.entries.update(entryId, { values });
}

export async function deleteEntry(entryId: string) {
  await db.entries.delete(entryId);
}

export async function updateField(
  fieldId: string,
  patch: Partial<Omit<Field, 'id' | 'trackerId'>>,
) {
  await db.fields.update(fieldId, patch);
}

export async function updateTracker(
  id: string,
  patch: Partial<Omit<Tracker, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.trackers.update(id, patch);
}
