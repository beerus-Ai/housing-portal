import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API, ApiError, type Me, type Settings } from '../api';

interface AuthValue {
  me: Me | null;
  loading: boolean;
  settings: Settings | undefined;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await API.auth.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: API.settings.public, retry: false, staleTime: 60_000 });

  const refreshMe = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    await qc.refetchQueries({ queryKey: ['me'] });
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    await API.auth.login(email, password);
    await refreshMe();
  }, [refreshMe]);

  const loginWithGoogle = useCallback(async (credential: string) => {
    await API.auth.google(credential);
    await refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    try {
      await API.auth.logout();
    } finally {
      await qc.cancelQueries();
      qc.setQueryData(['me'], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'settings' });
    }
  }, [qc]);

  const value = useMemo<AuthValue>(
    () => ({ me: meQ.data ?? null, loading: meQ.isPending, settings: settingsQ.data, login, loginWithGoogle, logout }),
    [meQ.data, meQ.isPending, settingsQ.data, login, loginWithGoogle, logout],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
