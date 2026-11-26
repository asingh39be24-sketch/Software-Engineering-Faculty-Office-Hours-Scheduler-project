import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler, tokenStore } from '../services/api.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

export const homeFor = (role) => ({ student: '/student', faculty: '/faculty', admin: '/admin' })[role] || '/';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(tokenStore.get() ? 'loading' : 'anonymous');
  const navigate = useNavigate();
  const toast = useToast();

  const logout = useCallback(
    (message) => {
      tokenStore.clear();
      toast.clear();
      setUser(null);
      setStatus('anonymous');
      navigate('/login', { replace: true });
      if (message) toast.info(message);
    },
    [navigate, toast]
  );

  useEffect(() => {
    setUnauthorizedHandler((msg) => logout(msg || 'Your session has ended. Please sign in again.'));
  }, [logout]);

  // Restore a persisted session.
  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .me()
      .then(({ user: u }) => { setUser(u); setStatus('authenticated'); })
      .catch((e) => {
        if (e.status === 401) { tokenStore.clear(); setStatus('anonymous'); }
        else setStatus('error');
      });
  }, []);

  const startSession = useCallback(({ token, user: u }) => {
    tokenStore.set(token);
    setUser(u);
    setStatus('authenticated');
    return u;
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      login: async (email, password) => startSession(await api.login({ email, password })),
      register: async (body) => startSession(await api.register(body)),
      logout: () => logout(),
      setUser,
      retry: () => window.location.reload(),
    }),
    [user, status, startSession, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
