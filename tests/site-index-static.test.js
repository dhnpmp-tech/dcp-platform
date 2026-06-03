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

[
  '/v2/home',
  '/v2/docs',
  '/v2/setup',
  '/v2/provider-setup',
  '/pricing',
  '/status',
].forEach((route) => {
  assert(sitemap.includes(route), `sitemap should include ${route}`);
});

console.log('site index static checks passed');
