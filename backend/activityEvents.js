import { broadcastMessage } from './ws.js';

export function broadcastActivityEvent(event) {
  const payload = {
    id: event.id ?? Date.now(),
    user: event.user ?? 'System',
    employeeId: event.employeeId ?? '',
    event: event.event,
    area: event.area ?? 'System',
    device: event.device ?? 'EIngress',
    status: event.status ?? 'Info',
    time: event.time ?? new Date().toISOString(),
  };

  broadcastMessage({
    type: 'activity:event',
    payload,
  });
}
