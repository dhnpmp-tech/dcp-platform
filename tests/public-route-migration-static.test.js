const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const modelsPage = fs.readFileSync(path.join(root, 'app/(site)/models/page.tsx'), 'utf8');
const providersPage = fs.readFileSync(path.join(root, 'app/(site)/providers/page.tsx'), 'utf8');
const publicDirectoryCss = fs.readFileSync(path.join(root, 'app/(site)/public-directory.css'), 'utf8');
const siteHeader = fs.readFileSync(path.join(root, 'app/(site)/components/chrome/SiteHeader.tsx'), 'utf8');
const homePage = fs.readFileSync(path.join(root, 'app/(site)/(home)/page.tsx'), 'utf8');
const sitemap = fs.readFileSync(path.join(root, 'app/sitemap.ts'), 'utf8');
const nextConfig = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8');

[
  'app/(site)/marketplace/page.tsx',
  'app/(site)/pricing/page.tsx',
  'app/(site)/models/page.tsx',
  'app/(site)/providers/page.tsx',
].forEach((routeFile) => {
  assert(fs.existsSync(path.join(root, routeFile)), `public migrated route should exist: ${routeFile}`);
});

[
  "fetch('/v1/models'",
  'provider_count',
  'catalog-only',
  'zero-provider metadata',
  'GET /v1/models',
  'href="/models/allam"',
  'href="/models/qwen-arabic"',
].forEach((needle) => {
  assert(modelsPage.includes(needle), `/models should keep live-catalog discipline: ${needle}`);
});

[
  "fetch('/api/providers/models'",
  "fetch('/api/health/detailed'",
  'No provider identities exposed',
  'endpoint_reachable',
  'verified_online',
  'model_coverage',
  'aggregate only',
  'href="/provider-setup"',
  'href="/provider/dashboard"',
].forEach((needle) => {
  assert(providersPage.includes(needle), `/providers should keep public-safe provider aggregate discipline: ${needle}`);
});

[
  'sample_provider_id',
  'wg_mesh_ip',
  'vllm_endpoint_url',
  'provider_ids',
  'Mission Control fleet rows',
].forEach((leak) => {
  assert(!providersPage.includes(leak), `/providers should not expose private fleet detail: ${leak}`);
});

[
  '.directory-hero',
  '.directory-metrics',
  '.directory-panel',
  '.directory-proof',
  '.directory-link-grid',
].forEach((selector) => {
  assert(publicDirectoryCss.includes(selector), `public directory CSS should style ${selector}`);
});

[
  "href: '/models'",
  "href: '/marketplace'",
  "href: '/providers'",
].forEach((href) => {
  assert(siteHeader.includes(href), `mobile menu should expose migrated public route ${href}`);
});

[
  'href="/models"',
  'href="/marketplace"',
  'href="/providers"',
  'href="/provider-setup"',
].forEach((href) => {
  assert(homePage.includes(href), `home footer should expose migrated public route ${href}`);
});

[
  "'/models'",
  "'/marketplace'",
  "'/providers'",
].forEach((route) => {
  assert(sitemap.includes(route), `sitemap should include ${route}`);
});

assert(!nextConfig.includes("{ source: '/models'"), '/models should be a live page, not a redirect');
assert(nextConfig.includes("{ source: '/marketplace/models', destination: '/models'"), 'legacy /marketplace/models should redirect to /models');

console.log('public route migration static checks passed');
