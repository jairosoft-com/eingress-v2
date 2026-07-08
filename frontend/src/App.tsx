import {
  Bell,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  FileText,
  Fingerprint,
  Home,
  LogOut,
  Monitor,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from './auth/useAuth';
import { API_BASE_URL } from './lib/api';

const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/ws');

const navItems = [
  { label: 'Dashboard', path: '/dashboard', Icon: Home },
  { label: 'User Management', path: '/attendance-management', Icon: UsersRound },
  { label: 'Attendance Management', path: '/attendance', Icon: CalendarCheck },
  { label: 'Enrollment Requests', path: '/enrollment-requests', Icon: ClipboardList },
  { label: 'Device Management', path: '/device-management', Icon: Monitor },
  { label: 'Reports', path: '/reports', Icon: FileText },
  { label: 'Audit Logs', path: '/audit-logs', Icon: ClipboardList },
  { label: 'Settings', path: '/settings', Icon: Settings },
];

type EnrollmentRequest = {
  status: 'Pending' | 'Approved' | 'Rejected';
};

type RealtimeMessage = {
  type?: string;
  payload?: { adminId?: string | number };
};

function decodeAccessTokenAdminId(accessToken: string): string | null {
  try {
    const payloadSegment = accessToken.split('.')[1];

    if (!payloadSegment) {
      return null;
    }

    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as { adminId?: string | number };

    return payload.adminId != null ? String(payload.adminId) : null;
  } catch {
    return null;
  }
}

async function fetchPendingEnrollmentCount(accessToken: string, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}/enrollment-requests`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal,
  });

  const data = (await response.json().catch(() => null)) as EnrollmentRequest[] | null;

  if (!response.ok || !Array.isArray(data)) {
    return null;
  }

  return data.filter((request) => request.status === 'Pending').length;
}

export function App() {
  const { session, signOut } = useAuth();
  const [pendingEnrollmentCount, setPendingEnrollmentCount] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    const controller = new AbortController();

    void fetchPendingEnrollmentCount(session.accessToken, controller.signal).then((count) => {
      if (!controller.signal.aborted && count !== null) {
        setPendingEnrollmentCount(count);
      }
    });

    return () => {
      controller.abort();
    };
  }, [session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimeoutId: number | null = null;
    let shouldReconnect = true;
    const accessToken = session.accessToken;
    const currentAdminId = decodeAccessTokenAdminId(accessToken);

    function refreshPendingEnrollmentCount() {
      void fetchPendingEnrollmentCount(accessToken).then((count) => {
        if (count !== null) {
          setPendingEnrollmentCount(count);
        }
      });
    }

    function connectRealtimeSocket() {
      socket = new WebSocket(WS_BASE_URL);

      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(event.data as string) as RealtimeMessage;

          if (message.type === 'enrollment:submitted') {
            refreshPendingEnrollmentCount();
          }

          if (
            message.type === 'auth:password-changed' &&
            currentAdminId != null &&
            message.payload?.adminId != null &&
            String(message.payload.adminId) === currentAdminId
          ) {
            shouldReconnect = false;
            socket?.close();
            signOut();
          }
        } catch {
          // Ignore realtime messages that are not JSON.
        }
      });

      socket.addEventListener('close', () => {
        if (!shouldReconnect) {
          return;
        }

        reconnectTimeoutId = window.setTimeout(connectRealtimeSocket, 2000);
      });
    }

    window.addEventListener('enrollment-requests:changed', refreshPendingEnrollmentCount);
    connectRealtimeSocket();

    return () => {
      shouldReconnect = false;
      window.removeEventListener('enrollment-requests:changed', refreshPendingEnrollmentCount);

      if (reconnectTimeoutId) {
        window.clearTimeout(reconnectTimeoutId);
      }

      socket?.close();
    };
  }, [session?.accessToken]);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <span className="logo-mark" aria-hidden="true">
            <Fingerprint size={25} strokeWidth={2.4} />
          </span>
          <span>
            <strong>EINGRESS</strong>
            <small>RFID & Biometric System</small>
          </span>
        </div>

        <nav className="admin-nav">
          {navItems.map(({ Icon, label, path }) => (
            <NavLink
              className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
              end={path === '/dashboard'}
              key={path}
              to={path}
            >
              <Icon size={20} strokeWidth={2.25} />
              <span>{label}</span>
              {path === '/enrollment-requests' && pendingEnrollmentCount !== null ? (
                <strong className="admin-nav-badge">{pendingEnrollmentCount}</strong>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-promo">
          <div className="shield-visual compact">
            <ShieldCheck size={70} strokeWidth={1.8} />
            <Fingerprint size={38} strokeWidth={2.2} />
          </div>
          <strong>
            Secure. Smart. <span>Seamless.</span>
          </strong>
          <p>Advanced biometric and RFID solutions for a smarter tomorrow.</p>
        </div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <button className="icon-button" type="button" aria-label="Open navigation">
            <Menu size={24} />
          </button>

          <label className="search-field">
            <Search size={20} aria-hidden="true" />
            <input type="search" placeholder="Search users, devices, logs..." />
          </label>

          <button className="notification-button" type="button" aria-label="Notifications">
            <Bell size={22} />
            <span>5</span>
          </button>

          <button className="profile-button" type="button">
            <span className="avatar" aria-hidden="true">
              JD
            </span>
            <span>
              <strong>{session?.adminName ?? 'Juan Dela Cruz'}</strong>
              <small>Administrator</small>
            </span>
            <ChevronDown size={18} />
          </button>

          <button className="logout-button" onClick={signOut} type="button">
            <LogOut size={18} />
            Sign out
          </button>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
