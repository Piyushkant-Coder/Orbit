import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import { api } from '../lib/api';

export default function ResetPassword() {
  const router = useRouter();
  const token = String(router.query.token || '');
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    try {
      const result = await api<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      setMessage(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to reset password'); }
  };
  return <main className="auth-page"><section className="auth-showcase"><Link href="/login" className="brand auth-brand"><span className="brand-mark">O</span><span>Orbit</span></Link><div className="showcase-copy"><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Choose a<br /><em>new key.</em></h1><p>Use a strong password you do not reuse elsewhere.</p></div><small>Private by default · Built for focused teams</small></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><div className="panel-top"><span className="eyebrow">PASSWORD RESET</span><span className="help-mark">?</span></div><h1>Set a new password</h1><p className="muted">Your password must be at least 10 characters.</p><label>New password<input type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required /></label><label>Confirm password<input type="password" minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label>{error && <p className="error">{error}</p>}{message ? <><p className="notice">{message}</p><Link className="button primary" href="/login">Continue to sign in</Link></> : <button className="button primary" type="submit" disabled={!token}>Reset password <span>↗</span></button>}</form></section></main>;
}
