import express from "express";

import { query } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { fullNameSql } from "../lib/personName.js";
import { getDateStringInTimeZone, getSystemTimeZone } from "../lib/timezone.js";
import { ensureAttendanceStatus, isLateTapSql, workedMinutesSql } from "../lib/attendance.js";

export const attendanceRouter = express.Router();
attendanceRouter.use(authMiddleware);

void ensureAttendanceStatus().catch((error) => {
  console.error("Unable to ensure attendance status exists", error);
});

attendanceRouter.get("/", async (req, res, next) => {
  try {
    await ensureAttendanceStatus();
    const timeZone = await getSystemTimeZone();
    const date = req.query.date || getDateStringInTimeZone(timeZone);
    const department = req.query.department;
    const status = req.query.status;
    const search = req.query.search;

    const params = [date];
    const where = ["ar.attendance_date = $1"];

    if (department) {
      params.push(department);
      where.push(`u.department = $${params.length}`);
    }

    if (status) {
      params.push(status);
      where.push(`ar.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(${fullNameSql("u")} ILIKE $${params.length} OR u.employee_id ILIKE $${params.length})`,
      );
    }

    params.push(timeZone);
    const timeZoneParam = `$${params.length}`;

    const result = await query(
      `SELECT ar.id, ar.attendance_date::text AS attendance_date, ar.check_in_at, ar.check_out_at, ar.status, ar.location,
        ${workedMinutesSql(timeZoneParam)} AS total_minutes,
        u.employee_id, ${fullNameSql("u")} AS full_name, u.department, u.role
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       WHERE ${where.join(" AND ")}
       ORDER BY ar.attendance_date DESC, ar.check_in_at DESC NULLS LAST, ${fullNameSql("u")}`,
      params,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

attendanceRouter.get("/summary", async (req, res, next) => {
  try {
    await ensureAttendanceStatus();
    const timeZone = await getSystemTimeZone();
    const date = req.query.date || getDateStringInTimeZone(timeZone);
    // late counts everyone whose first tap was after the 15-minute grace period (08:16+), including those who have since clocked out;
    // attended is everyone with a record who is not absent (present + late + clocked out, each counted once).
    const result = await query(
      `SELECT
        COUNT(*)::int AS total_records,
        COUNT(*) FILTER (WHERE status = 'Present')::int AS present,
        COUNT(*) FILTER (
          WHERE status = 'Late'
            OR (status = 'Clocked Out' AND ${isLateTapSql("check_in_at", "$2")})
        )::int AS late,
        COUNT(*) FILTER (WHERE status = 'Clocked Out')::int AS clocked_out,
        COUNT(*) FILTER (WHERE status <> 'Absent')::int AS attended,
        COUNT(*) FILTER (WHERE status = 'Absent')::int AS absent
       FROM attendance_records
       WHERE attendance_date = $1`,
      [date, timeZone],
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
