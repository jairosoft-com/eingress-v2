import {
  CalendarDays,
  ClipboardList,
  FileText,
  Fingerprint,
  MonitorSmartphone,
  Settings,
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

async function fetchTodaysAttendance(accessToken: string, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  const data = (await response.json().catch(() => null)) as {
    metrics?: { todays_attendance?: number };
  } | null;

  return response.ok && typeof data?.metrics?.todays_attendance === 'number'
    ? data.metrics.todays_attendance
    : null;
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

const accessEvents = [
  {
    user: 'Juan Dela Cruz',
    id: 'EMP-000123',
    event: 'Access Granted',
    area: 'Main Entrance',
    device: 'Door Controller 01',
    time: '08:21 AM',
    status: 'Success',
  },
  {
    user: 'Maria Santos',
    id: 'EMP-000124',
    event: 'Access Granted',
    area: 'Side Entrance',
    device: 'Door Controller 02',
    time: '08:18 AM',
    status: 'Success',
  },
  {
    user: 'Peter Reyes',
    id: 'EMP-000125',
    event: 'Access Denied',
    area: 'Main Entrance',
    device: 'Door Controller 01',
    time: '08:15 AM',
    status: 'Failed',
  },
  {
    user: 'Anna Garcia',
    id: 'EMP-000126',
    event: 'Access Granted',
    area: 'Back Entrance',
    device: 'Door Controller 03',
    time: '08:12 AM',
    status: 'Success',
  },
  {
    user: 'John Mercado',
    id: 'EMP-000127',
    event: 'Access Granted',
    area: 'Main Entrance',
    device: 'Door Controller 01',
    time: '08:09 AM',
    status: 'Success',
  },
];

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
  const [todaysAttendance, setTodaysAttendance] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const controller = new AbortController();

    void fetchTodaysAttendance(session.accessToken, controller.signal)
      .then((count) => {
        if (!controller.signal.aborted && count !== null) {
          setTodaysAttendance(count);
        }
      })
      .catch(() => {
        // Keep the loading placeholder when the dashboard cannot be reached.
      });

    return () => controller.abort();
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const accessToken = session.accessToken;
    const socket = new WebSocket(WS_BASE_URL);
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as { type?: string };

        if (message.type === 'attendance:changed') {
          void fetchTodaysAttendance(accessToken)
            .then((count) => {
              if (count !== null) {
                setTodaysAttendance(count);
              }
            })
            .catch(() => {
              // Keep the last known count if a realtime refresh fails.
            });
        }
      } catch {
        // Ignore realtime messages that are not JSON.
      }
    });

    return () => socket.close();
  }, [session?.accessToken]);

  const metrics = metricDefinitions.map((metric) =>
    metric.label === "Today's Attendance"
      ? { ...metric, value: todaysAttendance === null ? '—' : todaysAttendance.toLocaleString() }
      : metric,
  );
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
