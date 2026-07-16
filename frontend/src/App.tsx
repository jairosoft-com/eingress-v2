import {
  Bell,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  ContactRound,
  FileText,
  Fingerprint,
  Home,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  X,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import eingressIcon from './assets/icons/eingress-icon.png';
import sidebarShieldIcon from './assets/icons/sidebar-shield.png';
import { IdleTimeoutWarning } from './auth/IdleTimeoutWarning';
import { useAuth } from './auth/useAuth';
import { API_BASE_URL } from './lib/api';

const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api$/, '/ws');

const navItems = [
  { label: 'Dashboard', path: '/dashboard', Icon: Home },
  { label: 'User Management', path: '/attendance-management', Icon: UsersRound },
  { label: 'Attendance Management', path: '/attendance', Icon: CalendarCheck },
  { label: 'Enrollment Requests', path: '/enrollment-requests', Icon: ClipboardList },
  { label: 'Reports & Audit Logs', path: '/reports', Icon: FileText },
  { label: 'Settings', path: '/settings', Icon: Settings },
];

type EnrollmentRequest = {
  status: 'Pending' | 'Approved' | 'Rejected';
};

type RealtimeMessage = {
  type?: string;
  payload?: { adminId?: string | number };
};

type AdminProfile = {
  email: string;
  name: string;
  rfidUid: string;
  role: string;
};

type Notification = {
  created_at: string;
  id: number;
  is_read: boolean;
  message: string;
  severity: string;
  title: string;
};

