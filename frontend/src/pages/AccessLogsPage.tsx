const sampleLogs = [
  { id: 'EVT-1001', name: 'Main Entrance', status: 'Granted', time: '08:45' },
  { id: 'EVT-1002', name: 'Lab Door', status: 'Review', time: '09:12' },
  { id: 'EVT-1003', name: 'Server Room', status: 'Denied', time: '09:18' },
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
              <th>Event</th>
              <th>Entry Point</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {sampleLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{log.name}</td>
                <td>{log.status}</td>
                <td>{log.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
