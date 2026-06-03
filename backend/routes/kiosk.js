import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastMessage } from '../ws.js';

export const kioskRouter = express.Router();
kioskRouter.use(authMiddleware);

kioskRouter.post('/scan', async (req, res) => {
  const { userId, authenticationMethod } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const userResult = await query('SELECT id, full_name, is_active FROM users WHERE id = $1', [userId]);

  if (userResult.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userResult.rows[0];
  const result = user.is_active ? 'Granted' : 'Denied';
  const method = authenticationMethod || 'rfid';

  const logResult = await query(
    'INSERT INTO access_logs (user_id, authentication_method, result) VALUES ($1, $2, $3) RETURNING id, access_time',
    [user.id, method, result],
  );

  const log = {
    id: logResult.rows[0].id,
    userId: user.id,
    userName: user.full_name,
    authenticationMethod: method,
    result,
    accessTime: logResult.rows[0].access_time,
  };

  broadcastMessage({ type: 'access-log', payload: log });
  res.json(log);
});
