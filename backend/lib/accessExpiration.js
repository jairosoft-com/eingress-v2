import { query } from '../db.js';
import { broadcastActivityEvent } from '../activityEvents.js';
import { createNotification } from './notifications.js';

export async function runAccessExpirationCheck({ actorAdminId, ip } = {}) {
  const eligibleResult = await query(
    `SELECT id, employee_id, full_name, email, role, expiration_date
     FROM users
     WHERE is_active = TRUE
       AND COALESCE(is_archived, FALSE) = FALSE
       AND LOWER(role) = 'student'
       AND expiration_date IS NOT NULL
       AND expiration_date < NOW()`,
  );

  const deactivatedUsers = [];

  for (const eligibleUser of eligibleResult.rows) {
    const reason = 'RFID access expired';
    const result = await query(
      `UPDATE users
       SET is_active = FALSE,
         deactivated_at = NOW(),
         deactivation_reason = $2,
         updated_at = NOW()
       WHERE id = $1 AND is_active = TRUE
       RETURNING id, employee_id, full_name, email, role, is_active, deactivated_at, deactivation_reason`,
      [eligibleUser.id, reason],
    );

    const user = result.rows[0];
    if (!user) continue;

    deactivatedUsers.push(user);

    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actorAdminId || null,
        'Access Expired',
        'Account Lifecycle',
        `Deactivated ${user.employee_id} (${user.full_name}) after RFID access expired`,
        ip || null,
      ],
    );

    broadcastActivityEvent({
      user: user.full_name,
      employeeId: user.employee_id,
      event: 'RFID Access Expired',
      area: 'Account Lifecycle',
      device: 'System',
      status: 'Failed',
      time: user.deactivated_at,
    });

    await createNotification(
      'RFID Access Expired',
      `${user.full_name} (${user.employee_id})'s RFID access has expired and the account was deactivated.`,
      'warning',
    );
  }

  return { deactivatedUsers };
}
