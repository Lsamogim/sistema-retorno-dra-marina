import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { endpoints } from '../api/endpoints.js';
import { onUnauthorized } from '../api/client.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | anonymous | ready | error
  const [user, setUser] = useState(null);
  const [expired, setExpired] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await endpoints.getSession();
      if (s?.authenticated) {
        setUser(s.user);
        setStatus('ready');
      } else {
        setUser(null);
        setStatus('anonymous');
      }
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    onUnauthorized(() => {
      setExpired(true);
      setUser(null);
      setStatus('anonymous');
    });
    refresh();
    return () => onUnauthorized(null);
  }, [refresh]);

  const login = useCallback(async (username, password) => {
    const r = await endpoints.login(username, password);
    setExpired(false);
    setUser(r.user);
    setStatus('ready');
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await endpoints.logout().catch(() => {});
    setUser(null);
    setStatus('anonymous');
  }, []);

  const markPasswordChanged = useCallback(() => {
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
  }, []);

  const value = useMemo(
    () => ({ status, user, expired, isAdmin: user?.role === 'admin', login, logout, refresh, markPasswordChanged }),
    [status, user, expired, login, logout, refresh, markPasswordChanged]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession precisa estar dentro de SessionProvider');
  return ctx;
}
