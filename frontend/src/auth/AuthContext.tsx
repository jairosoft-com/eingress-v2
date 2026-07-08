import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  AuthSession,
  clearStoredSession,
  createStoredSession,
  getStoredSession,
  refreshStoredSession,
} from './session';
import { AuthContext, AuthContextValue, SignInInput } from './context';
import { API_BASE_URL } from '../lib/api';

const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];

type LoginResponse = {
  accessToken: string;
  adminName: string;
  email: string;
  expiresAt: number;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const lastRefreshAt = useRef(0);
  const hasSession = Boolean(session?.accessToken);

  useEffect(() => {
    if (!hasSession) {
      return;
    }

    const expireInvalidSession = () => {
      const storedSession = getStoredSession();
      setSession(storedSession);
    };

    const recordActivity = () => {
      const now = Date.now();

      if (now - lastRefreshAt.current < 30_000) {
        return;
      }

      lastRefreshAt.current = now;
      const refreshedSession = refreshStoredSession();
      setSession(refreshedSession);
    };

    const intervalId = window.setInterval(expireInvalidSession, 10_000);

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      if (response.status === 401) {
        const requestUrl =
          typeof args[0] === 'string'
            ? args[0]
            : args[0] instanceof URL
              ? args[0].toString()
              : (args[0] as Request).url;

        if (requestUrl.startsWith(API_BASE_URL) && !requestUrl.includes('/auth/login')) {
          clearStoredSession();
          setSession(null);
        }
      }

      return response;
    };

    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      window.fetch = originalFetch;
    };
  }, [hasSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      async signIn(input: SignInInput) {
        if (!input.usernameOrEmail.trim() || !input.password.trim() || !input.rfidCode.trim()) {
          throw new Error('Username/email, password, and RFID verification are required.');
        }

        const response = await fetch(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            usernameOrEmail: input.usernameOrEmail,
            password: input.password,
            rfidCode: input.rfidCode,
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | (Partial<LoginResponse> & { error?: string })
          | null;

        if (!response.ok || !data?.accessToken) {
          throw new Error(data?.error || 'Authentication failed.');
        }

        const createdSession = createStoredSession({
          accessToken: data.accessToken,
          adminName: data.adminName,
          email: data.email,
          expiresAt: data.expiresAt,
        });

        setSession(createdSession);

        return createdSession;
      },
      signOut() {
        clearStoredSession();
        setSession(null);
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
