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

// Two backends behind one set of hooks: Dexie/IndexedDB when signed out,
// Supabase via React Query when signed in. Every hook runs both paths, since
// hooks can't be conditional, and returns whichever matches the auth state.
// The cloud path is gated on `enabled: !!user` so it never fetches for a
// signed-out user.

// Prefixes matter: invalidating ['entries'] also matches ['entries', 'all'].
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
 * A tracker plus whether the lookup is still in flight. Callers need to tell
 * "not loaded yet" from "deleted": both are absent values, and confusing them
 * leaves the page spinning forever when a co-member deletes the tracker.
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

// Cloud writes invalidate the affected key prefix. Dexie writes don't need it;
// useLiveQuery is already reactive.
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
      // Postgres cascades to fields + entries, so all three go stale.
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
   * Step a count field. Separate from updateEntry so no current value crosses
   * the wire: the database adds to whatever is stored at write time.
   *
   * Applied optimistically, or tapping through a set costs a round trip plus a
   * refetch per tap. Rolled back on failure so a dropped write snaps back
   * instead of quietly doing nothing.
   */
  const incrementEntryValue = async (
    entryId: string,
    fieldId: string,
    delta: number,
    max: number,
  ): Promise<number> => {
    if (!user) return dexie.incrementEntryValue(entryId, fieldId, delta, max);

    const snapshot = qc.getQueriesData<Entry[]>({ queryKey: ['entries'] });

    qc.setQueriesData<Entry[]>({ queryKey: ['entries'] }, (old) =>
      old?.map((e) => {
        if (e.id !== entryId) return e;
        const raw = e.values[fieldId];
        const current = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0;
        return {
          ...e,
          values: {
            ...e.values,
            [fieldId]: Math.min(max, Math.max(0, current + delta)),
          },
        };
      }),
    );

    try {
      const next = await cloud.incrementEntryValue(entryId, fieldId, delta, max);
      // Server wins: someone else may have stepped the same field meanwhile.
      qc.invalidateQueries({ queryKey: ['entries'] });
      return next;
    } catch (e) {
      for (const [key, data] of snapshot) qc.setQueryData(key, data);
      throw e;
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
   * Create a tracker from a template, fields included. Lives here rather than
   * in templates.ts because it composes mutations and has to go through the
   * same auth-aware layer.
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

// Sharing is cloud-only: there is nobody to share with while signed out, so
// these hooks stay disabled without a user and return empty.

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
  /** True when someone else owns it, i.e. it was shared with you. */
  theirs: boolean;
  memberCount: number;
}

/**
 * Sharing status for every tracker at once, for the home page. One query
 * rather than one per tile: RLS already limits tracker_members to trackers the
 * caller belongs to, so selecting all of them returns exactly what's needed.
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
      // Someone else holds the owner role, so this was shared with me.
      if (m.role === 'owner' && m.userId !== user.id) cur.theirs = true;
      out.set(m.trackerId, cur);
    }
    return out;
  }, [query.data, user]);
}

/** Owner-only in practice: the select policy returns nothing to anyone else. */
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
 * The caller's role on a tracker, or null when signed out or not a member.
 * Decides which controls to render; the database refuses the actions either
 * way, so this only stops the UI offering buttons that would fail.
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
    // too. Invalidating both covers leaving without a separate path.
    qc.invalidateQueries({ queryKey: ['trackers'] });
  };

  const leave = async (trackerId: string): Promise<void> => {
    if (!user) return;
    await removeMember(trackerId, user.id);
  };

  return { invite, revokeInvite, setRole, removeMember, leave };
}

/**
 * Turns any invitations addressed to the signed-in user into memberships, once
 * per session. This is what makes a shared tracker show up on the invitee's
 * home page with no link to open and no code to enter.
 *
 * Mounted once at the app root. Failures are swallowed: an invite that can't
 * be claimed right now isn't worth interrupting a session over, and
 * the next load retries.
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
        // Only touch the cache when something actually changed.
        if (cancelled || joined === 0) return;
        qc.invalidateQueries({ queryKey: ['trackers'] });
        qc.invalidateQueries({ queryKey: ['fields'] });
        qc.invalidateQueries({ queryKey: ['entries'] });
      })
      .catch(() => {
        // next load retries
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, qc]);
}

/**
 * Live updates for one tracker. Subscribes to Postgres changes on the tracker
 * and everything hanging off it, then invalidates the matching query keys so a
 * co-member's writes show up without a reload.
 *
 * Realtime applies RLS to what it delivers, so this only fires for rows the
 * subscriber could already read. No event data reaches the app either way; an
 * event is just a signal to refetch, and the refetch is RLS-scoped too.
 *
 * Does nothing without a user: signed out there is nobody to sync with.
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
          // Skip our own writes; the mutation already invalidated. Otherwise
          // every inline counter tap round-trips twice, once to write and once
          // to react to having written. Deletes carry only a primary key, so
          // they fall through and refetch, which is what a delete needs.
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
          // list and its contents can return.
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
 * Force a refetch of every cloud query. Used after the local-to-cloud import,
 * when the database holds rows the cache never saw.
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
