import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../../components/AppShell';
import AccessibleDialog from '../../components/AccessibleDialog';
import { useAuth } from '../../lib/auth';
import { api } from '../../lib/api';

interface Workspace {
  id: string;
  name: string;
  role: string;
}
export default function Workspaces() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Workspace[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => {
    if (!loading && !session) void router.replace('/login');
    if (session)
      api<{ items: Workspace[] }>('/workspaces')
        .then((r) => setItems(r.items))
        .catch((e) => setError(e.message));
  }, [loading, session, router]);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await api<{ workspace: Workspace }>('/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setItems((current) => [...current, result.workspace]);
      setName('');
      setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create workspace');
    }
  };
  if (loading || !session) return <div className="loading-screen">Loading workspaces…</div>;
  return (
    <AppShell>
      <section className="content-narrow workspace-home">
        <div className="section-heading workspace-heading">
          <div>
            <div className="eyebrow">YOUR SPACES</div>
            <h1>Workspaces</h1>
            <p className="muted">Choose a workspace or start a new one.</p>
          </div>
          <button
            className="button primary create-space-button"
            onClick={() => setShowCreate(true)}
          >
            ＋ New workspace
          </button>
        </div>
        {error && <div className="notice error">{error}</div>}
        <div className="workspace-grid">
          {items.map((workspace) => (
            <Link className="workspace-card" href={`/w/${workspace.id}`} key={workspace.id}>
              <span className="workspace-mark">{workspace.name.slice(0, 1).toUpperCase()}</span>
              <span className="workspace-card-copy">
                <strong>{workspace.name}</strong>
                <small>{workspace.role}</small>
              </span>
              <span className="arrow">↗</span>
            </Link>
          ))}
          {!items.length && (
            <div className="workspace-empty">
              <span className="workspace-mark">+</span>
              <span>
                <strong>Your first space is waiting</strong>
                <small>Create one below to get started.</small>
              </span>
            </div>
          )}
        </div>
        <div className="workspace-footer-note">
          <span>{items.length.toString().padStart(2, '0')} spaces</span>
          <span>Private by default</span>
        </div>
      </section>
      {showCreate && (
        <AccessibleDialog
          label="Create a workspace"
          className="modal-card"
          onClose={() => setShowCreate(false)}
        >
          <form onSubmit={create}>
            <div className="modal-heading">
              <div>
                <div className="eyebrow">WORKSPACE SETUP</div>
                <h2>Create a workspace</h2>
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
              Give your team a focused home for projects, decisions, and momentum.
            </p>
            <label>
              Workspace name
              <input
                data-dialog-initial-focus
                placeholder="Northstar Studio"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <div className="modal-notes">
              <span>
                <strong>Private by default</strong>
                <small>Only invited members can access it.</small>
              </span>
              <span>
                <strong>Ready for live work</strong>
                <small>Start with a board and lists.</small>
              </span>
            </div>
            <div className="modal-actions">
              <button type="button" className="button subtle" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="button primary">＋ Create workspace</button>
            </div>
          </form>
        </AccessibleDialog>
      )}
    </AppShell>
  );
}
