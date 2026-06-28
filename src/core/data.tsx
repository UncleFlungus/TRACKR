import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/lib/auth';
import { db } from './db';
import * as dexie from './db';
import * as cloud from './cloud';
import { getTemplate } from './templates';
import type { Entry, Field, Tracker } from './types';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ============================================================
// Data layer
// ------------------------------------------------------------
// Two backends behind one set of hooks:
//   - signed OUT → Dexie / IndexedDB (useLiveQuery is reactive on writes)
//   - signed IN  → Supabase, cached and invalidated via React Query
//
// Each hook runs BOTH paths every render (React's no-conditional-hooks rule)
// but returns only the one matching the current auth state. The cloud path is
// gated by `enabled: !!user`, so React Query never fetches for signed-out users.
//
// Freshness model: manual invalidation on mutation. After a successful cloud
// write we call qc.invalidateQueries on the affected key prefix, which marks
// matching queries stale and refetches the active ones. No Realtime (yet) —
// the documented upgrade path if multi-device live sync is ever needed.
// ============================================================

// Query key factory. Prefix structure matters for invalidation:
//   ['trackers']            → list
//   ['trackers', id]        → one tracker (detail)
//   ['fields', trackerId]   → fields for a tracker
//   ['entries', trackerId]  → entries for a tracker
//   ['entries', 'all']      → all entries (HomePage activity map)
// Invalidating a prefix (e.g. ['entries']) matches every key beneath it.
const keys = {
  trackers: ['trackers'] as const,
  tracker: (id: string) => ['trackers', id] as const,
  fields: (trackerId: string) => ['fields', trackerId] as const,
  entries: (trackerId: string) => ['entries', trackerId] as const,
  allEntries: ['entries', 'all'] as const,
};

// ============================================================
// Query hooks
// ============================================================

export function useTrackers(): Tracker[] | undefined {
  const { user } = useAuth();

  const dexieData = useLiveQuery(async () => {
    if (user) return [];
    return db.trackers.orderBy('createdAt').reverse().toArray();
  }, [user]);

  const cloudQuery = useQuery({
    queryKey: keys.trackers,
    queryFn: cloud.fetchTrackers,
    enabled: !!user,
  });

  return user ? cloudQuery.data : dexieData;
}

export function useTracker(id: string | undefined): Tracker | undefined {
  const { user } = useAuth();

  const dexieData = useLiveQuery(async () => {
    if (user || !id) return undefined;
    return db.trackers.get(id);
  }, [user, id]);

  const cloudQuery = useQuery({
    queryKey: keys.tracker(id!),
    queryFn: () => cloud.fetchTracker(id!),
    enabled: !!user && !!id,
  });

  return user ? cloudQuery.data : dexieData;
}

export function useFieldsForTracker(trackerId: string | undefined): Field[] {
  const { user } = useAuth();

  const dexieData = useLiveQuery(
    async () => {
      if (user || !trackerId) return [];
      const list = await db.fields
        .where('trackerId')
        .equals(trackerId)
        .toArray();
      return list.sort((a, b) => a.order - b.order);
    },
    [user, trackerId],
    [],
  );

  const cloudQuery = useQuery({
    queryKey: keys.fields(trackerId!),
    queryFn: () => cloud.fetchFields(trackerId!),
    enabled: !!user && !!trackerId,
  });

  return user ? (cloudQuery.data ?? []) : dexieData;
}

