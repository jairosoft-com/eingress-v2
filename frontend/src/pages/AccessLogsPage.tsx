type AccessLog = {
  access_time: string;
  authentication_method: string;
  id: number;
  result: string;
  user_name: string;
};

const accessLogs: AccessLog[] = [
  {
    id: 1001,
    user_name: 'Juan Dela Cruz',
    authentication_method: 'Fingerprint + RFID',
    result: 'Granted',
    access_time: '2026-06-05T08:21:00+08:00',
  },
  {
    id: 1002,
    user_name: 'Maria Santos',
    authentication_method: 'Fingerprint',
    result: 'Granted',
    access_time: '2026-06-05T08:18:00+08:00',
  },
  {
    id: 1003,
    user_name: 'Peter Reyes',
    authentication_method: 'RFID',
    result: 'Denied',
    access_time: '2026-06-05T08:15:00+08:00',
  },
];

export function AccessLogsPage() {
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
              <th>Method</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {accessLogs.map((log) => (
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
      </div>
    </section>
  );
}
