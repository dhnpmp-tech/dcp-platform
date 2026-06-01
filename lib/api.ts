/**
 * DCP Platform API utilities
 *
 * Centralizes API base URL logic and auth helpers.
 * On production (https), uses the Vercel proxy at /api.
 * On local dev (http), hits the VPS directly.
 */

const PROXY_PATH = '/api';

/**
 * Returns the correct API base URL for the current environment.
 * Always uses the Next.js proxy — never exposes VPS IP to the client.
 */
export function getApiBase(): string {
  return PROXY_PATH;
}

/**
 * Returns the Mission Control API base URL.
 */
export function getMcBase(): string {
  return '/api/mc';
}

/**
 * Returns the Mission Control auth token.
 */
export function getMcToken(): string {
  return process.env.NEXT_PUBLIC_MC_TOKEN || 'YOUR_MC_API_TOKEN';
}

/**
 * Returns the admin token from localStorage, or null if not logged in.
 */
export function getAdminToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('dc1_admin_token') : null;
}

/**
 * Returns the provider API key from localStorage, or null.
 */
export function getProviderKey(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('dc1_provider_key') : null;
}

/**
 * Returns the renter API key from localStorage, or null.
 */
export function getRenterKey(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('dc1_renter_key') : null;
}
