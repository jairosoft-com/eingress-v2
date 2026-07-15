import { useEffect, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { API_BASE_URL } from '../lib/api';
import { formatDateTime } from '../lib/dateTimeFormat';
import { useDateTimeSettings } from '../lib/systemSettingsStore';

const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/ws');

type AccessLog = {
  area?: string | null;
  authentication_method?: string | null;
  device?: string | null;
  device_name?: string | null;
  employee_id?: string | null;
  employeeId?: string | null;
  event?: string;
  event_time?: string;
  id: number | string;
  result?: string;
  status?: string;
  time?: string;
  user?: string | null;
  user_name?: string | null;
};

function getEventTime(log: AccessLog) {
  return log.time ?? log.event_time ?? new Date().toISOString();
}

function sortAccessLogsByTime(logs: AccessLog[]) {
  return [...logs].sort(
    (logA, logB) => new Date(getEventTime(logB)).getTime() - new Date(getEventTime(logA)).getTime(),
  );
}

function getStatus(log: AccessLog) {
  const status = log.status ?? log.result ?? 'Info';

  if (status === 'Granted') {
    return 'Success';
  }

  if (status === 'Denied') {
    return 'Failed';
  }

  return status;
}

export function AccessLogsPage() {
  const { session } = useAuth();
  const dateTimeSettings = useDateTimeSettings();
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const controller = new AbortController();

    void fetch(`${API_BASE_URL}/access-logs`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as AccessLog[] | null;

        if (!response.ok || !Array.isArray(data)) {
          throw new Error('Unable to load access logs.');
        }

        setAccessLogs(sortAccessLogsByTime(data));
        setErrorMessage('');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : 'Unable to load access logs.');
      });

    return () => controller.abort();
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const socket = new WebSocket(WS_BASE_URL);

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          payload?: AccessLog;
          type?: string;
        };

        if (message.type === 'activity:event' && message.payload) {
          setAccessLogs((currentLogs) =>
            sortAccessLogsByTime([message.payload as AccessLog, ...currentLogs]).slice(0, 100),
          );
        }
      } catch {
        // Ignore realtime messages that are not JSON.
      }
    });

    return () => socket.close();
  }, [session?.accessToken]);

  return (
    <section className="page-stack" aria-labelledby="logs-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h1 id="logs-title">Access Logs</h1>
        </div>
      </header>

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Log ID</th>
              <th>User</th>
              <th>Event</th>
              <th>Method</th>
              <th>Area</th>
              <th>Device</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {errorMessage ? (
              <tr>
                <td colSpan={8}>{errorMessage}</td>
              </tr>
            ) : accessLogs.length === 0 ? (
              <tr>
                <td colSpan={8}>No recent access events.</td>
              </tr>
            ) : (
              accessLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>{log.user ?? log.user_name ?? 'Unknown'}</td>
                  <td>{log.event ?? 'Access Event'}</td>
                  <td>{log.authentication_method ?? 'System'}</td>
                  <td>{log.area ?? 'System'}</td>
                  <td>{log.device ?? log.device_name ?? 'EIngress'}</td>
                  <td>{getStatus(log)}</td>
                  <td>{formatDateTime(getEventTime(log), dateTimeSettings)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
