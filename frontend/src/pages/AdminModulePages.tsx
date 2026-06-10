import {
  AlertTriangle,
  Archive,
  Check,
  Filter,
  Fingerprint,
  Monitor,
  UsersRound,
  X,
} from 'lucide-react';

const attendanceRows = [
  ['EMP001', 'Juan Dela Cruz', 'IT Department', '08:01 AM', '05:02 PM', 'Present', 'Main Office'],
  ['EMP002', 'Maria Santos', 'HR Department', '07:55 AM', '05:10 PM', 'Present', 'Main Office'],
  ['EMP003', 'Pedro Reyes', 'Operations', '08:15 AM', '06:01 PM', 'Present', 'Main Office'],
  ['EMP004', 'Ana Garcia', 'Finance', '08:23 AM', '-', 'Late', 'Main Office'],
  ['EMP005', 'Carlo Mendoza', 'IT Department', '-', '-', 'Absent', '-'],
  ['EMP006', 'Liza Morales', 'HR Department', '08:05 AM', '04:58 PM', 'Present', 'Main Office'],
];

const enrollmentRows = [
  ['REQ-0101', 'Juan Dela Cruz', 'EMP001', 'IT', 'RFID Enrollment', 'May 20', 'Pending'],
  ['REQ-0102', 'Maria Santos', 'EMP002', 'HR', 'Biometric', 'May 20', 'Pending'],
  ['REQ-0103', 'Pedro Reyes', 'EMP003', 'Operations', 'RFID', 'May 20', 'Pending'],
  ['REQ-0104', 'Ana Garcia', 'EMP004', 'Finance', 'Biometric', 'May 20', 'Approved'],
  ['REQ-0105', 'Carlo Mendoza', 'EMP005', 'IT', 'Biometric', 'May 20', 'Rejected'],
  ['REQ-0106', 'Liza Morales', 'EMP006', 'HR', 'RFID', 'May 20', 'Approved'],
  ['REQ-0107', 'Ryan Torres', 'EMP007', 'Operations', 'Biometric', 'May 20', 'Approved'],
  ['REQ-0108', 'Grace Lee', 'EMP008', 'Finance', 'RFID', 'May 20', 'Approved'],
  ['REQ-0109', 'Kevin V.', 'EMP009', 'IT', 'Biometric', 'May 20', 'Approved'],
  ['REQ-0110', 'Ivy Cruz', 'EMP010', 'HR', 'RFID', 'May 20', 'Rejected'],
];

const deviceRows = [
  ['DEV-001', 'Main Entrance', 'RFID Reader', 'Office', '192.168.1.10', 'Online', 'May 20'],
  ['DEV-002', 'HR Office Bio', 'Biometric', 'HR Office', '192.168.1.11', 'Online', 'May 20'],
  ['DEV-003', 'Production Door', 'RFID Reader', 'Production', '192.168.1.12', 'Offline', 'May 20'],
  ['DEV-004', 'Finance Bio', 'Biometric', 'Finance', '192.168.1.13', 'Online', 'May 20'],
  [
    'DEV-005',
    'Warehouse Reader',
    'RFID Reader',
    'Warehouse',
    '192.168.1.14',
    'Maintenance',
    'May 20',
  ],
  ['DEV-006', 'IT Room Bio', 'Biometric', 'IT Room', '192.168.1.15', 'Online', 'May 20'],
];

const reportRows = [
  ['Attendance Summary', 'Attendance Summary', 'Admin', 'May 20', 'Download'],
  ['Late Arrival Report', 'Late Arrival', 'Admin', 'May 20', 'Download'],
  ['Absenteeism Report', 'Absenteeism', 'Admin', 'May 20', 'Download'],
];

const auditRows = [
  ['May 20 11:45 AM', 'Admin', 'Login', 'Authentication', 'Admin logged in', '192.168.1.100'],
  [
    'May 20 11:30 AM',
    'Admin',
    'Approved Enrollment',
    'Enrollment',
    'Approved REQ-0107',
    '192.168.1.100',
  ],
  ['May 20 11:25 AM', 'Admin', 'Added Device', 'Device Mgmt', 'Added DEV-006', '192.168.1.100'],
  [
    'May 20 11:15 AM',
    'Admin',
    'Generated Report',
    'Reports',
    'Attendance Summary',
    '192.168.1.100',
  ],
  ['May 20 11:05 AM', 'Admin', 'Updated User', 'User Mgmt', 'Updated EMP003', '192.168.1.100'],
  [
    'May 20 10:50 AM',
    'Admin',
    'Rejected Enrollment',
    'Enrollment',
    'Rejected REQ-0108',
    '192.168.1.100',
  ],
  ['May 20 10:35 AM', 'Admin', 'Login', 'Authentication', 'Admin logged in', '192.168.1.100'],
];

