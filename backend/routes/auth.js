import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { query } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const TOKEN_EXPIRES_IN = '1h';

export const authRouter = express.Router();

authRouter.post('/login', async (req, res) => {
  const { usernameOrEmail, password, rfidCode } = req.body;

  if (!usernameOrEmail || !password || !rfidCode) {
    return res.status(400).json({ error: 'usernameOrEmail, password, and rfidCode are required' });
  }

  const adminResult = await query(
    'SELECT id, username, password_hash FROM admin WHERE username = $1 LIMIT 1',
    [usernameOrEmail],
  );

  if (adminResult.rowCount === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const admin = adminResult.rows[0];
  const passwordMatch = await bcrypt.compare(password, admin.password_hash);

  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ adminId: admin.id, username: admin.username }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES_IN,
  });

  return res.json({
    accessToken: token,
    adminName: admin.username,
    email: usernameOrEmail,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
});
