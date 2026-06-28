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
 * Watches auth state and decides when to show the migration prompt.
 *
 * Rules:
 * - Only acts when user transitions to signed-in.
 * - Skips if we've already handled migration for this user on this device.
 * - Skips if the user already has cloud data (they're an existing user
 *   signing in, not a fresh signup).
 * - Skips if the user has no local data (nothing to migrate).
 *
 * Renders nothing in the DOM directly — just the modal when it's time.
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

    // We check both directions in parallel: cloud data and local data.
    // - Cloud data exists → existing user, not a fresh signup → silently mark handled.
    // - Cloud empty + local non-empty → prompt.
    // - Both empty → silently mark handled, nothing to do.
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
        // Don't block the app on a check failure — just log it.
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
        invalidate('trackers', 'fields', 'entries');
      }}
      onSkip={() => {
        markHandled(user.id);
        setSummary(null);
      }}
    />
  );
}
