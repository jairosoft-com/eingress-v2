import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const dashboardRouter = express.Router();
dashboardRouter.use(authMiddleware);

dashboardRouter.get('/', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [metrics, recentEvents, devices, attendanceTrend] = await Promise.all([
      query(
        `SELECT
          (SELECT COUNT(*)::int FROM users WHERE is_active = TRUE) AS total_users,
          (SELECT COUNT(DISTINCT user_id)::int FROM attendance_records WHERE attendance_date = $1 AND status <> 'Absent') AS todays_attendance,
          (SELECT COUNT(*)::int FROM access_logs WHERE access_time::date = $1) AS total_access,
          (SELECT COUNT(*)::int FROM access_logs WHERE access_time::date = $1 AND result = 'Denied') AS failed_attempts,
          (SELECT COUNT(*)::int FROM devices WHERE status = 'Online') AS active_devices`,
        [today],
      ),
      query(
        `SELECT al.id, al.authentication_method, al.result, al.access_time, al.area, d.device_name,
          u.employee_id, u.full_name AS user_name
         FROM access_logs al
         LEFT JOIN users u ON u.id = al.user_id
         LEFT JOIN devices d ON d.id = al.device_id
         ORDER BY al.access_time DESC
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
    ]);

    res.json({
      metrics: metrics.rows[0],
      recentEvents: recentEvents.rows,
      devices: devices.rows,
      attendanceTrend: attendanceTrend.rows,
    });
  } catch (error) {
    next(error);
  }
});
