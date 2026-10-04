import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';

export default function Home() {
  const router = useRouter();
  const { session, loading } = useAuth();
  useEffect(() => { if (!loading) void router.replace(session ? '/w' : '/login'); }, [loading, session, router]);
  return <div className="loading-screen">Loading workspace…</div>;
}
