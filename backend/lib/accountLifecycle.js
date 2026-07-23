import { query } from '../db.js';
import { broadcastActivityEvent } from '../activityEvents.js';

export async function getEligibleUsersForDeactivation({ durationDays, applicableRoles }) {
  const roles = (applicableRoles || [])
    .map((role) => String(role).trim().toLowerCase())
    .filter(Boolean);

  if (roles.length === 0) {
    return [];
  }

  const result = await query(
    `WITH activity AS (
       SELECT u.id,
         GREATEST(
           COALESCE(al.last_access, u.created_at),
           COALESCE(ar.last_checkin, u.created_at)
         ) AS last_activity_at
       FROM users u
       LEFT JOIN (
         SELECT user_id, MAX(access_time) AS last_access
         FROM access_logs
         GROUP BY user_id
       ) al ON al.user_id = u.id
       LEFT JOIN (
         SELECT user_id, MAX(check_in_at) AS last_checkin
         FROM attendance_records
         GROUP BY user_id
       ) ar ON ar.user_id = u.id
     )
     SELECT u.id, u.employee_id, u.full_name, u.email, u.role, activity.last_activity_at
     FROM users u
     JOIN activity ON activity.id = u.id
     WHERE u.is_active = TRUE
       AND COALESCE(u.is_archived, FALSE) = FALSE
       AND LOWER(u.role) = ANY($1::text[])
       AND activity.last_activity_at < NOW() - ($2 || ' days')::interval
     ORDER BY activity.last_activity_at ASC`,
    [roles, String(durationDays)],
  );

  return result.rows;
}

export async function runAutoDeactivation({ actorAdminId, ip }) {
  const settingsResult = await query(
    `SELECT auto_deactivation_enabled, auto_deactivation_duration_days, auto_deactivation_applicable_roles
     FROM system_settings
     ORDER BY id
     LIMIT 1`,
  );
  const settings = settingsResult.rows[0];

  if (!settings || !settings.auto_deactivation_enabled) {
    return { ran: false, reason: 'disabled', deactivatedUsers: [] };
  }

  const eligibleUsers = await getEligibleUsersForDeactivation({
    durationDays: settings.auto_deactivation_duration_days,
    applicableRoles: settings.auto_deactivation_applicable_roles,
  });

  const deactivatedUsers = [];

  for (const eligibleUser of eligibleUsers) {
    const reason = `Automatically deactivated after ${settings.auto_deactivation_duration_days} day(s) of inactivity (role: ${eligibleUser.role})`;
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
        'Auto-Deactivated User',
        'Account Lifecycle',
        `Deactivated ${user.employee_id} (${user.full_name}) after ${settings.auto_deactivation_duration_days} day(s) of inactivity`,
        ip || null,
      ],
    );

    broadcastActivityEvent({
      user: user.full_name,
      employeeId: user.employee_id,
      event: 'User Auto-Deactivated',
      area: 'Account Lifecycle',
      device: 'System',
      status: 'Failed',
      time: user.deactivated_at,
    });
  }

  return { ran: true, deactivatedUsers };
}
