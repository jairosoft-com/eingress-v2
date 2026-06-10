import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const TOKEN_EXPIRES_IN = '1h';

export const authRouter = express.Router();

authRouter.post('/login', async (req, res) => {
  const usernameOrEmail = req.body.usernameOrEmail || req.body.username || req.body.email;
  const { password, rfidCode } = req.body;

  if (!usernameOrEmail || !password || !rfidCode) {
    return res.status(400).json({ error: 'usernameOrEmail, password, and rfidCode are required' });
  }

  try {
    const adminResult = await query(
      `SELECT id, username, email, password_hash, rfid_uid, is_active
       FROM admins
       WHERE username = $1 OR email = $1
       LIMIT 1`,
      [usernameOrEmail],
    );

    if (adminResult.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = adminResult.rows[0];
    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    const rfidMatch = admin.rfid_uid === rfidCode;

    if (!admin.is_active || !passwordMatch || !rfidMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ adminId: admin.id, username: admin.username }, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRES_IN,
    });

    await query(
      `INSERT INTO audit_logs (admin_id, action, module, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [admin.id, 'Login', 'Authentication', 'Admin logged in', req.ip],
    );

    return res.json({
      accessToken: token,
      adminName: admin.username,
      email: admin.email,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
