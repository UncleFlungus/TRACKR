import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { db } from './db';
import * as dexie from './db';
import * as cloud from './cloud';
import { getTemplate } from './templates';
import type {
  Entry,
  Field,
  Tracker,
  TrackerInvite,
  TrackerMember,
  TrackerRole,
} from './types';
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
  members: (trackerId: string) => ['members', trackerId] as const,
  allMembers: ['members', 'all'] as const,
  invites: (trackerId: string) => ['invites', trackerId] as const,
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

/**
 * A tracker, and whether we're still looking for it.
 *
 * The distinction matters because "not loaded yet" and "gone" are both absent
 * values, and a page that can't tell them apart shows a loading spinner
 * forever when someone deletes a tracker out from under a co-member.
 *
 * `tracker` is null once we know it isn't there — undefined never escapes.
 * The Dexie branch gets the same shape by mapping a miss to null explicitly,
 * since useLiveQuery also returns undefined while it's still running.
 */
export function useTrackerResult(id: string | undefined): {
  tracker: Tracker | null;
  loading: boolean;
} {
  const { user } = useAuth();

  const dexieData = useLiveQuery(async () => {
    if (user || !id) return undefined;
    return (await db.trackers.get(id)) ?? null;
  }, [user, id]);

  const cloudQuery = useQuery({
    queryKey: keys.tracker(id!),
    queryFn: () => cloud.fetchTracker(id!),
    enabled: !!user && !!id,
  });

  if (!id) return { tracker: null, loading: false };

  if (user) {
    return {
      tracker: cloudQuery.data ?? null,
      loading: cloudQuery.isPending,
    };
  }
  return { tracker: dexieData ?? null, loading: dexieData === undefined };
}

export function useTracker(id: string | undefined): Tracker | undefined {
  return useTrackerResult(id).tracker ?? undefined;
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

  /**
   * Step a count field. Separate from updateEntry because the whole point is
   * that no current value crosses the wire — the database adds to whatever is
   * stored at write time.
   */
  const incrementEntryValue = async (
    entryId: string,
    fieldId: string,
    delta: number,
    max: number,
  ): Promise<number> => {
    if (user) {
      const next = await cloud.incrementEntryValue(entryId, fieldId, delta, max);
      qc.invalidateQueries({ queryKey: ['entries'] });
      return next;
    }
    return dexie.incrementEntryValue(entryId, fieldId, delta, max);
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
    incrementEntryValue,
    deleteEntry,
    createFromTemplate,
  };
}

// ============================================================
// Sharing
// ------------------------------------------------------------
// Cloud-only: there is nobody to share with while signed out, so these hooks
// stay disabled without a user and return empty rather than branching to a
// Dexie path that cannot exist.
// ============================================================

export function useTrackerMembers(trackerId: string | undefined): TrackerMember[] {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: keys.members(trackerId!),
    queryFn: () => cloud.fetchMembers(trackerId!),
    enabled: !!user && !!trackerId,
  });
  return query.data ?? [];
}

export interface SharingSummary {
  /** More than one person has access. */
  shared: boolean;
  /** True when someone else owns it — i.e. it was shared *with* you. */
  theirs: boolean;
  memberCount: number;
}

/**
 * Sharing status for every tracker at once, for the home page. One query
 * rather than one per tile: RLS already limits tracker_members to trackers
 * the caller belongs to, so selecting the lot returns exactly what's needed.
 */
export function useSharingSummaries(): Map<string, SharingSummary> {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: keys.allMembers,
    queryFn: cloud.fetchAllMembers,
    enabled: !!user,
  });

  return useMemo(() => {
    const out = new Map<string, SharingSummary>();
    if (!user || !query.data) return out;

    for (const m of query.data) {
      const cur = out.get(m.trackerId) ?? {
        shared: false,
        theirs: false,
        memberCount: 0,
      };
      cur.memberCount += 1;
      cur.shared = cur.memberCount > 1;
      // Someone else holds the owner role → this was shared with me.
      if (m.role === 'owner' && m.userId !== user.id) cur.theirs = true;
      out.set(m.trackerId, cur);
    }
    return out;
  }, [query.data, user]);
}

/** Owner-only in practice — the select policy returns nothing to anyone else. */
export function useTrackerInvites(trackerId: string | undefined): TrackerInvite[] {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: keys.invites(trackerId!),
    queryFn: () => cloud.fetchInvites(trackerId!),
    enabled: !!user && !!trackerId,
  });
  return query.data ?? [];
}

