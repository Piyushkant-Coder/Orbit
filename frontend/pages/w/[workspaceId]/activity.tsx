import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../../components/AppShell';
import { useAuth } from '../../../lib/auth';
import { api } from '../../../lib/api';

interface Activity {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actor?: { name: string } | null;
}
export default function ActivityPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const workspaceId = String(router.query.workspaceId || '');
  const [items, setItems] = useState<Activity[]>([]);
  const [error, setError] = useState('');
  const [activityLoading, setActivityLoading] = useState(true);
  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setError('');
    try {
      const response = await api<{ items: Activity[] }>(
        `/workspaces/${workspaceId}/activity?limit=50`
      );
      setItems(response.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load activity');
    } finally {
      setActivityLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => {
    if (!loading && !session) void router.replace('/login');
    if (session && workspaceId) void loadActivity();
  }, [loading, session, workspaceId, router, loadActivity]);
  if (loading || !session) return <div className="loading-screen">Loading activity…</div>;
  return (
    <AppShell workspaceId={workspaceId}>
      <section className="content-narrow">
        <div className="eyebrow">AUDIT TRAIL</div>
        <h1>Activity</h1>
        <p className="muted">A chronological record of workspace changes.</p>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button className="button subtle" onClick={() => void loadActivity()}>
              Try again
            </button>
          </div>
        )}
        <div className="card activity-list">
          {activityLoading && (
            <p className="muted empty-state" role="status">
              Loading activity…
            </p>
          )}
          {items.map((item) => (
            <div className="activity-row" key={item.id}>
              <span className="activity-dot" />
              <div>
                <strong>{item.action.replace('.', ' · ')}</strong>
                <p>
                  {item.actor?.name || 'System'} · {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          {!activityLoading && !error && !items.length && (
            <p className="muted empty-state">No workspace activity yet.</p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
