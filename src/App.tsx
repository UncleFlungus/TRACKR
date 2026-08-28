import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import HomePage from './ui/pages/HomePage';
import TrackerPage from './ui/pages/TrackerPage';
import CreateTrackerPage from './ui/pages/CreateTrackerPage';
import MigrationManager from './ui/components/MigrationManager';
import { useClaimInvites } from './core/data';
import PasswordRecovery from './ui/components/PasswordRecovery';
import LandingPage from './ui/pages/LandingPage';

/**
 * Turns pending invitations into memberships once per session, so a shared
 * tracker simply appears on the invitee's home page. Lives in its own
 * component because it has to sit inside AuthProvider to see the session.
 */
function InviteClaimer() {
  useClaimInvites();
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/new" element={<CreateTrackerPage />} />
          <Route path="/t/:trackerId" element={<TrackerPage />} />
          <Route path="/landing" element={<LandingPage />} />
        </Routes>
        {/*
            MigrationManager listens to auth state and renders the migration
            prompt when appropriate (fresh signup with local Dexie data).
            It lives inside BrowserRouter so its modal sits above page content,
            but outside <Routes> so it isn't unmounted on navigation.
          */}
        <MigrationManager />
        <InviteClaimer />
        {/* Renders only after arriving via a recovery link. */}
        <PasswordRecovery />
      </BrowserRouter>
    </AuthProvider>
  );
}
