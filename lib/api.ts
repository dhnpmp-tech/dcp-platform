/**
 * DCP Platform API utilities — POST-SEAL (H3 sealed-cookie migration).
 *
 * Auth no longer rides localStorage for dashboard API calls. getApiBase() points
 * at the authenticated server proxy /api/secure, which reads the httpOnly role
 * cookie (__dc1_session) + the sealed-key cookie (__Host-dc1_kc) and injects the
 * REAL backend key upstream (header, ?key= query, Bearer, and body.key). The
 * getters return a non-secret SENTINEL so existing call sites that build
 * x-*-key headers, ?key=… params, or Authorization: Bearer keep compiling and
 * running — the proxy overwrites whatever they send. The raw key is never read
 * back into JS for an API call again.
 *
 * NOTE: The sentinel literal is intentionally inlined (not imported from
 * app/lib/keySeal.ts) because that module imports node:crypto and this file is
 * imported by client components — pulling node:crypto into the client bundle
 * would break the build.
 */

const SECURE_PROXY_PATH = '/api/secure';

// Must match KEY_SENTINEL in app/lib/keySeal.ts. NOT a credential — the
// /api/secure proxy ignores it and injects the sealed key server-side.
const KEY_SENTINEL = '__dc1_cookie_session__';

/**
 * Authenticated, cookie-backed proxy base. Was '/api'.
 * All dashboard data calls route through here so the raw key stays server-side.
 */
export function getApiBase(): string {
  return SECURE_PROXY_PATH;
}

/**
 * Returns the Mission Control API base URL. (Out of scope for H3 — unchanged.)
 */
export function getMcBase(): string {
  return '/api/mc';
}

/**
 * Returns the Mission Control auth token. (Out of scope for H3 — unchanged.)
 */
export function getMcToken(): string {
  return process.env.NEXT_PUBLIC_MC_TOKEN || 'YOUR_MC_API_TOKEN';
}

/**
 * Returns the admin token sentinel. The real token lives in the sealed cookie;
 * the /api/secure proxy injects it. Returned (instead of null) so call sites
 * that guard on "no key" still proceed — if the cookie is gone the proxy 401s
 * and the page's existing 401 handler bounces to /auth.
 */
export function getAdminToken(): string {
  return KEY_SENTINEL;
}

/** Returns the provider key sentinel (real key injected by /api/secure). */
export function getProviderKey(): string {
  return KEY_SENTINEL;
}

/** Returns the renter key sentinel (real key injected by /api/secure). */
export function getRenterKey(): string {
  return KEY_SENTINEL;
}
