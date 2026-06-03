import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const usersRouter = express.Router();
usersRouter.use(authMiddleware);

usersRouter.get('/', async (req, res) => {
  const result = await query(
    'SELECT id, full_name, email, role, fingerprint_id, rfid_uid, is_active, created_at, updated_at FROM users ORDER BY full_name',
  );
  res.json(result.rows);
});
