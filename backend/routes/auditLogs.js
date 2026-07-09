import express from 'express';

import { query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const auditLogsRouter = express.Router();
auditLogsRouter.use(authMiddleware);

auditLogsRouter.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const moduleFilter = String(req.query.module || '').trim();
    const actionFilter = String(req.query.action || '').trim();
    const adminNameFilter = String(req.query.adminName || '').trim();
    const dateFrom = String(req.query.dateFrom || '').trim();
    const dateTo = String(req.query.dateTo || '').trim();
    const limit = Number.parseInt(String(req.query.limit || '500'), 10);

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
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 1000) : 500;

    const result = await query(
      `SELECT l.id, l.action, l.module, l.details, l.ip_address, l.created_at,
        a.username AS admin_name
       FROM audit_logs l
       LEFT JOIN admins a ON a.id = l.admin_id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT $${index}`,
      [...values, safeLimit],
    );

    res.json(
      result.rows.map((row) => ({
        ...row,
        ip_address: row.ip_address ? String(row.ip_address) : '',
      })),
    );
  } catch (error) {
    next(error);
  }
});
