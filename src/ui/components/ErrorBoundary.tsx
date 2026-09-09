import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one bad component doesn't take the app with it.
 *
 * Without this, a throw during render unmounts the entire tree: the page goes
 * blank, and because the crash is in React rather than the browser, client-side
 * navigation can't recover it either — "go back" lands on an equally blank
 * page and only a reload brings anything back. That symptom is what surfaced
 * the list-field bug, and it would hide the next one just as well.
 *
 * A class component because error boundaries have no hook equivalent.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for the browser console; there's no error reporting service here.
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-full max-w-2xl mx-auto px-6 py-16">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
          <AlertCircle className="w-7 h-7 text-rose-500" />
        </div>
        <h1 className="font-display font-semibold text-[22px] text-grape-900 mb-2">
          Something broke
        </h1>
        <p className="text-grape-500 text-[14px] mb-4">
          Your data is safe — this is a display problem, not a saving one.
        </p>
        <pre className="bg-grape-50 border border-grape-100 rounded-lg p-3 text-[12px] text-grape-700 whitespace-pre-wrap break-words mb-5">
          {error.message}
        </pre>
        <div className="flex items-center gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="bg-grape-500 hover:bg-grape-600 text-white font-display font-semibold rounded-xl px-4 py-2.5 text-[14px] transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => {
              // A full load rather than a router navigation: whatever state
              // caused the throw lives in memory, and this is the only way to
              // be sure it's gone.
              window.location.href = '/';
            }}
            className="border border-grape-200 hover:bg-grape-50 text-grape-700 font-semibold rounded-xl px-4 py-2.5 text-[14px] transition-colors"
          >
            Back to trackers
          </button>
        </div>
      </div>
    );
  }
}
