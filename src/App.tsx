import { BrowserRouter, Route, Routes } from 'react-router-dom';
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

/**
 * Turns pending invitations into memberships once per session, so a shared
 * tracker shows up on the invitee's home page. Its own component because it
 * has to sit inside AuthProvider to see the session.
 */
function InviteClaimer() {
  useClaimInvites();
  return null;
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
            </Routes>
            {/*
            Inside BrowserRouter so the modal sits above page content, outside
            <Routes> so navigation doesn't unmount it.
          */}
            <MigrationManager />
            <InviteClaimer />
            {/* Renders only after arriving via a recovery link. */}
            <PasswordRecovery />
          </ErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
