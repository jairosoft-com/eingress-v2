// Ticket 212153: User IDs are the role's 3-letter prefix plus a 4-digit number, e.g. EMP0021.
const USER_ID_NUMBER_WIDTH = 4;

// Take this inside a transaction (pg_advisory_xact_lock) before generating, so two registrations cannot
// receive the same number. 20260617 is the lock the enrollment routes already use.
export const USER_ID_LOCK_KEY = 20260617;

// Next ID for a prefix: one more than the highest number already used by a user or an enrollment request,
// whatever its width, so older IDs such as EMP001 keep counting and are never changed.
export async function generateUserId(client, prefix) {
  const result = await client.query(
    `SELECT COALESCE(MAX(SUBSTRING(employee_id FROM 4)::BIGINT), 0) + 1 AS next_number
     FROM (
       SELECT employee_id FROM users
       UNION ALL
       SELECT employee_id FROM enrollment_requests
     ) ids
     WHERE employee_id ~ ('^' || $1 || '[0-9]{1,9}$')`,
    [prefix],
  );

  return `${prefix}${String(result.rows[0].next_number).padStart(USER_ID_NUMBER_WIDTH, '0')}`;
}
