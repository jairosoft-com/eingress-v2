import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const dashboardRouter = express.Router();
dashboardRouter.use(authMiddleware);

dashboardRouter.get('/', async (req, res, next) => {
  try {
    const [metrics, recentEvents, devices, attendanceTrend, attendanceRecords] = await Promise.all([
      query(
        `SELECT
          (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS total_users,
          (SELECT COUNT(DISTINCT user_id)::int FROM attendance_records WHERE attendance_date = CURRENT_DATE AND status <> 'Absent') AS todays_attendance,
          (SELECT COUNT(*)::int FROM access_logs WHERE access_time::date = CURRENT_DATE) AS total_access,
          (SELECT COUNT(*)::int FROM access_logs WHERE access_time::date = CURRENT_DATE AND result = 'Granted') AS successful_attempts,
          (SELECT COUNT(*)::int FROM access_logs WHERE access_time::date = CURRENT_DATE AND result = 'Denied') AS failed_attempts,
          (SELECT COUNT(*)::int FROM devices WHERE status = 'Online') AS active_devices`,
      ),
      query(
        `SELECT *
         FROM (
           SELECT
             'access-' || al.id AS id,
             u.full_name AS user_name,
             u.employee_id,
             CASE WHEN al.result = 'Granted' THEN 'Access Granted' ELSE 'Access Denied' END AS event,
             al.result::text AS result,
             al.area,
             COALESCE(d.device_name, 'RFID Reader') AS device_name,
             al.access_time AS event_time
           FROM access_logs al
           LEFT JOIN users u ON u.id = al.user_id
           LEFT JOIN devices d ON d.id = al.device_id

           UNION ALL

           SELECT
             'audit-' || l.id AS id,
             COALESCE(a.username, 'System') AS user_name,
             NULL AS employee_id,
             l.action AS event,
             'Info' AS result,
             l.module AS area,
             'Admin Portal' AS device_name,
             l.created_at AS event_time
           FROM audit_logs l
           LEFT JOIN admins a ON a.id = l.admin_id
         ) recent_activity
         ORDER BY event_time DESC
         LIMIT 8`,
      ),
      query(
        `SELECT id, device_name, device_type, location, ip_address, status, last_seen
         FROM devices
         ORDER BY device_name
         LIMIT 8`,
      ),
      query(
        `SELECT attendance_date,
          COUNT(*) FILTER (WHERE check_in_at IS NOT NULL)::int AS check_ins,
          COUNT(*) FILTER (WHERE check_out_at IS NOT NULL)::int AS check_outs,
          COUNT(*)::int AS total
         FROM attendance_records
         WHERE attendance_date >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY attendance_date
         ORDER BY attendance_date`,
      ),
      query(
        `SELECT u.employee_id,
          u.full_name AS name,
          u.department,
          u.role,
          ar.check_in_at,
          ar.check_out_at,
          COALESCE(ar.status::text, 'Present') AS status,
          COALESCE(ar.location, 'Office') AS location
         FROM attendance_records ar
         JOIN users u ON u.id = ar.user_id
         WHERE ar.attendance_date = CURRENT_DATE
         ORDER BY ar.check_in_at DESC NULLS LAST, u.full_name
         LIMIT 10`,
      ),
    ]);

    res.json({
      metrics: metrics.rows[0],
      recentEvents: recentEvents.rows,
      devices: devices.rows,
      attendanceTrend: attendanceTrend.rows,
      attendanceRecords: attendanceRecords.rows,
    });
  } catch (error) {
    next(error);
  }
});

