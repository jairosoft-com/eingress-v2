import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const settingsRouter = express.Router();
settingsRouter.use(authMiddleware);

settingsRouter.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT company_name, time_zone, date_format, time_format,
        system_language, session_timeout_minutes, database_status, last_backup_at,
        system_version, updated_at
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
    const {
      companyName,
      timeZone,
      dateFormat,
      timeFormat,
      systemLanguage,
      sessionTimeoutMinutes,
    } = req.body;

    const result = await query(
      `UPDATE system_settings
       SET company_name = COALESCE($1, company_name),
         time_zone = COALESCE($2, time_zone),
         date_format = COALESCE($3, date_format),
         time_format = COALESCE($4, time_format),
         system_language = COALESCE($5, system_language),
         session_timeout_minutes = COALESCE($6, session_timeout_minutes),
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
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'System settings row not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