export function useEntriesForTracker(trackerId: string | undefined): Entry[] {
  const { user } = useAuth();

  const dexieData = useLiveQuery(
    async () => {
      if (user || !trackerId) return [];
      const list = await db.entries
        .where('trackerId')
        .equals(trackerId)
        .toArray();
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    [user, trackerId],
    [],
  );

  const cloudQuery = useQuery({
    queryKey: keys.entries(trackerId!),
    queryFn: () => cloud.fetchEntries(trackerId!),
    enabled: !!user && !!trackerId,
  });

  return user ? (cloudQuery.data ?? []) : dexieData;
}

export function useAllEntries(): Entry[] | undefined {
  const { user } = useAuth();

  const dexieEntries = useLiveQuery(async () => {
    if (user) return undefined;
    return db.entries.toArray();
  }, [user]);

  const cloudQuery = useQuery({
    queryKey: keys.allEntries,
    queryFn: cloud.fetchAllEntries,
    enabled: !!user,
  });

  return user ? cloudQuery.data : dexieEntries;
}

// ============================================================
// Mutation hook
// ------------------------------------------------------------
// Branches on auth state. Cloud writes invalidate the affected React Query
// key prefix; Dexie writes need no invalidation (useLiveQuery is reactive).
// ============================================================
export function useDataMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // ---------- Trackers
  const createTracker = async (
    input: Omit<Tracker, 'id' | 'createdAt'>,
  ): Promise<Tracker> => {
    if (user) {
      const t = await cloud.insertTracker(input, user.id);
      qc.invalidateQueries({ queryKey: keys.trackers });
      return t;
    }
    return dexie.createTracker(input);
  };

  const deleteTracker = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteTracker(id);
      // Cascade in Postgres removes this tracker's fields + entries, so
      // invalidate all three domains. ['trackers'] prefix also covers the
      // detail key ['trackers', id].
      qc.invalidateQueries({ queryKey: ['trackers'] });
      qc.invalidateQueries({ queryKey: ['fields'] });
      qc.invalidateQueries({ queryKey: ['entries'] });
    } else {
      await dexie.deleteTracker(id);
    }
  };

  const updateTracker = async (
    id: string,
    patch: Partial<Omit<Tracker, 'id' | 'createdAt'>>,
  ): Promise<void> => {
    if (user) {
      await cloud.updateTracker(id, patch);
      // ['trackers'] prefix refreshes both the list and the detail view.
      qc.invalidateQueries({ queryKey: ['trackers'] });
    } else {
      await dexie.updateTracker(id, patch);
    }
  };

  // ---------- Fields
  const addField = async (input: Omit<Field, 'id'>): Promise<Field> => {
    if (user) {
      const f = await cloud.insertField(input, user.id);
      qc.invalidateQueries({ queryKey: ['fields'] });
      return f;
    }
    return dexie.addField(input);
  };

  const deleteField = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteField(id);
      qc.invalidateQueries({ queryKey: ['fields'] });
    } else {
      await dexie.deleteField(id);
    }
  };

  const updateField = async (
    id: string,
    patch: Partial<Omit<Field, 'id' | 'trackerId'>>,
  ): Promise<void> => {
    if (user) {
      await cloud.updateField(id, patch);
      qc.invalidateQueries({ queryKey: ['fields'] });
    } else {
      await dexie.updateField(id, patch);
    }
  };

  // ---------- Entries
  const addEntry = async (
    input: Omit<Entry, 'id' | 'createdAt'> & { createdAt?: number },
  ): Promise<Entry> => {
    if (user) {
      const e = await cloud.insertEntry(input, user.id);
      // ['entries'] prefix covers both this tracker's entries and ['entries','all'].
      qc.invalidateQueries({ queryKey: ['entries'] });
      return e;
    }
    return dexie.addEntry(input);
  };

  const updateEntry = async (
    id: string,
    values: Record<string, unknown>,
  ): Promise<void> => {
    if (user) {
      await cloud.updateEntry(id, values);
      qc.invalidateQueries({ queryKey: ['entries'] });
    } else {
      await dexie.updateEntry(id, values);
    }
  };

  const deleteEntry = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteEntry(id);
      qc.invalidateQueries({ queryKey: ['entries'] });
    } else {
      await dexie.deleteEntry(id);
    }
  };

  /**
   * Creates a tracker from a template, including all its fields.
   * Lives here (instead of templates.ts) because it composes mutations
   * and needs to route through the same auth-aware layer.
   */
  const createFromTemplate = async (templateId: string): Promise<string> => {
    const tpl = getTemplate(templateId);
    if (!tpl) throw new Error(`No template: ${templateId}`);
    const tracker = await createTracker({
      name: tpl.name,
      icon: tpl.icon,
      color: tpl.color,
      settings: tpl.settings,
    });
    await Promise.all(
      tpl.fields.map((f, i) =>
        addField({
          trackerId: tracker.id,
          name: f.name,
          type: f.type,
          config: f.config ?? {},
          defaultValue: f.defaultValue ?? null,
          order: i,
        }),
      ),
    );
    return tracker.id;
  };

  return {
    createTracker,
    deleteTracker,
    updateTracker,
    addField,
    deleteField,
    updateField,
    addEntry,
    updateEntry,
    deleteEntry,
    createFromTemplate,
  };
}

/**
 * Force a refetch of all cloud queries. Used after the local→cloud migration,
 * when the database has new rows the cache didn't see at first fetch.
 */
export function useDataInvalidate() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['trackers'] });
    qc.invalidateQueries({ queryKey: ['fields'] });
    qc.invalidateQueries({ queryKey: ['entries'] });
  };
  return { invalidate };
}
