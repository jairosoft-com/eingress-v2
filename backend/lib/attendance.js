import { query } from '../db.js';

// Ticket 212471. A second tap counts as the clock-out only this many minutes after the first one.
export const CLOCK_OUT_MIN_GAP_MINUTES = 5;

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
// Only time between 07:00 and 17:30 (system time zone, on the attendance date) counts, minus the part of it that
// falls inside the 12:00-13:00 lunch break. `timeZoneParam` is the placeholder holding the time zone, e.g. '$2'.
export function workedMinutesSql(timeZoneParam, alias = 'ar') {
  const at = (time) => `((${alias}.attendance_date + TIME '${time}') AT TIME ZONE ${timeZoneParam})`;
  const start = `GREATEST(${alias}.check_in_at, ${at('07:00')})`;
  const end = `LEAST(${alias}.check_out_at, ${at('17:30')})`;
  const lunch = `GREATEST(0, EXTRACT(EPOCH FROM (LEAST(${end}, ${at('13:00')}) - GREATEST(${start}, ${at('12:00')}))) / 60)`;

  return `(CASE WHEN ${alias}.check_in_at IS NULL OR ${alias}.check_out_at IS NULL THEN NULL
    ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (${end} - ${start})) / 60 - ${lunch}))::int END)`;
}
