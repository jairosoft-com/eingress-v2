import { Navigate, createBrowserRouter } from 'react-router-dom';

import { App } from '../App';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AccessLogsPage } from '../pages/AccessLogsPage';
import {
  AttendanceManagementPage,
  AuditLogsPage,
  DeviceManagementPage,
  EnrollmentRequestsPage,
  ReportsPage,
  SettingsPage,
  UserManagementPage,
} from '../pages/AdminModulePages';
import { DashboardPage } from '../pages/DashboardPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { KioskBioPage } from '../pages/KioskBioPage';
import { KioskPage } from '../pages/KioskPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RegistrationPage } from '../pages/RegistrationPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/register',
    element: <RegistrationPage />,
  },
  {
    path: '/kiosk',
    element: <KioskPage />,
  },
  {
    path: '/kioskbio',
    element: <KioskBioPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <App />,
        children: [
          {
            index: true,
            element: <Navigate replace to="/dashboard" />,
          },
          {
            path: 'dashboard',
            element: <DashboardPage />,
          },
          {
            path: 'access-logs',
            element: <AccessLogsPage />,
          },
          {
            path: 'attendance-management',
            element: <UserManagementPage />,
          },
          {
            path: 'attendance',
            element: <AttendanceManagementPage />,
          },
          {
            path: 'enrollment-requests',
            element: <EnrollmentRequestsPage />,
          },
          {
            path: 'device-management',
            element: <DeviceManagementPage />,
          },
          {
            path: 'reports',
            element: <ReportsPage />,
          },
          {
            path: 'audit-logs',
            element: <AuditLogsPage />,
          },
          {
            path: 'settings',
            element: <SettingsPage />,
          },
          {
            path: '*',
            element: <NotFoundPage />,
          },
        ],
      },
    ],
  },
]);
