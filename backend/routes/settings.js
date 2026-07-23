import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { runAutoDeactivation } from '../lib/accountLifecycle.js';

export const settingsRouter = express.Router();
settingsRouter.use(authMiddleware);

const ALLOWED_DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];
const ALLOWED_TIME_FORMATS = ['12-Hour (hh:mm AM/PM)', '24-Hour (HH:mm)'];
const ALLOWED_FIRST_DAY_OF_WEEK = ['Monday', 'Sunday'];
const ALLOWED_LIFECYCLE_ROLES = ['Employee', 'Student', 'Staff', 'Intern'];

async function ensureSecuritySettingColumns() {
  await query(`
    ALTER TABLE system_settings
      ADD COLUMN IF NOT EXISTS first_day_of_week VARCHAR(20) NOT NULL DEFAULT 'Monday',
      ADD COLUMN IF NOT EXISTS max_failed_attempts INTEGER NOT NULL DEFAULT 5,
      ADD COLUMN IF NOT EXISTS lockout_duration_minutes INTEGER NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS reset_failed_attempts_after_minutes INTEGER NOT NULL DEFAULT 15,
      ADD COLUMN IF NOT EXISTS lockout_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS idle_timeout_warning_minutes INTEGER NOT NULL DEFAULT 5,
      ADD COLUMN IF NOT EXISTS auto_logout_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS keep_me_logged_in BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS admin_rfid_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS auto_deactivation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS auto_deactivation_duration_days INTEGER NOT NULL DEFAULT 7,
      ADD COLUMN IF NOT EXISTS auto_deactivation_applicable_roles TEXT[] NOT NULL DEFAULT ARRAY['Student', 'Intern', 'Staff']::TEXT[]
  `);
}

const settingsReady = ensureSecuritySettingColumns();

