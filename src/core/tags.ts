// Tag bookkeeping for list fields: what tags exist, and rewriting them across
// entries. No React in here.
//
// Tags are compared case-insensitively throughout. "Horror" and "horror" are
// one tag with two spellings, and the most used spelling is the one shown.

export interface PastTag {
  label: string;
  count: number;
  /** Every spelling seen, label included. More than one means a case duplicate. */
  spellings: string[];
}

export const tagKey = (tag: string) => tag.trim().toLowerCase();

/** Every tag a list field has held, most used first. */
export function collectPastTags(
  entries: { values: Record<string, unknown> }[],
  fieldId: string | undefined,
): PastTag[] {
  if (!fieldId) return [];
  const byKey = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const v = e.values[fieldId];
    if (!Array.isArray(v)) continue;
    for (const item of v) {
      if (typeof item !== 'string' || !item.trim()) continue;
      const key = tagKey(item);
      const spellings = byKey.get(key) ?? new Map<string, number>();
      spellings.set(item, (spellings.get(item) ?? 0) + 1);
      byKey.set(key, spellings);
    }
  }
  return Array.from(byKey.values())
    .map((spellings) => {
      let label = '';
      let best = 0;
      let count = 0;
      for (const [spelling, n] of spellings) {
        count += n;
        if (n > best) {
          best = n;
          label = spelling;
        }
      }
      return { label, count, spellings: Array.from(spellings.keys()) };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * A list value with the tags in `rename` swapped for their new spelling (keyed
 * by tagKey; null removes the tag). Duplicates that result are dropped, keeping
 * the first, so renaming "scifi" to "sci-fi" on an entry that has both leaves
 * one. Returns null when nothing changes, so callers can skip the write.
 */
export function rewriteTags(
  value: unknown,
  rename: Map<string, string | null>,
): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  let changed = false;
  for (const item of value) {
    if (typeof item !== 'string') {
      changed = true;
      continue;
    }
    const key = tagKey(item);
    const next = rename.has(key) ? rename.get(key)! : item;
    if (next !== item) changed = true;
    if (next === null) continue;
    const nextKey = tagKey(next);
    if (seen.has(nextKey)) {
      changed = true;
      continue;
    }
    seen.add(nextKey);
    out.push(next);
  }
  return changed ? out : null;
}
