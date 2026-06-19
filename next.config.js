/** @type {import('next').NextConfig} */
// Backend URL. Defaults to the public prod backend (api.dcp.sa) so Vercel
// preview/prod rewrites resolve a PUBLIC host — an unset BACKEND_URL used to fall
// back to localhost, which Vercel rejects as DNS_HOSTNAME_RESOLVED_PRIVATE (this
// broke /api/renters/* on previews). Matches the hardcoded api.dcp.sa in
// app/api/[...path]/route.ts. For local dev against a local backend, set
// BACKEND_URL=http://localhost:8083 explicitly.
const backendUrl = process.env.BACKEND_URL || 'https://api.dcp.sa';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const proxyRewrites = [
      // Provider auto-installer: curl dcp.sa/install | bash
      // Rewrites /install and /install.sh to backend /install endpoint
      {
        source: '/install',
        destination: `${backendUrl}/install`,
      },
      {
        source: '/install.sh',
        destination: `${backendUrl}/install`,
      },
      // Windows provider auto-installer: the wizard emits
      //   Invoke-WebRequest -Uri 'https://dcp.sa/install.ps1' -OutFile dcp_setup.ps1
      // so this must resolve to the backend PowerShell installer (not a 404).
      {
        source: '/install.ps1',
        destination: `${backendUrl}/install.ps1`,
      },
      // Desktop app binaries: the download page + wizard link to
      //   https://dcp.sa/download/windows (served by the backend; the .dmg for
      //   /download/mac doesn't exist yet, so macOS falls back to install.sh).
      // Without this rewrite /download/* has no frontend page and 404s.
      {
        source: '/download/:path*',
        destination: `${backendUrl}/download/:path*`,
      },
      // Model catalog API — used by ModelBrowsing and marketplace components
      {
        source: '/api/models',
        destination: `${backendUrl}/api/models`,
      },
      {
        source: '/api/models/:path*',
        destination: `${backendUrl}/api/models/:path*`,
      },
      // OpenAI-compatible earned-online catalog — used by the landing §01 live marketplace
      {
        source: '/v1/models',
        destination: `${backendUrl}/v1/models`,
      },
      // Docker template catalog — used by TemplateCatalog component
      {
        source: '/api/templates/:path*',
        destination: `${backendUrl}/api/templates/:path*`,
      },
      {
        source: '/api/templates',
        destination: `${backendUrl}/api/templates`,
      },
      // vLLM OpenAI-compatible API — mounted at /v1/ in Express (DCP-982)
      // Proxies /v1/* → backend /v1/* so external callers can reach the vLLM router
      {
        source: '/v1/:path*',
        destination: `${backendUrl}/v1/:path*`,
      },
      // Payments API — Moyasar integration (DCP-31)
      {
        source: '/api/payments/:path*',
        destination: `${backendUrl}/api/payments/:path*`,
      },
      // Renters API — profile, settings, balance
      {
        source: '/api/renters/:path*',
        destination: `${backendUrl}/api/renters/:path*`,
      },
      // Admin API — dashboard, payments, providers management
      {
        source: '/api/admin/:path*',
        destination: `${backendUrl}/api/admin/:path*`,
      },
      // Marketplace deploy modal: POST /api/jobs/from-template lives on Express.
      // Rewrite this one path only — /api/jobs/[id] and /api/jobs/submit are
      // handled by Next.js route handlers and must NOT be shadowed.
      {
        source: '/api/jobs/from-template',
        destination: `${backendUrl}/api/jobs/from-template`,
      },
    ];
    return {
      afterFiles: proxyRewrites,
    };
  },
  // Redirect table. Two jobs:
  //   1. /v2/* → clean ROOT (permanent 308) — the redesign is now CANONICAL at
  //      root (app/(site) route group). Google, AI answer engines, bookmarks and
  //      transactional-email links were pointed at /v2/home, /v2/docs, /v2/agents
  //      etc.; these 308s transfer that equity to the root URLs instead of
  //      breaking. This is the exact INVERSE of the old root→/v2 cutover.
  //   2. Retired v1 surfaces → their canonical ROOT twin (permanent 308).
  // NOTE on `permanent`: Next.js emits permanent:true as 308. Next matches
  // redirects in array order; the specific /v2/* entries precede the catch-all.
  // There is NO root→/v2 rule anywhere — that would form an infinite loop with
  // the /v2→root rules below.
  async redirects() {
    return [
      // ── /v2/* → canonical ROOT (equity transfer, permanent 308) ─────────
      // Home: the bare /v2 and /v2/home both collapse to "/".
      { source: '/v2', destination: '/', permanent: true },
      { source: '/v2/home', destination: '/', permanent: true },
      { source: '/v2/docs', destination: '/docs', permanent: true },
      { source: '/v2/agents', destination: '/agents', permanent: true },
      { source: '/v2/containers', destination: '/containers', permanent: true },
      { source: '/v2/architecture', destination: '/architecture', permanent: true },
      { source: '/v2/setup', destination: '/setup', permanent: true },
      { source: '/v2/provider-setup', destination: '/provider-setup', permanent: true },
      { source: '/v2/auth', destination: '/auth', permanent: true },
      // The single-page v2 admin was retired; the deep v1 admin console at /admin
      // stays canonical, so /v2/admin lands there.
      { source: '/v2/admin', destination: '/admin', permanent: true },
      { source: '/v2/renter/:path*', destination: '/renter/:path*', permanent: true },
      { source: '/v2/provider/:path*', destination: '/provider/:path*', permanent: true },
      // Catch-all LAST: sweep any stray /v2/* not matched above to its root twin.
      // The negative lookahead EXCLUDES /v2/home: Vercel's edge router evaluates
      // a param catch-all with higher precedence than a static source, so without
      // this guard /v2/home would be swept to the non-existent /home (404) instead
      // of honouring the specific /v2/home -> / rule above. Every other stray
      // /v2/<x> maps cleanly to /<x>.
      { source: '/v2/:path((?!home$).*)', destination: '/:path', permanent: true },

      // ── Retired v1 surfaces → canonical ROOT (permanent 308) ────────────
      // GPU Pods product page lives in the app now; the static one-pager is retired.
      { source: '/gpu-containers', destination: '/containers', permanent: true },
      { source: '/gpu-containers.html', destination: '/containers', permanent: true },
      // Retired public brand-guideline artifact. Keep old links landing on
      // current docs without continuing to publish stale internal design HTML.
      { source: '/docs/DCP-BRAND-GUIDELINES-v3.html', destination: '/docs', permanent: true },
      { source: '/docs/brand', destination: '/docs', permanent: true },
      // Retired v2 design-handoff URLs previously lived under public/dcp-v2.
      { source: '/dcp-v2/:path*', destination: '/', permanent: true },
      // Retired model-browser URLs → the playground/catalog source of truth.
      { source: '/models', destination: '/renter/playground', permanent: true },
      { source: '/marketplace/models', destination: '/renter/playground', permanent: true },
      { source: '/marketplace/templates', destination: '/renter/pods', permanent: true },
      // Retired v1 docs sub-pages → the consolidated single-page docs. (Bare
      // /quickstart, /pricing and /status keep their own self-canonicals.)
      { source: '/docs/api', destination: '/docs', permanent: true },
      { source: '/docs/api/:path*', destination: '/docs', permanent: true },
      { source: '/docs/quickstart', destination: '/docs', permanent: true },
      { source: '/docs/models', destination: '/docs', permanent: true },
      { source: '/docs/renter-guide', destination: '/docs', permanent: true },
      { source: '/docs/provider-guide', destination: '/docs', permanent: true },
      // Retired renter console deep-links + legacy signup → canonical root console.
      { source: '/api-keys', destination: '/renter/keys', permanent: true },
      { source: '/connections', destination: '/renter/keys', permanent: true },
      { source: '/budget', destination: '/renter/usage', permanent: true },
      { source: '/dashboard', destination: '/renter/dashboard', permanent: true },
      { source: '/dashboard/notifications', destination: '/renter/dashboard', permanent: true },
      { source: '/dashboard/jobs', destination: '/renter/jobs', permanent: true },
      { source: '/jobs', destination: '/renter/jobs', permanent: true },
      { source: '/jobs/submit', destination: '/renter/playground', permanent: true },
      // Retired v1 renter sub-pages that the redesigned console does not mirror.
      { source: '/renter/register', destination: '/setup', permanent: true },
      { source: '/renter/analytics', destination: '/renter/usage', permanent: true },
      { source: '/renter/cost-dashboard', destination: '/renter/usage', permanent: true },
      { source: '/renter/billing', destination: '/renter/wallet', permanent: true },
      { source: '/renter/billing/:path*', destination: '/renter/wallet', permanent: true },
      { source: '/renter/models', destination: '/renter/playground', permanent: true },
      { source: '/renter/templates', destination: '/renter/pods', permanent: true },
      { source: '/renter/marketplace', destination: '/renter/pods', permanent: true },
      { source: '/renter/marketplace/:path*', destination: '/renter/pods', permanent: true },
      { source: '/renter/gpu-comparison', destination: '/renter/pods', permanent: true },
      { source: '/renter/live', destination: '/renter/dashboard', permanent: true },
      { source: '/renter/pricing', destination: '/pricing', permanent: true },
      { source: '/renter/waitlist', destination: '/setup', permanent: true },
      // ── Bare console-root SAFETY NET (permanent 308) ────────────────────
      // The console route groups only ship subpages (/provider/dashboard,
      // /renter/dashboard, …); neither bare /provider nor bare /renter has a
      // page.tsx, so they hard-404. These EXACT-path sources (no `:path*`) send
      // the bare path to the console landing. A static source with no param
      // segment matches ONLY that exact path, so it CANNOT shadow the deeper
      // /provider/:path* and /renter/:path* console routes (or the subpath
      // redirects below). This also fixes broken provider-email links that
      // point at the bare /provider root.
      { source: '/provider', destination: '/provider/dashboard', permanent: true },
      { source: '/renter', destination: '/renter/dashboard', permanent: true },
      // Retired v1 provider sub-pages that the redesigned console does not mirror.
      { source: '/provider/withdraw', destination: '/provider/payouts', permanent: true },
      { source: '/provider/fleet', destination: '/provider/rigs', permanent: true },
      { source: '/provider/gpu', destination: '/provider/rigs', permanent: true },
      { source: '/provider/activate', destination: '/provider/profile', permanent: true },
      { source: '/provider/download', destination: '/earn', permanent: true },
      { source: '/provider/jobs', destination: '/provider/dashboard', permanent: true },
      { source: '/provider/jobs/:path*', destination: '/provider/dashboard', permanent: true },
      // Retired marketing pages superseded by the redesigned home.
      { source: '/intelligence', destination: '/', permanent: true },
      { source: '/arabic-rag', destination: '/', permanent: true },
      { source: '/onboarding', destination: '/setup', permanent: true },
      // Provider activation funnel (4 call sites link here) → the real onboarding entry.
      { source: '/provider-onboarding', destination: '/earn', permanent: true },
      // Draft/legal docs sometimes cross-link /legal/terms; canonical effective terms live at /terms
      { source: '/legal/terms', destination: '/terms', permanent: true },

      // ── Unify-shell cutover (permanent 308) ─────────────────────────────
      // These legacy v1 pages rendered the OLD public Header/Footer/LegalPage/
      // DashboardLayout chrome. The ones with real content (pricing, support,
      // trust-center, earn, terms, privacy, acceptable-use, payment/*) were
      // MIGRATED into the app/(site) route group and now render the NEW shell
      // at the SAME URL. The rest are retired here, folded into their nearest
      // redesigned twin so no old-chrome page is ever reachable again.
      //
      // /tokens previously did a JS bounce to /budget → /renter/usage; collapse
      // the double hop to a single 308.
      { source: '/tokens', destination: '/renter/usage', permanent: true },
      // Quickstart folds into the single-page docs.
      { source: '/quickstart', destination: '/docs', permanent: true },
      // Marketplace (bare + sub-pages) → the renter pods/catalog source of truth.
      { source: '/marketplace', destination: '/renter/pods', permanent: true },
      // Arabic-RAG solution pages → home (the redesign tells this story inline).
      { source: '/solutions/arabic-rag', destination: '/', permanent: true },
      { source: '/ar/solutions/arabic-rag', destination: '/', permanent: true },
      // Standalone old-era internal pages → their nearest public twin.
      { source: '/mission', destination: '/trust-center', permanent: true },
      { source: '/security', destination: '/trust-center', permanent: true },
      // Old draft/duplicate legal docs → the canonical effective documents.
      { source: '/legal/pdpl', destination: '/privacy', permanent: true },
      { source: '/legal/privacy', destination: '/privacy', permanent: true },
      { source: '/legal/privacy-v2', destination: '/privacy', permanent: true },
      { source: '/legal/terms-v2', destination: '/terms', permanent: true },
      // Old DashboardLayout job/monitor remnants → the redesigned renter console.
      // NOTE: the existing /dashboard/jobs EXACT redirect does not catch the
      // [jobId] child, and /jobs/:id/monitor had no rule — both are added here.
      { source: '/monitor', destination: '/renter/dashboard', permanent: true },
      { source: '/dashboard/jobs/:jobId', destination: '/renter/jobs', permanent: true },
      { source: '/jobs/:id/monitor', destination: '/renter/dashboard', permanent: true },
    ];
  },
}

module.exports = nextConfig
