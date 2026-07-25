export const API_URL = import.meta.env.SSR
  ? (import.meta.env.API_INTERNAL_URL || import.meta.env.PUBLIC_API_URL || 'http://localhost:8080')
  : (import.meta.env.PUBLIC_API_URL || 'http://localhost:8080');

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

export function authHeaders(): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('admin_token') : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
