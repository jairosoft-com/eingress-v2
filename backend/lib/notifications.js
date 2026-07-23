import { query } from '../db.js';
import { broadcastMessage } from '../ws.js';

export async function createNotification(title, message, severity = 'info') {
  const result = await query(
    `INSERT INTO notifications (title, message, severity)
     VALUES ($1, $2, $3)
     RETURNING id, title, message, severity, is_read, created_at`,
    [title, message, severity],
  );

  const notification = result.rows[0];
  broadcastMessage({ type: 'notification:created', payload: notification });

  return notification;
}
