// ─────────────────────────────────────────────────────────────────────────
// routes.ts — single source of truth for canonical internal paths.
//
// WHY THIS EXISTS: the site carries a legacy v1 page tree (app/*) alongside the
// redesigned v2 tree (app/v2/*). Hardcoded path string literals scattered across
// components, the home NAV/footer, middleware, and next.config drifted — the GPU
// "Rent →" CTA correctly pointed at /v2/renter/pods but the auth gate bounced
// unauthenticated visitors to the OLD v1 /login. Centralizing the canonical paths
// here keeps every internal link, redirect target, and the auth gate in lockstep
// so nothing lands on a stale v1 surface.
//
// SCOPE: app code (components) + middleware import this. next.config.js is
// CommonJS loaded before the TS toolchain, so its legacy→canonical redirect
// SOURCES stay literal there; the DESTINATIONS mirror these constants.
// ─────────────────────────────────────────────────────────────────────────

export const ROUTES = {
  // ── Public / marketing ──────────────────────────────────────────────
  home: '/v2/home',
  pricing: '/pricing',
  docs: '/v2/docs',
  // Agent-first product/explainer surface (zero-human onboarding, MCP, the
  // machine-readable money signals). Clean v2 route — the OLD v1 /agents page
  // is permanently redirected here in next.config; never reuse /agents.
  agents: '/v2/agents',
  containers: '/v2/containers',
  architecture: '/v2/architecture',
  status: '/status',
  support: '/support',
  trustCenter: '/trust-center',
  terms: '/terms',
  privacy: '/privacy',

  // ── Auth ────────────────────────────────────────────────────────────
  // The redesigned auth surface. Supports ?role=renter|provider|admin,
  // ?method=apikey, ?new=1 (signup tab) and ?redirect= (post-auth return).
  auth: '/v2/auth',

  // ── Renter onboarding / signup ──────────────────────────────────────
  // Renter "create account" / get-an-API-key funnel.
  renterSignup: '/v2/setup',

  // ── Renter console ──────────────────────────────────────────────────
  renterDashboard: '/v2/renter/dashboard',
  // Where every "Rent" / "launch a pod" action lands.
  renterPods: '/v2/renter/pods',
  renterPlayground: '/v2/renter/playground',
  renterWallet: '/v2/renter/wallet',
  renterUsage: '/v2/renter/usage',
  renterInvoices: '/v2/renter/invoices',
  renterKeys: '/v2/renter/keys',
  renterSettings: '/v2/renter/settings',

  // ── Provider onboarding / signup ────────────────────────────────────
  providerSetup: '/v2/provider-setup',

  // ── Provider console ────────────────────────────────────────────────
  providerDashboard: '/v2/provider/dashboard',
  providerEarnings: '/v2/provider/earnings',
  providerPayouts: '/v2/provider/payouts',
  providerProfile: '/v2/provider/profile',
  providerRigs: '/v2/provider/rigs',
  providerSettings: '/v2/provider/settings',

  // ── Admin ───────────────────────────────────────────────────────────
  admin: '/v2/admin',
} as const

export type RouteKey = keyof typeof ROUTES

/**
 * Builds an auth URL for the redesigned /v2/auth page, preserving the
 * post-auth redirect and the role/signup intent.
 *
 * Used by the middleware auth gate (replacing the old /login bounce) and by
 * public CTAs that need a sign-in/sign-up entry that returns the visitor to a
 * specific destination after authenticating.
 */
export function buildAuthHref(options: {
  role?: 'renter' | 'provider' | 'admin'
  redirect?: string
  signup?: boolean
  method?: 'apikey' | 'email'
  reason?: string
} = {}): string {
  const params = new URLSearchParams()
  if (options.role) params.set('role', options.role)
  if (options.method) params.set('method', options.method)
  if (options.signup) params.set('new', '1')
  if (options.reason) params.set('reason', options.reason)
  if (options.redirect) params.set('redirect', options.redirect)
  const query = params.toString()
  return query ? `${ROUTES.auth}?${query}` : ROUTES.auth
}
