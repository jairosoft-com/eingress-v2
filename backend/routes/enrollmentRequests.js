import express from 'express';

import {
  clearPendingEnrollmentRfidUid,
  getPendingEnrollmentRfidUid,
} from '../enrollmentSession.js';
import { pool, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastMessage } from '../ws.js';
import { broadcastActivityEvent } from '../activityEvents.js';
import { getDuplicateUserMessage } from './users.js';
import { getDefaultExpirationForRole } from '../lib/userExpiration.js';
import { createNotification } from '../lib/notifications.js';

export const enrollmentRequestsRouter = express.Router();

async function getNextEmployeeId(client) {
  const result = await client.query(
    `SELECT COALESCE(MAX(employee_number), 0) + 1 AS next_number
     FROM (
       SELECT NULLIF(REGEXP_REPLACE(employee_id, '^EMP', ''), '')::INTEGER AS employee_number
       FROM enrollment_requests
       WHERE employee_id ~ '^EMP[0-9]+$'
     ) employee_ids`,
  );

  const nextNumber = Number(result.rows[0]?.next_number ?? 1);

  return `EMP${String(nextNumber).padStart(3, '0')}`;
}

// Collapses common Philippine phone formats to +63XXXXXXXXXX so "0917 123 4567", "9171234567"
// and "+63 917 123 4567" are recognised as the same number for duplicate-checking, and so the
// value saved is consistent regardless of how it was typed. A number that's already
// international under a different country code (e.g. +1 555 123 4567) is left exactly as
// submitted, as is anything that doesn't match a recognised PH shape (e.g. a landline).
function normalizePhPhoneNumber(rawPhone) {
  const trimmed = String(rawPhone || '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (hasPlus && !trimmed.startsWith('+63')) {
    return trimmed;
  }

  if (trimmed.startsWith('+63') && digits.length === 12) {
    return `+${digits}`;
  }

  if (!hasPlus && digits.startsWith('63') && digits.length === 12) {
    return `+${digits}`;
  }

  if (!hasPlus && digits.startsWith('0') && digits.length === 11) {
    return `+63${digits.slice(1)}`;
  }

  if (!hasPlus && digits.length === 10 && digits.startsWith('9')) {
    return `+63${digits}`;
  }

  return trimmed;
}

async function resetEnrollmentSequencesIfEmpty(client) {
  const result = await client.query(
    `SELECT NOT EXISTS (SELECT 1 FROM enrollment_requests) AS is_empty`,
  );

  if (!result.rows[0]?.is_empty) {
    return;
  }

  await client.query(
    `SELECT
       setval(pg_get_serial_sequence('enrollment_requests', 'id'), 1, FALSE),
       setval('enrollment_request_code_seq', 1, FALSE)`,
  );
}

