/** @type {import('next').NextConfig} */
// Backend URL must be supplied via env (BACKEND_URL). Falls back to localhost
// for local development. Production deployments must set BACKEND_URL explicitly.
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8083';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
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
  },
  // Internal link fixes — these source paths have no page and previously 404'd.
  async redirects() {
    return [
      // Homepage "Start Building" banner + any stale refs → the live model catalog
      { source: '/models', destination: '/marketplace/models', permanent: false },
      // Provider activation funnel (4 call sites link here) → the real onboarding entry
      { source: '/provider-onboarding', destination: '/setup', permanent: false },
      // Draft/legal docs sometimes cross-link /legal/terms; canonical effective terms live at /terms
      { source: '/legal/terms', destination: '/terms', permanent: false },
    ];
  },
}

module.exports = nextConfig
