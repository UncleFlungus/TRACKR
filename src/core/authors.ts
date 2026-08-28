// Who logged what, on a shared tracker.
//
// Entries already carry an author id (entries.user_id, pinned to the writer by
// RLS), and the member roster already carries emails. This turns those two into
// something renderable: a short label and a stable colour per person.

import { ALL_COLORS } from '@/ui/colors';
import type { TrackerMember } from './types';

export interface AuthorStyle {
  label: string;
  colorKey: string;
}

export type AuthorMap = Map<string, AuthorStyle>;

/**
 * The part before the @. Full addresses are too long to sit next to an entry,
 * and among a handful of people who invited each other, the local part is
 * plenty to tell them apart.
 */
export function authorLabel(email: string | null | undefined): string {
  if (!email) return 'Someone';
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : email;
}

/**
 * A colour per member, assigned by position in the roster.
 *
 * The owner keeps the tracker's own accent — their entries should look like
 * the tracker looks — and everyone else takes the remaining palette in join
 * order. Stable for as long as the roster is, which is what matters: colours
 * that reshuffle on every render would be worse than no colours.
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
 * Style for one entry's author. Falls back to a neutral "Someone" for authors
 * who have left — their entries stay in the tracker, so they still need to
 * render as something.
 */
export function authorStyle(
  authors: AuthorMap,
  authorId: string | null | undefined,
): AuthorStyle {
  if (!authorId) return { label: 'Someone', colorKey: 'slate' };
  return authors.get(authorId) ?? { label: 'Someone', colorKey: 'slate' };
}
