import {
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Fingerprint,
  Home,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', path: '/', Icon: Home },
  { label: 'Users', path: '/users', Icon: UsersRound },
  { label: 'Attendance', path: '/access-logs', Icon: CalendarDays },
  { label: 'Devices', path: '/devices', Icon: Smartphone },
  { label: 'Reports', path: '/reports', Icon: ClipboardList },
  { label: 'Access Control', path: '/access-control', Icon: ShieldCheck },
  { label: 'Alerts', path: '/alerts', Icon: Bell },
  { label: 'System Logs', path: '/system-logs', Icon: ClipboardList },
  { label: 'Settings', path: '/settings', Icon: Settings },
];

export function App() {
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
              end={path === '/'}
              key={path}
              to={path}
            >
              <Icon size={20} strokeWidth={2.25} />
              <span>{label}</span>
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
              <strong>Juan Dela Cruz</strong>
              <small>Administrator</small>
            </span>
            <ChevronDown size={18} />
          </button>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
