import { useEffect, useState } from 'react';

// UI preferences in localStorage. Device-local; syncing them across devices
// would be its own system.

const HIDE_TEMPLATES_KEY = 'trackr:hide_templates';
const HIDE_TEMPLATES_EVENT = 'trackr:hide_templates_change';

/**
 * Backed by localStorage, kept in sync across components with a custom event,
 * so the toggle in AuthModal and the rendering in HomePage agree without prop
 * drilling or a context.
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
    // Broadcast so other instances of this hook update too.
    window.dispatchEvent(
      new CustomEvent(HIDE_TEMPLATES_EVENT, { detail: next }),
    );
  }

  return [value, update];
}
