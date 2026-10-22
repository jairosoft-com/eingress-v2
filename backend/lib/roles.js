import { query } from '../db.js';

const DEFAULT_ROLE = ['Intern', 'Student', 'Employee'];

export const MAX_ROLE_NAME_LENGTH = 120;

export function normalizeRoleName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
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
    return { name: '' };
  }

  await ensureRolesTable();
  const result = await query(`SELECT name, is_active FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);

  if (result.rowCount === 0) {
    return strict ? { error: `Role "${name}" does not exist. Choose an existing role.` } : { name };
  }

  if (!result.rows[0].is_active) {
    return { error: `Role "${result.rows[0].name}" is inactive and cannot be assigned to new users.` };
  }

  return { name: result.rows[0].name };
}
