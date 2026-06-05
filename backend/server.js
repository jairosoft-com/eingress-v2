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
app.use('/api/users', usersRouter);
app.use('/api/access-logs', accessLogsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/kiosk', kioskRouter);

const server = http.createServer(app);
createWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`EIngress backend is running on http://localhost:${PORT}`);
});
