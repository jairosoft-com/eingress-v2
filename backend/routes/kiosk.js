import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastMessage } from '../ws.js';

export const kioskRouter = express.Router();
kioskRouter.use(authMiddleware);

kioskRouter.post('/scan', async (req, res) => {
  const { userId, employeeId, rfidUid, fingerprintId, authenticationMethod, deviceId } = req.body;

  if (!userId && !employeeId && !rfidUid && !fingerprintId) {
    return res.status(400).json({ error: 'A userId, employeeId, rfidUid, or fingerprintId is required' });
  }

  const params = [];
  const predicates = [];

  if (userId) {
    params.push(userId);
    predicates.push(`id = $${params.length}`);
  }

  if (employeeId) {
    params.push(employeeId);
    predicates.push(`employee_id = $${params.length}`);
  }

  if (rfidUid) {
    params.push(rfidUid);
    predicates.push(`rfid_uid = $${params.length}`);
  }

  if (fingerprintId) {
    params.push(fingerprintId);
    predicates.push(`fingerprint_id = $${params.length}`);
  }

  const userResult = await query(
    `SELECT id, employee_id, full_name, department, is_active FROM users WHERE ${predicates.join(' OR ')} LIMIT 1`,
    params,
  );

  if (userResult.rowCount === 0) {
    await query(
      `INSERT INTO access_logs (device_id, authentication_method, result, area)
       VALUES ($1, $2, $3, $4)`,
      [deviceId || null, authenticationMethod || 'Unknown', 'Denied', 'Kiosk'],
    );
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userResult.rows[0];
  const result = user.is_active ? 'Granted' : 'Denied';
  const method = authenticationMethod || (fingerprintId ? 'Fingerprint' : 'RFID');

  const logResult = await query(
    `INSERT INTO access_logs (user_id, device_id, authentication_method, result, area)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, access_time`,
    [user.id, deviceId || null, method, result, 'Kiosk'],
  );

  if (result === 'Granted') {
    const today = new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO attendance_records (user_id, attendance_date, check_in_at, status, location)
       VALUES ($1, $2, NOW(), 'Present', 'Kiosk')
       ON CONFLICT (user_id, attendance_date)
       DO UPDATE SET check_out_at = NOW(), updated_at = NOW()`,
      [user.id, today],
    );
  }

  const log = {
    id: logResult.rows[0].id,
    userId: user.id,
    employeeId: user.employee_id,
    userName: user.full_name,
    department: user.department,
    authenticationMethod: method,
    result,
    accessTime: logResult.rows[0].access_time,
  };

  broadcastMessage({ type: 'access-log', payload: log });
  res.json(log);
});
