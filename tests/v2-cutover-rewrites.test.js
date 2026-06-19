const assert = require('assert');

// The redesigned site is now CANONICAL at clean ROOT URLs (app/(site) route
// group). next.config.js no longer gates a root->/v2 cutover behind DCP_V2_LIVE;
// instead it permanently (308) redirects every legacy /v2/* URL back to its root
// twin so AEO equity transfers, and it must NOT contain any root->/v2 rule
// (that would form an infinite redirect loop with the /v2->root rules).
const configPath = require.resolve('../next.config.js');

async function loadConfig() {
  delete require.cache[configPath];
  const config = require('../next.config.js');
  try {
    return {
      redirects: await config.redirects(),
      rewrites: await config.rewrites(),
    };
  } finally {
    delete require.cache[configPath];
  }
}

async function run() {
  const { redirects, rewrites } = await loadConfig();
  const redirectSources = redirects.map((r) => r.source);
  const redirectMap = new Map(redirects.map((r) => [r.source, r.destination]));

  // /v2/* -> clean ROOT (the equity-transfer 308s).
  assert.strictEqual(redirectMap.get('/v2/home'), '/', 'legacy /v2/home should 308 to the root home');
  assert.strictEqual(redirectMap.get('/v2'), '/', 'bare /v2 should 308 to the root home');
  assert.strictEqual(redirectMap.get('/v2/docs'), '/docs', 'legacy /v2/docs should 308 to /docs');
  assert.strictEqual(redirectMap.get('/v2/agents'), '/agents', 'legacy /v2/agents should 308 to /agents');
  assert.strictEqual(redirectMap.get('/v2/setup'), '/setup', 'legacy /v2/setup should 308 to /setup');
  assert.strictEqual(redirectMap.get('/v2/provider-setup'), '/provider-setup', 'legacy /v2/provider-setup should 308 to /provider-setup');
  assert.strictEqual(redirectMap.get('/v2/auth'), '/auth', 'legacy /v2/auth should 308 to /auth');
  assert.strictEqual(redirectMap.get('/v2/admin'), '/admin', 'legacy single-page /v2/admin should 308 to the canonical /admin console');
  assert.strictEqual(redirectMap.get('/v2/renter/:path*'), '/renter/:path*', 'legacy /v2/renter/* should 308 to the root renter console');
  assert.strictEqual(redirectMap.get('/v2/provider/:path*'), '/provider/:path*', 'legacy /v2/provider/* should 308 to the root provider console');
  assert.strictEqual(redirectMap.get('/v2/:path*'), '/:path*', 'a catch-all should sweep any stray /v2/* to its root twin');

  // Every /v2/* redirect must be permanent (308) so engines treat root as canonical.
  redirects
    .filter((r) => r.source.startsWith('/v2'))
    .forEach((r) => assert.strictEqual(r.permanent, true, `${r.source} must be a permanent (308) redirect`));

  // No root->/v2 rule may exist anywhere (would loop with the /v2->root rules).
  redirects.forEach((r) => {
    assert(!r.destination.startsWith('/v2'), `redirect ${r.source} must NOT point back into /v2 (got ${r.destination})`);
  });

  // Retired v1 surfaces now point at clean ROOT destinations.
  assert.strictEqual(redirectMap.get('/models'), '/renter/playground', 'retired model-browser URLs should land on the root playground');
  assert.strictEqual(redirectMap.get('/docs/brand'), '/docs', 'retired brand guideline page should land on the root docs');
  assert.strictEqual(redirectMap.get('/renter/register'), '/setup', 'legacy renter registration should land on the renter signup funnel (/setup)');
  assert.strictEqual(redirectMap.get('/provider-onboarding'), '/earn', 'legacy provider onboarding should land on public /earn');
  assert.strictEqual(redirectMap.get('/dcp-v2/:path*'), '/', 'retired public v2 handoff URLs should land on the root home');

  // /login stays out of next.config (it is handled in middleware.ts -> /auth).
  assert(!redirectSources.includes('/login'), '/login must be handled in middleware (308 -> /auth), not in next.config redirects()');

  // The backend proxy rewrites are unchanged and must not touch /v2.
  const rewriteSources = (rewrites.afterFiles || []).map((rw) => rw.source);
  assert(!rewriteSources.some((s) => s.startsWith('/v2')), 'proxy rewrites must not reference /v2');
}

run()
  .then(() => {
    console.log('v2->root collapse redirect tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
