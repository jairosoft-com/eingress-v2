import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

import { pool, query } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { broadcastMessage } from '../ws.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret';
const TOKEN_EXPIRES_IN = '1h';
const RESET_TOKEN_EXPIRES_MINUTES = Number.parseInt(
  process.env.RESET_TOKEN_EXPIRES_MINUTES || '30',
  10,
);
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5174').replace(/\/$/, '');
const MAIL_FROM = process.env.MAIL_FROM || 'EINGRESS Support <no-reply@eingress.local>';

export const authRouter = express.Router();

async function ensureAdminPasswordColumns() {
  try {
    await query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`);
  } catch (error) {
    console.error('Unable to ensure admin password_changed_at column exists', error);
  }
}

void ensureAdminPasswordColumns();

let ensuredPasswordResetTable = false;

async function ensurePasswordResetTable() {
  if (ensuredPasswordResetTable) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGSERIAL PRIMARY KEY,
      admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(
    'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_admin_id ON password_reset_tokens(admin_id)',
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at)',
  );

  ensuredPasswordResetTable = true;
}

function getResetTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getMailTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT) {
    return null;
  }

  const auth =
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number.parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth,
  });
}

async function sendResetEmail({ email, resetUrl, username }) {
  const transport = getMailTransport();

  if (!transport) {
    console.info(`Password reset link for ${email}: ${resetUrl}`);
    return;
  }

  await transport.sendMail({
    from: MAIL_FROM,
    to: email,
    subject: 'Reset your EINGRESS password',
    text: `Hi ${username},\n\nUse this link to reset your EINGRESS password:\n${resetUrl}\n\nThis link expires in ${RESET_TOKEN_EXPIRES_MINUTES} minutes. If you did not request this, you can ignore this email.`,
    html: `
      <p>Hi ${username},</p>
      <p>Use the link below to reset your EINGRESS password:</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p>This link expires in ${RESET_TOKEN_EXPIRES_MINUTES} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}

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

    const notificationResult = await query(
      `INSERT INTO notifications (title, message, severity)
       VALUES ($1, $2, $3)
       RETURNING id, title, message, severity, is_read, created_at`,
      ['Welcome, administrator', `${admin.username} signed in successfully.`, 'success'],
    );
    broadcastMessage({ type: 'notification:created', payload: notificationResult.rows[0] });

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

authRouter.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT username, email, rfid_uid
       FROM admins
       WHERE id = $1 AND is_active = TRUE
       LIMIT 1`,
      [req.user.adminId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Administrator account not found' });
    }

    const admin = result.rows[0];
    return res.json({
      name: admin.username,
      email: admin.email,
      role: 'Administrator',
      rfidUid: admin.rfid_uid,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  try {
    await ensurePasswordResetTable();

    const adminResult = await query(
      `SELECT id, username, email
       FROM admins
       WHERE LOWER(email) = $1 AND is_active = TRUE
       LIMIT 1`,
      [email],
    );

    if (adminResult.rowCount > 0) {
      const admin = adminResult.rows[0];
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = getResetTokenHash(token);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000);
      const resetUrl = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

      await query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE admin_id = $1 AND used_at IS NULL`,
        [admin.id],
      );

      await query(
        `INSERT INTO password_reset_tokens (admin_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [admin.id, tokenHash, expiresAt],
      );

      await sendResetEmail({
        email: admin.email,
        resetUrl,
        username: admin.username,
      });
    }

    return res.json({
      message: 'If that email exists, a password reset link has been sent.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to send password reset link' });
  }
});

authRouter.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ error: 'Reset token is required' });
  }

  try {
    await ensurePasswordResetTable();

    const tokenHash = getResetTokenHash(token);
    const tokenResult = await query(
      `SELECT id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash],
    );

    return res.json({ valid: tokenResult.rowCount > 0 });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to verify reset token' });
  }
});

authRouter.post('/reset-password', async (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');

  if (!token || !password) {
    return res.status(400).json({ error: 'Reset token and new password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    await ensurePasswordResetTable();

    const tokenHash = getResetTokenHash(token);
    const tokenResult = await query(
      `SELECT prt.id, prt.admin_id, admins.username
       FROM password_reset_tokens prt
       JOIN admins ON admins.id = prt.admin_id
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
         AND admins.is_active = TRUE
       LIMIT 1`,
      [tokenHash],
    );

    if (tokenResult.rowCount === 0) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    }

    const resetToken = tokenResult.rows[0];
    const passwordHash = await bcrypt.hash(password, 12);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE admins
         SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, resetToken.admin_id],
      );

      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE id = $1`,
        [resetToken.id],
      );

      await client.query(
        `INSERT INTO audit_logs (admin_id, action, module, details)
         VALUES ($1, $2, $3, $4)`,
        [resetToken.admin_id, 'Password Reset', 'Authentication', 'Admin password was reset'],
      );

      await client.query(
        `INSERT INTO notifications (title, message, severity)
         VALUES ($1, $2, $3)`,
        [
          'Password changed',
          `The password for ${resetToken.username} was changed successfully.`,
          'warning',
        ],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    broadcastMessage({
      type: 'auth:password-changed',
      payload: { adminId: resetToken.admin_id },
    });

    return res.json({ message: 'Password has been reset. You can now sign in.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to reset password' });
  }
});
