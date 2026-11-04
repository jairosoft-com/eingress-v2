import { query } from '../db.js';

const DEFAULT_ROLE = ['Intern', 'Student', 'Employee'];

export const MAX_ROLE_NAME_LENGTH = 120;

export function normalizeRoleName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

// Ticket 212153: every role carries the 3-letter prefix used to generate its users' IDs (e.g. EMP0001).
export function validateUserIdPrefix(value) {
  const prefix = String(value ?? '').trim();

  if (!prefix) return { error: 'User ID prefix is required.' };
  if (!/^[A-Za-z]{3}$/.test(prefix)) {
    return { error: 'User ID prefix must be exactly 3 letters (A-Z), with no spaces or special characters.' };
  }

  return { prefix: prefix.toUpperCase() };
}

let rolesReady;

// Creates the roles table on first use so existing databases need no manual migration. When the table is
// new (empty) it is seeded from the roles already used by users, plus the default list.
export function ensureRolesTable() {
  rolesReady ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS roles (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(${MAX_ROLE_NAME_LENGTH}) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS roles_name_lower_idx ON roles (LOWER(name))`);
    await query(`ALTER TABLE roles ADD COLUMN IF NOT EXISTS user_id_prefix VARCHAR(3)`);
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS roles_user_id_prefix_idx ON roles (UPPER(user_id_prefix)) WHERE user_id_prefix IS NOT NULL`,
    );

    const { rows } = await query(`SELECT 1 FROM roles LIMIT 1`);

    if (rows.length === 0) {
      await query(
        `INSERT INTO roles (name)
         SELECT DISTINCT ON (LOWER(name)) name
         FROM (
           SELECT REGEXP_REPLACE(TRIM(role), '\\s+', ' ', 'g') AS name
           FROM users
           WHERE role IS NOT NULL AND TRIM(role) <> ''
           UNION ALL
           SELECT UNNEST($1::TEXT[])
         ) names
         ORDER BY LOWER(name), name
         ON CONFLICT DO NOTHING`,
        [DEFAULT_ROLE],
      );
    }

    // Pre-saved prefixes for the standard roles. Only fills a role that has no prefix yet and only when the prefix is
    // free, so a prefix an admin has already set is never overwritten.
    await query(
      `UPDATE roles r
       SET user_id_prefix = d.prefix, updated_at = NOW()
       FROM (VALUES ('Employee', 'EMP'), ('Intern', 'INT'), ('Staff', 'STA'), ('Student', 'STU')) AS d(name, prefix)
       WHERE LOWER(r.name) = LOWER(d.name)
         AND r.user_id_prefix IS NULL
         AND NOT EXISTS (SELECT 1 FROM roles o WHERE UPPER(o.user_id_prefix) = d.prefix)`,
    );
  })().catch((error) => {
    rolesReady = undefined;
    throw error;
  });

  return rolesReady;
}

// Returns { name } (the stored spelling) when the role can be assigned, or { error } when it cannot.
// strict: the name must exist in the roles table. Not strict: only an existing inactive role is refused.
export async function checkRoleAssignable(role, { strict = true } = {}) {
  const name = normalizeRoleName(role);

  if (!name) {
    return strict ? { error: 'Role is required.' } : { name: '' };
  }

  await ensureRolesTable();
  const result = await query(
    `SELECT name, is_active, user_id_prefix FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [name],
  );

  if (result.rowCount === 0) {
    return strict ? { error: `Role "${name}" does not exist. Choose an existing role.` } : { name };
  }

  if (!result.rows[0].is_active) {
    return { error: `Role "${result.rows[0].name}" is inactive and cannot be assigned to new users.` };
  }

  return { name: result.rows[0].name, userIdPrefix: result.rows[0].user_id_prefix };
}
