import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { api, bootstrapSession, logout as apiLogout, setAccessToken } from './api';

export interface User { id: string; email: string; name: string }
export interface Session { user: User; memberships: Array<{ workspaceId: string; workspaceName: string; role: string }> }
interface AuthContextValue { session: Session | null; loading: boolean; login: (email: string, password: string) => Promise<void>; signup: (email: string, name: string, password: string) => Promise<void>; logout: () => Promise<void> }

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    bootstrapSession().then((token) => token ? api<Session>('/auth/me').then(setSession).catch(() => undefined) : undefined).finally(() => setLoading(false));
  }, []);
  const value = useMemo<AuthContextValue>(() => ({
    session, loading,
    login: async (email, password) => {
      const result = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setAccessToken(result.accessToken); setSession(await api<Session>('/auth/me'));
    },
    signup: async (email, name, password) => {
      const result = await api<{ accessToken: string }>('/auth/signup', { method: 'POST', body: JSON.stringify({ email, name, password }) });
      setAccessToken(result.accessToken); setSession(await api<Session>('/auth/me'));
    },
    logout: async () => { await apiLogout(); setSession(null); },
  }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
