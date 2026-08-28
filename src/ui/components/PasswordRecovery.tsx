import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';

/**
 * Shown after arriving via a password recovery link.
 *
 * Supabase exchanges that link for a real session, so without this the user
 * lands on the home page already signed in, with nothing asking them to set
 * the password they came to set — and they're locked out again next time.
 *
 * Deliberately not dismissable: closing it would leave them in exactly that
 * state. Signing out is the way past it without setting one.
 */
export default function PasswordRecovery() {
  const { isRecovering, updatePassword, endRecovery, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!isRecovering) return null;

  async function handleSave() {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setError(error.message);
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        {done ? (
          <div className="p-6 text-center">
            <h2 className="font-display font-semibold text-grape-900 text-[20px] mb-2">
              Password updated
            </h2>
            <p className="text-grape-600 text-[14px] mb-6">
              You're signed in. Use the new password next time.
            </p>
            <button
              onClick={endRecovery}
              className="w-full bg-grape-500 hover:bg-grape-600 text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
            >
              Continue
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-5 pb-3">
              <div className="w-12 h-12 rounded-full bg-grape-100 flex items-center justify-center mb-3">
                <KeyRound className="w-6 h-6 text-grape-600" />
              </div>
              <h2 className="font-display font-semibold text-grape-900 text-[20px]">
                Set a new password
              </h2>
            </div>
            <div className="px-5 pb-5 space-y-3">
              <div>
                <label className="text-grape-700 text-[12px] font-semibold block mb-1">
                  New password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  className="w-full bg-white border border-grape-200 focus:border-grape-400 rounded-lg px-3 py-2 text-[14px] text-grape-900 transition-colors focus:outline-none"
                />
                <p className="text-grape-400 text-[11px] mt-1">
                  At least 8 characters.
                </p>
              </div>
              <div>
                <label className="text-grape-700 text-[12px] font-semibold block mb-1">
                  Confirm
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  autoComplete="new-password"
                  className="w-full bg-white border border-grape-200 focus:border-grape-400 rounded-lg px-3 py-2 text-[14px] text-grape-900 transition-colors focus:outline-none"
                />
              </div>
              {error && (
                <p className="text-red-600 text-[13px] bg-red-50 rounded-md px-3 py-2">
                  {error}
                </p>
              )}
              <button
                onClick={handleSave}
                disabled={!password || !confirm || submitting}
                className="w-full bg-grape-500 hover:bg-grape-600 disabled:bg-grape-200 disabled:cursor-not-allowed text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
              >
                {submitting ? '…' : 'Save password'}
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  endRecovery();
                }}
                className="w-full text-grape-500 hover:text-grape-700 text-[13px] font-semibold py-1.5 transition-colors"
              >
                Cancel and sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
