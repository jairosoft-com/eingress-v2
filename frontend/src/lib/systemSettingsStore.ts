import { useSyncExternalStore } from 'react';

export type DateTimeSettings = {
  date_format: string;
  time_format: string;
  time_zone: string;
  first_day_of_week: string;
};

export const DEFAULT_DATE_TIME_SETTINGS: DateTimeSettings = {
  date_format: 'MM/DD/YYYY',
  time_format: '12-Hour (hh:mm AM/PM)',
  time_zone: '(UTC+08:00) Asia/Manila',
  first_day_of_week: 'Monday',
};

let currentSettings: DateTimeSettings = DEFAULT_DATE_TIME_SETTINGS;
const listeners = new Set<() => void>();

export function getDateTimeSettings(): DateTimeSettings {
  return currentSettings;
}

export function setDateTimeSettings(next: Partial<DateTimeSettings>) {
  currentSettings = { ...currentSettings, ...next };
  listeners.forEach((listener) => listener());
}

function subscribeDateTimeSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDateTimeSettings(): DateTimeSettings {
  return useSyncExternalStore(subscribeDateTimeSettings, getDateTimeSettings);
}
