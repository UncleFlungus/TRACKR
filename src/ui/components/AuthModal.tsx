import { useEffect, useState } from 'react';
import { X, Mail, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface Props {
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'check_email';

/**
 * Single modal that adapts to the user's auth state:
 * - Signed out: sign in / sign up form, plus a post-signup "check your email" state.
 * - Signed in: account info + sign out.
 *
 * Reuses the modal shell pattern from EntryDetailsModal: backdrop click
 * closes, Escape closes, body scroll locks while open.
 */
export default function AuthModal({ onClose }: Props) {
  const { user, signIn, signUp, signOut } = useAuth();

  // Escape + body scroll lock — same pattern as EntryDetailsModal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl"
      >
        {user ? (
          <SignedInPanel
            email={user.email ?? ''}
            onSignOut={signOut}
            onClose={onClose}
          />
        ) : (
          <SignedOutPanel signIn={signIn} signUp={signUp} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function SignedInPanel({
  email,
  onSignOut,
  onClose,
}: {
  email: string;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}) {
  async function handleSignOut() {
    await onSignOut();
    onClose();
  }
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="font-display font-semibold text-grape-900 text-[20px]">
          Account
        </h2>
        <button
          onClick={onClose}
          className="p-1 text-grape-400 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-5 pb-5 space-y-4">
        <div className="bg-grape-50 rounded-lg px-3 py-2.5">
          <p className="text-grape-400 text-[11px] font-semibold uppercase tracking-wide mb-0.5">
            Signed in as
          </p>
          <p className="text-grape-900 text-[14px] truncate">{email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full border border-grape-200 hover:bg-grape-50 text-grape-700 text-[14px] font-semibold rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </>
  );
}

function SignedOutPanel({
  signIn,
  signUp,
  onClose,
}: {
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: { message: string } | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{
    needsVerification: boolean;
    error: { message: string } | null;
  }>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
        else onClose();
      } else if (mode === 'signup') {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.');
          return;
        }
        const { needsVerification, error } = await signUp(email, password);
        if (error) setError(error.message);
        else if (needsVerification) setMode('check_email');
        else onClose();
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Post-signup state: tell them to go check their inbox.
  if (mode === 'check_email') {
    return (
      <div className="p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-grape-100 flex items-center justify-center mx-auto mb-4">
          <Mail className="w-7 h-7 text-grape-600" />
        </div>
        <h2 className="font-display font-semibold text-grape-900 text-[20px] mb-2">
          Check your email
        </h2>
        <p className="text-grape-600 text-[14px] mb-6">
          We sent a confirmation link to{' '}
          <span className="font-semibold text-grape-900">{email}</span>. Click
          it to finish signing up.
        </p>
        <button
          onClick={onClose}
          className="w-full bg-grape-500 hover:bg-grape-600 text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
        >
          Got it
        </button>
      </div>
    );
  }

  const isSignup = mode === 'signup';
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="font-display font-semibold text-grape-900 text-[20px]">
          {isSignup ? 'Create account' : 'Sign in'}
        </h2>
        <button
          onClick={onClose}
          className="p-1 text-grape-400 hover:text-grape-700 hover:bg-grape-50 rounded-md transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 pb-5 space-y-3">
        <p className="text-grape-500 text-[13px]">
          {isSignup ? 'Sync your trackers across devices.' : 'Welcome back.'}
        </p>

        <div>
          <label className="text-grape-700 text-[12px] font-semibold block mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            className="w-full bg-white border border-grape-200 focus:border-grape-400 rounded-lg px-3 py-2 text-[14px] text-grape-900 placeholder:text-grape-300 transition-colors focus:outline-none"
          />
        </div>

        <div>
          <label className="text-grape-700 text-[12px] font-semibold block mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            className="w-full bg-white border border-grape-200 focus:border-grape-400 rounded-lg px-3 py-2 text-[14px] text-grape-900 placeholder:text-grape-300 transition-colors focus:outline-none"
          />
          {isSignup && (
            <p className="text-grape-400 text-[11px] mt-1">
              At least 8 characters.
            </p>
          )}
        </div>

        {error && (
          <p className="text-red-600 text-[13px] bg-red-50 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!email || !password || submitting}
          className="w-full bg-grape-500 hover:bg-grape-600 disabled:bg-grape-200 disabled:cursor-not-allowed text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
        >
          {submitting ? '…' : isSignup ? 'Create account' : 'Sign in'}
        </button>

        <p className="text-center text-grape-500 text-[13px]">
          {isSignup ? 'Already have an account?' : "Don't have one?"}{' '}
          <button
            onClick={() => {
              setMode(isSignup ? 'signin' : 'signup');
              setError(null);
            }}
            className="font-semibold text-grape-700 hover:text-grape-900"
          >
            {isSignup ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </>
  );
}
