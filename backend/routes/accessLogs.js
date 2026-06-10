import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const accessLogsRouter = express.Router();
accessLogsRouter.use(authMiddleware);

accessLogsRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT al.id, al.user_id, u.employee_id, u.full_name AS user_name, al.authentication_method,
        al.result, al.access_time, al.area, d.device_name
       FROM access_logs al
       LEFT JOIN users u ON u.id = al.user_id
       LEFT JOIN devices d ON d.id = al.device_id
       ORDER BY al.access_time DESC
       LIMIT 100`,
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
