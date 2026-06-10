import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const auditLogsRouter = express.Router();
auditLogsRouter.use(authMiddleware);

auditLogsRouter.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT l.id, l.action, l.module, l.details, l.ip_address, l.created_at,
        a.username AS admin_name
       FROM audit_logs l
       LEFT JOIN admins a ON a.id = l.admin_id
       ORDER BY l.created_at DESC
       LIMIT 200`,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});
