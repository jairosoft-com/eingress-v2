import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const enrollmentRequestsRouter = express.Router();
enrollmentRequestsRouter.use(authMiddleware);

enrollmentRequestsRouter.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, request_code, employee_id, full_name, department, request_type, email, status,
        submitted_at, reviewed_at, reviewed_by, rejection_reason
       FROM enrollment_requests
       ORDER BY submitted_at DESC`,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

enrollmentRequestsRouter.post('/', async (req, res, next) => {
  try {
    const { employeeId, fullName, department, requestType, email, phone, rfidUid, fingerprintTemplate } = req.body;

    if (!employeeId || !fullName || !department || !requestType) {
      return res.status(400).json({ error: 'employeeId, fullName, department, and requestType are required' });
    }

    const result = await query(
      `INSERT INTO enrollment_requests
        (employee_id, full_name, department, request_type, email, phone, rfid_uid, fingerprint_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [employeeId, fullName, department, requestType, email || null, phone || null, rfidUid || null, fingerprintTemplate || null],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

enrollmentRequestsRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { status, rejectionReason } = req.body;

    if (!id || !['Approved', 'Rejected', 'Pending'].includes(status)) {
      return res.status(400).json({ error: 'Valid id and status are required' });
    }

    const result = await query(
      `UPDATE enrollment_requests
       SET status = $1, rejection_reason = $2, reviewed_by = $3,
         reviewed_at = CASE WHEN $1 = 'Pending' THEN NULL ELSE NOW() END,
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, rejectionReason || null, req.user.adminId || null, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Enrollment request not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
