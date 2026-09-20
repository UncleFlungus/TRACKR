// Who logged what, on a shared tracker. Entries carry an author id
// (entries.user_id, pinned to the writer by RLS) and the roster carries
// emails; this turns the two into a short label and a stable colour.

import { ALL_COLORS } from '@/ui/colors';
import type { TrackerMember } from './types';

export interface AuthorStyle {
  label: string;
  colorKey: string;
}

export type AuthorMap = Map<string, AuthorStyle>;

/**
 * The part before the @. Full addresses are too long to sit next to an entry,
 * and among a handful of people who invited each other it is enough to tell
 * them apart.
 */
export function authorLabel(email: string | null | undefined): string {
  if (!email) return 'Someone';
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * A colour per member, by position in the roster. The owner keeps the tracker's
 * accent so their entries match the tracker, and everyone else takes the rest
 * of the palette in join order. Stable as long as the roster is; colours that
 * reshuffled between renders would be worse than none.
 */
export function buildAuthorMap(
  members: TrackerMember[],
  accentColorKey: string,
): AuthorMap {
  const map: AuthorMap = new Map();
  const rest = ALL_COLORS.filter((c) => c !== accentColorKey);
  let i = 0;

  for (const m of members) {
    const colorKey =
      m.role === 'owner' ? accentColorKey : rest[i++ % rest.length];
    map.set(m.userId, { label: authorLabel(m.email), colorKey });
  }
  return map;
}

/**
 * Style for one entry's author. Authors who deleted their account fall back to
 * a neutral "Someone": their entries stay in the tracker and still have to
 * render as something.
 */
export function authorStyle(
  authors: AuthorMap,
  authorId: string | null | undefined,
): AuthorStyle {
  if (!authorId) return { label: 'Someone', colorKey: 'slate' };
  return authors.get(authorId) ?? { label: 'Someone', colorKey: 'slate' };
}
