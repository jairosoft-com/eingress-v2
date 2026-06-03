import { WebSocketServer, WebSocket } from 'ws';

let wss;

export function createWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'welcome', payload: { message: 'Connected to EIngress realtime bus' } }));

    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        if (data?.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // ignore invalid JSON
      }
    });
  });
}

export function broadcastMessage(payload) {
  if (!wss) {
    return;
  }

  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