settingsRouter.get('/', async (req, res, next) => {
  try {
    await settingsReady;
    const result = await query(
      `SELECT company_name, time_zone, date_format, time_format,
        system_language, session_timeout_minutes, database_status, last_backup_at,
        system_version, updated_at, first_day_of_week, max_failed_attempts,
        lockout_duration_minutes, reset_failed_attempts_after_minutes, lockout_enabled,
        idle_timeout_warning_minutes, auto_logout_enabled, keep_me_logged_in,
        admin_rfid_enabled, auto_deactivation_enabled, auto_deactivation_duration_days,
        auto_deactivation_applicable_roles
       FROM system_settings
       ORDER BY id
       LIMIT 1`,
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    next(error);
  }
});

settingsRouter.patch('/', async (req, res, next) => {
  try {
    await settingsReady;
    const {
      companyName,
      timeZone,
      dateFormat,
      timeFormat,
      systemLanguage,
      sessionTimeoutMinutes,
      firstDayOfWeek,
      maxFailedAttempts,
      lockoutDurationMinutes,
      resetFailedAttemptsAfterMinutes,
      lockoutEnabled,
      idleTimeoutWarningMinutes,
      autoLogoutEnabled,
      keepMeLoggedIn,
      adminRfidEnabled,
      autoDeactivationEnabled,
      autoDeactivationDurationDays,
      autoDeactivationApplicableRoles,
    } = req.body;

    if (dateFormat !== undefined && dateFormat !== null && !ALLOWED_DATE_FORMATS.includes(dateFormat)) {
      return res.status(400).json({ error: `dateFormat must be one of: ${ALLOWED_DATE_FORMATS.join(', ')}` });
    }
    if (timeFormat !== undefined && timeFormat !== null && !ALLOWED_TIME_FORMATS.includes(timeFormat)) {
      return res.status(400).json({ error: `timeFormat must be one of: ${ALLOWED_TIME_FORMATS.join(', ')}` });
    }
    if (
      firstDayOfWeek !== undefined &&
      firstDayOfWeek !== null &&
      !ALLOWED_FIRST_DAY_OF_WEEK.includes(firstDayOfWeek)
    ) {
      return res
        .status(400)
        .json({ error: `firstDayOfWeek must be one of: ${ALLOWED_FIRST_DAY_OF_WEEK.join(', ')}` });
    }

    if (
      autoDeactivationDurationDays !== undefined &&
      autoDeactivationDurationDays !== null &&
      (!Number.isInteger(autoDeactivationDurationDays) || autoDeactivationDurationDays < 1)
    ) {
      return res.status(400).json({ error: 'autoDeactivationDurationDays must be a positive integer' });
    }

    let normalizedApplicableRoles;
    if (autoDeactivationApplicableRoles !== undefined && autoDeactivationApplicableRoles !== null) {
      if (
        !Array.isArray(autoDeactivationApplicableRoles) ||
        autoDeactivationApplicableRoles.some((role) => typeof role !== 'string')
      ) {
        return res.status(400).json({ error: 'autoDeactivationApplicableRoles must be an array of role names' });
      }

      normalizedApplicableRoles = autoDeactivationApplicableRoles.map((role) => role.trim());
      const invalidRole = normalizedApplicableRoles.find(
        (role) => !ALLOWED_LIFECYCLE_ROLES.some((allowed) => allowed.toLowerCase() === role.toLowerCase()),
      );

      if (invalidRole) {
        return res.status(400).json({
          error: `autoDeactivationApplicableRoles must only contain: ${ALLOWED_LIFECYCLE_ROLES.join(', ')}`,
        });
      }
    }

    if (sessionTimeoutMinutes != null || idleTimeoutWarningMinutes != null) {
      const current = await query(
        `SELECT session_timeout_minutes, idle_timeout_warning_minutes
         FROM system_settings
         ORDER BY id
         LIMIT 1`,
      );
      const effectiveSessionTimeout =
        sessionTimeoutMinutes ?? current.rows[0]?.session_timeout_minutes;
      const effectiveIdleWarning =
        idleTimeoutWarningMinutes ?? current.rows[0]?.idle_timeout_warning_minutes;

      if (effectiveIdleWarning >= effectiveSessionTimeout) {
        return res.status(400).json({
          error: 'idleTimeoutWarningMinutes must be less than sessionTimeoutMinutes',
        });
      }
    }

    const result = await query(
      `UPDATE system_settings
       SET company_name = COALESCE($1, company_name),
         time_zone = COALESCE($2, time_zone),
         date_format = COALESCE($3, date_format),
         time_format = COALESCE($4, time_format),
         system_language = COALESCE($5, system_language),
         session_timeout_minutes = COALESCE($6, session_timeout_minutes),
         first_day_of_week = COALESCE($7, first_day_of_week),
         max_failed_attempts = COALESCE($8, max_failed_attempts),
         lockout_duration_minutes = COALESCE($9, lockout_duration_minutes),
         reset_failed_attempts_after_minutes = COALESCE($10, reset_failed_attempts_after_minutes),
         lockout_enabled = COALESCE($11, lockout_enabled),
         idle_timeout_warning_minutes = COALESCE($12, idle_timeout_warning_minutes),
         auto_logout_enabled = COALESCE($13, auto_logout_enabled),
         keep_me_logged_in = COALESCE($14, keep_me_logged_in),
         admin_rfid_enabled = COALESCE($15, admin_rfid_enabled),
         auto_deactivation_enabled = COALESCE($16, auto_deactivation_enabled),
         auto_deactivation_duration_days = COALESCE($17, auto_deactivation_duration_days),
         auto_deactivation_applicable_roles = COALESCE($18, auto_deactivation_applicable_roles),
         updated_at = NOW()
       WHERE id = (SELECT id FROM system_settings ORDER BY id LIMIT 1)
       RETURNING *`,
      [
        companyName ?? null,
        timeZone ?? null,
        dateFormat ?? null,
        timeFormat ?? null,
        systemLanguage ?? null,
        sessionTimeoutMinutes ?? null,
        firstDayOfWeek ?? null,
        maxFailedAttempts ?? null,
        lockoutDurationMinutes ?? null,
        resetFailedAttemptsAfterMinutes ?? null,
        lockoutEnabled ?? null,
        idleTimeoutWarningMinutes ?? null,
        autoLogoutEnabled ?? null,
        keepMeLoggedIn ?? null,
        adminRfidEnabled ?? null,
        autoDeactivationEnabled ?? null,
        autoDeactivationDurationDays ?? null,
        normalizedApplicableRoles ?? null,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'System settings row not found' });
    }

    const updatedSettings = result.rows[0];
    let lifecycleRun = null;

    if (updatedSettings.auto_deactivation_enabled) {
      const runResult = await runAutoDeactivation({ actorAdminId: req.user.adminId, ip: req.ip });
      lifecycleRun = { ran: runResult.ran, deactivatedCount: runResult.deactivatedUsers.length };
    }

    res.json({ ...updatedSettings, lifecycleRun });
  } catch (error) {
    next(error);
  }
});

settingsRouter.post('/lifecycle/run', async (req, res, next) => {
  try {
    await settingsReady;
    const result = await runAutoDeactivation({ actorAdminId: req.user.adminId, ip: req.ip });

    if (!result.ran) {
      return res.status(400).json({ error: 'Automatic account deactivation is not enabled.' });
    }

    res.json({
      deactivatedCount: result.deactivatedUsers.length,
      deactivatedUsers: result.deactivatedUsers,
    });
  } catch (error) {
    next(error);
  }
});
