import { useSyncExternalStore } from 'react';

export type SecuritySettings = {
  auto_logout_enabled: boolean;
  idle_timeout_warning_minutes: number;
  keep_me_logged_in: boolean;
  session_timeout_minutes: number;
};

export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  auto_logout_enabled: true,
  idle_timeout_warning_minutes: 5,
  keep_me_logged_in: false,
  session_timeout_minutes: 30,
};

const SECURITY_SETTINGS_STORAGE_KEY = 'eingress.security-settings';

function readPersistedSecuritySettings(): SecuritySettings {
  try {
    const value = window.localStorage.getItem(SECURITY_SETTINGS_STORAGE_KEY);
    const parsed = value ? (JSON.parse(value) as Partial<SecuritySettings>) : null;

    return parsed ? { ...DEFAULT_SECURITY_SETTINGS, ...parsed } : DEFAULT_SECURITY_SETTINGS;
  } catch {
    return DEFAULT_SECURITY_SETTINGS;
  }
}

// A page refresh re-runs this module from scratch, so without persisting the
// last-known settings, a brief window would fall back to the hardcoded
// defaults (e.g. a 5-minute warning) until the /settings fetch resolves,
// which could momentarily flash the idle-timeout warning for a real session
// that's already close to a much shorter configured expiry.
let currentSettings: SecuritySettings = readPersistedSecuritySettings();
const listeners = new Set<() => void>();

export function getSecuritySettings(): SecuritySettings {
  return currentSettings;
}

export function setSecuritySettings(next: Partial<SecuritySettings>) {
  currentSettings = { ...currentSettings, ...next };
  window.localStorage.setItem(SECURITY_SETTINGS_STORAGE_KEY, JSON.stringify(currentSettings));
  listeners.forEach((listener) => listener());
}

function subscribeSecuritySettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSecuritySettings(): SecuritySettings {
  return useSyncExternalStore(subscribeSecuritySettings, getSecuritySettings);
}
