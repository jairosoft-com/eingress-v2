const API_BASE = '/api';

type ApiFetchOptions = {
  headers?: Record<string, string>;
  body?: unknown;
  method?: string;
};

export async function apiFetch(endpoint: string, options: ApiFetchOptions = {}) {
  const { headers = {}, body, ...rest } = options;
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...rest,
    headers: requestHeaders,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error || response.statusText || 'Request failed';
    throw new Error(message);
  }

  return response;
}

export function authHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
