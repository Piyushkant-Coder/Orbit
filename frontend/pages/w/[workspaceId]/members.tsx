import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppShell from '../../../components/AppShell';
import { useAuth } from '../../../lib/auth';
import { api } from '../../../lib/api';

interface Member {
  id: string;
  role: string;
  user: { name: string; email: string };
}
interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}
export default function Members() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const workspaceId = String(router.query.workspaceId || '');
  const role = session?.memberships.find((m) => m.workspaceId === workspaceId)?.role;
  const canInvite = role === 'OWNER' || role === 'ADMIN';
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [membersLoading, setMembersLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [revokingId, setRevokingId] = useState('');
  const load = useCallback(async () => {
    setMembersLoading(true);
    setError('');
    try {
      const [m, i] = await Promise.all([
        api<{ items: Member[] }>(`/workspaces/${workspaceId}/members`),
        canInvite
          ? api<{ items: Invitation[] }>(`/workspaces/${workspaceId}/invitations`)
          : Promise.resolve({ items: [] }),
      ]);
      setMembers(m.items);
      setInvitations(i.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load workspace members');
    } finally {
      setMembersLoading(false);
    }
  }, [workspaceId, canInvite]);
  useEffect(() => {
    if (!loading && !session) void router.replace('/login');
    if (session && workspaceId) window.setTimeout(() => void load(), 0);
  }, [loading, session, workspaceId, router, load]);
  const invite = async () => {
    setInviting(true);
    setError('');
    try {
      const result = await api<{ inviteUrl: string }>(`/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email, role: inviteRole }),
      });
      setInviteUrl(result.inviteUrl);
      setEmail('');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to invite');
    } finally {
      setInviting(false);
    }
  };
  const revoke = async (id: string) => {
    setRevokingId(id);
    setError('');
    try {
      await api(`/workspaces/${workspaceId}/invitations/${id}`, { method: 'DELETE' });
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to revoke');
    } finally {
      setRevokingId('');
    }
  };
  if (loading || !session) return <div className="loading-screen">Loading members…</div>;
  return (
    <AppShell workspaceId={workspaceId}>
      <section className="content-narrow">
        <div className="eyebrow">PEOPLE</div>
        <h1>Members</h1>
        <p className="muted">Roles are enforced by the server on every request.</p>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="card table-card">
          {membersLoading && (
            <p className="muted empty-state" role="status">
              Loading members…
            </p>
          )}
          {members.map((member) => (
            <div className="member-row" key={member.id}>
              <span className="avatar">{member.user.name.slice(0, 1)}</span>
              <span>
                <strong>{member.user.name}</strong>
                <small>{member.user.email}</small>
              </span>
              <span className="role-pill">{member.role}</span>
            </div>
          ))}
          {!membersLoading && !error && !members.length && (
            <p className="muted empty-state">No members found.</p>
          )}
        </div>
        {canInvite && (
          <>
            <div className="section-heading compact">
              <div>
                <div className="eyebrow">ACCESS</div>
                <h2>Invite people</h2>
              </div>
            </div>
            <div className="card create-row">
              <input
                type="email"
                aria-label="Invitee email address"
                placeholder="person@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <select
                aria-label="Invitee role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="MEMBER">Member</option>
                <option value="VIEWER">Viewer</option>
                {role === 'OWNER' && <option value="ADMIN">Admin</option>}
              </select>
              <button
                className="button primary"
                disabled={!email || inviting}
                onClick={() => void invite()}
              >
                {inviting ? 'Sending…' : 'Send invite'}
              </button>
            </div>
            {inviteUrl && (
              <div className="notice">
                Invite link: <code>{inviteUrl}</code>
                <button
                  className="button subtle"
                  onClick={() => void navigator.clipboard?.writeText(inviteUrl)}
                >
                  Copy
                </button>
              </div>
            )}
            <div className="card table-card">
              {!membersLoading && !error && !invitations.length && (
                <p className="muted empty-state">No pending invitations.</p>
              )}
              {invitations.map((invitation) => (
                <div className="member-row" key={invitation.id}>
                  <span>
                    <strong>{invitation.email}</strong>
                    <small>
                      {invitation.role} · expires{' '}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </small>
                  </span>
                  <button
                    className="button subtle"
                    disabled={revokingId === invitation.id}
                    onClick={() => void revoke(invitation.id)}
                  >
                    {revokingId === invitation.id ? 'Revoking…' : 'Revoke'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
