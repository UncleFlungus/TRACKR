import { useEffect, useState } from 'react';
import { X, Mail, LogOut, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useHideTemplates } from '@/lib/preferences';

interface Props {
  onClose: () => void;
}

type Mode = 'signin' | 'signup' | 'check_email' | 'forgot' | 'reset_sent';

export default function AuthModal({ onClose }: Props) {
  const { user, signIn, signUp, signOut, requestPasswordReset } = useAuth();

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
          <SignedOutPanel
            signIn={signIn}
            signUp={signUp}
            requestPasswordReset={requestPasswordReset}
            onClose={onClose}
          />
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
  const [showDelete, setShowDelete] = useState(false);

  async function handleSignOut() {
    await onSignOut();
    onClose();
  }

  if (showDelete) {
    return (
      <DeleteAccountPanel
        email={email}
        onBack={() => setShowDelete(false)}
        onSuccess={onClose}
      />
    );
  }
  const [hideTemplates, setHideTemplates] = useHideTemplates();

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

        {/* Templates visibility toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-[14px] text-grape-700">
            Show templates on home
          </span>
          <input
            type="checkbox"
            checked={!hideTemplates}
            onChange={(e) => setHideTemplates(!e.target.checked)}
            className="w-4 h-4 accent-grape-500 cursor-pointer"
          />
        </label>

        <button
          onClick={handleSignOut}
          className="w-full border border-grape-200 hover:bg-grape-50 text-grape-700 text-[14px] font-semibold rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
        <button
          onClick={() => setShowDelete(true)}
          className="w-full text-red-600 hover:text-red-700 text-[13px] font-semibold py-1 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete account
        </button>
      </div>
    </>
  );
}

/**
 * Account deletion confirmation. Requires typing the word "delete" so it can't
 * happen by muscle memory. Once the RPC succeeds their auth row is gone, so the
 * session is cleared and the modal closes.
 */
function DeleteAccountPanel({
  email,
  onBack,
  onSuccess,
}: {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('delete_my_account');
      if (rpcError) throw rpcError;
      // The user no longer exists, so sign out just clears the local session.
      await supabase.auth.signOut();
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not delete account.');
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button
          onClick={onBack}
          className="text-grape-500 hover:text-grape-700 text-[13px] font-semibold"
        >
          ← Back
        </button>
      </div>
      <div className="px-5 pb-5">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <h2 className="font-display font-semibold text-grape-900 text-[20px] mb-2">
          Delete account?
        </h2>
        <p className="text-grape-600 text-[14px] mb-1">
          This will permanently delete{' '}
          <span className="font-semibold text-grape-900">{email}</span> and all
          its cloud data — every tracker, field, and entry. This cannot be
          undone.
        </p>
        <p className="text-grape-500 text-[13px] mb-4">
          Type{' '}
          <span className="font-mono text-grape-900 bg-grape-100 px-1 rounded">
            delete
          </span>{' '}
          to confirm.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="delete"
          autoFocus
          className="w-full bg-white border border-grape-200 focus:border-red-400 rounded-lg px-3 py-2 text-[14px] text-grape-900 placeholder:text-grape-300 transition-colors focus:outline-none mb-3"
        />
        {error && (
          <p className="text-red-600 text-[13px] bg-red-50 rounded-md px-3 py-2 mb-3">
            {error}
          </p>
        )}
        <button
          onClick={handleDelete}
          disabled={confirmText !== 'delete' || submitting}
          className="w-full bg-red-600 hover:bg-red-700 disabled:bg-grape-200 disabled:cursor-not-allowed text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
        >
          {submitting ? '…' : 'Permanently delete account'}
        </button>
      </div>
    </>
  );
}

function SignedOutPanel({
  signIn,
  signUp,
  requestPasswordReset,
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
  requestPasswordReset: (
    email: string,
  ) => Promise<{ error: { message: string } | null }>;
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

  async function handleForgot() {
    if (!email) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error } = await requestPasswordReset(email);
      if (error) setError(error.message);
      else setMode('reset_sent');
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === 'forgot') {
    return (
      <>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-display font-semibold text-grape-900 text-[20px]">
            Reset password
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
            We'll email you a link to set a new one.
          </p>
          <div>
            <label className="text-grape-700 text-[12px] font-semibold block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleForgot()}
              autoComplete="email"
              autoFocus
              className="w-full bg-white border border-grape-200 focus:border-grape-400 rounded-lg px-3 py-2 text-[14px] text-grape-900 placeholder:text-grape-300 transition-colors focus:outline-none"
            />
          </div>
          {error && (
            <p className="text-red-600 text-[13px] bg-red-50 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          <button
            onClick={handleForgot}
            disabled={!email || submitting}
            className="w-full bg-grape-500 hover:bg-grape-600 disabled:bg-grape-200 disabled:cursor-not-allowed text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors"
          >
            {submitting ? '…' : 'Send reset link'}
          </button>
          <button
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
            className="w-full text-grape-500 hover:text-grape-700 text-[13px] font-semibold py-1.5 transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </>
    );
  }

  if (mode === 'reset_sent') {
    return (
      <div className="p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-grape-100 flex items-center justify-center mx-auto mb-4">
          <Mail className="w-7 h-7 text-grape-600" />
        </div>
        <h2 className="font-display font-semibold text-grape-900 text-[20px] mb-2">
          Check your email
        </h2>
        {/* Hedged for the same reason as signup: confirming whether an
            address has an account would make this form an enumeration tool. */}
        <p className="text-grape-600 text-[14px] mb-6">
          If <span className="font-semibold text-grape-900">{email}</span> has
          an account, a reset link is on its way. Open it and you'll be asked
          to set a new password.
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

  if (mode === 'check_email') {
    return (
      <div className="p-6 text-center">
        <div className="w-14 h-14 rounded-full bg-grape-100 flex items-center justify-center mx-auto mb-4">
          <Mail className="w-7 h-7 text-grape-600" />
        </div>
        <h2 className="font-display font-semibold text-grape-900 text-[20px] mb-2">
          Check your email
        </h2>
        {/*
          The hedging is intentional. Supabase returns the same response either
          way, registered or not, and sends no email in the second case, so
          promising one flatly would sometimes be a lie. Phrasing it as a
          condition is honest and still doesn't confirm whether the account
          exists, which is what stops signup being a way to discover who has
          one.
        */}
        <p className="text-grape-600 text-[14px] mb-2">
          If <span className="font-semibold text-grape-900">{email}</span> isn't
          already registered, a confirmation link is on its way. Click it to
          finish signing up.
        </p>
        <p className="text-grape-400 text-[13px] mb-6">
          Nothing arrives? You may already have an account with this email.
        </p>
        <button
          onClick={onClose}
          className="w-full bg-grape-500 hover:bg-grape-600 text-white font-display font-semibold rounded-xl py-2.5 text-[14px] transition-colors mb-2"
        >
          Got it
        </button>
        <button
          onClick={() => setMode('signin')}
          className="w-full text-grape-500 hover:text-grape-700 text-[13px] font-semibold py-1.5 transition-colors"
        >
          Sign in instead
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
          {isSignup ? (
            <p className="text-grape-400 text-[11px] mt-1">
              At least 8 characters.
            </p>
          ) : (
            <button
              onClick={() => {
                setMode('forgot');
                setError(null);
              }}
              className="text-grape-400 hover:text-grape-600 text-[11px] mt-1 transition-colors"
            >
              Forgot password?
            </button>
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
