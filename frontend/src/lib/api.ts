const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL =
  configuredApiBaseUrl &&
  !configuredApiBaseUrl.includes('localhost') &&
  !configuredApiBaseUrl.includes('127.0.0.1')
    ? configuredApiBaseUrl
    : '/api';

export type RealtimeSocketMessage = {
  payload?: unknown;
  type?: string;
};

export function getWebSocketUrl(): string {
  const wsTarget = API_BASE_URL.replace(/^http/i, 'ws').replace(/\/api$/, '/ws');

  if (/^wss?:\/\//i.test(wsTarget)) {
    return wsTarget;
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = wsTarget.startsWith('/') ? wsTarget : `/${wsTarget}`;
    return `${protocol}//${window.location.host}${path}`;
  }

  return wsTarget;
}

export function subscribeRealtimeMessages(
  onMessage: (message: RealtimeSocketMessage) => void,
  options?: {
    onReconnect?: () => void;
    reconnectDelayMs?: number;
  },
): () => void {
  let socket: WebSocket | null = null;
  let reconnectTimeoutId: number | undefined;
  let shouldReconnect = true;
  let hasConnectedOnce = false;
  const reconnectDelayMs = options?.reconnectDelayMs ?? 1500;

  function connect() {
    if (!shouldReconnect) {
      return;
    }

    socket = new WebSocket(getWebSocketUrl());

    socket.addEventListener('open', () => {
      if (hasConnectedOnce) {
        options?.onReconnect?.();
      }
      hasConnectedOnce = true;
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as RealtimeSocketMessage;
        onMessage(message);
      } catch {
        // Ignore realtime messages that are not JSON.
      }
    });

    socket.addEventListener('close', () => {
      if (shouldReconnect) {
        reconnectTimeoutId = window.setTimeout(connect, reconnectDelayMs);
      }
    });
  }

  connect();

  return () => {
    shouldReconnect = false;
    if (reconnectTimeoutId !== undefined) {
      window.clearTimeout(reconnectTimeoutId);
    }
    socket?.close();
  };
}
