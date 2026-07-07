import {
  CalendarDays,
  ClipboardList,
  FileText,
  Fingerprint,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../auth/useAuth';
import { API_BASE_URL } from '../lib/api';

const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/ws');

type DashboardMetrics = {
  active_devices?: number;
  failed_attempts?: number;
  successful_attempts?: number;
  todays_attendance?: number;
  total_access?: number;
  total_users?: number;
};

type RecentActivityEvent = {
  area?: string | null;
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

type DashboardAttendanceRecord = {
  employee_id?: string | null;
  name?: string | null;
  department?: string | null;
  role?: string | null;
  attendance_date?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  status?: string | null;
  location?: string | null;
};

type DashboardData = {
  metrics?: DashboardMetrics;
  recentEvents?: RecentActivityEvent[];
  attendanceRecords?: DashboardAttendanceRecord[];
};

async function fetchDashboardData(accessToken: string, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const data = (await response.json().catch(() => null)) as DashboardData | null;

  return response.ok && data ? data : null;
}

function toAccessEvent(event: RecentActivityEvent) {
  const status = event.status ?? event.result ?? 'Info';
  const eventTimestamp = event.time ?? event.event_time ?? new Date().toISOString();

  return {
    user: event.user ?? event.user_name ?? 'Unknown',
    id: event.employeeId ?? event.employee_id ?? String(event.id),
    event: event.event ?? (status === 'Granted' ? 'Access Granted' : 'Access Denied'),
    area: event.area ?? 'System',
    device: event.device ?? event.device_name ?? 'EIngress',
    sortTime: eventTimestamp,
    time: new Date(eventTimestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    status:
      status === 'Granted' || status === 'Success'
        ? 'Success'
        : status === 'Denied' || status === 'Failed'
          ? 'Failed'
          : 'Info',
  };
}

function sortAccessEventsByTime(events: ReturnType<typeof toAccessEvent>[]) {
  return [...events].sort(
    (eventA, eventB) => new Date(eventB.sortTime).getTime() - new Date(eventA.sortTime).getTime(),
  );
}

function formatAttendanceTime(value?: string | null) {
  if (!value) {
    return '';
  }

  try {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const metricDefinitions = [
  {
    label: 'Total Users',
    value: '1,248',
    delta: '12.5%',
    trend: 'up',
    Icon: UsersRound,
    tone: 'red',
  },
  {
    label: "Today's Attendance",
    value: '—',
    description: 'Unique users scanned today',
    Icon: Fingerprint,
    tone: 'blue',
  },
  {
    label: 'Total Access',
    value: '1,102',
    delta: '10.2%',
    trend: 'up',
    Icon: MonitorSmartphone,
    tone: 'purple',
  },
  {
    label: 'Successful Attempts',
    value: '0',
    description: 'Granted scans today',
    Icon: ShieldCheck,
    tone: 'green',
  },
  {
    label: 'Failed Attempts',
    value: '23',
    delta: '15.4%',
    trend: 'down',
    Icon: ShieldAlert,
    tone: 'amber',
  },
  {
    label: 'Active Devices',
    value: '12',
    delta: '9.1%',
    trend: 'up',
    Icon: Smartphone,
    tone: 'blue',
  },
];

const initialAccessEvents: ReturnType<typeof toAccessEvent>[] = [];

const devices = [
  ['Door Controller 01', 'Main Entrance', 'Online'],
  ['Door Controller 02', 'Side Entrance', 'Online'],
  ['Door Controller 03', 'Back Entrance', 'Online'],
  ['RFID Reader 01', 'Lobby', 'Maintenance'],
  ['Fingerprint Scanner 01', 'Server Room', 'Online'],
];

const bars = [
  ['May 11', '620'],
  ['May 12', '780'],
  ['May 13', '845'],
  ['May 14', '890'],
  ['May 15', '912'],
  ['May 16', '870'],
  ['May 17', '856'],
];

const quickActions = [
  { label: 'Add New User', hint: 'Enroll a new user', Icon: UserPlus },
  { label: 'View Attendance', hint: 'Check attendance logs', Icon: CalendarDays },
  { label: 'Access Reports', hint: 'Generate reports', Icon: FileText },
  { label: 'Manage Devices', hint: 'View and manage devices', Icon: Smartphone },
  { label: 'System Settings', hint: 'Configure system', Icon: Settings },
  { label: 'Export Attendance', hint: 'Export attendance data', Icon: ClipboardList },
];

export function DashboardPage() {
  const { session } = useAuth();
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [accessEvents, setAccessEvents] = useState(initialAccessEvents);
  const [attendanceRecords, setAttendanceRecords] = useState<DashboardAttendanceRecord[]>([]);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const controller = new AbortController();

    void fetchDashboardData(session.accessToken, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && data) {
          setDashboardMetrics(data.metrics ?? null);
          setAccessEvents(sortAccessEventsByTime((data.recentEvents ?? []).map(toAccessEvent)));
          setAttendanceRecords(data.attendanceRecords ?? []);
        }
      })
      .catch(() => {
        // Keep placeholders when the dashboard cannot be reached.
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
          payload?: DashboardMetrics | RecentActivityEvent;
          type?: string;
        };

        if (message.type === 'dashboard:metrics-changed' && message.payload) {
          const metricsPayload = message.payload as DashboardMetrics;

          setDashboardMetrics((currentMetrics) => ({
            ...(currentMetrics ?? {}),
            active_devices: metricsPayload.active_devices ?? currentMetrics?.active_devices,
            failed_attempts: metricsPayload.failed_attempts ?? currentMetrics?.failed_attempts,
            successful_attempts:
              metricsPayload.successful_attempts ?? currentMetrics?.successful_attempts,
            todays_attendance:
              metricsPayload.todays_attendance ?? currentMetrics?.todays_attendance,
            total_access: metricsPayload.total_access ?? currentMetrics?.total_access,
            total_users: metricsPayload.total_users ?? currentMetrics?.total_users,
          }));
        }

        if (message.type === 'attendance:changed') {
          void fetchDashboardData(session.accessToken)
            .then((data) => {
              if (data) {
                setDashboardMetrics(data.metrics ?? null);
                setAttendanceRecords(data.attendanceRecords ?? []);
              }
            })
            .catch(() => {
              // Keep the last known metrics if a realtime refresh fails.
            });
        }

        const activityEvent = message.payload as RecentActivityEvent | undefined;

        if (message.type === 'activity:event' && activityEvent) {
          setAccessEvents((currentEvents) =>
            sortAccessEventsByTime([toAccessEvent(activityEvent), ...currentEvents]).slice(0, 8),
          );
        }
      } catch {
        // Ignore realtime messages that are not JSON.
      }
    });

    return () => socket.close();
  }, [session?.accessToken]);

  const metricValues: Record<string, number | null> = {
    'Active Devices': dashboardMetrics?.active_devices ?? null,
    'Successful Attempts': dashboardMetrics?.successful_attempts ?? null,
    'Failed Attempts': dashboardMetrics?.failed_attempts ?? null,
    "Today's Attendance": dashboardMetrics?.todays_attendance ?? null,
    'Total Access': dashboardMetrics?.total_access ?? null,
    'Total Users': dashboardMetrics?.total_users ?? null,
  };
  const metrics = metricDefinitions.map((metric) => {
    const liveValue = metricValues[metric.label];

    return {
      ...metric,
      value: liveValue === null ? '-' : liveValue.toLocaleString(),
    };
  });
  const todayLabel = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <section className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-header">
        <div>
          <h1 id="dashboard-title">Admin Dashboard</h1>
          <p>Welcome back, Juan! Here's what's happening with your system today.</p>
        </div>

        <button className="date-button" type="button">
          <CalendarDays size={20} />
          <span>{todayLabel} (Today)</span>
        </button>
      </header>

      <div className="stats-grid">
        {metrics.map(({ Icon, delta, description, label, tone, trend, value }) => {
          const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown;

          return (
            <article className="stat-card" key={label}>
              <span className={`stat-icon ${tone}`}>
                <Icon size={30} />
              </span>
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{description ?? 'vs yesterday'}</small>
              </div>
              {delta && trend ? (
                <span className={`stat-delta ${trend}`}>
                  <TrendIcon size={16} />
                  {delta}
                </span>
              ) : null}
            </article>
          );
        })}
      </div>

      <section
        className="panel attendance-table-panel"
        aria-labelledby="dashboard-attendance-title"
      >
        <div className="panel-heading">
          <h2 id="dashboard-attendance-title">Today's Attendance</h2>
          <button className="text-button" type="button">
            View all
          </button>
        </div>

        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Department</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Status</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRecords.length > 0 ? (
                attendanceRecords.map((record, index) => (
                  <tr key={`${record.employee_id ?? 'record'}-${index}`}>
                    <td>{record.employee_id ?? '—'}</td>
                    <td>{record.name ?? 'Unknown user'}</td>
                    <td>{record.department ?? '—'}</td>
                    <td>{formatAttendanceTime(record.check_in_at) || '—'}</td>
                    <td>{formatAttendanceTime(record.check_out_at) || '—'}</td>
                    <td>
                      <span
                        className={`attendance-status ${record.status?.toLowerCase() ?? 'present'}`}
                      >
                        {record.status ?? 'Present'}
                      </span>
                    </td>
                    <td>{record.location ?? 'Office'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty-state-row">
                    No attendance records are available for today yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="panel chart-panel" aria-labelledby="attendance-overview-title">
          <div className="panel-heading">
            <h2 id="attendance-overview-title">Attendance Overview</h2>
            <button className="ghost-select" type="button">
              Today
            </button>
          </div>

          <div className="line-legend" aria-hidden="true">
            <span className="checkins">Check-ins</span>
            <span className="checkouts">Check-outs</span>
            <span className="total">Total</span>
          </div>

          <svg
            className="line-chart"
            viewBox="0 0 640 250"
            role="img"
            aria-label="Attendance chart"
          >
            <g className="chart-grid">
              <line x1="40" y1="35" x2="610" y2="35" />
              <line x1="40" y1="90" x2="610" y2="90" />
              <line x1="40" y1="145" x2="610" y2="145" />
              <line x1="40" y1="200" x2="610" y2="200" />
            </g>
            <polyline
              className="line total-line"
              points="40,210 92,160 144,105 196,70 248,52 300,50 352,52 404,54 456,48 508,36 560,25 610,18"
            />
            <polyline
              className="line checkin-line"
              points="40,212 92,182 144,150 196,120 248,96 300,80 352,78 404,82 456,79 508,62 560,50 610,40"
            />
            <polyline
              className="line checkout-line"
              points="40,216 92,204 144,190 196,172 248,154 300,142 352,140 404,140 456,125 508,105 560,90 610,78"
            />
          </svg>
        </section>

        <section className="panel events-panel" aria-labelledby="recent-events-title">
          <div className="panel-heading">
            <h2 id="recent-events-title">Recent Access Events</h2>
            <button className="text-button" type="button">
              View all
            </button>
          </div>

          <div className="events-table">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Event</th>
                  <th>Device</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {accessEvents.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <span className="user-cell">
                        <span className="mini-avatar">{event.user.charAt(0)}</span>
                        <span>
                          <strong>{event.user}</strong>
                          <small>{event.id}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <strong className={event.status === 'Failed' ? 'event-failed' : 'event-ok'}>
                        {event.event}
                      </strong>
                      <small>{event.area}</small>
                    </td>
                    <td>{event.device}</td>
                    <td>{event.time}</td>
                    <td>
                      <span className={event.status === 'Failed' ? 'status failed' : 'status'}>
                        {event.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel device-panel" aria-labelledby="device-status-title">
          <div className="panel-heading">
            <h2 id="device-status-title">Device Status</h2>
            <button className="text-button" type="button">
              View all
            </button>
          </div>

          <div className="device-list">
            {devices.map(([name, location, status]) => (
              <div className="device-row" key={name}>
                <Smartphone size={20} />
                <span>
                  <strong>{name}</strong>
                  <small>{location}</small>
                </span>
                <em className={status === 'Maintenance' ? 'maintenance' : ''}>{status}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel trend-panel" aria-labelledby="attendance-trend-title">
          <div className="panel-heading">
            <h2 id="attendance-trend-title">
              Attendance Trend <span>(This Week)</span>
            </h2>
            <button className="ghost-select" type="button">
              This Week
            </button>
          </div>

          <div className="bar-chart" aria-label="Weekly attendance bar chart">
            {bars.map(([day, value]) => (
              <div className="bar-item" key={day}>
                <strong>{value}</strong>
                <span style={{ height: `${Number(value) / 10}px` }} />
                <small>{day}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel actions-panel" aria-labelledby="quick-actions-title">
          <h2 id="quick-actions-title">Quick Actions</h2>
          <div className="quick-actions">
            {quickActions.map(({ Icon, hint, label }) => (
              <button className="quick-action" key={label} type="button">
                <Icon size={28} />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
