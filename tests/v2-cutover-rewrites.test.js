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

  assert(redirectSources.includes('/'), 'DCP_V2_LIVE should cut over the public home page');
  assert(redirectSources.includes('/setup'), 'DCP_V2_LIVE should cut over setup to the v2 provider wizard');
  assert(redirectSources.includes('/renter/register'), 'DCP_V2_LIVE should cut over renter registration to v2 setup');
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
