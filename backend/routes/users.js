import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastActivityEvent } from '../activityEvents.js';

export const usersRouter = express.Router();
usersRouter.use(authMiddleware);

async function ensureUserStatusColumns() {
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch (error) {
    console.error('Unable to ensure user archive column exists', error);
  }
}

void ensureUserStatusColumns();

function getDuplicateUserMessage(error) {
  if (error?.code !== '23505') {
    return null;
  }

  const constraint = error.constraint ?? '';

  if (constraint.includes('rfid_uid')) {
    return {
      error: 'Existing RFID. This RFID UID is already assigned to another user.',
      field: 'rfidUid',
    };
  }

  if (constraint.includes('email')) {
    return {
      error: 'Existing email. This email address is already assigned to another user.',
      field: 'email',
    };
  }

  if (constraint.includes('employee_id')) {
    return {
      error: 'Existing employee ID. This employee ID is already assigned to another user.',
      field: 'employeeId',
    };
  }

  if (constraint.includes('fingerprint_id')) {
    return {
      error: 'Existing fingerprint. This fingerprint is already assigned to another user.',
      field: 'fingerprintId',
    };
  }

  return {
    error: 'Existing user details. One of these values is already assigned to another user.',
  };
}

usersRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, employee_id, full_name, email, phone, department, role,
        fingerprint_id, rfid_uid, is_active, is_archived, created_at, updated_at
       FROM users
       WHERE COALESCE(is_archived, FALSE) = FALSE
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
      `INSERT INTO users (employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE)
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, created_at, updated_at`,
      [employeeId, fullName, email || null, phone || null, department || null, role || 'Employee', fingerprintId || null, rfidUid || null, isActive],
    );
    const user = result.rows[0];
    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.adminId || null, 'Added User', 'User Management', `Added ${user.employee_id} (${user.full_name})`, req.ip],
    );
    broadcastActivityEvent({
      user: user.full_name,
      employeeId: user.employee_id,
      event: 'User Added',
      area: 'User Management',
      device: 'Admin Portal',
      status: 'Info',
      time: user.created_at,
    });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    const duplicateError = getDuplicateUserMessage(error);

    if (duplicateError) {
      return res.status(409).json(duplicateError);
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { fullName, email, phone, department, role, fingerprintId, rfidUid, isActive, isArchived } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Valid user id is required' });
  }

  try {
    if (fullName) {
      const existingName = await query(
        `SELECT id FROM users WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1`,
        [fullName, id],
      );

      if (existingName.rowCount > 0) {
        return res.status(409).json({
          error: 'Existing user. This name is already assigned to another user.',
          field: 'fullName',
        });
      }
    }

    if (rfidUid) {
      const existingRfid = await query(
        `SELECT id FROM users WHERE LOWER(TRIM(rfid_uid)) = LOWER(TRIM($1)) AND id <> $2 LIMIT 1`,
        [rfidUid, id],
      );

      if (existingRfid.rowCount > 0) {
        return res.status(409).json({
          error: 'Existing RFID. This RFID UID is already assigned to another user.',
          field: 'rfidUid',
        });
      }
    }

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
         is_archived = COALESCE($9, is_archived),
         updated_at = NOW()
       WHERE id = $10
       RETURNING id, employee_id, full_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, created_at, updated_at`,
      [fullName ?? null, email ?? null, phone ?? null, department ?? null, role ?? null, fingerprintId ?? null, rfidUid ?? null, isActive ?? null, isArchived ?? null, id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.adminId || null, 'Updated User', 'User Management', `Updated ${user.employee_id} (${user.full_name})`, req.ip],
    );
    broadcastActivityEvent({
      user: user.full_name,
      employeeId: user.employee_id,
      event: 'User Updated',
      area: 'User Management',
      device: 'Admin Portal',
      status: 'Info',
      time: user.updated_at,
    });
    res.json(result.rows[0]);
  } catch (error) {
    const duplicateError = getDuplicateUserMessage(error);

    if (duplicateError) {
      return res.status(409).json(duplicateError);
    }

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

    const user = result.rows[0];
    const action = isActive ? 'Activated User' : 'Disabled User';
    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.adminId || null, action, 'User Management', `${action} ${user.employee_id} (${user.full_name})`, req.ip],
    );
    broadcastActivityEvent({
      user: user.full_name,
      employeeId: user.employee_id,
      event: isActive ? 'User Activated' : 'User Disabled',
      area: 'User Management',
      device: 'Admin Portal',
      status: isActive ? 'Success' : 'Failed',
      time: user.updated_at,
    });
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
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.adminId || null, isArchived ? 'Archived User' : 'Restored User', 'User Management', `${isArchived ? 'Archived' : 'Restored'} ${user.employee_id} (${user.full_name})`, req.ip],
    );
    broadcastActivityEvent({
      user: user.full_name,
      employeeId: user.employee_id,
      event: isArchived ? 'User Archived' : 'User Restored',
      area: 'User Management',
      device: 'Admin Portal',
      status: isArchived ? 'Failed' : 'Success',
      time: user.updated_at,
    });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
