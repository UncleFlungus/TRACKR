import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/lib/auth';
import { db } from './db';
import * as dexie from './db';
import * as cloud from './cloud';
import { getTemplate } from './templates';
import type { Entry, Field, Tracker } from './types';

// ============================================================
// Invalidation context
// ------------------------------------------------------------
// Dexie has built-in reactivity (useLiveQuery rebroadcasts on
// any table change). Supabase doesn't (without Realtime), so
// after a cloud mutation we bump a version counter that every
// cloud query depends on, triggering a refetch.
//
// Crude but fine for this data size — refetches every cloud
// query on every cloud mutation. A future improvement would be
// per-key invalidation or switching to Realtime.
// Cloud invalidation is intentionally global: every mutation bumps a version
// counter and all cloud queries refetch. This is fine at personal-tracker
// scale (low write frequency, small dataset). When it stops being fine, the
// upgrade is either Supabase Realtime subscriptions (push-based) or
// per-key invalidation (only refetch what changed).
// ============================================================

type Domain = 'trackers' | 'fields' | 'entries';

interface InvalidationCtx {
  versions: Record<Domain, number>;
  invalidate: (...domains: Domain[]) => void;
}

const InvalidationContext = createContext<InvalidationCtx>({
  versions: { trackers: 0, fields: 0, entries: 0 },
  invalidate: () => {},
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [versions, setVersions] = useState<Record<Domain, number>>({
    trackers: 0,
    fields: 0,
    entries: 0,
  });
  const invalidate = useCallback((...domains: Domain[]) => {
    setVersions((prev) => {
      const next = { ...prev };
      for (const d of domains) next[d] = prev[d] + 1;
      return next;
    });
  }, []);
  return (
    <InvalidationContext.Provider value={{ versions, invalidate }}>
      {children}
    </InvalidationContext.Provider>
  );
}

// ============================================================
// Query hooks
// ------------------------------------------------------------
// Each hook runs both paths (Dexie + cloud fetch) every render
// to satisfy React's "no conditional hooks" rule, but only one
// path actually produces data based on the current auth state.
// ============================================================

export function useTrackers(): Tracker[] | undefined {
  const { user } = useAuth();
  const { versions } = useContext(InvalidationContext);
  // Dexie path — returns undefined when signed in so it doesn't
  // hit IndexedDB unnecessarily.
  const dexieData = useLiveQuery(async () => {
    if (user) return [];
    return db.trackers.orderBy('createdAt').reverse().toArray();
  }, [user]);
  // Cloud path
  const [cloudData, setCloudData] = useState<Tracker[] | undefined>(undefined);
  useEffect(() => {
    if (!user) {
      setCloudData(undefined);
      return;
    }
    let cancelled = false;
    cloud.fetchTrackers().then(
      (data) => !cancelled && setCloudData(data),
      (err) => !cancelled && console.error('fetchTrackers failed', err),
    );
    return () => {
      cancelled = true;
    };
  }, [user, versions.trackers]);

  return user ? cloudData : dexieData;
}

export function useTracker(id: string | undefined): Tracker | undefined {
  const { user } = useAuth();
  const { versions } = useContext(InvalidationContext);
  const dexieData = useLiveQuery(async () => {
    if (user || !id) return undefined;
    return db.trackers.get(id);
  }, [user, id]);
  const [cloudData, setCloudData] = useState<Tracker | undefined>(undefined);
  useEffect(() => {
    if (!user || !id) {
      setCloudData(undefined);
      return;
    }
    let cancelled = false;
    cloud.fetchTracker(id).then(
      (data) => !cancelled && setCloudData(data),
      (err) => !cancelled && console.error('fetchTracker failed', err),
    );
    return () => {
      cancelled = true;
    };
  }, [user, id, versions.trackers]);

  return user ? cloudData : dexieData;
}

export function useFieldsForTracker(trackerId: string | undefined): Field[] {
  const { user } = useAuth();
  const { versions } = useContext(InvalidationContext);
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

  const [cloudData, setCloudData] = useState<Field[]>([]);
  useEffect(() => {
    if (!user || !trackerId) {
      setCloudData([]);
      return;
    }
    let cancelled = false;
    cloud.fetchFields(trackerId).then(
      (data) => !cancelled && setCloudData(data),
      (err) => !cancelled && console.error('fetchFields failed', err),
    );
    return () => {
      cancelled = true;
    };
  }, [user, trackerId, versions.fields]);

  return user ? cloudData : dexieData;
}

export function useEntriesForTracker(trackerId: string | undefined): Entry[] {
  const { user } = useAuth();
  const { versions } = useContext(InvalidationContext);
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

  const [cloudData, setCloudData] = useState<Entry[]>([]);
  useEffect(() => {
    if (!user || !trackerId) {
      setCloudData([]);
      return;
    }
    let cancelled = false;
    cloud.fetchEntries(trackerId).then(
      (data) => !cancelled && setCloudData(data),
      (err) => !cancelled && console.error('fetchEntries failed', err),
    );
    return () => {
      cancelled = true;
    };
  }, [user, trackerId, versions.entries]);

  return user ? cloudData : dexieData;
}

// ... other existing imports

export function useAllEntries(): Entry[] | undefined {
  const { user } = useAuth();
  const { versions } = useDataInvalidate();

  // Dexie: live query (auto-refreshes on writes)
  const dexieEntries = useLiveQuery(async () => {
    if (user) return undefined; // signed in → use cloud path below
    return await db.entries.toArray();
  }, [user]);

  // Cloud: manual fetch, refetches on invalidation bumps
  const [cloudEntries, setCloudEntries] = useState<Entry[] | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!user) {
      setCloudEntries(undefined);
      return;
    }
    cloud.fetchAllEntries().then(setCloudEntries);
  }, [user, versions.entries]);

  return user ? cloudEntries : dexieEntries;
}
// ============================================================
// Mutation hook
// ------------------------------------------------------------
// All mutations go through here. Branches on auth state and
// invalidates cloud queries after a successful cloud write.
// Dexie writes don't need invalidation — useLiveQuery is reactive.
// ============================================================
export function useDataMutations() {
  const { user } = useAuth();
  const { invalidate } = useContext(InvalidationContext);

  const createTracker = async (
    input: Omit<Tracker, 'id' | 'createdAt'>,
  ): Promise<Tracker> => {
    if (user) {
      const t = await cloud.insertTracker(input, user.id);
      invalidate('trackers');
      return t;
    }
    return dexie.createTracker(input);
  };

  const deleteTracker = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteTracker(id);
      invalidate('trackers', 'fields', 'entries');
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
      invalidate('trackers');
    } else {
      await dexie.updateTracker(id, patch);
    }
  };

  //  ----------- Fields
  const addField = async (input: Omit<Field, 'id'>): Promise<Field> => {
    if (user) {
      const f = await cloud.insertField(input, user.id);
      invalidate('fields');
      return f;
    }
    return dexie.addField(input);
  };

  const deleteField = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteField(id);
      invalidate('fields');
    } else {
      await dexie.deleteField(id);
    }
  };
  const updateField = async (
    id: string,
    patch: Partial<Omit<Field, 'id' | 'trackerId'>>,
  ): Promise<void> => {
    if (user) {
      await cloud.updateTracker(id, patch);
      invalidate('fields');
    } else {
      await dexie.updateField(id, patch);
    }
  };
  //  --------Entries
  const addEntry = async (
    input: Omit<Entry, 'id' | 'createdAt'> & { createdAt?: number },
  ): Promise<Entry> => {
    if (user) {
      const e = await cloud.insertEntry(input, user.id);
      invalidate('entries');
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
      invalidate('entries');
    } else {
      await dexie.updateEntry(id, values);
    }
  };

  const deleteEntry = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteEntry(id);
      invalidate('entries');
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
 * Manually invalidate all cloud queries — forces a refetch.
 * Used after the local→cloud migration, when the data layer
 * has new rows it didn't see when first fetching post-signin.
 */
export function useDataInvalidate() {
  const { versions, invalidate } = useContext(InvalidationContext);
  return { versions, invalidate };
}
