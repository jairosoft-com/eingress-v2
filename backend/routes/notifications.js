import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const notificationsRouter = express.Router();
notificationsRouter.use(authMiddleware);

notificationsRouter.get('/', async (req, res) => {
  const result = await query(
    'SELECT id, title, message, severity, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 50',
  );
  res.json(result.rows);
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: 'Notification id is required' });
  }

  await query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [id]);
  res.json({ success: true });
});
