import { query } from '../db.js';

// Ticket 212471. A second tap counts as the clock-out only this many minutes after the first one.
export const CLOCK_OUT_MIN_GAP_MINUTES = 1;

// A tap by someone already clocked out, before this local time (end of the 8-5 working day), undoes the clock-out.
export const WORKDAY_END_TIME = '17:00:00';

// 15-minute grace period after 08:00: arrivals through 08:15:59 remain Present; 08:16:00+ (> 15 mins late) are Late.
export const LATE_CUTOFF_TIME = '08:16:00';

export function isLateTapSql(timestampExpr, timeZoneParam) {
  return `((${timestampExpr} AT TIME ZONE ${timeZoneParam})::time >= TIME '${LATE_CUTOFF_TIME}')`;
}

let attendanceReady;

// Adds the 'Clocked Out' status to existing databases and tidies rows written before it existed. Safe to run
// repeatedly. ALTER TYPE ... ADD VALUE has to be committed before the new label is used, so these are separate statements.
export function ensureAttendanceStatus() {
  attendanceReady ??= (async () => {
    await query(`ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'Clocked Out'`);
    // The first tap used to store check_out_at = check_in_at; an empty Time Out is now NULL.
    await query(`UPDATE attendance_records SET check_out_at = NULL WHERE check_out_at = check_in_at`);
    await query(
      `UPDATE attendance_records SET status = 'Clocked Out', updated_at = NOW()
       WHERE check_out_at IS NOT NULL AND status <> 'Clocked Out'`,
    );
  })().catch((error) => {
    attendanceReady = undefined;
    throw error;
  });

  return attendanceReady;
}

// Worked minutes for an attendance_records row (alias `ar`) as a SQL expression, or NULL until there is a clock-out.
// Only time between 07:00 and 17:30 (system time zone, on the attendance date) counts, minus any recorded break intervals
// (clock-out before WORKDAY_END_TIME followed by a clock-in revert before WORKDAY_END_TIME) and the non-overlapping
// part of the 12:00-13:00 lunch break. `timeZoneParam` is the placeholder holding the time zone, e.g. '$2'.
export function workedMinutesSql(timeZoneParam, alias = 'ar') {
  const at = (time) => `((${alias}.attendance_date + TIME '${time}') AT TIME ZONE ${timeZoneParam})`;
  const effectiveSeconds = (fromExpr, toExpr) => {
    const start = `GREATEST(${fromExpr}, ${at('07:00')})`;
    const end = `LEAST(${toExpr}, ${at('17:30')})`;
    const span = `GREATEST(0, EXTRACT(EPOCH FROM (${end} - ${start})))`;
    const lunch = `GREATEST(0, EXTRACT(EPOCH FROM (LEAST(${end}, ${at('13:00')}) - GREATEST(${start}, ${at('12:00')}))))`;
    return `(${span} - ${lunch})`;
  };

  // Derive break intervals [clock_out, next_clock_in] from granted attendance taps using the same debouncing and
  // workday-cutoff rules as kiosk.js, then deduct their effectiveSeconds so lunch is never double-deducted.
  const breakSeconds = `COALESCE((
    WITH raw_taps AS (
      SELECT tap_logs.id, tap_logs.access_time,
        LAG(tap_logs.access_time) OVER (ORDER BY tap_logs.access_time, tap_logs.id) AS prev_tap
      FROM access_logs tap_logs
      WHERE tap_logs.user_id = ${alias}.user_id
        AND tap_logs.result = 'Granted'
        AND tap_logs.authentication_method = 'Fingerprint'
        AND (tap_logs.access_time AT TIME ZONE ${timeZoneParam})::date = ${alias}.attendance_date
        AND tap_logs.access_time >= ${alias}.check_in_at
        AND tap_logs.access_time <= ${alias}.check_out_at
    ),
    kept_taps AS (
      SELECT id, access_time,
        (access_time AT TIME ZONE ${timeZoneParam})::time AS tap_time,
        ROW_NUMBER() OVER (ORDER BY access_time, id) AS rn
      FROM raw_taps
      WHERE prev_tap IS NULL
        OR access_time - prev_tap >= (${CLOCK_OUT_MIN_GAP_MINUTES} * INTERVAL '1 minute')
    ),
    breaks AS (
      SELECT access_time AS break_start,
        LEAD(access_time) OVER (ORDER BY rn) AS break_end,
        LEAD(tap_time) OVER (ORDER BY rn) AS next_tap_time,
        rn
      FROM kept_taps
    )
    SELECT SUM(${effectiveSeconds('breaks.break_start', 'breaks.break_end')})
    FROM breaks
    WHERE breaks.rn % 2 = 0
      AND breaks.break_end IS NOT NULL
      AND breaks.next_tap_time < TIME '${WORKDAY_END_TIME}'
  ), 0)`;

  return `(CASE WHEN ${alias}.check_in_at IS NULL OR ${alias}.check_out_at IS NULL THEN NULL
    ELSE GREATEST(0, ROUND((${effectiveSeconds(`${alias}.check_in_at`, `${alias}.check_out_at`)} - ${breakSeconds}) / 60))::int END)`;
}
