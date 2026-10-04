import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../../components/AppShell';
import AccessibleDialog from '../../../components/AccessibleDialog';
import { useAuth } from '../../../lib/auth';
import { api } from '../../../lib/api';

interface Board {
  id: string;
  name: string;
  description?: string | null;
}
interface Dashboard {
  boardCount: number;
  memberCount: number;
  tasksByStatus: Array<{ status: string; _count: { _all: number } }>;
  recentActivity: Array<{ id: string; action: string; createdAt: string }>;
}
export default function WorkspaceHome() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const workspaceId = String(router.query.workspaceId || '');
  const [boards, setBoards] = useState<Board[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => {
    if (!loading && !session) void router.replace('/login');
    if (session && workspaceId)
      Promise.all([
        api<{ items: Board[] }>(`/workspaces/${workspaceId}/boards`),
        api<Dashboard>(`/workspaces/${workspaceId}/dashboard`),
      ])
        .then(([b, d]) => {
          setBoards(b.items);
          setDashboard(d);
        })
        .catch((e) => setError(e.message));
  }, [loading, session, workspaceId, router]);
  const createBoard = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await api<{ board: Board }>(`/workspaces/${workspaceId}/boards`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      setBoards((current) => [...current, result.board]);
      setName('');
      setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create board');
    }
  };
  if (loading || !session || !workspaceId)
    return <div className="loading-screen">Loading workspace…</div>;
  return (
    <AppShell workspaceId={workspaceId}>
      <section className="content-wide">
        <div className="section-heading">
          <div>
            <div className="eyebrow">WORKSPACE OVERVIEW</div>
            <h1>Command center</h1>
            <p className="muted">A calm view of what your team is shipping.</p>
          </div>
          <div className="section-actions">
            <Link className="button subtle" href={`/w/${workspaceId}/activity`}>
              View activity
            </Link>
            <button className="button primary compact-button" onClick={() => setShowCreate(true)}>
              ＋ New board
            </button>
          </div>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="stats-grid">
          <div className="stat-card">
            <small>Boards</small>
            <strong>{dashboard?.boardCount ?? '—'}</strong>
            <span>Active spaces</span>
          </div>
          <div className="stat-card">
            <small>Members</small>
            <strong>{dashboard?.memberCount ?? '—'}</strong>
            <span>People with access</span>
          </div>
          <div className="stat-card">
            <small>Tasks</small>
            <strong>
              {dashboard
                ? dashboard.tasksByStatus.reduce((total, item) => total + item._count._all, 0)
                : '—'}
            </strong>
            <span>Across all boards</span>
          </div>
        </div>
        <div className="section-heading compact">
          <div>
            <div className="eyebrow">WORK IN PROGRESS</div>
            <h2>Boards</h2>
          </div>
          <span className="section-count">{boards.length.toString().padStart(2, '0')} total</span>
        </div>
        <div className="board-grid">
          {boards.map((board) => (
            <Link className="board-card" href={`/w/${workspaceId}/b/${board.id}`} key={board.id}>
              <span className="board-accent" />
              <strong>{board.name}</strong>
              <p>{board.description || 'Open board'}</p>
              <span className="arrow">→</span>
            </Link>
          ))}
          {!boards.length && (
            <div className="empty-panel">
              <span className="workspace-mark">+</span>
              <div>
                <strong>Your workspace is ready.</strong>
                <p>Create your first board to give the team a place to plan.</p>
              </div>
              <button className="button subtle" onClick={() => setShowCreate(true)}>
                Create board
              </button>
            </div>
          )}
        </div>
      </section>
      {showCreate && (
        <AccessibleDialog
          label="Create a board"
          className="modal-card"
          onClose={() => setShowCreate(false)}
        >
          <form onSubmit={createBoard}>
            <div className="modal-heading">
              <div>
                <div className="eyebrow">BOARD SETUP</div>
                <h2>Create a board</h2>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close dialog"
                onClick={() => setShowCreate(false)}
              >
                ×
              </button>
            </div>
            <p className="muted">
              Give the team a focused space for a project, product, or workflow.
            </p>
            <label>
              Board name
              <input
                data-dialog-initial-focus
                placeholder="Product launch"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button subtle" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="button primary">Create board</button>
            </div>
          </form>
        </AccessibleDialog>
      )}
    </AppShell>
  );
}
