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
    const v2Live = process.env.DCP_V2_LIVE === '1';
    const v2CutoverRedirects = v2Live
      ? [
          // Keep /login on the proven v1 auth surface until /v2/auth can mint
          // renter, provider, and admin sessions with the same production tokens.
          { source: '/', destination: '/v2/home', permanent: false },
          { source: '/setup', destination: '/v2/setup', permanent: false },
          { source: '/earn', destination: '/v2/provider-setup', permanent: false },
          { source: '/renter/register', destination: '/setup', permanent: false },
          { source: '/docs', destination: '/v2/docs', permanent: false },
        ]
      : [];

    return [
      ...v2CutoverRedirects,
      // GPU Pods page is canonical in the v2 console design.
      { source: '/renter/pods', destination: '/v2/renter/pods', permanent: false },
      // GPU Pods product page lives in the app now; the static one-pager is retired.
      { source: '/containers', destination: '/v2/containers', permanent: false },
      { source: '/gpu-containers', destination: '/v2/containers', permanent: false },
      { source: '/gpu-containers.html', destination: '/v2/containers', permanent: false },
      // Retired public brand-guideline artifact. Keep old links landing on
      // current docs without continuing to publish stale internal design HTML.
      { source: '/docs/DCP-BRAND-GUIDELINES-v3.html', destination: '/v2/docs', permanent: false },
      { source: '/docs/brand', destination: '/v2/docs', permanent: false },
      // Retired v2 design-handoff URLs previously lived under public/dcp-v2.
      { source: '/dcp-v2/:path*', destination: '/v2/home', permanent: false },
      // Retired model-browser URL → the v2 playground/catalog source of truth.
      { source: '/models', destination: '/v2/renter/playground', permanent: false },
      // Provider activation funnel (4 call sites link here) → the real onboarding entry
      { source: '/provider-onboarding', destination: '/earn', permanent: false },
      // Draft/legal docs sometimes cross-link /legal/terms; canonical effective terms live at /terms
      { source: '/legal/terms', destination: '/terms', permanent: false },
    ];
  },
}

module.exports = nextConfig
