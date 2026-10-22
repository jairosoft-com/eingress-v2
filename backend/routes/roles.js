import express from 'express';
import { pool, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { createNotification } from '../lib/notifications.js';
import {
  ensureRolesTable,
  MAX_ROLE_NAME_LENGTH,
  normalizeRoleName,
} from '../lib/roles.js';

export const rolesRouter = express.Router();

void ensureRolesTable().catch((error) => {
  console.error('Unable to ensure roles table exists', error);
});

// user_count: users currently assigned to the role (archived users are not counted).
const ROLE_SELECT = `
  SELECT r.id, r.name, r.is_active, r.created_at, r.updated_at,
    (SELECT COUNT(*)::int FROM users u
     WHERE LOWER(TRIM(u.role)) = LOWER(r.name) AND COALESCE(u.is_archived, FALSE) = FALSE) AS user_count
  FROM roles r`;

function validateName(body) {
  const name = normalizeRoleName(body.name);

  if (!name) return { error: 'Role name is required.' };
  if (name.length > MAX_ROLE_NAME_LENGTH) {
    return { error: `Role name must be ${MAX_ROLE_NAME_LENGTH} characters or fewer.` };
  }

  return { name };
}

function logAudit(req, action, details) {
  return query(
    `INSERT INTO audit_logs (admin_id, action, module, details, ip_address) VALUES ($1, $2, $3, $4, $5)`,
    [req.user.adminId || null, action, 'Settings', details, req.ip],
  );
}

// Public: the registration form needs the roles people may currently be assigned to.
rolesRouter.get('/active', async (req, res) => {
  try {
    await ensureRolesTable();
    const result = await query(`SELECT id, name FROM roles WHERE is_active = TRUE ORDER BY LOWER(name)`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

rolesRouter.get('/', authMiddleware, async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const status = String(req.query.status ?? '').toLowerCase();
  const where = [];
  const params = [];

  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    where.push(`r.name ILIKE $${params.length}`);
  }

  if (status === 'active' || status === 'inactive') {
    where.push(`r.is_active = ${status === 'active' ? 'TRUE' : 'FALSE'}`);
  }

  try {
    await ensureRolesTable();
    const result = await query(
      `${ROLE_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY LOWER(r.name)`,
      params,
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

rolesRouter.post('/', authMiddleware, async (req, res) => {
  const { name, error } = validateName(req.body);

  if (error) {
    return res.status(400).json({ error, errors: { name: error } });
  }

  try {
    await ensureRolesTable();
    const inserted = await query(`INSERT INTO roles (name) VALUES ($1) RETURNING id`, [name]);
    await logAudit(req, 'Added Role', `Added role ${name}`);
    await createNotification('Role Added', `Role ${name} was added.`, 'success');
    const result = await query(`${ROLE_SELECT} WHERE r.id = $1`, [inserted.rows[0].id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err?.code === '23505') {
      return res.status(409).json({
        error: 'Existing role. This role name is already in use.',
        errors: { name: 'Existing role. This role name is already in use.' },
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

rolesRouter.patch('/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const { isActive, confirm } = req.body;
  const nameProvided = req.body.name !== undefined;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Valid role id is required' });
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
    await ensureRolesTable();
    await client.query('BEGIN');

    const current = await client.query(`SELECT id, name, is_active FROM roles WHERE id = $1 FOR UPDATE`, [id]);

    if (current.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Role not found' });
    }

    const role = current.rows[0];
    const newName = validated.name ?? role.name;
    const newActive = isActive ?? role.is_active;
    const deactivating = role.is_active && !newActive;

    if (deactivating && confirm !== true) {
      const assigned = await client.query(
        `SELECT COUNT(*)::int AS total FROM users
         WHERE LOWER(TRIM(role)) = LOWER($1) AND COALESCE(is_archived, FALSE) = FALSE`,
        [role.name],
      );
      const userCount = assigned.rows[0].total;

      if (userCount > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `${userCount} user(s) are assigned to ${role.name}. They keep this role, but no new users can be assigned to it. Confirm to deactivate.`,
          requiresConfirmation: true,
          userCount,
        });
      }
    }

    await client.query(`UPDATE roles SET name = $1, is_active = $2, updated_at = NOW() WHERE id = $3`, [
      newName,
      newActive,
      id,
    ]);

    // users and enrollment requests store the role name, so a rename has to follow them.
    if (newName !== role.name) {
      await client.query(`UPDATE users SET role = $1, updated_at = NOW() WHERE LOWER(TRIM(role)) = LOWER($2)`, [
        newName,
        role.name,
      ]);
    }

    await client.query('COMMIT');

    const changes = [];
    if (newName !== role.name) changes.push(`renamed ${role.name} to ${newName}`);
    if (newActive !== role.is_active) changes.push(`${newActive ? 'activated' : 'deactivated'} ${newName}`);

    if (changes.length > 0) {
      const action = newName !== role.name ? 'Updated Role' : newActive ? 'Activated Role' : 'Deactivated Role';
      await logAudit(req, action, `Role ${changes.join(', ')}`);
      await createNotification('Role Updated', `Role ${changes.join(', ')}.`, 'success');
    }

    const result = await query(`${ROLE_SELECT} WHERE r.id = $1`, [id]);
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    if (err?.code === '23505') {
      return res.status(409).json({
        error: 'Existing role. This role name is already in use.',
        errors: { name: 'Existing role. This role name is already in use.' },
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});
