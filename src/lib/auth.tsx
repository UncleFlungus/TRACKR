import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  /** True while the initial session check is in flight. */
  loading: boolean;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  /** Sends a recovery link. Always resolves without error; see below. */
  requestPasswordReset: (email: string) => Promise<{ error: AuthError | null }>;
  /** Sets a new password for the user in the current (recovery) session. */
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
  /**
   * True after arriving via a recovery link. Supabase signs the user in when
   * they click it, so without this they land on the home page with no prompt
   * to set a password, which is the one thing they came to do.
   */
  isRecovering: boolean;
  endRecovery: () => void;
}

interface SignUpResult {
  /**
   * True when signup succeeded but the user needs to click the
   * email-confirmation link before they can sign in.
   */
  needsVerification: boolean;
  error: AuthError | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    // Load any existing session from localStorage, where Supabase persists it.
    // Runs on every page load so a refresh doesn't sign the user out.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Then catch everything after that: sign in and out, the token refreshes
    // Supabase does on its own, and the redirect back from a confirmation
    // link.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setLoading(false);
      // Fired once, when the recovery link is exchanged for a session.
      if (event === 'PASSWORD_RECOVERY') setIsRecovering(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
  ): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Where the confirmation link lands. Without it Supabase falls back to
        // the project's Site URL, a single fixed value, so a link generated on
        // localhost tries to return to production and an unconfigured Site URL
        // gives "requested path is invalid".
        //
        // Taking the current origin sends the link back to wherever the person
        // actually signed up. Both origins still have to be listed under Auth
        // > URL Configuration > Redirect URLs: Supabase rejects any
        // redirect_to that isn't allowlisted, which is what keeps this from
        // being an open redirect.
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    // With confirm-email on, signUp creates the user but returns session: null.
    // The session only appears once they click the link.
    return {
      needsVerification: !error && !data.session,
      error,
    };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const requestPasswordReset = async (email: string) => {
    // Supabase answers the same way whether or not the address has an account,
    // and so does the UI. A reset form that said "no such user" would be an
    // account enumeration oracle.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  };

  const endRecovery = () => setIsRecovering(false);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        requestPasswordReset,
        updatePassword,
        isRecovering,
        endRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}