enrollmentRequestsRouter.post('/public', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { fullName, department, email, phone } = req.body;

    if (!fullName || !department || !email || !phone) {
      return res.status(400).json({ error: 'fullName, department, email, and phone are required' });
    }

    const normalizedPhone = normalizePhPhoneNumber(phone);

    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [20260617]);

    const existingUser = await client.query(
      `SELECT full_name
       FROM (
         SELECT full_name FROM users
         UNION ALL
         SELECT full_name FROM enrollment_requests
       ) existing_names
       WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1))
       LIMIT 1`,
      [fullName],
    );

    if (existingUser.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Existing user. This name is already registered or pending enrollment.' });
    }

    const existingEmail = await client.query(
      `SELECT email
       FROM (
         SELECT email FROM users WHERE email IS NOT NULL
         UNION ALL
         SELECT email FROM enrollment_requests WHERE email IS NOT NULL AND status = 'Pending'
       ) existing_emails
       WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
       LIMIT 1`,
      [email],
    );

    if (existingEmail.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Existing email. This email address is already registered or pending enrollment.',
        field: 'email',
      });
    }

    const existingPhone = await client.query(
      `SELECT phone
       FROM (
         SELECT phone FROM users WHERE phone IS NOT NULL
         UNION ALL
         SELECT phone FROM enrollment_requests WHERE phone IS NOT NULL AND status = 'Pending'
       ) existing_phones
       WHERE LOWER(TRIM(phone)) = LOWER(TRIM($1))
       LIMIT 1`,
      [normalizedPhone],
    );

    if (existingPhone.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Existing phone number. This phone number is already registered or pending enrollment.',
        field: 'phone',
      });
    }

    const rfidUid = getPendingEnrollmentRfidUid();

    if (!rfidUid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'RFID UID must be captured before submitting registration.' });
    }

    const existingRfid = await client.query(
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
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Existing RFID. This ID is already registered or pending enrollment.',
        field: 'rfidUid',
      });
    }

    const employeeId = await getNextEmployeeId(client);
    await resetEnrollmentSequencesIfEmpty(client);

    const result = await client.query(
      `INSERT INTO enrollment_requests
        (employee_id, full_name, department, request_type, email, phone, rfid_uid)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, request_code, employee_id, full_name, department, request_type, email, phone, rfid_uid, status, submitted_at`,
      [
        employeeId,
        fullName.trim(),
        department.trim(),
        'New Enrollment',
        email.trim(),
        normalizedPhone,
        rfidUid,
      ],
    );

    await client.query('COMMIT');
    clearPendingEnrollmentRfidUid();

    broadcastMessage({
      type: 'enrollment:submitted',
      payload: {
        employeeId: result.rows[0].employee_id,
        rfidUid: result.rows[0].rfid_uid,
        fullName: result.rows[0].full_name,
        requestCode: result.rows[0].request_code,
      },
    });
    broadcastActivityEvent({
      user: result.rows[0].full_name,
      employeeId: result.rows[0].employee_id,
      event: 'Enrollment Submitted',
      area: 'Registration',
      device: 'Public Form',
      status: 'Info',
      time: result.rows[0].submitted_at,
    });
    await createNotification(
      'New Access Request',
      `${result.rows[0].full_name} submitted an access request (${result.rows[0].request_code}).`,
      'info',
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

enrollmentRequestsRouter.use(authMiddleware);

enrollmentRequestsRouter.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, request_code, employee_id, full_name, department, request_type, email, phone,
        status, rfid_uid, fingerprint_template, submitted_at, reviewed_at, reviewed_by,
        rejection_reason
       FROM enrollment_requests
       ORDER BY submitted_at DESC`,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

enrollmentRequestsRouter.post('/', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { employeeId, fullName, department, requestType, email, phone, rfidUid, fingerprintTemplate } = req.body;

    if (!employeeId || !fullName || !department || !requestType) {
      return res.status(400).json({ error: 'employeeId, fullName, department, and requestType are required' });
    }

    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [20260617]);
    await resetEnrollmentSequencesIfEmpty(client);

    const result = await client.query(
      `INSERT INTO enrollment_requests
        (employee_id, full_name, department, request_type, email, phone, rfid_uid, fingerprint_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [employeeId, fullName, department, requestType, email || null, phone || null, rfidUid || null, fingerprintTemplate || null],
    );

    await client.query('COMMIT');

    broadcastActivityEvent({
      user: result.rows[0].full_name,
      employeeId: result.rows[0].employee_id,
      event: 'Enrollment Request Created',
      area: 'Enrollment',
      device: 'Admin Portal',
      status: 'Info',
      time: result.rows[0].submitted_at,
    });
    await createNotification(
      'New Access Request',
      `${result.rows[0].full_name} submitted an access request (${result.rows[0].request_code}).`,
      'info',
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

enrollmentRequestsRouter.patch('/:id/status', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const id = Number(req.params.id);
    const { status, rejectionReason } = req.body;

    if (!id || !['Approved', 'Rejected', 'Pending'].includes(status)) {
      return res.status(400).json({ error: 'Valid id and status are required' });
    }

    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT *
       FROM enrollment_requests
       WHERE id = $1
       FOR UPDATE`,
      [id],
    );

    if (requestResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Enrollment request not found' });
    }

    const request = requestResult.rows[0];

    if (status === 'Approved') {
      const rfidUid = request.rfid_uid?.trim() || null;

      if (!rfidUid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'RFID UID is required before approving enrollment.' });
      }

      const expirationDate = getDefaultExpirationForRole(request.department);

      await client.query(
        `INSERT INTO users
          (employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, expiration_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (employee_id) DO UPDATE
         SET full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           department = EXCLUDED.department,
           role = EXCLUDED.role,
           fingerprint_id = EXCLUDED.fingerprint_id,
           rfid_uid = EXCLUDED.rfid_uid,
           expiration_date = EXCLUDED.expiration_date,
           updated_at = NOW()`,
        [
          request.employee_id,
          request.full_name,
          request.email,
          request.phone,
          request.department,
          request.department,
          request.fingerprint_template,
          rfidUid,
          expirationDate,
        ],
      );
    }

    const result = await client.query(
      `UPDATE enrollment_requests
       SET status = $1::enrollment_status, rejection_reason = $2, reviewed_by = $3,
         reviewed_at = CASE WHEN $1::enrollment_status = 'Pending' THEN NULL ELSE NOW() END,
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, rejectionReason || null, req.user.adminId || null, id],
    );

    await client.query('COMMIT');

    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.adminId || null,
        `${status} Enrollment`,
        'Enrollment',
        `${status} ${request.request_code} for ${request.full_name}`,
        req.ip,
      ],
    );
    broadcastActivityEvent({
      user: request.full_name,
      employeeId: request.employee_id,
      event: `Enrollment ${status}`,
      area: 'Enrollment',
      device: 'Admin Portal',
      status: status === 'Approved' ? 'Success' : status === 'Rejected' ? 'Failed' : 'Info',
      time: result.rows[0].reviewed_at || result.rows[0].updated_at,
    });
    broadcastMessage({
      type: 'enrollment:reviewed',
      payload: {
        employeeId: request.employee_id,
        fullName: request.full_name,
        requestCode: request.request_code,
        status,
      },
    });
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});
