import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle } from 'lucide-react';

interface ToastContextValue {
  /** Show a transient message. Used for writes that failed. */
  notify: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Most writes here are fire-and-forget: tap the counter, the mutation runs, the
 * list refetches. When one fails the number just doesn't move, which looks
 * exactly like a dead button. This is so a dropped write says so.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const notify = useCallback((next: string) => {
    setMessage(next);
    window.setTimeout(() => {
      // Only clear if nothing newer replaced it, so a later message isn't cut
      // short by an earlier one's timer.
      setMessage((cur) => (cur === next ? null : cur));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      {message && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-100 max-w-[90vw]">
          <div className="flex items-center gap-2 bg-grape-900 text-white text-[13px] rounded-xl px-3.5 py-2.5 shadow-lg">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-300" />
            <span className="truncate">{message}</span>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  // A component rendered outside the provider shouldn't crash over a failure
  // message it may never need.
  return ctx ?? { notify: () => {} };
}
