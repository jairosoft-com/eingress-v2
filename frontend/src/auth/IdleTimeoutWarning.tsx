import { useEffect, useState } from 'react';

import { useSecuritySettings } from '../lib/securitySettingsStore';
import { useAuth } from './useAuth';

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function IdleTimeoutWarning() {
  const { session, signOut, extendSession } = useAuth();
  const { auto_logout_enabled, idle_timeout_warning_minutes, keep_me_logged_in } =
    useSecuritySettings();
  const isIdleTimeoutActive = auto_logout_enabled && !keep_me_logged_in;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session || !isIdleTimeoutActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (session.expiresAt - Date.now() <= 0) {
        signOut();
        return;
      }

      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isIdleTimeoutActive, session, signOut]);

  if (!session || !isIdleTimeoutActive) {
    return null;
  }

  const remainingMs = session.expiresAt - now;
  const warningWindowMs = idle_timeout_warning_minutes * 60_000;

  if (remainingMs <= 0 || remainingMs > warningWindowMs) {
    return null;
  }

  return (
    <div className="idle-warning-backdrop" role="presentation">
      <section
        aria-describedby="idle-warning-description"
        aria-labelledby="idle-warning-title"
        aria-modal="true"
        className="idle-warning-dialog"
        role="alertdialog"
      >
        <h2 id="idle-warning-title">You&apos;re about to be signed out</h2>
        <p id="idle-warning-description">
          You&apos;ve been inactive for a while. For your security, you&apos;ll be logged out in{' '}
          <strong>{formatCountdown(remainingMs)}</strong> unless you choose to stay signed in.
        </p>
        <div className="idle-warning-actions">
          <button className="idle-warning-stay" onClick={extendSession} type="button">
            Stay Signed In
          </button>
          <button className="idle-warning-logout" onClick={signOut} type="button">
            Log Out Now
          </button>
        </div>
      </section>
    </div>
  );
}
