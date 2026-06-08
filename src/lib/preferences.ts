import { useEffect, useState } from 'react';

// ============================================================
// User-level UI preferences stored in localStorage.
// These are device-local on purpose — they don't sync via Supabase.
// (If a user wants the same preferences across devices, that's a
//  separate sync system to build later.)
// ============================================================

const HIDE_TEMPLATES_KEY = 'trackr:hide_templates';
const HIDE_TEMPLATES_EVENT = 'trackr:hide_templates_change';

/**
 * Returns [hideTemplates, setHideTemplates].
 *
 * Backed by localStorage but synced across components via a custom
 * event. That way the toggle in AuthModal and the rendering in
 * HomePage stay aligned without prop drilling or a context.
 */
export function useHideTemplates(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    return localStorage.getItem(HIDE_TEMPLATES_KEY) === 'true';
  });

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<boolean>).detail;
      setValue(detail);
    }
    window.addEventListener(HIDE_TEMPLATES_EVENT, handler);
    return () => window.removeEventListener(HIDE_TEMPLATES_EVENT, handler);
  }, []);

  function update(next: boolean) {
    localStorage.setItem(HIDE_TEMPLATES_KEY, String(next));
    setValue(next);
    // Broadcast so other instances of this hook in other components also update.
    window.dispatchEvent(
      new CustomEvent(HIDE_TEMPLATES_EVENT, { detail: next }),
    );
  }

  return [value, update];
}