function PageHeader({ description, title }: { description: string; title: string }) {
  return (
    <header className="module-header">
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function FilterRow({ showGenerate = false }: { showGenerate?: boolean }) {
  return (
    <div className="module-filter-row">
      <input defaultValue="May 20, 2025" aria-label="Date" />
      <input defaultValue="All Departments" aria-label="Department" />
      <input defaultValue="All Status" aria-label="Status" />
      <input placeholder="Search by name or ID..." aria-label="Search" />
      {showGenerate ? <button className="dark-action-button">Generate Report</button> : null}
      <button className="filter-button" type="button">
        Filter
        <Filter size={16} />
      </button>
    </div>
  );
}

function ModuleTable({
  columns,
  rows,
  title,
  withActions = false,
}: {
  columns: string[];
  rows: string[][];
  title: string;
  withActions?: boolean;
}) {
  return (
    <section className="module-panel" aria-labelledby={`${title.replaceAll(' ', '-')}-title`}>
      <h2 id={`${title.replaceAll(' ', '-')}-title`}>{title}</h2>
      <div className="module-table-wrap">
        <table className="module-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
              {withActions ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join('-')}>
                {row.map((cell, index) => (
                  <td key={`${cell}-${index}`}>
                    {isStatusColumn(columns[index]) ? (
                      <span className={`module-status ${statusTone(cell)}`}>{cell}</span>
                    ) : index === 1 ? (
                      <strong>{cell}</strong>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
                {withActions ? (
                  <td>
                    <span className="table-actions">
                      <button className="tiny-action approve" type="button" aria-label="Approve">
                        <Check size={14} />
                      </button>
                      <button className="tiny-action reject" type="button" aria-label="Reject">
                        <X size={14} />
                      </button>
                      <button className="tiny-view" type="button">
                        View
                      </button>
                    </span>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="module-pagination">
        <span>Showing 1 to {rows.length} entries</span>
        <span>
          <button className="active">1</button>
          <button>2</button>
          <button>3</button>
          <button>&gt;</button>
        </span>
      </div>
    </section>
  );
}

function isStatusColumn(column: string) {
  return column === 'Status';
}

function statusTone(status: string) {
  if (status === 'Present' || status === 'Online' || status === 'Approved') {
    return 'success';
  }

  if (status === 'Late' || status === 'Pending' || status === 'Maintenance') {
    return 'warning';
  }

  return 'danger';
}

function MetricCards({
  cards,
}: {
  cards: Array<{ Icon: typeof UsersRound; label: string; tone: string; value: string }>;
}) {
  return (
    <div className="module-stats-grid">
      {cards.map(({ Icon, label, tone, value }) => (
        <article className="module-stat-card" key={label}>
          <span className={`stat-icon ${tone}`}>
            <Icon size={30} />
          </span>
          <div>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>vs yesterday</small>
          </div>
          <em>+ 12.5%</em>
        </article>
      ))}
    </div>
  );
}

export function AttendanceManagementPage() {
  return (
    <section className="module-page">
      <PageHeader
        title="Attendance Management"
        description="Monitor and manage attendance records in real-time."
      />
      <MetricCards
        cards={[
          { label: 'Total Users', value: '1,248', tone: 'green', Icon: UsersRound },
          { label: "Today's Attendance", value: '856', tone: 'blue', Icon: Fingerprint },
          { label: 'Late', value: '23', tone: 'amber', Icon: AlertTriangle },
          { label: 'Absent', value: '12', tone: 'red', Icon: Archive },
        ]}
      />
      <ModuleTable
        title="Today's Attendance"
        columns={[
          'Employee ID',
          'Name',
          'Department',
          'Check In',
          'Check Out',
          'Status',
          'Location',
        ]}
        rows={attendanceRows}
      />
    </section>
  );
}

export function EnrollmentRequestsPage() {
  return (
    <section className="module-page">
      <PageHeader
        title="Enrollment Requests"
        description="Review and manage biometric and RFID enrollment requests."
      />
      <FilterRow />
      <ModuleTable
        title="Enrollment Requests"
        columns={[
          'Request ID',
          'Name',
          'Employee ID',
          'Department',
          'Request Type',
          'Submitted',
          'Status',
        ]}
        rows={enrollmentRows}
        withActions
      />
    </section>
  );
}

export function DeviceManagementPage() {
  return (
    <section className="module-page">
      <div className="module-header-row">
        <PageHeader
          title="Device Management"
          description="Monitor and manage all RFID and biometric devices."
        />
        <button className="dark-action-button">+ Add New User</button>
      </div>
      <MetricCards
        cards={[
          { label: 'Total Devices', value: '24', tone: 'purple', Icon: Monitor },
          { label: 'Online', value: '18', tone: 'green', Icon: UsersRound },
          { label: 'Offline', value: '4', tone: 'red', Icon: Archive },
          { label: 'Maintenance', value: '2', tone: 'amber', Icon: AlertTriangle },
        ]}
      />
      <ModuleTable
        title="Device List"
        columns={[
          'Device ID',
          'Device Name',
          'Type',
          'Location',
          'IP Address',
          'Status',
          'Last Sync',
        ]}
        rows={deviceRows}
        withActions
      />
    </section>
  );
}

export function ReportsPage() {
  return (
    <section className="module-page">
      <PageHeader title="Reports" description="Generate and download system reports." />
      <FilterRow showGenerate />
      <div className="report-summary-grid">
        <section className="module-panel">
          <h2>Attendance Summary</h2>
          <div className="report-bars">
            <span style={{ width: '74%' }} />
            <span style={{ width: '82%' }} />
            <span className="green" style={{ width: '68%' }} />
            <span className="red" style={{ width: '55%' }} />
            <span className="yellow" style={{ width: '63%' }} />
          </div>
        </section>
        <section className="module-panel department-summary">
          <h2>Department Summary</h2>
          <div className="donut-summary">Total 528</div>
          <ul>
            <li>
              IT Department <strong>42%</strong>
            </li>
            <li>
              HR Department <strong>25%</strong>
            </li>
            <li>
              Operations <strong>20%</strong>
            </li>
            <li>
              Finance <strong>13%</strong>
            </li>
          </ul>
        </section>
      </div>
      <ModuleTable
        title="Recent Reports"
        columns={['Report Name', 'Report Type', 'Generated By', 'Generated On', 'Actions']}
        rows={reportRows}
        withActions
      />
    </section>
  );
}

export function AuditLogsPage() {
  return (
    <section className="module-page">
      <PageHeader title="Audit Logs" description="Track all system activities and changes." />
      <FilterRow />
      <ModuleTable
        title="Audit Logs"
        columns={['Date & Time', 'User', 'Action', 'Module', 'Details', 'IP Address']}
        rows={auditRows}
      />
    </section>
  );
}

export function SettingsPage() {
  return (
    <section className="module-page">
      <PageHeader title="Settings" description="Configure system preferences and parameters." />
      <div className="settings-layout">
        <nav className="settings-menu" aria-label="Settings sections">
          {[
            'General Settings',
            'System Preferences',
            'Security Settings',
            'Backup & Restore',
            'System Information',
          ].map((item, index) => (
            <button className={index === 0 ? 'active' : ''} key={item} type="button">
              {item}
            </button>
          ))}
        </nav>

        <section className="module-panel settings-form-panel">
          <h2>General Settings</h2>
          <div className="settings-form-grid">
            <label>
              Company Name
              <input defaultValue="EINGRESS Corporation" />
            </label>
            <label>
              Time Zone
              <input defaultValue="(UTC+08:00) Asia/Manila" />
            </label>
            <label>
              Date Format
              <input defaultValue="MM/DD/YYYY" />
            </label>
            <label>
              Time Format
              <input defaultValue="12-Hour (hh:mm AM/PM)" />
            </label>
            <label>
              System Language
              <input defaultValue="English" />
            </label>
            <label>
              Session Timeout
              <input defaultValue="30 minutes" />
            </label>
          </div>
          <button className="save-settings-button" type="button">
            Save Changes
          </button>
        </section>

        <section className="module-panel system-info-panel">
          <h2>System Information</h2>
          {[
            ['System Version', 'v2.1.0'],
            ['Database Status', 'Healthy'],
            ['Last Backup', 'May 20, 2025 02:00 AM'],
            ['Total Users', '528'],
            ['Total Devices', '24'],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong className={value === 'Healthy' ? 'healthy' : ''}>{value}</strong>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}
