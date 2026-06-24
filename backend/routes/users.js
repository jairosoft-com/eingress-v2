import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const usersRouter = express.Router();
usersRouter.use(authMiddleware);

<<<<<<< HEAD
async function ensureUserStatusColumns() {
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch (error) {
    console.error('Unable to ensure user archive column exists', error);
  }
}

void ensureUserStatusColumns();

=======
>>>>>>> qa
usersRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, email, phone, department, role,
<<<<<<< HEAD
        fingerprint_id, rfid_uid, is_active, is_archived, created_at, updated_at
       FROM users
       WHERE COALESCE(is_archived, FALSE) = FALSE
=======
        fingerprint_id, rfid_uid, is_active, created_at, updated_at
       FROM users
>>>>>>> qa
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
<<<<<<< HEAD
      `INSERT INTO users (employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, created_at, updated_at`,
=======
      `INSERT INTO users (employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, created_at, updated_at`,
>>>>>>> qa
      [employeeId, fullName, email || null, phone || null, department || null, role || 'Employee', fingerprintId || null, rfidUid || null, isActive],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
<<<<<<< HEAD
  const { fullName, email, phone, department, role, fingerprintId, rfidUid, isActive, isArchived } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
=======
  const { fullName, email, phone, department, role, fingerprintId, rfidUid, isActive } = req.body;

  if (!id) {
>>>>>>> qa
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
<<<<<<< HEAD
         is_archived = COALESCE($9, is_archived),
         updated_at = NOW()
       WHERE id = $10
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, created_at, updated_at`,
      [fullName ?? null, email ?? null, phone ?? null, department ?? null, role ?? null, fingerprintId ?? null, rfidUid ?? null, isActive ?? null, isArchived ?? null, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { isActive } = req.body;

  if (!Number.isInteger(id) || id <= 0 || typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'Valid user id and isActive are required' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET is_active = $1,
         is_archived = FALSE,
         updated_at = NOW()
       WHERE id = $2
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, created_at, updated_at`,
      [isActive, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.patch('/:id/archive', async (req, res) => {
  const id = Number(req.params.id);
  const { isArchived = true } = req.body;

  if (!Number.isInteger(id) || id <= 0 || typeof isArchived !== 'boolean') {
    return res.status(400).json({ error: 'Valid user id and archive state are required' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET is_active = $1,
         is_archived = $2,
         updated_at = NOW()
       WHERE id = $3
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, created_at, updated_at`,
      [isArchived ? false : true, isArchived, id],
=======
         updated_at = NOW()
       WHERE id = $9
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, created_at, updated_at`,
      [fullName ?? null, email ?? null, phone ?? null, department ?? null, role ?? null, fingerprintId ?? null, rfidUid ?? null, isActive ?? null, id],
>>>>>>> qa
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