function formatNotificationTime(value: string) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));

  if (elapsedSeconds < 60) return 'Just now';
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h ago`;
  return `${Math.floor(elapsedSeconds / 86400)}d ago`;
}

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
  const accessToken = session?.accessToken;
  const [pendingEnrollmentCount, setPendingEnrollmentCount] = useState<number | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/notifications`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = (await response.json().catch(() => null)) as Notification[] | null;

      if (response.ok && Array.isArray(data)) {
        setNotifications(data);
      }
    } catch {
      // Notification availability should not interrupt the dashboard.
    }
  }, [accessToken]);

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

          if (message.type === 'notification:created') {
            void loadNotifications();
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
  }, [loadNotifications, session?.accessToken, signOut]);

  useEffect(() => {
    if (!isProfileOpen || !session?.accessToken) {
      return;
    }

    const controller = new AbortController();

    void fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as AdminProfile | null;

        if (response.ok && data) {
          setProfile(data);
        }
      })
      .catch(() => {
        // Retain the session details when the profile request is unavailable.
      });

    return () => controller.abort();
  }, [isProfileOpen, session?.accessToken]);

  const profileName = profile?.name ?? session?.adminName ?? 'Administrator';
  const profileEmail = profile?.email ?? session?.email ?? '—';
  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name.charAt(0))
    .join('')
    .toUpperCase();
  const unreadNotifications = notifications.filter((notification) => !notification.is_read);
  const visibleNotifications =
    notificationFilter === 'unread' ? unreadNotifications : notifications;

  async function markNotificationAsRead(id: number) {
    const notification = notifications.find((item) => item.id === id);

    if (!notification || notification.is_read || !session?.accessToken) {
      return;
    }

    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
    );
    await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }).catch(() => void loadNotifications());
  }

  async function markAllNotificationsAsRead() {
    if (unreadNotifications.length === 0 || !session?.accessToken) {
      return;
    }

    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    await fetch(`${API_BASE_URL}/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }).catch(() => void loadNotifications());
  }

  return (
    <div className="admin-shell">
      <IdleTimeoutWarning />
      <aside className="admin-sidebar" aria-label="Primary navigation">
        <div className="sidebar-brand">
          <span className="logo-mark logo-mark-image" aria-hidden="true">
            <img src={eingressIcon} alt="" />
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
          <div className="shield-visual shield-visual-image compact">
            <img src={sidebarShieldIcon} alt="" />
          </div>
          <strong>
            Secure. Smart. <span>Seamless.</span>
          </strong>
          <p>Advanced biometric and RFID solutions for a smarter tomorrow.</p>
        </div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <button
            aria-expanded={isNotificationsOpen}
            aria-haspopup="dialog"
            className="notification-button"
            onClick={() => {
              setIsNotificationsOpen(true);
              void loadNotifications();
            }}
            type="button"
          >
            <Bell size={22} />
            {unreadNotifications.length > 0 ? <span>{unreadNotifications.length}</span> : null}
          </button>

          <button
            aria-expanded={isProfileOpen}
            aria-haspopup="dialog"
            className="profile-button"
            onClick={() => setIsProfileOpen(true)}
            type="button"
          >
            <span className="avatar" aria-hidden="true">
              {profileInitials}
            </span>
            <span>
              <strong>{profileName}</strong>
              <small>Administrator</small>
            </span>
            <ChevronDown size={18} />
          </button>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      {isProfileOpen ? (
        <div className="profile-dialog-backdrop" onMouseDown={() => setIsProfileOpen(false)}>
          <section
            aria-labelledby="profile-dialog-title"
            aria-modal="true"
            className="profile-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label="Close profile"
              className="profile-dialog-close"
              onClick={() => setIsProfileOpen(false)}
              type="button"
            >
              <X size={26} />
            </button>
            <div className="profile-dialog-avatar" aria-hidden="true">
              {profileInitials}
            </div>
            <h2 id="profile-dialog-title">Account Details</h2>
            <dl className="profile-details">
              <div>
                <dt>
                  <ContactRound size={21} /> Name
                </dt>
                <dd>{profileName}</dd>
              </div>
              <div>
                <dt>
                  <Mail size={21} /> Email
                </dt>
                <dd>{profileEmail}</dd>
              </div>
              <div>
                <dt>
                  <ShieldCheck size={21} /> Role
                </dt>
                <dd>{profile?.role ?? 'Administrator'}</dd>
              </div>
              <div>
                <dt>
                  <Fingerprint size={21} /> RFID Number
                </dt>
                <dd>{profile?.rfidUid ?? '—'}</dd>
              </div>
            </dl>
            <button className="profile-dialog-logout" onClick={signOut} type="button">
              <LogOut size={19} />
              Log Out
            </button>
          </section>
        </div>
      ) : null}

      {isNotificationsOpen ? (
        <div className="notifications-backdrop" onMouseDown={() => setIsNotificationsOpen(false)}>
          <section
            aria-labelledby="notifications-title"
            aria-modal="true"
            className="notifications-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <h2 id="notifications-title">Notifications</h2>
              <button
                className="mark-all-read"
                disabled={unreadNotifications.length === 0}
                onClick={() => void markAllNotificationsAsRead()}
                type="button"
              >
                Mark all as read
              </button>
              <button
                aria-label="Close notifications"
                className="notifications-close"
                onClick={() => setIsNotificationsOpen(false)}
                type="button"
              >
                <X size={24} />
              </button>
            </header>
            <div className="notification-tabs" role="tablist" aria-label="Notification filter">
              <button
                aria-selected={notificationFilter === 'all'}
                className={notificationFilter === 'all' ? 'active' : ''}
                onClick={() => setNotificationFilter('all')}
                role="tab"
                type="button"
              >
                All
              </button>
              <button
                aria-selected={notificationFilter === 'unread'}
                className={notificationFilter === 'unread' ? 'active' : ''}
                onClick={() => setNotificationFilter('unread')}
                role="tab"
                type="button"
              >
                Unread{' '}
                {unreadNotifications.length > 0 ? <span>{unreadNotifications.length}</span> : null}
              </button>
            </div>
            <div className="notification-list">
              {visibleNotifications.length > 0 ? (
                visibleNotifications.map((notification) => (
                  <button
                    className={`notification-item ${notification.is_read ? '' : 'unread'} ${notification.severity}`}
                    key={notification.id}
                    onClick={() => void markNotificationAsRead(notification.id)}
                    type="button"
                  >
                    <span>
                      <strong>{notification.title}</strong>
                      <small>{notification.message}</small>
                    </span>
                    <time dateTime={notification.created_at}>
                      {formatNotificationTime(notification.created_at)}
                    </time>
                    {!notification.is_read ? <i aria-label="Unread notification" /> : null}
                  </button>
                ))
              ) : (
                <p className="notifications-empty">No {notificationFilter} notifications.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
