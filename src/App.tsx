import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { DataProvider } from './core/data';
import HomePage from './ui/pages/HomePage';
import TrackerPage from './ui/pages/TrackerPage';
import CreateTrackerPage from './ui/pages/CreateTrackerPage';
import MigrationManager from './ui/components/MigrationManager';

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/new" element={<CreateTrackerPage />} />
            <Route path="/t/:trackerId" element={<TrackerPage />} />
          </Routes>
          {/*
            MigrationManager listens to auth state and renders the migration
            prompt when appropriate (fresh signup with local Dexie data).
            It lives inside BrowserRouter so its modal sits above page content,
            but outside <Routes> so it isn't unmounted on navigation.
          */}
          <MigrationManager />
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  );
}
