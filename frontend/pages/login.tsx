import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { login } = useAuth(); const router = useRouter();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); try { await login(email, password); await router.push('/w'); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in'); } };
  return <main className="auth-page"><section className="auth-showcase"><Link href="/login" className="brand auth-brand"><span className="brand-mark">O</span><span>Orbit</span></Link><div className="showcase-copy"><div className="eyebrow">A calmer way to collaborate</div><h1>Make progress<br /><em>visible.</em></h1><p>Bring plans, people, and momentum into one clear shared space.</p></div><div className="showcase-orbit"><span /><span /><span /></div><small>Plan clearly · Work together · Ship with confidence</small></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><div className="panel-top"><span className="eyebrow">WELCOME BACK</span><span className="help-mark">?</span></div><h1>Sign in to Orbit</h1><p className="muted">Pick up where your team left off.</p><label>Email<input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{error && <p className="error">{error}</p>}<button className="button primary" type="submit">Continue <span>↗</span></button><p className="auth-links"><Link href="/forgot-password">Forgot password?</Link></p><p className="auth-footer">New to Orbit? <Link href="/signup">Create an account</Link></p></form><small className="legal-note">Private by default · Built for focused teams</small></section></main>;
}
