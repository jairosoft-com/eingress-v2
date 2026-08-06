const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL =
  configuredApiBaseUrl &&
  !configuredApiBaseUrl.includes('localhost') &&
  !configuredApiBaseUrl.includes('127.0.0.1')
    ? configuredApiBaseUrl
    : '/api';
