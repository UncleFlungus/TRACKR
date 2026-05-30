import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { DataProvider } from './core/data';
import HomePage from './ui/pages/HomePage';
import TrackerPage from './ui/pages/TrackerPage';
import CreateTrackerPage from './ui/pages/CreateTrackerPage';

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
        </BrowserRouter>
      </DataProvider>
    </AuthProvider>
  );
}
