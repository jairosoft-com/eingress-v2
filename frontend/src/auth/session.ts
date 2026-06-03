export type AuthSession = {
  accessToken: string;
  adminName: string;
  email: string;
  expiresAt: number;
  issuedAt: number;
  lastActivityAt: number;
};

export type CreateSessionInput = {
  accessToken: string;
  expiresAt: number;
  adminName?: string;
  email?: string;
};

const SESSION_STORAGE_KEY = 'eingress.admin.session';

function readSession(): AuthSession | null {
  const value = window.localStorage.getItem(SESSION_STORAGE_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as AuthSession;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function writeSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function isSessionValid(session: AuthSession | null, now = Date.now()) {
  return Boolean(session?.accessToken && session.expiresAt > now);
}

export function getStoredSession(now = Date.now()) {
  const session = readSession();

  if (!isSessionValid(session, now)) {
    clearStoredSession();
    return null;
  }

  return session;
}

export function createStoredSession(input: CreateSessionInput, now = Date.now()) {
  const session: AuthSession = {
    accessToken: input.accessToken,
    adminName: input.adminName ?? 'Admin',
    email: input.email ?? '',
    issuedAt: now,
    lastActivityAt: now,
    expiresAt: input.expiresAt,
  };

  writeSession(session);

  return session;
}

export function refreshStoredSession(now = Date.now()) {
  const session = getStoredSession(now);

  if (!session) {
    return null;
  }

  const refreshedSession: AuthSession = {
    ...session,
    lastActivityAt: now,
    expiresAt: now + 15 * 60 * 1000,
  };

  writeSession(refreshedSession);

  return refreshedSession;
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
