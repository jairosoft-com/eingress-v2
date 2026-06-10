export type AuthSession = {
  accessToken: string;
  adminName: string;
  email: string;
  expiresAt: number;
  issuedAt: number;
  lastActivityAt: number;
};

export type CreateSessionInput = {
  accessToken?: string;
  adminName?: string;
  email?: string;
  expiresAt?: number;
};

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const SESSION_STORAGE_KEY = 'eingress.admin.session';

function createAccessToken() {
  if (window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `frontend-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
    accessToken: input.accessToken ?? createAccessToken(),
    adminName: input.adminName ?? 'Admin',
    email: input.email ?? '',
    issuedAt: now,
    lastActivityAt: now,
    expiresAt: input.expiresAt ?? now + SESSION_TIMEOUT_MS,
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
    expiresAt: now + SESSION_TIMEOUT_MS,
  };

  writeSession(refreshedSession);

  return refreshedSession;
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}
