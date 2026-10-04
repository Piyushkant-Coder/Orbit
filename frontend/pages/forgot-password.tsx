import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api } from '../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const result = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to request a password reset'); }
  };
  return <main className="auth-page"><section className="auth-showcase"><Link href="/login" className="brand auth-brand"><span className="brand-mark">O</span><span>Orbit</span></Link><div className="showcase-copy"><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Find your way<br /><em>back.</em></h1><p>We’ll send a secure, time-limited link to your account email.</p></div><small>Private by default · Built for focused teams</small></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><div className="panel-top"><span className="eyebrow">PASSWORD RESET</span><span className="help-mark">?</span></div><h1>Forgot your password?</h1><p className="muted">Enter your account email and we’ll send reset instructions.</p><label>Email<input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>{error && <p className="error">{error}</p>}{message && <p className="notice">{message}</p>}<button className="button primary" type="submit">Send reset link <span>↗</span></button><p className="auth-links"><Link href="/login">Back to sign in</Link></p></form></section></main>;
}
