import express from 'express';
import { pool, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastActivityEvent } from '../activityEvents.js';
import { broadcastMessage } from '../ws.js';
import { getDefaultExpirationForRole } from '../lib/userExpiration.js';
import { createNotification } from '../lib/notifications.js';
import { composeFullName, fullNameSql, validateNameParts } from '../lib/personName.js';
import { checkDepartmentAssignable } from '../lib/departments.js';
import { checkRoleAssignable } from '../lib/roles.js';
import { generateUserId, USER_ID_LOCK_KEY } from '../lib/userIds.js';


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
  const role = req.query.role ? String(req.query.role).trim() : null;
  const where = ['COALESCE(is_archived, FALSE) = FALSE'];
  const params = [];

  if (role) {
    params.push(role);
    where.push(`LOWER(TRIM(role)) = LOWER(TRIM($${params.length}))`);
  }

  try {
    const result = await query(
      `SELECT ${USER_FIELDS}
       FROM users
       WHERE ${where.join(' AND ')}
       ORDER BY LOWER(last_name), LOWER(first_name), employee_id`,
      params,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Preview of the User ID a new user in this role would get (display only; the ID is assigned when the user is saved).
usersRouter.get('/next-id', async (req, res) => {
  try {
    const roleCheck = await checkRoleAssignable(req.query.role);

    if (roleCheck.error) {
      return res.status(400).json({ error: roleCheck.error, errors: { role: roleCheck.error } });
    }

    if (!roleCheck.userIdPrefix) {
      const message = `Role "${roleCheck.name}" has no User ID prefix. Set one in Role Management first.`;
      return res.status(400).json({ error: message, errors: { role: message } });
    }

    res.json({ prefix: roleCheck.userIdPrefix, userId: await generateUserId(pool, roleCheck.userIdPrefix) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

usersRouter.post('/', async (req, res) => {
  const { email, phone, department, role, fingerprintId, rfidUid, isActive = true } = req.body;
  const { firstName, lastName, errors } = validateNameParts(req.body);

  if (!role || !String(role).trim()) {
    errors.role = 'Role is required.';
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

    if (!roleCheck.userIdPrefix) {
      const message = `Role "${roleCheck.name}" has no User ID prefix. Set one in Role Management first.`;
      return res.status(400).json({ error: message, errors: { role: message } });
    }

    const expirationDate = getDefaultExpirationForRole(roleCheck.name);
    const client = await pool.connect();
    let result;

    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [USER_ID_LOCK_KEY]);
      const employeeId = await generateUserId(client, roleCheck.userIdPrefix);
      result = await client.query(
        `INSERT INTO users (employee_id, first_name, last_name, email, phone, department, role, fingerprint_id, rfid_uid, is_active, is_archived, expiration_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11)
         RETURNING ${USER_FIELDS}`,
        [employeeId, firstName, lastName, email || null, phone || null, departmentCheck.name || null, roleCheck.name, fingerprintId || null, rfidUid || null, isActive, expirationDate],
      );
      await client.query('COMMIT');
    } catch (insertError) {
      await client.query('ROLLBACK').catch(() => {});
      throw insertError;
    } finally {
      client.release();
    }

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
    broadcastMessage({
      type: 'users:changed',
      payload: { action: 'created', userId: user.id, user },
    });
    broadcastMessage({
      type: 'roles:changed',
      payload: { action: 'user_assigned', role: user.role },
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

    const departmentProvided = req.body.department !== undefined;
    let departmentValue = departmentProvided ? (department ? String(department).trim() : null) : undefined;

    if (departmentProvided && departmentValue !== null && departmentValue !== '') {
      const currentUser = await query(`SELECT department FROM users WHERE id = $1`, [id]);
      const currentDepartment = String(currentUser.rows[0]?.department ?? '').trim().toLowerCase();

      if (currentUser.rowCount > 0 && currentDepartment !== departmentValue.replace(/\s+/g, ' ').toLowerCase()) {
        const departmentCheck = await checkDepartmentAssignable(departmentValue);

        if (departmentCheck.error) {
          return res.status(400).json({ error: departmentCheck.error, errors: { department: departmentCheck.error } });
        }

        departmentValue = departmentCheck.name;
      } else if (currentUser.rowCount > 0) {
        departmentValue = currentUser.rows[0]?.department ?? departmentValue;
      }
    }

    const roleProvided = req.body.role !== undefined;
    let roleValue = roleProvided ? (role ? String(role).trim() : '') : undefined;

    if (roleProvided) {
      if (!roleValue) {
        return res.status(400).json({ error: 'Role is required.', errors: { role: 'Role is required.' } });
      }

      const currentUser = await query(`SELECT role FROM users WHERE id = $1`, [id]);
      const currentRole = String(currentUser.rows[0]?.role ?? '').trim().toLowerCase();

      if (currentUser.rowCount > 0 && currentRole !== roleValue.replace(/\s+/g, ' ').toLowerCase()) {
        const roleCheck = await checkRoleAssignable(roleValue);

        if (roleCheck.error) {
          return res.status(400).json({ error: roleCheck.error, errors: { role: roleCheck.error } });
        }

        roleValue = roleCheck.name;
      } else if (currentUser.rowCount > 0) {
        roleValue = currentUser.rows[0]?.role ?? roleValue;
      }
    }

    const result = await query(
      `UPDATE users
       SET first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         department = CASE WHEN $11 THEN $5 ELSE department END,
         role = CASE WHEN $12 THEN $6 ELSE role END,
         fingerprint_id = COALESCE($7, fingerprint_id),
         rfid_uid = COALESCE($8, rfid_uid),
         is_active = COALESCE($9, is_active),
         is_archived = COALESCE($10, is_archived),
         updated_at = NOW()
       WHERE id = $13
       RETURNING ${USER_FIELDS}`,
      [
        namesProvided ? firstName : null,
        namesProvided ? lastName : null,
        email ?? null,
        phone ?? null,
        departmentValue ?? null,
        roleValue ?? null,
        fingerprintId ?? null,
        rfidUid ?? null,
        isActive ?? null,
        isArchived ?? null,
        departmentProvided,
        roleProvided,
        id,
      ],
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
    broadcastMessage({
      type: 'users:changed',
      payload: { action: 'updated', userId: user.id, user },
    });
    broadcastMessage({
      type: 'roles:changed',
      payload: { action: 'user_updated', role: user.role },
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
    broadcastMessage({
      type: 'users:changed',
      payload: { action: 'status_changed', userId: user.id, user },
    });
    broadcastMessage({
      type: 'roles:changed',
      payload: { action: 'user_status_changed', role: user.role },
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
    broadcastMessage({
      type: 'users:changed',
      payload: { action: 'archived', userId: user.id, user },
    });
    broadcastMessage({
      type: 'roles:changed',
      payload: { action: 'user_archived', role: user.role },
    });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
