// A field's Input can start async work after the user has already moved on.
// The link field is the case that matters: it fetches the page title on blur,
// and clicking "Save entry" is what causes that blur. The form would otherwise
// submit the bare URL and reset itself, leaving the title to resolve into a
// closed form and vanish.
//
// Inputs register the in-flight work here, and forms wait for it before
// writing, merging whatever it resolves to over their own state. Keyed by
// tracker and field so one form's wait can't pick up another's edit.

type PendingWork = Promise<unknown>;

// How long a save will wait on in-flight work before going ahead without it.
// The server gives up on a page after 5s, so a wait longer than this means
// something is wrong, and a Save button that looks frozen is worse than an
// entry without a title. Timing out loses nothing the user typed.
const SETTLE_TIMEOUT_MS = 2500;

const pending = new Map<string, PendingWork>();

function keyFor(trackerId: string | undefined, fieldId: string): string {
  return `${trackerId ?? ''}:${fieldId}`;
}

/**
 * Records work whose result still needs to reach the next save. Resolving to
 * undefined means "leave whatever the form already has", which is what a
 * superseded or failed fetch should do.
 */
export function registerPendingValue(
  trackerId: string | undefined,
  fieldId: string | undefined,
  work: PendingWork,
): void {
  if (!fieldId) return; // previews in the field editor have no entry to save
  const key = keyFor(trackerId, fieldId);
  pending.set(key, work);

  void work
    .catch(() => undefined)
    .then(() => {
      // Only clear if nothing newer replaced it in the meantime.
      if (pending.get(key) === work) pending.delete(key);
    });
}

/** Forgets any recorded work for a field, e.g. once its value is cleared. */
export function clearPendingValue(
  trackerId: string | undefined,
  fieldId: string | undefined,
): void {
  if (!fieldId) return;
  pending.delete(keyFor(trackerId, fieldId));
}

/** Resolves to the work's value, or to undefined if it fails or takes too long. */
function settled(work: PendingWork): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), SETTLE_TIMEOUT_MS);
    void work
      .then(
        (value) => value,
        () => undefined,
      )
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      });
  });
}

/**
 * Waits for work registered against these fields and returns the values it
 * produced, ready to merge over the form's own state. Failures and slow
 * responses resolve to nothing rather than rejecting or hanging: a missing
 * title must never block a save.
 */
export async function settlePendingValues(
  trackerId: string | undefined,
  fieldIds: string[],
): Promise<Record<string, unknown>> {
  const waiting: Array<[string, PendingWork]> = [];
  for (const fieldId of fieldIds) {
    const work = pending.get(keyFor(trackerId, fieldId));
    if (work) waiting.push([fieldId, work]);
  }
  if (waiting.length === 0) return {};

  const results = await Promise.all(
    waiting.map(
      async ([fieldId, work]) => [fieldId, await settled(work)] as const,
    ),
  );

  const merged: Record<string, unknown> = {};
  for (const [fieldId, value] of results) {
    if (value !== undefined) merged[fieldId] = value;
  }
  return merged;
}
