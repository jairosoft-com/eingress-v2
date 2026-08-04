import { DateTimeSettings, getDateTimeSettings } from './systemSettingsStore';

export function resolveTimeZone(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  const candidate = (raw.match(/\)\s*(.+)$/)?.[1] ?? raw).trim();

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return undefined;
  }
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function getZonedDateParts(date: Date, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return { year: get('year'), month: get('month'), day: get('day') };
}

export function formatDate(
  value: string | Date,
  settings: DateTimeSettings = getDateTimeSettings(),
): string {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  const { year, month, day } = getZonedDateParts(date, resolveTimeZone(settings.time_zone));

  switch (settings.date_format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${month}/${day}/${year}`;
  }
}

export function formatTime(
  value: string | Date,
  settings: DateTimeSettings = getDateTimeSettings(),
): string {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(settings.time_zone),
    hour: '2-digit',
    minute: '2-digit',
    hour12: settings.time_format !== '24-Hour (HH:mm)',
  }).format(date);
}

export function formatDateTime(
  value: string | Date,
  settings: DateTimeSettings = getDateTimeSettings(),
): string {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : '';
  }

  return `${formatDate(date, settings)}, ${formatTime(date, settings)}`;
}

export function formatWeekdayShort(
  value: string | Date,
  settings: DateTimeSettings = getDateTimeSettings(),
): string {
  const date = toDate(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: resolveTimeZone(settings.time_zone),
    weekday: 'short',
  })
    .format(date)
    .toUpperCase();
}
