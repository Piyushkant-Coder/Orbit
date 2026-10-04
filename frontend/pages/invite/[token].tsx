import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface Invitation { workspaceName: string; email: string; role: string; expired: boolean }
export default function InvitePage() {
  const router = useRouter(); const token = String(router.query.token || ''); const { session, loading } = useAuth(); const [invite, setInvite] = useState<Invitation | null>(null); const [error, setError] = useState(''); const [accepted, setAccepted] = useState('');
  useEffect(() => { if (token) api<Invitation>(`/invitations/${token}`).then(setInvite).catch((e) => setError(e.message)); }, [token]);
  useEffect(() => { if (accepted) void router.replace(`/w/${accepted}`); }, [accepted, router]);
  const accept = async () => { try { const result = await api<{ workspaceId: string }>(`/invitations/${token}/accept`, { method: 'POST' }); setAccepted(result.workspaceId); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to accept invitation'); } };
  if (error) return <main className="auth-page"><section className="card auth-card"><div className="eyebrow">INVITATION</div><h1>Invite unavailable</h1><p className="error">{error}</p><Link className="button subtle" href="/login">Go to sign in</Link></section></main>;
  if (!invite) return <div className="loading-screen">Loading invitation…</div>;
  return <main className="auth-page"><section className="card auth-card"><div className="eyebrow">YOU’RE INVITED</div><h1>Join {invite.workspaceName}</h1><p className="muted">This invitation is for <strong>{invite.email}</strong> as a {invite.role.toLowerCase()}.</p>{invite.expired ? <p className="error">This invitation is no longer active.</p> : session ? <button className="button primary" onClick={() => void accept()}>Accept invitation</button> : <><p className="muted">Sign in with the invited email, then return here to accept.</p><Link className="button primary" href={`/login?invite=${encodeURIComponent(token)}`}>Continue to sign in</Link><Link className="button subtle" href={`/signup?email=${encodeURIComponent(invite.email)}&invite=${encodeURIComponent(token)}`}>Create an account</Link></>}{error && <p className="error">{error}</p>}{loading && <p className="muted">Checking your session…</p>}</section></main>;
}
