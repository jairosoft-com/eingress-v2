import { pool, query } from '../db.js';

await query(`
  ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(160),
    ADD COLUMN IF NOT EXISTS department VARCHAR(120),
    ADD COLUMN IF NOT EXISTS role VARCHAR(80);
`);

const backfillResult = await query(`
  UPDATE attendance_records ar
  SET employee_id = u.employee_id,
      full_name = u.full_name,
      department = u.department,
      role = u.role
  FROM users u
  WHERE u.id = ar.user_id
    AND ar.employee_id IS NULL;
`);

console.log(`Migration complete. Backfilled ${backfillResult.rowCount} existing row(s).`);

await pool.end();
