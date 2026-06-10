import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import cors from 'cors';

import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { accessLogsRouter } from './routes/accessLogs.js';
import { devicesRouter } from './routes/devices.js';
import { notificationsRouter } from './routes/notifications.js';
import { kioskRouter } from './routes/kiosk.js';
import { dashboardRouter } from './routes/dashboard.js';
import { attendanceRouter } from './routes/attendance.js';
import { enrollmentRequestsRouter } from './routes/enrollmentRequests.js';
import { reportsRouter } from './routes/reports.js';
import { auditLogsRouter } from './routes/auditLogs.js';
import { settingsRouter } from './routes/settings.js';
import { createWebSocketServer } from './ws.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/users', usersRouter);
app.use('/api/access-logs', accessLogsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/enrollment-requests', enrollmentRequestsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit-logs', auditLogsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/kiosk', kioskRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
createWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`EIngress backend is running on http://localhost:${PORT}`);
});
