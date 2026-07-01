import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const accessLogsRouter = express.Router();
accessLogsRouter.use(authMiddleware);

accessLogsRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT *
       FROM (
         SELECT
           'access-' || al.id AS id,
           u.full_name AS user_name,
           u.employee_id,
           CASE WHEN al.result = 'Granted' THEN 'Access Granted' ELSE 'Access Denied' END AS event,
           al.authentication_method,
           al.result::text AS status,
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
           'System' AS authentication_method,
           'Info' AS status,
           l.module AS area,
           'Admin Portal' AS device_name,
           l.created_at AS event_time
         FROM audit_logs l
         LEFT JOIN admins a ON a.id = l.admin_id
       ) recent_activity
       ORDER BY event_time DESC
       LIMIT 100`,
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
