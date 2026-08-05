import { Server as SocketIOServer } from 'socket.io';

let io;

export function createSocketServer(server) {
  io = new SocketIOServer(server, {
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

  return io;
}

export function emitDoorUnlock(payload) {
  if (!io) {
    return;
  }

  io.emit('door:unlock', payload);
}
