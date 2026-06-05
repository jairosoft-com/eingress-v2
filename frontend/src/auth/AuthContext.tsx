import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  AuthSession,
  clearStoredSession,
  createStoredSession,
  getStoredSession,
  refreshStoredSession,
} from './session';
import { AuthContext, AuthContextValue, SignInInput } from './context';

const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];

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

    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
    };
  }, [hasSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      async signIn(input: SignInInput) {
        if (!input.password.trim() || !input.rfidCode.trim()) {
          throw new Error('Password and RFID verification are required.');
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, 700);
        });

        const createdSession = createStoredSession({
          adminName: 'Juan Dela Cruz',
          email: input.email,
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
