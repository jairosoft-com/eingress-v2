import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const accessLogsRouter = express.Router();
accessLogsRouter.use(authMiddleware);

accessLogsRouter.get('/', async (req, res) => {
  const result = await query(
    `SELECT al.id, al.user_id, u.full_name AS user_name, al.authentication_method, al.result, al.access_time
     FROM access_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.access_time DESC
     LIMIT 100`,
  );

  res.json(result.rows);
});
