import { ReactNode, useEffect } from 'react';

import { useAuth } from '../auth/useAuth';
import { API_BASE_URL } from '../lib/api';
import { SecuritySettings, setSecuritySettings } from '../lib/securitySettingsStore';
import { DateTimeSettings, setDateTimeSettings } from '../lib/systemSettingsStore';

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.accessToken) return;

    const controller = new AbortController();

    fetch(`${API_BASE_URL}/settings`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      signal: controller.signal,
    })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<Partial<DateTimeSettings & SecuritySettings>>)
          : null,
      )
      .then((data) => {
        if (data) {
          setDateTimeSettings(data);
          setSecuritySettings(data);
        }
      })
      .catch(() => {
        // The rest of the app keeps using the last-known/default formatting.
      });

    return () => controller.abort();
  }, [session?.accessToken]);

  return <>{children}</>;
}
