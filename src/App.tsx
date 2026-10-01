import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import HomePage from './ui/pages/HomePage';
import TrackerPage from './ui/pages/TrackerPage';
import CreateTrackerPage from './ui/pages/CreateTrackerPage';
import MigrationManager from './ui/components/MigrationManager';
import { useClaimInvites } from './core/data';
import PasswordRecovery from './ui/components/PasswordRecovery';
import { ToastProvider } from './ui/components/Toast';
import ErrorBoundary from './ui/components/ErrorBoundary';
import LandingPage from './ui/pages/LandingPage';
import EmbedPage from './ui/pages/EmbedPage';

/**
 * Turns pending invitations into memberships once per session, so a shared
 * tracker shows up on the invitee's home page. Its own component because it
 * has to sit inside AuthProvider to see the session.
 */
function InviteClaimer() {
  useClaimInvites();
  return null;
}

/**
 * App-wide prompts that belong to the signed-in app, not to an embed sitting
 * on someone else's page.
 */
function AppPrompts() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/embed/')) return null;
  return (
    <>
      {/*
        Inside BrowserRouter so the modal sits above page content, outside
        <Routes> so navigation doesn't unmount it.
      */}
      <MigrationManager />
      <InviteClaimer />
      {/* Renders only after arriving via a recovery link. */}
      <PasswordRecovery />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/new" element={<CreateTrackerPage />} />
              <Route path="/t/:trackerId" element={<TrackerPage />} />
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/embed/:token" element={<EmbedPage />} />
            </Routes>
            <AppPrompts />
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
