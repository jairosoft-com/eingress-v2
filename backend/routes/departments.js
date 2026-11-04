import express from 'express';
import { pool, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { createNotification } from '../lib/notifications.js';
import {
  ensureDepartmentsTable,
  MAX_DEPARTMENT_NAME_LENGTH,
  normalizeDepartmentName,
} from '../lib/departments.js';

export const departmentsRouter = express.Router();

void ensureDepartmentsTable().catch((error) => {
  console.error('Unable to ensure departments table exists', error);
});

// user_count: users currently assigned to the department (archived users are not counted).
const DEPARTMENT_SELECT = `
  SELECT d.id, d.name, d.is_active, d.created_at, d.updated_at,
    (SELECT COUNT(*)::int FROM users u
     WHERE LOWER(TRIM(u.department)) = LOWER(d.name) AND COALESCE(u.is_archived, FALSE) = FALSE) AS user_count
  FROM departments d`;

function validateName(body) {
  const name = normalizeDepartmentName(body.name);

  if (!name) return { error: 'Department name is required.' };
  if (name.length > MAX_DEPARTMENT_NAME_LENGTH) {
    return { error: `Department name must be ${MAX_DEPARTMENT_NAME_LENGTH} characters or fewer.` };
  }

  return { name };
}

function logAudit(req, action, details) {
  return query(
    `INSERT INTO audit_logs (admin_id, action, module, details, ip_address) VALUES ($1, $2, $3, $4, $5)`,
    [req.user.adminId || null, action, 'Settings', details, req.ip],
  );
}

// Public: the registration form needs the departments people may currently be assigned to.
departmentsRouter.get('/active', async (req, res) => {
  try {
    await ensureDepartmentsTable();
    const result = await query(`SELECT id, name FROM departments WHERE is_active = TRUE ORDER BY LOWER(name)`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

departmentsRouter.get('/', authMiddleware, async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '').toLowerCase();
  const where = [];
  const params = [];

  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`d.name ILIKE $${params.length}`);
  }

  if (status === 'active' || status === 'inactive') {
    where.push(`d.is_active = ${status === 'active' ? 'TRUE' : 'FALSE'}`);
  }

  try {
    await ensureDepartmentsTable();
    const result = await query(
      `${DEPARTMENT_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY LOWER(d.name)`,
      params,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

departmentsRouter.post('/', authMiddleware, async (req, res) => {
  const { name, error } = validateName(req.body);

  if (error) {
    return res.status(400).json({ error, errors: { name: error } });
  }

  try {
    await ensureDepartmentsTable();
    const inserted = await query(`INSERT INTO departments (name) VALUES ($1) RETURNING id`, [name]);
    await logAudit(req, 'Added Department', `Added department ${name}`);
    await createNotification('Department Added', `Department ${name} was added.`, 'success');
    const result = await query(`${DEPARTMENT_SELECT} WHERE d.id = $1`, [inserted.rows[0].id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({
        error: 'Existing department. This department name is already in use.',
        errors: { name: 'Existing department. This department name is already in use.' },
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

departmentsRouter.patch('/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { isActive, confirm } = req.body;
  const nameProvided = req.body.name !== undefined;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Valid department id is required' });
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({ error: 'isActive must be true or false' });
  }

  const validated = nameProvided ? validateName(req.body) : {};

  if (validated.error) {
    return res.status(400).json({ error: validated.error, errors: { name: validated.error } });
  }

  const client = await pool.connect();

  try {
    await ensureDepartmentsTable();
    await client.query('BEGIN');

    const current = await client.query(`SELECT id, name, is_active FROM departments WHERE id = $1 FOR UPDATE`, [id]);

    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Department not found' });
    }

    const department = current.rows[0];
    const newName = validated.name ?? department.name;
    const newActive = isActive ?? department.is_active;
    const deactivating = department.is_active && !newActive;

    if (deactivating && confirm !== true) {
      const assigned = await client.query(
        `SELECT COUNT(*)::int AS total FROM users
         WHERE LOWER(TRIM(department)) = LOWER($1) AND COALESCE(is_archived, FALSE) = FALSE`,
        [department.name],
      );
      const userCount = assigned.rows[0].total;

      if (userCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `${userCount} user(s) are assigned to ${department.name}. They keep this department, but no new users can be assigned to it. Confirm to deactivate.`,
          requiresConfirmation: true,
          userCount,
        });
      }
    }

    await client.query(`UPDATE departments SET name = $1, is_active = $2, updated_at = NOW() WHERE id = $3`, [
      newName,
      newActive,
      id,
    ]);

    // users and enrollment requests store the department name, so a rename has to follow them.
    if (newName !== department.name) {
      await client.query(`UPDATE users SET department = $1, updated_at = NOW() WHERE LOWER(TRIM(department)) = LOWER($2)`, [
        newName,
        department.name,
      ]);
      await client.query(`UPDATE enrollment_requests SET department = $1 WHERE LOWER(TRIM(department)) = LOWER($2)`, [
        newName,
        department.name,
      ]);
    }

    await client.query('COMMIT');

    const changes = [];
    if (newName !== department.name) changes.push(`renamed ${department.name} to ${newName}`);
    if (newActive !== department.is_active) changes.push(`${newActive ? 'activated' : 'deactivated'} ${newName}`);

    if (changes.length > 0) {
      const action = newName !== department.name ? 'Updated Department' : newActive ? 'Activated Department' : 'Deactivated Department';
      await logAudit(req, action, `Department ${changes.join(', ')}`);
      await createNotification('Department Updated', `Department ${changes.join(', ')}.`, 'success');
    }

    const result = await query(`${DEPARTMENT_SELECT} WHERE d.id = $1`, [id]);
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    if (err?.code === '23505') {
      return res.status(409).json({
        error: 'Existing department. This department name is already in use.',
        errors: { name: 'Existing department. This department name is already in use.' },
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});
