import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AuthSession,
  clearStoredSession,
  createStoredSession,
  getStoredSession,
  refreshStoredSession,
} from './session';
import { AuthContext, AuthContextValue, SignInInput } from './context';
import { API_BASE_URL } from '../lib/api';
import { getSecuritySettings, setSecuritySettings } from '../lib/securitySettingsStore';

const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
const FORCE_LOGOUT_STORAGE_KEY = 'eingress.auth.force-logout';
const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/ws');

type LoginResponse = {
  accessToken: string;
  adminName: string;
  email: string;
  expiresAt: number;
  autoLogoutEnabled: boolean;
  idleTimeoutWarningMinutes: number;
  keepMeLoggedIn: boolean;
  sessionTimeoutMinutes: number;
};

function decodeAccessTokenAdminId(accessToken: string): string | null {
  try {
    const payloadSegment = accessToken.split('.')[1];

    if (!payloadSegment) {
      return null;
    }

    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as { adminId?: string | number };

    return payload.adminId != null ? String(payload.adminId) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => getStoredSession());
  const lastRefreshAt = useRef(0);
  const hasSession = Boolean(session?.accessToken);

  const handleLogout = useCallback(() => {
    clearStoredSession();
    setSession(null);
    window.localStorage.setItem(FORCE_LOGOUT_STORAGE_KEY, `${Date.now()}`);
    window.dispatchEvent(new Event('auth:force-logout'));
  }, []);

  useEffect(() => {
    const handleStorageLogout = (event: StorageEvent) => {
      if (event.key === FORCE_LOGOUT_STORAGE_KEY) {
        handleLogout();
      }
    };

    window.addEventListener('storage', handleStorageLogout);
    window.addEventListener('auth:force-logout', handleLogout);

    return () => {
      window.removeEventListener('storage', handleStorageLogout);
      window.removeEventListener('auth:force-logout', handleLogout);
    };
  }, [handleLogout]);

  useEffect(() => {
    if (!hasSession) {
      return;
    }

    const expireInvalidSession = () => {
      const storedSession = getStoredSession();
      setSession(storedSession);
    };

    const currentAdminId = session?.accessToken
      ? decodeAccessTokenAdminId(session.accessToken)
      : null;
    let socket: WebSocket | null = null;
    let reconnectTimeoutId: number | null = null;
    let shouldReconnect = true;

    const recordActivity = () => {
      const { auto_logout_enabled, idle_timeout_warning_minutes, keep_me_logged_in } =
        getSecuritySettings();

      if (!auto_logout_enabled || keep_me_logged_in) {
        return;
      }

      const storedSession = getStoredSession();

      if (!storedSession) {
        return;
      }

      // Once the idle warning is showing, only an explicit "stay signed in"
      // response (extendSession) should reset the clock, not ambient mouse
      // movement, so an unattended screen still logs out on schedule.
      if (storedSession.expiresAt - Date.now() <= idle_timeout_warning_minutes * 60_000) {
        return;
      }

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
          handleLogout();
        }
      }

      return response;
    };

    const connectRealtimeSocket = () => {
      socket = new WebSocket(WS_BASE_URL);

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data as string) as {
            payload?: { adminId?: string | number };
            type?: string;
          };

          if (
            message.type === 'auth:password-changed' &&
            currentAdminId != null &&
            message.payload?.adminId != null &&
            String(message.payload.adminId) === currentAdminId
          ) {
            shouldReconnect = false;
            socket?.close();
            handleLogout();
          }
        } catch {
          // Ignore invalid realtime messages.
        }
      });

      socket.addEventListener('close', () => {
        if (!shouldReconnect) {
          return;
        }

        reconnectTimeoutId = window.setTimeout(connectRealtimeSocket, 2000);
      });
    };

    connectRealtimeSocket();

    return () => {
      shouldReconnect = false;
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      window.fetch = originalFetch;

      if (reconnectTimeoutId) {
        window.clearTimeout(reconnectTimeoutId);
      }

      socket?.close();
    };
  }, [handleLogout, hasSession, session?.accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: Boolean(session),
      async signIn(input: SignInInput) {
        if (!input.usernameOrEmail.trim() || !input.password.trim()) {
          throw new Error('Username/email and password are required.');
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

        // Seed the security settings store from the login response itself,
        // rather than waiting on the separate /settings fetch, so the idle
        // warning never briefly evaluates this fresh session against a
        // stale/default warning window before that fetch resolves.
        if (
          data.autoLogoutEnabled !== undefined &&
          data.idleTimeoutWarningMinutes !== undefined &&
          data.keepMeLoggedIn !== undefined &&
          data.sessionTimeoutMinutes !== undefined
        ) {
          setSecuritySettings({
            auto_logout_enabled: data.autoLogoutEnabled,
            idle_timeout_warning_minutes: data.idleTimeoutWarningMinutes,
            keep_me_logged_in: data.keepMeLoggedIn,
            session_timeout_minutes: data.sessionTimeoutMinutes,
          });
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
        handleLogout();
      },
      extendSession() {
        lastRefreshAt.current = Date.now();
        setSession(refreshStoredSession());
      },
    }),
    [handleLogout, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
