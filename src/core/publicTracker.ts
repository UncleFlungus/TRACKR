// The public read-only view of a tracker, as returned by the public_tracker()
// database function. Shared by the embed page and the /api/public endpoint, so
// it imports nothing that pulls in React or the Supabase client.

import type { Entry, Field, FieldTypeId, TrackerSettings } from './types';

/** Tokens are 32 lowercase hex characters; anything else is rejected before a query. */
export const PUBLIC_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export interface PublicTrackerPayload {
  tracker: {
    name: string;
    icon: string;
    color: string;
    viewMode: TrackerSettings['viewMode'] | null;
    hideEmptyFields: boolean | null;
  };
  fields: Array<{
    id: string;
    name: string;
    type: FieldTypeId;
    config: Record<string, unknown>;
    order: number;
  }>;
  entries: Array<{
    id: string;
    createdAt: string;
    values: Record<string, unknown>;
  }>;
}

/** Into the app's own types, so the embed can reuse the normal entry components. */
export function toAppShapes(payload: PublicTrackerPayload): {
  fields: Field[];
  entries: Entry[];
} {
  return {
    fields: payload.fields.map((f) => ({
      id: f.id,
      trackerId: '',
      name: f.name,
      type: f.type,
      config: f.config ?? {},
      defaultValue: null,
      order: f.order,
    })),
    entries: payload.entries.map((e) => ({
      id: e.id,
      trackerId: '',
      createdAt: new Date(e.createdAt).getTime(),
      values: e.values ?? {},
    })),
  };
}

/**
 * A value as an outside developer would want it: timestamps as ISO strings,
 * links as { url, title }, table rows keyed by column name instead of column id.
 */
function readableValue(
  field: PublicTrackerPayload['fields'][number],
  value: unknown,
): unknown {
  if (value === null || value === undefined) return null;
  switch (field.type) {
    case 'time':
      return typeof value === 'number' ? new Date(value).toISOString() : null;
    case 'link':
      if (typeof value === 'string') return { url: value, title: null };
      if (typeof value === 'object' && 'url' in value) {
        const v = value as { url: string; title?: string };
        return { url: v.url, title: v.title || null };
      }
      return null;
    case 'table': {
      if (!Array.isArray(value)) return [];
      const columns = Array.isArray(field.config?.columns)
        ? (field.config.columns as Array<{ id: string; name: string }>)
        : [];
      return value.map((row: Record<string, unknown>) =>
        Object.fromEntries(columns.map((c) => [c.name, row?.[c.id] ?? null])),
      );
    }
    default:
      return value;
  }
}

/**
 * The /api/public response. Values are keyed by field name, since field ids
 * mean nothing outside the app. Two fields with the same name would collide,
 * so a repeat gets its id appended.
 */
export function toApiResponse(payload: PublicTrackerPayload) {
  const keys = new Map<string, string>();
  const used = new Set<string>();
  for (const f of payload.fields) {
    const key = used.has(f.name) ? `${f.name} (${f.id.slice(0, 8)})` : f.name;
    used.add(key);
    keys.set(f.id, key);
  }

  return {
    tracker: { name: payload.tracker.name },
    fields: payload.fields.map((f) => ({
      name: keys.get(f.id)!,
      type: f.type,
    })),
    entries: payload.entries.map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      values: Object.fromEntries(
        payload.fields.map((f) => [
          keys.get(f.id)!,
          readableValue(f, e.values?.[f.id]),
        ]),
      ),
    })),
  };
}
