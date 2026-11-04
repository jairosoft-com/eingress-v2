import { query } from "../db.js";

export const DEFAULT_TIME_ZONE = "Asia/Manila";

export function resolveTimeZone(raw) {
  if (!raw || typeof raw !== "string") {
    return DEFAULT_TIME_ZONE;
  }

  const candidate = (raw.match(/\)\s*(.+)$/)?.[1] ?? raw).trim();
  if (!candidate) {
    return DEFAULT_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export async function getSystemTimeZone() {
  try {
    const result = await query(
      "SELECT time_zone FROM system_settings WHERE id = 1 LIMIT 1",
    );
    return resolveTimeZone(result.rows[0]?.time_zone);
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getDateStringInTimeZone(
  timeZone = DEFAULT_TIME_ZONE,
  date = new Date(),
) {
  const resolved = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: resolved,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}
