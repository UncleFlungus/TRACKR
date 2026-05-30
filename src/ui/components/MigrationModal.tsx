import { useEffect, useState } from 'react';
import { Cloud, CheckCircle2, AlertCircle } from 'lucide-react';
import type { LocalDataSummary } from '@/core/migration';

interface Props {
  summary: LocalDataSummary;
  /** Called when the user chooses to import. Should perform the migration. */
  onImport: () => Promise<void>;
  /** Called when the user explicitly skips. Marks handled so we never re-prompt. */
  onSkip: () => void;
}

type Status = 'prompt' | 'importing' | 'success' | 'error';

/**
 * Post-signup prompt: "we found local data, want to import it?"
 *
 * This modal CANNOT be dismissed by backdrop click, Escape, or any
 * implicit gesture — only by the two explicit buttons (Import / Start
 * fresh). The decision is too important to lose to an accidental tap.
 */
export default function MigrationModal({ summary, onImport, onSkip }: Props) {
  const [status, setStatus] = useState<Status>('prompt');
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleImport() {
    setStatus('importing');
    setError(null);
    try {
      await onImport();
      setStatus('success');
      // Brief success state, then auto-close. This is the only non-button
      // close path, but it's triggered by the user's own Import action so
      // it doesn't have the "accidental dismiss" problem.
      setTimeout(onSkip, 1500);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Something went wrong during import.';
      setError(msg);
      setStatus('error');
    }
  }

  return (
    // Backdrop has no onClick — clicking through it does nothing.
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="px-6 py-6">
          {status === 'prompt' && (
            <PromptBody
              summary={summary}
              onImport={handleImport}
              onSkip={onSkip}
            />
          )}
          {status === 'importing' && <ImportingBody />}
          {status === 'success' && <SuccessBody summary={summary} />}
          {status === 'error' && (
            <ErrorBody
              error={error ?? ''}
              onRetry={handleImport}
              onSkip={onSkip}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PromptBody({
  summary,
  onImport,
  onSkip,
}: {
  summary: LocalDataSummary;
  onImport: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="w-12 h-12 rounded-full bg-grape-100 flex items-center justify-center mb-4">
        <Cloud className="w-6 h-6 text-grape-600" />
      </div>
      <h2 className="font-display font-semibold text-grape-900 text-[20px] mb-2">
        Bring your data along
      </h2>
      <p className="text-grape-600 text-[14px] mb-1">
        We found{' '}
        <strong className="text-grape-900">
          {summary.trackers} {summary.trackers === 1 ? 'tracker' : 'trackers'}
        </strong>
        {summary.entries > 0 && (
          <>
            {' '}
            with{' '}
            <strong className="text-grape-900">
              {summary.entries} {summary.entries === 1 ? 'entry' : 'entries'}
            </strong>
          </>
        )}{' '}
        on this device.
      </p>
      <p className="text-grape-600 text-[14px] mb-5">
        Import them to your account to access them from any device.
      </p>
      <div className="space-y-2">
        <button
          onClick={onImport}
          className="w-full bg-grape-500 hover:bg-grape-600 text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
        >
          Import to my account
        </button>
        <button
          onClick={onSkip}
          className="w-full border border-grape-200 hover:bg-grape-50 text-grape-600 text-[14px] font-semibold rounded-xl py-2.5 transition-colors"
        >
          Start fresh
        </button>
      </div>
    </>
  );
}

function ImportingBody() {
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 rounded-full bg-grape-100 flex items-center justify-center mx-auto mb-4">
        <Cloud className="w-6 h-6 text-grape-600 animate-pulse" />
      </div>
      <p className="text-grape-700 text-[14px]">Importing your data…</p>
    </div>
  );
}

function SuccessBody({ summary }: { summary: LocalDataSummary }) {
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
      </div>
      <h2 className="font-display font-semibold text-grape-900 text-[18px] mb-1">
        All set
      </h2>
      <p className="text-grape-600 text-[14px]">
        {summary.trackers} {summary.trackers === 1 ? 'tracker' : 'trackers'}{' '}
        imported.
      </p>
    </div>
  );
}

function ErrorBody({
  error,
  onRetry,
  onSkip,
}: {
  error: string;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-600" />
      </div>
      <h2 className="font-display font-semibold text-grape-900 text-[20px] mb-2">
        Import failed
      </h2>
      <p className="text-grape-600 text-[14px] mb-1">
        Your local data is safe — nothing was changed.
      </p>
      <p className="text-red-700 text-[12px] bg-red-50 rounded-md px-3 py-2 mb-5 wrap-break-words">
        {error}
      </p>
      <div className="space-y-2">
        <button
          onClick={onRetry}
          className="w-full bg-grape-500 hover:bg-grape-600 text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
        >
          Try again
        </button>
        <button
          onClick={onSkip}
          className="w-full border border-grape-200 hover:bg-grape-50 text-grape-600 text-[14px] font-semibold rounded-xl py-2.5 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </>
  );
}
