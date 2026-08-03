let io = null;

export function setSocketIO(socketServer) {
  io = socketServer;
}

export function getSocketIO() {
  return io;
}