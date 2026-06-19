const assert = require('assert');
const fs = require('fs');
const path = require('path');

const robotsPath = path.join(__dirname, '..', 'public/robots.txt');
const sitemapPath = path.join(__dirname, '..', 'app/sitemap.ts');

assert(fs.existsSync(robotsPath), 'public robots.txt should exist');
assert(fs.existsSync(sitemapPath), 'app sitemap route should exist');

const robots = fs.readFileSync(robotsPath, 'utf8');
const sitemap = fs.readFileSync(sitemapPath, 'utf8');

assert(robots.includes('User-agent: *'), 'robots.txt should define a default user agent policy');
assert(robots.includes('Sitemap: https://dcp.sa/sitemap.xml'), 'robots.txt should point crawlers at sitemap.xml');

// The redesigned surface is canonical at clean ROOT URLs — the sitemap must
// list those, never the legacy /v2/* paths (a /v2 URL in the sitemap would
// advertise a redirecting URL).
[
  '/docs',
  '/agents',
  '/setup',
  '/provider-setup',
  '/pricing',
  '/status',
].forEach((route) => {
  assert(sitemap.includes(`'${route}'`), `sitemap should include ${route}`);
});

// The sitemap must NOT advertise any legacy /v2/* URL.
assert(!/['"`]\/v2\//.test(sitemap), 'sitemap must not list any /v2/* URL');

console.log('site index static checks passed');
