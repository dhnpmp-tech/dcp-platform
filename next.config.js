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
  // Internal link fixes — these source paths have no page and previously 404'd.
  async redirects() {
    // Flip switch: set DCP_V2_LIVE=1 in the Vercel env to serve the v2 redesign
    // from the public entry routes. Use redirects instead of internal rewrites:
    // the v2 shell is intentionally mounted under /v2, and rendering it through
    // a different browser pathname causes hydration mismatches in production.
    // NOTE on `permanent`: Next.js emits permanent:true as 308 and false as 307.
    // The DCP_V2_LIVE-gated entries stay temporary (the team may still toggle the
    // flag), but the genuinely-retired v1 surfaces below are permanent (308) so
    // search engines, bookmarks, and transactional-email links treat the new v2
    // URLs as canonical and never re-resolve to a stale v1 page.
    const v2Live = process.env.DCP_V2_LIVE === '1';
    const v2CutoverRedirects = v2Live
      ? [
          // Public entry-route cutover. Temporary while DCP_V2_LIVE is a flip switch.
          // /login is handled in middleware.ts (permanent 308 → /v2/auth), NOT here:
          // tests/v2-cutover-rewrites.test.js asserts /login is absent from this table.
          { source: '/', destination: '/v2/home', permanent: false },
          { source: '/setup', destination: '/v2/provider-setup', permanent: false },
          { source: '/earn', destination: '/v2/provider-setup', permanent: false },
          // Legacy renter registration → the renter signup funnel (/v2/setup).
          // Previously pointed at /setup, which chains to the PROVIDER setup —
          // a wrong-funnel bug. Renters now land on the renter onboarding flow.
          { source: '/renter/register', destination: '/v2/setup', permanent: false },
          { source: '/docs', destination: '/v2/docs', permanent: false },
        ]
      : [];

    return [
      ...v2CutoverRedirects,
      // ── Retired v1 surfaces → canonical v2 (permanent 308) ──────────────
      // GPU Pods page is canonical in the v2 console design.
      { source: '/renter/pods', destination: '/v2/renter/pods', permanent: true },
      // GPU Pods product page lives in the app now; the static one-pager is retired.
      { source: '/containers', destination: '/v2/containers', permanent: true },
      { source: '/gpu-containers', destination: '/v2/containers', permanent: true },
      { source: '/gpu-containers.html', destination: '/v2/containers', permanent: true },
      // Retired public brand-guideline artifact. Keep old links landing on
      // current docs without continuing to publish stale internal design HTML.
      { source: '/docs/DCP-BRAND-GUIDELINES-v3.html', destination: '/v2/docs', permanent: true },
      { source: '/docs/brand', destination: '/v2/docs', permanent: true },
      // Retired v2 design-handoff URLs previously lived under public/dcp-v2.
      { source: '/dcp-v2/:path*', destination: '/v2/home', permanent: true },
      // Retired model-browser URLs → the v2 playground/catalog source of truth.
      { source: '/models', destination: '/v2/renter/playground', permanent: true },
      { source: '/marketplace/models', destination: '/v2/renter/playground', permanent: true },
      { source: '/marketplace/templates', destination: '/v2/renter/pods', permanent: true },
      // Retired docs sub-pages → the consolidated v2 docs. (Bare /quickstart,
      // /pricing and /status keep their own self-canonicals and are NOT redirected.)
      { source: '/docs/api', destination: '/v2/docs', permanent: true },
      { source: '/docs/api/:path*', destination: '/v2/docs', permanent: true },
      { source: '/docs/quickstart', destination: '/v2/docs', permanent: true },
      { source: '/docs/models', destination: '/v2/docs', permanent: true },
      { source: '/docs/renter-guide', destination: '/v2/docs', permanent: true },
      { source: '/docs/provider-guide', destination: '/v2/docs', permanent: true },
      // Retired renter console deep-links not covered by the middleware /renter/* rule.
      { source: '/api-keys', destination: '/v2/renter/keys', permanent: true },
      { source: '/connections', destination: '/v2/renter/keys', permanent: true },
      { source: '/budget', destination: '/v2/renter/usage', permanent: true },
      { source: '/dashboard', destination: '/v2/renter/dashboard', permanent: true },
      { source: '/dashboard/notifications', destination: '/v2/renter/dashboard', permanent: true },
      { source: '/dashboard/jobs', destination: '/v2/renter/jobs', permanent: true },
      { source: '/jobs', destination: '/v2/renter/jobs', permanent: true },
      { source: '/jobs/submit', destination: '/v2/renter/playground', permanent: true },
      // Retired v1 /agents surface → the canonical v2 agent-first product page.
      // The new page lives at /v2/agents (ROUTES.agents); this 308 keeps old
      // links, bookmarks, and crawlers pointed at the current surface.
      { source: '/agents', destination: '/v2/agents', permanent: true },
      // Retired marketing pages superseded by the v2 home.
      { source: '/intelligence', destination: '/v2/home', permanent: true },
      { source: '/arabic-rag', destination: '/v2/home', permanent: true },
      { source: '/onboarding', destination: '/v2/setup', permanent: true },
      // Provider activation funnel (4 call sites link here) → the real onboarding entry.
      { source: '/provider-onboarding', destination: '/earn', permanent: true },
      // Draft/legal docs sometimes cross-link /legal/terms; canonical effective terms live at /terms
      { source: '/legal/terms', destination: '/terms', permanent: true },
    ];
  },
}

module.exports = nextConfig
