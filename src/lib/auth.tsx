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

  useEffect(() => {
    // 1. Load any existing session (from localStorage, where Supabase persists it).
    //    Important: this runs on every page load so a refresh doesn't sign the user out.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // 2. Subscribe to all subsequent auth changes. This catches:
    //    - sign in / sign out
    //    - token refresh (Supabase rotates tokens automatically)
    //    - the redirect back from an email-confirmation link
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
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
        // Where the confirmation link lands. Without this, Supabase falls back
        // to the project's Site URL, which is one fixed value — so a link
        // generated from localhost tries to return to production, and an
        // unconfigured Site URL produces "requested path is invalid".
        //
        // Deriving it from the current origin means the link comes back to
        // wherever the person actually signed up. Both origins still have to
        // be listed under Auth → URL Configuration → Redirect URLs; Supabase
        // rejects any redirect_to that isn't allowlisted, which is what makes
        // this safe rather than an open redirect.
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    // With confirm-email ON, signUp creates the user but returns session: null.
    // The session only appears after the user clicks the email link.
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

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signUp,
        signIn,
        signOut,
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
