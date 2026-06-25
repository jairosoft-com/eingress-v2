import express from 'express';

import {
  clearPendingEnrollmentRfidUid,
  getPendingEnrollmentRfidUid,
} from '../enrollmentSession.js';
import { pool, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastMessage } from '../ws.js';

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
         SELECT rfid_uid FROM enrollment_requests WHERE rfid_uid IS NOT NULL
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
        phone.trim(),
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
      `SELECT id, request_code, employee_id, full_name, department, request_type, email, status,
        rfid_uid, submitted_at, reviewed_at, reviewed_by, rejection_reason
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

      await client.query(
        `INSERT INTO users
          (employee_id, full_name, email, phone, department, fingerprint_id, rfid_uid)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (employee_id) DO UPDATE
         SET full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           department = EXCLUDED.department,
           fingerprint_id = EXCLUDED.fingerprint_id,
           rfid_uid = EXCLUDED.rfid_uid,
           updated_at = NOW()`,
        [
          request.employee_id,
          request.full_name,
          request.email,
          request.phone,
          request.department,
          request.fingerprint_template,
          rfidUid,
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

    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});
