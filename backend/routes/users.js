import express from 'express';
import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastActivityEvent } from '../activityEvents.js';
import { getDefaultExpirationForRole } from '../lib/userExpiration.js';
import { createNotification } from '../lib/notifications.js';
import { composeFullName, fullNameSql, validateNameParts } from '../lib/personName.js';
import { checkDepartmentAssignable } from '../lib/departments.js';
import { checkRoleAssignable } from '../lib/roles.js';


export const usersRouter = express.Router();

const USER_FIELDS = `id, employee_id, ${fullNameSql()} AS full_name, first_name, last_name,
  email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, expiration_date, created_at, updated_at`;
usersRouter.use(authMiddleware);

async function ensureUserStatusColumns() {
  try {
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_reason TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS expiration_date TIMESTAMPTZ`);
  } catch (error) {
    console.error('Unable to ensure user archive column exists', error);
  }
}

void ensureUserStatusColumns();

export function getDuplicateUserMessage(error) {
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
      `SELECT ${USER_FIELDS}
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
  const { employeeId, email, phone, department, role, fingerprintId, rfidUid, isActive = true } = req.body;
  const { firstName, lastName, errors } = validateNameParts(req.body);

  if (!employeeId) {
    errors.employeeId = 'Employee ID is required.';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: Object.values(errors).join(' '), errors });
  }

  try {
    const departmentCheck = await checkDepartmentAssignable(department);
    const roleCheck = await checkRoleAssignable(role);

    if (departmentCheck.error) {
      return res.status(400).json({ error: departmentCheck.error, errors: { department: departmentCheck.error } });
    }

    if (roleCheck.error) {
      return res.status(400).json({ error: roleCheck.error, errors: { role: roleCheck.error } });
    }

    const expirationDate = getDefaultExpirationForRole(role);
    const result = await query(
      `INSERT INTO users (employee_id, first_name, last_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, expiration_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11)
       RETURNING ${USER_FIELDS}`,
      [employeeId, firstName, lastName, email || null, phone || null, departmentCheck.name || null, role || 'Employee', fingerprintId || null, rfidUid || null, isActive, expirationDate],
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
    await createNotification(
      'New User Added',
      `${user.full_name} (${user.employee_id}) was added successfully.`,
      'success',
    );
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
  const { email, phone, department, role, fingerprintId, rfidUid, isActive, isArchived } = req.body;
  const namesProvided = req.body.firstName !== undefined || req.body.lastName !== undefined;
  const { firstName, lastName, errors: nameErrors } = validateNameParts(req.body);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Valid user id is required' });
  }

  if (namesProvided && Object.keys(nameErrors).length > 0) {
    return res.status(400).json({ error: Object.values(nameErrors).join(' '), errors: nameErrors });
  }

  const fullName = namesProvided ? composeFullName(firstName, lastName) : null;

  try {
    if (fullName) {
      const existingName = await query(
        `SELECT id FROM users WHERE LOWER(${fullNameSql()}) = LOWER($1) AND id <> $2 LIMIT 1`,
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

    // Only a changed department is checked, so users already in a now-inactive department can still be edited.
    let departmentValue = department ?? null;

    if (departmentValue !== null && String(departmentValue).trim() !== '') {
      const currentUser = await query(`SELECT department FROM users WHERE id = $1`, [id]);
      const currentDepartment = String(currentUser.rows[0]?.department ?? '').trim().toLowerCase();

      if (currentUser.rowCount > 0 && currentDepartment !== String(departmentValue).trim().replace(/\s+/g, ' ').toLowerCase()) {
        const departmentCheck = await checkDepartmentAssignable(departmentValue);

        if (departmentCheck.error) {
          return res.status(400).json({ error: departmentCheck.error, errors: { department: departmentCheck.error } });
        }

        departmentValue = departmentCheck.name;
      }
    }

    let roleValue = role ?? null;

    if (roleValue !== null && String(roleValue).trim() !== '') {
      const currentUser = await query(`SELECT role FROM users WHERE id = $1`, [id]);
      const currentRole = String(currentUser.rows[0]?.role ?? '').trim().toLowerCase();

      if (currentUser.rowCount > 0 && currentRole !== String(roleValue).trim().replace(/\s+/g, ' ').toLowerCase()) {
        const roleCheck = await checkRoleAssignable(roleValue);

        if (roleCheck.error) {
          return res.status(400).json({ error: roleCheck.error, errors: { role: roleCheck.error } });
        }

        roleValue = roleCheck.name;
      }
    }

    const result = await query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         department = COALESCE($5, department),
         role = COALESCE($6, role),
         fingerprint_id = COALESCE($7, fingerprint_id),
         rfid_uid = COALESCE($8, rfid_uid),
         is_active = COALESCE($9, is_active),
         is_archived = COALESCE($10, is_archived),
         updated_at = NOW()
       WHERE id = $11
       RETURNING ${USER_FIELDS}`,
      [namesProvided ? firstName : null, namesProvided ? lastName : null, email ?? null, phone ?? null, departmentValue, role ?? null, fingerprintId ?? null, rfidUid ?? null, isActive ?? null, isArchived ?? null, id],
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
    await createNotification(
      'User Updated',
      `${user.full_name} (${user.employee_id}) details were updated successfully.`,
      'success',
    );
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
  const { isActive, reason } = req.body;

  if (!Number.isInteger(id) || id <= 0 || typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'Valid user id and isActive are required' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET is_active = $1,
         is_archived = FALSE,
         deactivated_at = CASE WHEN $1 THEN NULL ELSE NOW() END,
         deactivation_reason = CASE WHEN $1 THEN NULL ELSE COALESCE($3, 'Manually deactivated by admin') END,
         updated_at = NOW()
       WHERE id = $2
       RETURNING ${USER_FIELDS}`,
      [isActive, id, reason || null],
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
       RETURNING ${USER_FIELDS}`,
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
