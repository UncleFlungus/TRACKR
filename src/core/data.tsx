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
// ============================================================

interface InvalidationCtx {
  version: number;
  invalidate: () => void;
}

const InvalidationContext = createContext<InvalidationCtx>({
  version: 0,
  invalidate: () => {},
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const invalidate = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <InvalidationContext.Provider value={{ version, invalidate }}>
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
  const { version } = useContext(InvalidationContext);

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
  }, [user, version]);

  return user ? cloudData : dexieData;
}

export function useTracker(id: string | undefined): Tracker | undefined {
  const { user } = useAuth();
  const { version } = useContext(InvalidationContext);

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
  }, [user, id, version]);

  return user ? cloudData : dexieData;
}

export function useFieldsForTracker(trackerId: string | undefined): Field[] {
  const { user } = useAuth();
  const { version } = useContext(InvalidationContext);

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
  }, [user, trackerId, version]);

  return user ? cloudData : dexieData;
}

export function useEntriesForTracker(trackerId: string | undefined): Entry[] {
  const { user } = useAuth();
  const { version } = useContext(InvalidationContext);

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
  }, [user, trackerId, version]);

  return user ? cloudData : dexieData;
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
      invalidate();
      return t;
    }
    return dexie.createTracker(input);
  };

  const deleteTracker = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteTracker(id);
      invalidate();
    } else {
      await dexie.deleteTracker(id);
    }
  };

  const addField = async (input: Omit<Field, 'id'>): Promise<Field> => {
    if (user) {
      const f = await cloud.insertField(input, user.id);
      invalidate();
      return f;
    }
    return dexie.addField(input);
  };

  const deleteField = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteField(id);
      invalidate();
    } else {
      await dexie.deleteField(id);
    }
  };

  const addEntry = async (
    input: Omit<Entry, 'id' | 'createdAt'>,
  ): Promise<Entry> => {
    if (user) {
      const e = await cloud.insertEntry(input, user.id);
      invalidate();
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
      invalidate();
    } else {
      await dexie.updateEntry(id, values);
    }
  };

  const deleteEntry = async (id: string): Promise<void> => {
    if (user) {
      await cloud.deleteEntry(id);
      invalidate();
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
    addField,
    deleteField,
    addEntry,
    updateEntry,
    deleteEntry,
    createFromTemplate,
  };
}
