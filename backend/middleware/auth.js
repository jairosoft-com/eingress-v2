import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const adminResult = await query(
      `SELECT password_changed_at FROM admins WHERE id = $1 LIMIT 1`,
      [payload.adminId],
    );
    const passwordChangedAt = adminResult.rows[0]?.password_changed_at;

    if (passwordChangedAt && payload.iat * 1000 < new Date(passwordChangedAt).getTime()) {
      return res.status(401).json({ error: 'Your password was changed. Please sign in again.' });
    }

    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
