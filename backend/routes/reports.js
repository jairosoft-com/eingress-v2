import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { createNotification } from '../lib/notifications.js';

export const reportsRouter = express.Router();
reportsRouter.use(authMiddleware);

const DEFAULT_PAGE_SIZE = Number.parseInt(process.env.REPORTS_DEFAULT_PAGE_SIZE || '10', 10);
const MAX_PAGE_SIZE = Number.parseInt(process.env.REPORTS_MAX_PAGE_SIZE || '10', 10);

const REPORT_TYPES = [
  'Attendance Summary',
  'Access Request Summary',
  'User Summary',
  'Auto-Deactivated Accounts',
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toISOString().slice(0, 10);
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toISOString().slice(11, 16);
}

async function buildReportData(reportType, filters) {
  const { date, dateFrom, dateTo, department, status, search } = filters;

  if (reportType === 'Attendance Summary') {
    const params = [];
    const where = [];

    if (date) {
      params.push(date);
      where.push(`ar.attendance_date = $${params.length}`);
    } else {
      if (dateFrom) {
        params.push(dateFrom);
        where.push(`ar.attendance_date >= $${params.length}`);
      }
      if (dateTo) {
        params.push(dateTo);
        where.push(`ar.attendance_date <= $${params.length}`);
      }
    }

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

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await query(
      `SELECT u.full_name, u.role, ar.attendance_date, ar.check_in_at, ar.check_out_at
       FROM attendance_records ar
       JOIN users u ON u.id = ar.user_id
       ${whereClause}
       ORDER BY ar.attendance_date DESC, u.full_name`,
      params,
    );

    return {
      columns: ['Name', 'Role', 'Date', 'Time In', 'Time Out'],
      rows: result.rows.map((row) => [
        row.full_name,
        row.role || '—',
        formatDate(row.attendance_date),
        formatTime(row.check_in_at),
        formatTime(row.check_out_at),
      ]),
    };
  }

  if (reportType === 'Access Request Summary') {
    const params = [];
    const where = [];

    if (date) {
      params.push(date);
      where.push(`er.submitted_at::date = $${params.length}`);
    } else {
      if (dateFrom) {
        params.push(dateFrom);
        where.push(`er.submitted_at::date >= $${params.length}`);
      }
      if (dateTo) {
        params.push(dateTo);
        where.push(`er.submitted_at::date <= $${params.length}`);
      }
    }

    if (department) {
      params.push(department);
      where.push(`er.department = $${params.length}`);
    }

    if (status) {
      params.push(status);
      where.push(`er.status::text = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(er.full_name ILIKE $${params.length} OR er.employee_id ILIKE $${params.length} OR er.request_code ILIKE $${params.length})`,
      );
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const result = await query(
      `SELECT er.request_code, er.full_name, u.role, er.request_type, er.submitted_at, er.status
       FROM enrollment_requests er
       LEFT JOIN users u ON u.employee_id = er.employee_id
       ${whereClause}
       ORDER BY er.submitted_at DESC`,
      params,
    );

    return {
      columns: ['Request ID', 'Name', 'Role', 'Request Type', 'Date Submitted', 'Status'],
      rows: result.rows.map((row) => [
        row.request_code,
        row.full_name,
        row.role || '—',
        row.request_type,
        formatDate(row.submitted_at),
        row.status,
      ]),
    };
  }

  if (reportType === 'User Summary') {
    const params = [];
    const where = ['is_archived = FALSE'];

    if (department) {
      params.push(department);
      where.push(`department = $${params.length}`);
    }

    if (status) {
      params.push(status === 'Active');
      where.push(`is_active = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(full_name ILIKE $${params.length} OR employee_id ILIKE $${params.length})`);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const result = await query(
      `SELECT full_name, employee_id, role, rfid_uid, fingerprint_id, is_active
       FROM users
       ${whereClause}
       ORDER BY full_name`,
      params,
    );

    return {
      columns: ['Name', 'Employee ID', 'Role', 'RFID Status', 'Biometric Status', 'Account Status'],
      rows: result.rows.map((row) => [
        row.full_name,
        row.employee_id,
        row.role || '—',
        row.rfid_uid ? 'Registered' : 'Missing',
        row.fingerprint_id ? 'Registered' : 'Missing',
        row.is_active ? 'Active' : 'Disabled',
      ]),
    };
  }

  if (reportType === 'Auto-Deactivated Accounts') {
    const params = [];
    const where = ['is_active = FALSE', 'is_archived = FALSE'];

    if (department) {
      params.push(department);
      where.push(`department = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(full_name ILIKE $${params.length} OR employee_id ILIKE $${params.length})`);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const result = await query(
      `SELECT full_name, employee_id, role, rfid_uid, deactivated_at, deactivation_reason, updated_at
       FROM users
       ${whereClause}
       ORDER BY COALESCE(deactivated_at, updated_at) DESC`,
      params,
    );

    return {
      columns: ['Name', 'Employee ID', 'Role', 'RFID Status', 'Deactivation Date', 'Deactivation Reason'],
      rows: result.rows.map((row) => [
        row.full_name,
        row.employee_id,
        row.role || '—',
        row.rfid_uid ? 'Registered' : 'Missing',
        formatDate(row.deactivated_at || row.updated_at),
        row.deactivation_reason || 'Not recorded',
      ]),
    };
  }

  return { columns: [], rows: [] };
}

reportsRouter.get('/summary', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const trendDays = 7;
    const endDate = new Date(`${date}T00:00:00Z`);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (trendDays - 1));
    const startDateString = startDate.toISOString().slice(0, 10);

    const [attendance, departments, trend] = await Promise.all([
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
      query(
        `SELECT attendance_date,
          COUNT(*) FILTER (WHERE status = 'Present')::int AS present,
          COUNT(*) FILTER (WHERE status = 'Late')::int AS late,
          COUNT(*) FILTER (WHERE status = 'Absent')::int AS absent
         FROM attendance_records
         WHERE attendance_date BETWEEN $1 AND $2
         GROUP BY attendance_date
         ORDER BY attendance_date`,
        [startDateString, date],
      ),
    ]);

    const trendByDate = new Map(
      trend.rows.map((row) => [row.attendance_date.toISOString().slice(0, 10), row]),
    );
    const filledTrend = [];
    for (let index = 0; index < trendDays; index += 1) {
      const day = new Date(startDate);
      day.setUTCDate(day.getUTCDate() + index);
      const dayString = day.toISOString().slice(0, 10);
      const row = trendByDate.get(dayString);
      filledTrend.push({
        date: dayString,
        present: row?.present ?? 0,
        late: row?.late ?? 0,
        absent: row?.absent ?? 0,
      });
    }

    res.json({ attendance: attendance.rows[0], departments: departments.rows, trend: filledTrend });
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/data', async (req, res, next) => {
  try {
    const reportType = String(req.query.reportType || '');

    if (!REPORT_TYPES.includes(reportType)) {
      return res.status(400).json({ error: 'A valid reportType is required' });
    }

    const data = await buildReportData(reportType, {
      date: req.query.date ? String(req.query.date) : '',
      dateFrom: req.query.dateFrom ? String(req.query.dateFrom) : '',
      dateTo: req.query.dateTo ? String(req.query.dateTo) : '',
      department: req.query.department ? String(req.query.department) : '',
      status: req.query.status ? String(req.query.status) : '',
      search: req.query.search ? String(req.query.search) : '',
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/', async (req, res, next) => {
  try {
    const requestedPage = Number.parseInt(String(req.query.page || '1'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    const requestedPageSize = Number.parseInt(String(req.query.pageSize || ''), 10);
    const pageSize =
      Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? Math.min(requestedPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const offset = (page - 1) * pageSize;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const date = req.query.date ? String(req.query.date).trim() : '';
    const department = req.query.department ? String(req.query.department).trim() : '';
    const status = req.query.status ? String(req.query.status).trim() : '';

    const params = [];
    const where = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(r.report_name ILIKE $${params.length} OR r.report_type ILIKE $${params.length})`);
    }
    if (date) {
      params.push(date);
      where.push(`r.created_at::date = $${params.length}`);
    }
    if (department) {
      params.push(department);
      where.push(`r.parameters->>'department' = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`r.parameters->>'status' = $${params.length}`);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(
      `SELECT COUNT(*)::int AS total FROM generated_reports r ${whereClause}`,
      params,
    );
    const totalRecords = countResult.rows[0]?.total ?? 0;
    const totalPages = Math.max(Math.ceil(totalRecords / pageSize), 1);

    const result = await query(
      `SELECT r.id, r.report_name, r.report_type, r.file_url, r.created_at,
        a.username AS generated_by
       FROM generated_reports r
       LEFT JOIN admins a ON a.id = r.generated_by
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    res.json({
      data: result.rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

reportsRouter.get('/:id/data', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'A valid report id is required' });
    }

    const result = await query(
      `SELECT r.id, r.report_name, r.report_type, r.parameters, r.created_at,
        a.username AS generated_by
       FROM generated_reports r
       LEFT JOIN admins a ON a.id = r.generated_by
       WHERE r.id = $1`,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = result.rows[0];
    const data = await buildReportData(report.report_type, report.parameters || {});

    res.json({
      reportName: report.report_name,
      reportType: report.report_type,
      generatedBy: report.generated_by || 'System',
      generatedOn: report.created_at,
      columns: data.columns,
      rows: data.rows,
    });
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

    if (!REPORT_TYPES.includes(reportType)) {
      return res.status(400).json({ error: 'A valid reportType is required' });
    }

    const result = await query(
      `INSERT INTO generated_reports (report_name, report_type, generated_by, parameters)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [reportName, reportType, req.user.adminId || null, parameters || {}],
    );

    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.adminId || null, 'Generated Report', 'Reports', `Generated "${reportName}" (${reportType})`, req.ip],
    );

    await createNotification('Report Ready', `"${reportName}" (${reportType}) is ready to view.`, 'success');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});
