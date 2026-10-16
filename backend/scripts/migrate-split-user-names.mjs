// Ticket 211793: move user and enrollment-request names from full_name to first_name / last_name.
//
//   Step 1 - split (adds the columns and backfills; never changes or drops full_name):
//     node scripts/migrate-split-user-names.mjs            dry run: reports what would happen, writes nothing
//     node scripts/migrate-split-user-names.mjs --apply    writes (one transaction)
//
//   Step 2 - drop full_name (only once nobody needs review any more; take a pg_dump first):
//     node scripts/migrate-split-user-names.mjs --drop-full-name            dry run
//     node scripts/migrate-split-user-names.mjs --drop-full-name --apply    writes (one transaction)
//
// Step 1 splits only names made of exactly two whitespace-separated words. Everything else is left with
// first_name/last_name NULL ("needs review") and keeps its original full_name; fix those in User Management
// (or with SQL), then re-run step 1 to see the remaining count. Idempotent: step 1 only considers rows where
// BOTH parts are NULL. Step 2 refuses to run while any row still needs review, then makes first_name/last_name
// NOT NULL and drops full_name from users and enrollment_requests. Uses DATABASE_URL (backend/.env or env).
import { pool } from '../db.js';

const APPLY = process.argv.includes('--apply');
const DROP = process.argv.includes('--drop-full-name');
const MAX_PART_LENGTH = 79;
const TABLES = [
  { table: 'users', reference: 'employee_id' },
  { table: 'enrollment_requests', reference: 'request_code' },
];

const client = await pool.connect();
let exitCode = 0;

async function hasFullNameColumn(table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'full_name'`,
    [table],
  );
  return rows.length > 0;
}

async function needingReview(table) {
  return client.query(
    `SELECT id, ${table === 'users' ? 'employee_id' : 'request_code'} AS reference, first_name, last_name
     FROM ${table}
     WHERE first_name IS NULL OR last_name IS NULL
     ORDER BY id`,
  );
}

try {
  await client.query('BEGIN');

  for (const { table } of TABLES) {
    await client.query(
      `ALTER TABLE ${table}
         ADD COLUMN IF NOT EXISTS first_name VARCHAR(79),
         ADD COLUMN IF NOT EXISTS last_name VARCHAR(79)`,
    );
  }

  if (!DROP) {
    for (const { table, reference } of TABLES) {
      if (!(await hasFullNameColumn(table))) {
        console.log(`\n${table}: full_name column is already dropped - nothing to split.`);
        continue;
      }

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

      console.log(
        `\n${table}: ${rows.length} unsplit record(s) found -> ${splitCount} split, ${needsReview.length} need review`,
      );
      for (const row of needsReview) {
        console.log(`  needs review  ${String(row.reference).padEnd(10)} "${row.full_name}"`);
      }
      console.log(`  total still needing review in ${table}: ${remaining.rows[0].total}`);
    }
  } else {
    let blocked = false;

    for (const { table } of TABLES) {
      const review = await needingReview(table);

      if (review.rowCount > 0) {
        blocked = true;
        console.log(`\n${table}: ${review.rowCount} record(s) still need review - cannot drop full_name:`);
        for (const row of review.rows) {
          console.log(`  needs review  ${row.reference}`);
        }
      }
    }

    if (blocked) {
      throw new Error('Refusing to drop full_name while records still need review. Fix them and re-run.');
    }

    for (const { table } of TABLES) {
      if (!(await hasFullNameColumn(table))) {
        console.log(`\n${table}: full_name is already dropped.`);
      } else {
        console.log(`\n${table}: dropping full_name; first_name/last_name become NOT NULL.`);
      }

      await client.query(
        `ALTER TABLE ${table}
           ALTER COLUMN first_name SET NOT NULL,
           ALTER COLUMN last_name SET NOT NULL,
           DROP COLUMN IF EXISTS full_name`,
      );
    }
  }

  if (APPLY) {
    await client.query('COMMIT');
    console.log(DROP ? '\nAPPLIED. full_name has been dropped.' : '\nAPPLIED. full_name was not modified.');
  } else {
    await client.query('ROLLBACK');
    console.log('\nDRY RUN - nothing was written. Re-run with --apply to make the changes.');
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nMigration did not run and was rolled back:', error.message);
  exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

process.exit(exitCode);
