import { query } from '../db.js';

const DEFAULT_DEPARTMENTS = ['IT Department', 'HR Department', 'Operations', 'Admin', 'Engineering'];

export const MAX_DEPARTMENT_NAME_LENGTH = 120;

export function normalizeDepartmentName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

let departmentsReady;

// Creates the departments table on first use so existing databases need no manual migration. When the table is
// new (empty) it is seeded from the departments already used by users, plus the default list.
export function ensureDepartmentsTable() {
  departmentsReady ??= (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS departments (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(${MAX_DEPARTMENT_NAME_LENGTH}) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS departments_name_lower_idx ON departments (LOWER(name))`);

    const { rows } = await query(`SELECT 1 FROM departments LIMIT 1`);

    if (rows.length === 0) {
      await query(
        `INSERT INTO departments (name)
         SELECT DISTINCT ON (LOWER(name)) name
         FROM (
           SELECT REGEXP_REPLACE(TRIM(department), '\\s+', ' ', 'g') AS name
           FROM users
           WHERE department IS NOT NULL AND TRIM(department) <> ''
           UNION ALL
           SELECT UNNEST($1::TEXT[])
         ) names
         ORDER BY LOWER(name), name
         ON CONFLICT DO NOTHING`,
        [DEFAULT_DEPARTMENTS],
      );
    }
  })().catch((error) => {
    departmentsReady = undefined;
    throw error;
  });

  return departmentsReady;
}

// Returns { name } (the stored spelling) when the department can be assigned, or { error } when it cannot.
// strict: the name must exist in the departments table. Not strict: only an existing inactive department is refused.
export async function checkDepartmentAssignable(department, { strict = true } = {}) {
  const name = normalizeDepartmentName(department);

  if (!name) {
    return { name: '' };
  }

  await ensureDepartmentsTable();
  const result = await query(`SELECT name, is_active FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1`, [name]);

  if (result.rowCount === 0) {
    return strict ? { error: `Department "${name}" does not exist. Choose an existing department.` } : { name };
  }

  if (!result.rows[0].is_active) {
    return { error: `Department "${result.rows[0].name}" is inactive and cannot be assigned to new users.` };
  }

  return { name: result.rows[0].name };
}
