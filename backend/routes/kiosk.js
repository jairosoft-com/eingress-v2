import express from 'express';
import { setPendingEnrollmentRfidUid } from '../enrollmentSession.js';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastMessage } from '../ws.js';
import { broadcastActivityEvent } from '../activityEvents.js';

export const kioskRouter = express.Router();

async function getTodaysAccessMetrics() {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total_access,
       COUNT(*) FILTER (WHERE result = 'Granted')::int AS successful_attempts,
       COUNT(*) FILTER (WHERE result = 'Denied')::int AS failed_attempts
     FROM access_logs
     WHERE access_time::date = CURRENT_DATE`,
  );

  return result.rows[0];
}

async function processKioskScan(req, res) {
  const { userId, employeeId, rfidUid, authenticationMethod, deviceId } = req.body;

  if (!userId && !employeeId && !rfidUid) {
    return res.status(400).json({ error: 'A userId, employeeId, or rfidUid is required' });
  }

  if (rfidUid) {
    broadcastMessage({
      type: 'rfid:scanned',
      payload: { rfidUid },
    });
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

  const userResult = await query(
    `SELECT id, employee_id, full_name, department, is_active FROM users WHERE (${predicates.join(' OR ')}) AND COALESCE(is_archived, FALSE) = FALSE LIMIT 1`,
    params,
  );

  if (userResult.rowCount === 0) {
    const logResult = await query(
      `INSERT INTO access_logs (device_id, authentication_method, result, area)
       VALUES ($1, $2, $3, $4)
       RETURNING id, access_time`,
      [deviceId || null, authenticationMethod || 'Unknown', 'Denied', 'Kiosk'],
    );
    const accessMetrics = await getTodaysAccessMetrics();

    broadcastMessage({
      type: 'dashboard:metrics-changed',
      payload: accessMetrics,
    });
    broadcastActivityEvent({
      id: logResult.rows[0].id,
      user: 'Unknown RFID',
      employeeId: rfidUid || '',
      event: 'Access Denied',
      area: 'Kiosk',
      device: 'RFID Reader',
      status: 'Failed',
      time: logResult.rows[0].access_time,
    });
    return res.status(404).json({
      error: 'User not found',
      failedAttempts: accessMetrics.failed_attempts,
      successfulAttempts: accessMetrics.successful_attempts,
      totalAccess: accessMetrics.total_access,
    });
  }

  const user = userResult.rows[0];
  const result = user.is_active ? 'Granted' : 'Denied';
  const method = authenticationMethod || 'RFID';

  const logResult = await query(
    `INSERT INTO access_logs (user_id, device_id, authentication_method, result, area)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, access_time`,
    [user.id, deviceId || null, method, result, 'Kiosk'],
  );

  if (result === 'Granted') {
    await query(
      `INSERT INTO attendance_records (user_id, attendance_date, check_in_at, status, location)
       VALUES ($1, CURRENT_DATE, NOW(), 'Present', 'Kiosk')
       ON CONFLICT (user_id, attendance_date)
       DO UPDATE SET check_out_at = NOW(), updated_at = NOW()`,
      [user.id],
    );

    broadcastMessage({
      type: 'attendance:changed',
      payload: { userId: user.id },
    });
  }

  const accessMetrics = await getTodaysAccessMetrics();

  const log = {
    id: logResult.rows[0].id,
    userId: user.id,
    employeeId: user.employee_id,
    userName: user.full_name,
    department: user.department,
    authenticationMethod: method,
    result,
    accessTime: logResult.rows[0].access_time,
    failedAttempts: accessMetrics.failed_attempts,
    successfulAttempts: accessMetrics.successful_attempts,
    totalAccess: accessMetrics.total_access,
  };

  broadcastMessage({
    type: 'dashboard:metrics-changed',
    payload: accessMetrics,
  });
  broadcastMessage({ type: 'access-log', payload: log });
  broadcastActivityEvent({
    id: log.id,
    user: log.userName,
    employeeId: log.employeeId,
    event: result === 'Granted' ? 'Access Granted' : 'Access Denied',
    area: 'Kiosk',
    device: 'RFID Reader',
    status: result === 'Granted' ? 'Success' : 'Failed',
    time: log.accessTime,
  });
  res.json(log);
}

kioskRouter.post('/rfid-scan', async (req, res) => {
  req.body = {
    rfidUid: req.body.rfidUid,
    authenticationMethod: 'RFID',
    deviceId: req.body.deviceId,
  };

  return processKioskScan(req, res);
});

kioskRouter.post('/admin-rfid-scan', async (req, res, next) => {
  try {
    const rfidUid = req.body.rfidUid?.trim();

    if (!rfidUid) {
      return res.status(400).json({ error: 'rfidUid is required' });
    }

    const adminResult = await query(
      `SELECT id, username, email, is_active
       FROM admins
       WHERE rfid_uid = $1
       LIMIT 1`,
      [rfidUid],
    );

    if (adminResult.rowCount === 0 || !adminResult.rows[0].is_active) {
      return res.status(401).json({ error: 'Invalid admin RFID' });
    }

    const admin = adminResult.rows[0];

    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [admin.id, 'Authorize Enrollment', 'Kiosk', 'Admin RFID authorized kiosk enrollment', req.ip],
    );
    broadcastActivityEvent({
      user: admin.username,
      event: 'Admin RFID Authorized Enrollment',
      area: 'Kiosk',
      device: 'RFID Reader',
      status: 'Success',
    });

    return res.json({
      authorized: true,
      adminName: admin.username,
      email: admin.email,
    });
  } catch (error) {
    return next(error);
  }
});

kioskRouter.post('/enrollment-rfid', async (req, res, next) => {
  const rfidUid = String(req.body.rfidUid || '').trim();

  if (!rfidUid) {
    return res.status(400).json({ error: 'rfidUid is required' });
  }

  try {
    const existingRfid = await query(
      `SELECT rfid_uid
       FROM (
         SELECT rfid_uid FROM users WHERE rfid_uid IS NOT NULL
         UNION ALL
         SELECT rfid_uid FROM enrollment_requests WHERE rfid_uid IS NOT NULL AND status = 'Pending'
       ) existing_rfids
       WHERE LOWER(TRIM(rfid_uid)) = LOWER(TRIM($1))
       LIMIT 1`,
      [rfidUid],
    );

    if (existingRfid.rowCount > 0) {
      return res.status(409).json({
        error: 'RFID already exists. Tap a new RFID.',
        field: 'rfidUid',
      });
    }

    setPendingEnrollmentRfidUid(rfidUid);

    broadcastMessage({
      type: 'enrollment:rfid-captured',
      payload: { rfidUid },
    });
    broadcastActivityEvent({
      user: 'Pending Enrollment',
      employeeId: rfidUid,
      event: 'RFID Captured for Enrollment',
      area: 'Kiosk',
      device: 'RFID Reader',
      status: 'Info',
    });

    return res.json({ rfidUid });
  } catch (error) {
    return next(error);
  }
});

kioskRouter.use(authMiddleware);
kioskRouter.post('/scan', processKioskScan);

