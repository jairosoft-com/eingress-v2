import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const usersRouter = express.Router();
usersRouter.use(authMiddleware);

usersRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, email, phone, department, role,
        fingerprint_id, rfid_uid, is_active, created_at, updated_at
       FROM users
       ORDER BY full_name`,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.post('/', async (req, res) => {
  const { employeeId, fullName, email, phone, department, role, fingerprintId, rfidUid, isActive = true } = req.body;

  if (!employeeId || !fullName) {
    return res.status(400).json({ error: 'employeeId and fullName are required' });
  }

  try {
    const result = await query(
      `INSERT INTO users (employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, created_at, updated_at`,
      [employeeId, fullName, email || null, phone || null, department || null, role || 'Employee', fingerprintId || null, rfidUid || null, isActive],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { fullName, email, phone, department, role, fingerprintId, rfidUid, isActive } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Valid user id is required' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         department = COALESCE($4, department),
         role = COALESCE($5, role),
         fingerprint_id = COALESCE($6, fingerprint_id),
         rfid_uid = COALESCE($7, rfid_uid),
         is_active = COALESCE($8, is_active),
         updated_at = NOW()
       WHERE id = $9
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, created_at, updated_at`,
      [fullName ?? null, email ?? null, phone ?? null, department ?? null, role ?? null, fingerprintId ?? null, rfidUid ?? null, isActive ?? null, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
