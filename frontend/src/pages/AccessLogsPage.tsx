import { useEffect, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { apiFetch, authHeaders } from '../api/client';

type AccessLog = {
  id: number;
  user_id: number;
  user_name: string;
  authentication_method: string;
  result: string;
  access_time: string;
};

export function AccessLogsPage() {
  const { session } = useAuth();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogs() {
      if (!session?.accessToken) {
        return;
      }

      try {
        setLoading(true);
        const response = await apiFetch('/access-logs', {
          headers: authHeaders(session.accessToken),
        });
        const data = await response.json();
        setLogs(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load access logs.');
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, [session]);

  return (
    <section className="page-stack" aria-labelledby="logs-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Monitoring</p>
          <h1 id="logs-title">Access Logs</h1>
        </div>
      </header>

      <div className="table-panel">
        {loading ? (
          <p>Loading access logs…</p>
        ) : error ? (
          <p className="field-error">{error}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Log ID</th>
                <th>User</th>
                <th>Method</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>{log.user_name}</td>
                  <td>{log.authentication_method}</td>
                  <td>{log.result}</td>
                  <td>{new Date(log.access_time).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
