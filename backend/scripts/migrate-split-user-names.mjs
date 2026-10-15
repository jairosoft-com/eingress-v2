// Ticket 211793, phase 1: add first_name / last_name and backfill them from full_name.
//
//   node scripts/migrate-split-user-names.mjs           dry run: reports what would happen, writes nothing
//   node scripts/migrate-split-user-names.mjs --apply   writes (one transaction)
//
// Only names made of exactly two whitespace-separated words are split automatically. Everything else is left
// with first_name/last_name NULL ("needs review") and keeps its original full_name. full_name is never
// changed or dropped. Idempotent: only rows where BOTH parts are NULL are considered, so re-running is safe.
// Uses DATABASE_URL (backend/.env, or the environment).
import { pool } from '../db.js';

const APPLY = process.argv.includes('--apply');
const MAX_PART_LENGTH = 79;
const TABLES = [
  { table: 'users', reference: 'employee_id' },
  { table: 'enrollment_requests', reference: 'request_code' },
];

const client = await pool.connect();
let exitCode = 0;

try {
  await client.query('BEGIN');

  for (const { table } of TABLES) {
    await client.query(
      `ALTER TABLE ${table}
         ADD COLUMN IF NOT EXISTS first_name VARCHAR(79),
         ADD COLUMN IF NOT EXISTS last_name VARCHAR(79)`,
    );
  }

  for (const { table, reference } of TABLES) {
    const { rows } = await client.query(
      `SELECT id, ${reference} AS reference, full_name
       FROM ${table}
       WHERE first_name IS NULL AND last_name IS NULL
       ORDER BY id`,
    );

    let splitCount = 0;
    const needsReview = [];

    for (const row of rows) {
      const parts = String(row.full_name ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      if (parts.length === 2 && parts.every((part) => part.length <= MAX_PART_LENGTH)) {
        await client.query(`UPDATE ${table} SET first_name = $1, last_name = $2 WHERE id = $3`, [
          parts[0],
          parts[1],
          row.id,
        ]);
        splitCount += 1;
      } else {
        needsReview.push(row);
      }
    }

    const remaining = await client.query(
      `SELECT COUNT(*)::int AS total FROM ${table} WHERE first_name IS NULL OR last_name IS NULL`,
    );

    console.log(`\n${table}: ${rows.length} unsplit record(s) found -> ${splitCount} split, ${needsReview.length} need review`);
    for (const row of needsReview) {
      console.log(`  needs review  ${String(row.reference).padEnd(10)} "${row.full_name}"`);
    }
    console.log(`  total still needing review in ${table}: ${remaining.rows[0].total}`);
  }

  if (APPLY) {
    await client.query('COMMIT');
    console.log('\nAPPLIED. full_name was not modified.');
  } else {
    await client.query('ROLLBACK');
    console.log('\nDRY RUN - nothing was written. Re-run with --apply to make the changes.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nMigration failed and was rolled back:', error);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

process.exit(exitCode);