/**
 * The caller's own role on a tracker, or null when signed out / not a member.
 *
 * Used to decide which controls to render. The database refuses the actions
 * regardless — this exists so the UI doesn't offer buttons that would fail.
 */
export function useMyRole(trackerId: string | undefined): TrackerRole | null {
  const { user } = useAuth();
  const members = useTrackerMembers(trackerId);
  if (!user) return null;
  return members.find((m) => m.userId === user.id)?.role ?? null;
}

export function useSharingMutations() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const invite = async (
    trackerId: string,
    email: string,
    role: 'editor' | 'viewer',
  ): Promise<void> => {
    if (!user) throw new Error('Sign in to share a tracker');
    await cloud.inviteToTracker(trackerId, email, role, user.id);
    qc.invalidateQueries({ queryKey: keys.invites(trackerId) });
  };

  const revokeInvite = async (
    trackerId: string,
    inviteId: string,
  ): Promise<void> => {
    await cloud.revokeInvite(inviteId);
    qc.invalidateQueries({ queryKey: keys.invites(trackerId) });
  };

  const setRole = async (
    trackerId: string,
    userId: string,
    role: TrackerRole,
  ): Promise<void> => {
    await cloud.updateMemberRole(trackerId, userId, role);
    qc.invalidateQueries({ queryKey: keys.members(trackerId) });
  };

  const removeMember = async (
    trackerId: string,
    userId: string,
  ): Promise<void> => {
    await cloud.removeMember(trackerId, userId);
    qc.invalidateQueries({ queryKey: keys.members(trackerId) });
    // Removing yourself revokes your own access, so the tracker list changes
    // too. Invalidating both covers the leave case without a separate path.
    qc.invalidateQueries({ queryKey: ['trackers'] });
  };

  const leave = async (trackerId: string): Promise<void> => {
    if (!user) return;
    await removeMember(trackerId, user.id);
  };

  return { invite, revokeInvite, setRole, removeMember, leave };
}

/**
 * Turns any invitations addressed to the signed-in user into memberships,
 * once per session. This is what makes a shared tracker appear on the
 * invitee's home page without them doing anything — there is no link to open
 * and no code to enter.
 *
 * Mounted once, at the app root. Failures are swallowed deliberately: an
 * invite that cannot be claimed right now is not worth interrupting someone's
 * session over, and the next load tries again.
 */
export function useClaimInvites(): void {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    cloud
      .claimMyInvites()
      .then((joined) => {
        // Only disturb the cache when something actually changed.
        if (cancelled || joined === 0) return;
        qc.invalidateQueries({ queryKey: ['trackers'] });
        qc.invalidateQueries({ queryKey: ['fields'] });
        qc.invalidateQueries({ queryKey: ['entries'] });
      })
      .catch(() => {
        /* next load will retry */
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, qc]);
}

/**
 * Live updates for one tracker.
 *
 * Subscribes to Postgres changes for the tracker and everything hanging off
 * it, and invalidates the matching React Query keys so a co-member's writes
 * appear without a reload. Without this, the freshness model is "refetch after
 * your own writes", which is fine alone and useless shared.
 *
 * Realtime applies RLS to what it delivers, so this only ever fires for rows
 * the subscriber could already read. It carries no data into the app either
 * way — an event is only a signal to refetch, and the refetch is itself
 * RLS-scoped.
 *
 * Signed out (IndexedDB) there is nobody to sync with, and Dexie's useLiveQuery
 * is already reactive, so this does nothing without a user.
 */
export function useRealtimeTracker(trackerId: string | undefined): void {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !trackerId) return;

    const channel = supabase
      .channel(`tracker:${trackerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'entries',
          filter: `tracker_id=eq.${trackerId}`,
        },
        (payload) => {
          // Skip our own writes. The mutation that caused them already
          // invalidated, and without this every tap of the inline counter
          // would round-trip twice — once to write, once to react to having
          // written. Deletes carry only a primary key, so they fall through
          // and refetch, which is what a delete needs anyway.
          const author = (payload.new as { user_id?: string } | null)?.user_id;
          if (author && author === userId) return;
          qc.invalidateQueries({ queryKey: ['entries'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'fields',
          filter: `tracker_id=eq.${trackerId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['fields'] }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trackers',
          filter: `id=eq.${trackerId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['trackers'] }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tracker_members',
          filter: `tracker_id=eq.${trackerId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: keys.members(trackerId) });
          // Membership decides access, so losing it changes what the tracker
          // list and its contents are allowed to return.
          qc.invalidateQueries({ queryKey: ['trackers'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, trackerId, qc]);
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
