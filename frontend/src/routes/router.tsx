import { Navigate, createBrowserRouter } from 'react-router-dom';

import { App } from '../App';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AccessLogsPage } from '../pages/AccessLogsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { KioskPage } from '../pages/KioskPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';

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
    path: '/kiosk',
    element: <KioskPage />,
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
            path: '*',
            element: <NotFoundPage />,
          },
        ],
      },
    ],
  },
]);
