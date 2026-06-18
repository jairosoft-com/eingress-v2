import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const reportsRouter = express.Router();
reportsRouter.use(authMiddleware);

reportsRouter.get('/summary', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const [attendance, departments] = await Promise.all([
      query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'Present')::int AS present,
          COUNT(*) FILTER (WHERE status = 'Late')::int AS late,
          COUNT(*) FILTER (WHERE status = 'Absent')::int AS absent,
          COUNT(*)::int AS total
         FROM attendance_records
         WHERE attendance_date = $1`,
        [date],
      ),
      query(
        `SELECT u.department, COUNT(*)::int AS total
         FROM attendance_records ar
         JOIN users u ON u.id = ar.user_id
         WHERE ar.attendance_date = $1
         GROUP BY u.department
         ORDER BY total DESC`,
        [date],
      ),
    ]);

    res.json({ attendance: attendance.rows[0], departments: departments.rows });
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT r.id, r.report_name, r.report_type, r.file_url, r.created_at,
        a.username AS generated_by
       FROM generated_reports r
       LEFT JOIN admins a ON a.id = r.generated_by
       ORDER BY r.created_at DESC
       LIMIT 50`,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

reportsRouter.post('/', async (req, res, next) => {
  try {
    const { reportName, reportType, parameters } = req.body;

    if (!reportName || !reportType) {
      return res.status(400).json({ error: 'reportName and reportType are required' });
    }

    const result = await query(
      `INSERT INTO generated_reports (report_name, report_type, generated_by, parameters)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [reportName, reportType, req.user.adminId || null, parameters || {}],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
