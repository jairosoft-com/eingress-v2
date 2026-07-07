import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const attendanceRouter = express.Router();
attendanceRouter.use(authMiddleware);

attendanceRouter.get('/', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const department = req.query.department;
    const status = req.query.status;
    const search = req.query.search;

    const params = [date];
    const where = ['ar.attendance_date = $1'];

    if (department) {
      params.push(department);
      where.push(`u.department = $${params.length}`);
    }

    if (status) {
      params.push(status);
      where.push(`ar.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR u.employee_id ILIKE $${params.length})`);
    }

    const result = await query(
      `SELECT ar.id, ar.attendance_date, ar.check_in_at, ar.check_out_at, ar.status, ar.location,
        u.employee_id, u.full_name, u.department, u.role
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY ar.attendance_date DESC, ar.check_in_at DESC NULLS LAST, u.full_name`,
      params,
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

attendanceRouter.get('/summary', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const result = await query(
      `SELECT
        COUNT(*)::int AS total_records,
        COUNT(*) FILTER (WHERE status = 'Present')::int AS present,
        COUNT(*) FILTER (WHERE status = 'Late')::int AS late,
        COUNT(*) FILTER (WHERE status = 'Absent')::int AS absent
       FROM attendance_records
       WHERE attendance_date = $1`,
      [date],
    );

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
