import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const devicesRouter = express.Router();
devicesRouter.use(authMiddleware);

devicesRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, device_code, device_name, device_type, location, ip_address, status,
        temperature, cpu_usage, memory_usage, last_seen, created_at, updated_at
       FROM devices
       ORDER BY device_name`,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

devicesRouter.post('/', async (req, res) => {
  const { deviceCode, deviceName, deviceType, location, ipAddress, status = 'Online' } = req.body;

  if (!deviceCode || !deviceName || !deviceType) {
    return res.status(400).json({ error: 'deviceCode, deviceName, and deviceType are required' });
  }

  try {
    const result = await query(
      `INSERT INTO devices (device_code, device_name, device_type, location, ip_address, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [deviceCode, deviceName, deviceType, location || null, ipAddress || null, status],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

devicesRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { deviceName, deviceType, location, ipAddress, status, temperature, cpuUsage, memoryUsage } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Valid device id is required' });
  }

  try {
    const result = await query(
      `UPDATE devices
       SET device_name = COALESCE($1, device_name),
         device_type = COALESCE($2, device_type),
         location = COALESCE($3, location),
         ip_address = COALESCE($4, ip_address),
         status = COALESCE($5, status),
         temperature = COALESCE($6, temperature),
         cpu_usage = COALESCE($7, cpu_usage),
         memory_usage = COALESCE($8, memory_usage),
         last_seen = NOW(),
         updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [deviceName ?? null, deviceType ?? null, location ?? null, ipAddress ?? null, status ?? null, temperature ?? null, cpuUsage ?? null, memoryUsage ?? null, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
