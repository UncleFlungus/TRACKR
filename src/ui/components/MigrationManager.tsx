import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useDataInvalidate } from '@/core/data';
import * as cloud from '@/core/cloud';
import {
  getLocalDataSummary,
  hasBeenHandled,
  markHandled,
  migrateLocalToCloud,
  type LocalDataSummary,
} from '@/core/migration';
import MigrationModal from './MigrationModal';

/**
 * Decides when to offer the local-to-cloud import. Acts only on a transition to
 * signed-in, and skips when this device already handled the user, when they
 * already have cloud data (so they're signing in, not signing up), or when
 * there is no local data to import.
 *
 * Renders nothing of its own, just the modal when it's time.
 */
export default function MigrationManager() {
  const { user } = useAuth();
  const { invalidate } = useDataInvalidate();
  const [summary, setSummary] = useState<LocalDataSummary | null>(null);

  useEffect(() => {
    if (!user) {
      setSummary(null);
      return;
    }
    if (hasBeenHandled(user.id)) return;

    let cancelled = false;

    // Cloud data means an existing user, so mark handled and say nothing.
    // Empty cloud plus local data is the one case worth prompting about.
    // Both empty, nothing to do.
    Promise.all([cloud.fetchTrackers(), getLocalDataSummary()])
      .then(([cloudTrackers, localSummary]) => {
        if (cancelled) return;
        if (cloudTrackers.length > 0) {
          markHandled(user.id);
          return;
        }
        if (localSummary.trackers === 0) {
          markHandled(user.id);
          return;
        }
        setSummary(localSummary);
      })
      .catch((err) => {
        // A failed check shouldn't block the app.
        console.error('Migration check failed', err);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || !summary) return null;

  return (
    <MigrationModal
      summary={summary}
      onImport={async () => {
        await migrateLocalToCloud(user.id);
        invalidate();
      }}
      onSkip={() => {
        markHandled(user.id);
        setSummary(null);
      }}
    />
  );
}
