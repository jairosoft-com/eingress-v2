import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { router } from './routes/router';
import { SystemSettingsProvider } from './settings/SystemSettingsProvider';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <SystemSettingsProvider>
        <RouterProvider router={router} />
      </SystemSettingsProvider>
    </AuthProvider>
  </React.StrictMode>,
);
