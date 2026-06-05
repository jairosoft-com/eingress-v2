import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const devicesRouter = express.Router();
devicesRouter.use(authMiddleware);

devicesRouter.get('/', async (req, res) => {
  const result = await query(
    'SELECT id, device_name, ip_address, status, temperature, cpu_usage, memory_usage, last_seen FROM devices ORDER BY device_name',
  );
  res.json(result.rows);
});
