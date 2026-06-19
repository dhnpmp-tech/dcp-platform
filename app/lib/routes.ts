// ─────────────────────────────────────────────────────────────────────────
// routes.ts — single source of truth for canonical internal paths.
//
// WHY THIS EXISTS: the redesigned surface now lives in the app/(site) route
// group and is CANONICAL at clean ROOT URLs (/, /docs, /agents, /renter/*,
// /provider/*, …). A handful of legacy v1 pages still live at app/* (pricing,
// status, terms, /earn, /admin, …). Hardcoded path string literals scattered
// across components, the home NAV/footer, middleware, and next.config drifted —
// centralizing the canonical paths here keeps every internal link, redirect
// target, and the auth gate in lockstep so nothing emits a stale /v2 URL that
// would only 308 back to root (a wasted redirect hop).
//
// SCOPE: app code (components) + middleware import this. next.config.js is
// CommonJS loaded before the TS toolchain, so its /v2→root and legacy→canonical
// redirect SOURCES stay literal there; the DESTINATIONS mirror these constants.
// ─────────────────────────────────────────────────────────────────────────

export const ROUTES = {
  // ── Public / marketing ──────────────────────────────────────────────
  home: '/',
  // The dedicated /pricing page was retired and FOLDED into the home #pricing
  // section (GPU rental grid + per-token inference rate card + PAYG/subscription
  // billing story). This anchor points consumers straight at that section so no
  // link 308-chains through the now-removed /pricing page. The bare /pricing URL
  // still 308s to "/" in next.config for old bookmarks/AEO equity.
  pricing: '/#pricing',
  docs: '/docs',
  // Agent-first product/explainer surface (zero-human onboarding, MCP, the
  // machine-readable money signals). Canonical root route — the OLD v1 /agents
  // page has been retired and this surface now lives at /agents; the legacy
  // /v2/agents URL 308s here in next.config to transfer AEO equity.
  agents: '/agents',
  containers: '/containers',
  architecture: '/architecture',
  status: '/status',
  support: '/support',
  trustCenter: '/trust-center',
  terms: '/terms',
  privacy: '/privacy',

  // ── Auth ────────────────────────────────────────────────────────────
  // The redesigned auth surface. Supports ?role=renter|provider|admin,
  // ?method=apikey, ?new=1 (signup tab) and ?redirect= (post-auth return).
  auth: '/auth',

  // ── Renter onboarding / signup ──────────────────────────────────────
  // Renter "create account" / get-an-API-key funnel. (The legacy /setup
  // PROVIDER wizard is retired; /setup is now the renter signup funnel.)
  renterSignup: '/setup',

  // ── Renter console ──────────────────────────────────────────────────
  renterDashboard: '/renter/dashboard',
  // Where every "Rent" / "launch a pod" action lands.
  renterPods: '/renter/pods',
  renterPlayground: '/renter/playground',
  renterWallet: '/renter/wallet',
  renterUsage: '/renter/usage',
  renterInvoices: '/renter/invoices',
  renterKeys: '/renter/keys',
  renterSettings: '/renter/settings',

  // ── Provider onboarding / signup ────────────────────────────────────
  providerSetup: '/provider-setup',

  // ── Provider console ────────────────────────────────────────────────
  providerDashboard: '/provider/dashboard',
  providerEarnings: '/provider/earnings',
  providerPayouts: '/provider/payouts',
  providerProfile: '/provider/profile',
  providerRigs: '/provider/rigs',
  providerSettings: '/provider/settings',

  // ── Admin ───────────────────────────────────────────────────────────
  // The deep v1 admin console remains canonical at /admin (the redesigned
  // single-page admin surface was retired pending parity); /v2/admin 308s here.
  admin: '/admin',
} as const

export type RouteKey = keyof typeof ROUTES

/**
 * Builds an auth URL for the redesigned /auth page, preserving the
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
