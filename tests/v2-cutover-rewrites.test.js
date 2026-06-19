const assert = require('assert');

const configPath = require.resolve('../next.config.js');

async function loadConfig(v2Live) {
  const original = process.env.DCP_V2_LIVE;
  if (v2Live) process.env.DCP_V2_LIVE = '1';
  else delete process.env.DCP_V2_LIVE;
  delete require.cache[configPath];

  try {
    const config = require('../next.config.js');
    return {
      redirects: await config.redirects(),
      rewrites: await config.rewrites(),
    };
  } finally {
    delete require.cache[configPath];
    if (original === undefined) delete process.env.DCP_V2_LIVE;
    else process.env.DCP_V2_LIVE = original;
  }
}

async function run() {
  const live = await loadConfig(true);
  const redirectSources = live.redirects.map((redirect) => redirect.source);
  const rewriteSources = (live.rewrites.beforeFiles || []).map((rewrite) => rewrite.source);
  const redirectMap = new Map(live.redirects.map((redirect) => [redirect.source, redirect.destination]));

  assert(redirectSources.includes('/'), 'DCP_V2_LIVE should cut over the public home page');
  assert.strictEqual(redirectMap.get('/setup'), '/v2/provider-setup', 'public /setup is the provider onboarding flow');
  assert.strictEqual(redirectMap.get('/earn'), '/v2/provider-setup', 'public /earn should be the provider onboarding flow');
  assert.strictEqual(redirectMap.get('/renter/register'), '/v2/setup', 'legacy renter registration should land on the renter signup funnel (/v2/setup), not the provider /setup');
  assert.strictEqual(redirectMap.get('/provider-onboarding'), '/earn', 'legacy provider onboarding should land on public /earn');
  assert.strictEqual(redirectMap.get('/dcp-v2/:path*'), '/v2/home', 'retired public v2 handoff URLs should land on the real v2 home');
  assert.strictEqual(redirectMap.get('/models'), '/v2/renter/playground', 'retired model-browser URLs should not send visitors to the legacy marketplace');
  assert.strictEqual(redirectMap.get('/docs/DCP-BRAND-GUIDELINES-v3.html'), '/v2/docs', 'retired brand guideline HTML should not remain a public deployed artifact');
  assert.strictEqual(redirectMap.get('/docs/brand'), '/v2/docs', 'retired brand guideline page should land on current docs');
  assert(redirectSources.includes('/docs'), 'DCP_V2_LIVE should cut over public docs');
  assert(!redirectSources.includes('/login'), 'DCP_V2_LIVE must not redirect /login before v2 auth can mint admin tokens');
  assert(!rewriteSources.includes('/'), 'DCP_V2_LIVE must not internally rewrite the home page because v2 is mounted under /v2');

  const off = await loadConfig(false);
  const offRedirectSources = off.redirects.map((redirect) => redirect.source);
  assert(!offRedirectSources.includes('/'), 'DCP_V2_LIVE off should leave the public home page untouched');
  assert.deepStrictEqual(off.rewrites.beforeFiles || [], [], 'DCP_V2_LIVE off should not add public route rewrites');
}

run()
  .then(() => {
    console.log('v2 cutover redirect tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
