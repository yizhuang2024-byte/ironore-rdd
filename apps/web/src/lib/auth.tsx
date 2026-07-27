import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

export interface AuthRole {
  role: string;
  unitId: string | null;
}

export interface CurrentUser {
  id: string;
  account: string;
  displayName: string;
  orgId: string;
  roles: AuthRole[];
  permissions: string[];
  attendantId: string | null;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (account: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  isAttendantOnly: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * 登出時清除 Service Worker 快取。
 *
 * 行動端的班表快取含個案姓名、電話與地址 —— 若登出後留在裝置上，
 * 下一個使用者（或撿到手機的人）打開瀏覽器就看得到。這是很容易漏掉的外洩點。
 */
async function clearCaches() {
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // 快取清除失敗不應阻擋登出流程
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api
      .get<CurrentUser>('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (account: string, password: string) => {
    const r = await api.post<CurrentUser>('/auth/login', {
      account,
      password,
      deviceLabel: navigator.userAgent.slice(0, 60),
    });
    setUser(r.data);
    return r.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      await clearCaches();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login,
      logout,
      can: (p) => user?.permissions.includes(p) ?? false,
      isAttendantOnly:
        (user?.roles.length ?? 0) > 0 && (user?.roles.every((r) => r.role === 'ATTENDANT') ?? false),
    }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必須在 AuthProvider 內使用');
  return ctx;
}
