import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const auditLogsRouter = express.Router();
auditLogsRouter.use(authMiddleware);

const DEFAULT_PAGE_SIZE = Number.parseInt(process.env.AUDIT_LOGS_DEFAULT_PAGE_SIZE || '10', 10);
const MAX_PAGE_SIZE = Number.parseInt(process.env.AUDIT_LOGS_MAX_PAGE_SIZE || '100', 10);

auditLogsRouter.get('/options', async (_req, res, next) => {
  try {
    const [moduleResult, actionResult] = await Promise.all([
      query('SELECT DISTINCT module FROM audit_logs WHERE module IS NOT NULL ORDER BY module'),
      query('SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL ORDER BY action'),
    ]);

    res.json({
      actions: actionResult.rows.map((row) => row.action),
      modules: moduleResult.rows.map((row) => row.module),
    });
  } catch (error) {
    next(error);
  }
});

auditLogsRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const moduleFilter = String(req.query.module || '').trim();
    const actionFilter = String(req.query.action || '').trim();
    const adminNameFilter = String(req.query.adminName || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();

    const requestedPage = Number.parseInt(String(req.query.page || '1'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    const requestedPageSize = Number.parseInt(String(req.query.pageSize || ''), 10);
    const pageSize =
      Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? Math.min(requestedPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const conditions = [];
    const values = [];
    let index = 1;

    const addCondition = (clause) => {
      conditions.push(clause);
    };

    if (search) {
      const pattern = `%${search.toLowerCase()}%`;
      addCondition(`(
        LOWER(l.details) LIKE $${index} OR
        LOWER(l.action) LIKE $${index} OR
        LOWER(l.module) LIKE $${index} OR
        LOWER(COALESCE(a.username, 'System')) LIKE $${index}
      )`);
      values.push(pattern);
      index += 1;
    }

    if (moduleFilter) {
      addCondition(`LOWER(l.module) LIKE $${index}`);
      values.push(`%${moduleFilter.toLowerCase()}%`);
      index += 1;
    }

    if (actionFilter) {
      addCondition(`LOWER(l.action) LIKE $${index}`);
      values.push(`%${actionFilter.toLowerCase()}%`);
      index += 1;
    }

    if (adminNameFilter) {
      addCondition(`LOWER(COALESCE(a.username, 'System')) LIKE $${index}`);
      values.push(`%${adminNameFilter.toLowerCase()}%`);
      index += 1;
    }

    if (dateFrom) {
      addCondition(`l.created_at >= $${index}`);
      values.push(new Date(`${dateFrom}T00:00:00`));
      index += 1;
    }

    if (dateTo) {
      addCondition(`l.created_at <= $${index}`);
      values.push(new Date(`${dateTo}T23:59:59`));
      index += 1;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM audit_logs l
       LEFT JOIN admins a ON a.id = l.admin_id
       ${whereClause}`,
      values,
    );
    const totalRecords = countResult.rows[0]?.total ?? 0;
    const totalPages = Math.max(Math.ceil(totalRecords / pageSize), 1);

    const result = await query(
      `SELECT l.id, l.action, l.module, l.details, l.ip_address, l.created_at,
        a.username AS admin_name
       FROM audit_logs l
       LEFT JOIN admins a ON a.id = l.admin_id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT $${index} OFFSET $${index + 1}`,
      [...values, pageSize, offset],
    );

    res.json({
      data: result.rows.map((row) => ({
        ...row,
        ip_address: row.ip_address ? String(row.ip_address) : '',
      })),
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
