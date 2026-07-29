

import dotenv from 'dotenv';
import express from 'express';
import http from 'http';
import os from 'os';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';

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

function getLanIpAddress() {
  const networkInterfaces = os.networkInterfaces();

  for (const addresses of Object.values(networkInterfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }

  return null;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/network-info', (req, res) => {
  res.json({ lanIp: getLanIpAddress() });
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

function startServer(port) {
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket.IO client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`Socket.IO client disconnected: ${socket.id}`);
    });
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use. Trying ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    console.error(error);
    process.exit(1);
  });

  server.listen(port, () => {
    createWebSocketServer(server);
    console.log(`EIngress backend is running on http://localhost:${port}`);
  });
}

startServer(PORT);
