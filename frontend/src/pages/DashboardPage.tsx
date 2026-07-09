import {
  CalendarDays,
  Fingerprint,
  MonitorSmartphone,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  TrendingDown,
  TrendingUp,
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

type DashboardAttendanceTrendPoint = {
  attendance_date?: string | null;
  check_ins?: number | null;
  check_outs?: number | null;
  total?: number | null;
};

type DashboardData = {
  metrics?: DashboardMetrics;
  recentEvents?: RecentActivityEvent[];
  attendanceRecords?: DashboardAttendanceRecord[];
  attendanceTrend?: DashboardAttendanceTrendPoint[];
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

function formatTrendLabel(value?: string | null) {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value)
      .toLocaleDateString([], {
        weekday: 'short',
      })
      .toUpperCase();
  } catch {
    return '—';
  }
}

function hasCheckedOut(checkInAt?: string | null, checkOutAt?: string | null) {
  if (!checkInAt || !checkOutAt) {
    return false;
  }

  const checkInTime = new Date(checkInAt).getTime();
  const checkOutTime = new Date(checkOutAt).getTime();

  return !Number.isNaN(checkInTime) && !Number.isNaN(checkOutTime) && checkOutTime !== checkInTime;
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

export function DashboardPage() {
  const { session } = useAuth();
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [accessEvents, setAccessEvents] = useState(initialAccessEvents);
  const [attendanceRecords, setAttendanceRecords] = useState<DashboardAttendanceRecord[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<DashboardAttendanceTrendPoint[]>([]);

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
          setAttendanceTrend(data.attendanceTrend ?? []);
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
                setAttendanceTrend(data.attendanceTrend ?? []);
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
  const trendValues = attendanceTrend.map((point) =>
    Math.max(Number(point.total ?? 0), Number(point.check_ins ?? 0), Number(point.check_outs ?? 0)),
  );
  const maxTrendValue = trendValues.length > 0 ? Math.max(...trendValues, 1) : 1;
  const trendBars = attendanceTrend.map((point) => {
    const total = Number(point.total ?? 0);
    const barHeight = Math.max(16, Math.round((total / maxTrendValue) * 130));

    return {
      label: formatTrendLabel(point.attendance_date),
      value: total,
      barHeight,
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

      <div className="dashboard-grid">
        <section className="panel trend-panel" aria-labelledby="attendance-trend-title">
          <div className="panel-heading">
            <h2 id="attendance-trend-title">
              Attendance Trend <span>(Last 7 Days)</span>
            </h2>
            <button className="ghost-select" type="button">
              Last 7 Days
            </button>
          </div>

          <div className="bar-chart" aria-label="Attendance trend bar chart">
            {trendBars.length > 0 ? (
              trendBars.map((bar) => (
                <div className="bar-item" key={bar.label}>
                  <strong>{bar.value}</strong>
                  <span style={{ height: `${bar.barHeight}px` }} />
                  <small>{bar.label}</small>
                </div>
              ))
            ) : (
              <div className="bar-empty-state">No attendance trend data available yet.</div>
            )}
          </div>
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
                <th>Time In</th>
                <th>Time Out</th>
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
                    <td>
                      {hasCheckedOut(record.check_in_at, record.check_out_at)
                        ? formatAttendanceTime(record.check_out_at)
                        : '—'}
                    </td>
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
    </section>
  );
}
