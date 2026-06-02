const assert = require('assert');

const configPath = require.resolve('../next.config.js');

async function loadRewrites(v2Live) {
  const original = process.env.DCP_V2_LIVE;
  if (v2Live) process.env.DCP_V2_LIVE = '1';
  else delete process.env.DCP_V2_LIVE;
  delete require.cache[configPath];

  try {
    const config = require('../next.config.js');
    return await config.rewrites();
  } finally {
    delete require.cache[configPath];
    if (original === undefined) delete process.env.DCP_V2_LIVE;
    else process.env.DCP_V2_LIVE = original;
  }
}

async function run() {
  const live = await loadRewrites(true);
  const beforeFiles = live.beforeFiles || [];
  const sources = beforeFiles.map((rewrite) => rewrite.source);

  assert(sources.includes('/'), 'DCP_V2_LIVE should cut over the public home page');
  assert(sources.includes('/setup'), 'DCP_V2_LIVE should cut over setup to the v2 provider wizard');
  assert(sources.includes('/renter/register'), 'DCP_V2_LIVE should cut over renter registration to v2 setup');
  assert(sources.includes('/docs'), 'DCP_V2_LIVE should cut over public docs');
  assert(!sources.includes('/login'), 'DCP_V2_LIVE must not rewrite /login before v2 auth can mint admin tokens');

  const off = await loadRewrites(false);
  assert.deepStrictEqual(off.beforeFiles || [], [], 'DCP_V2_LIVE off should leave public routes untouched');
}

run()
  .then(() => {
    console.log('v2 cutover rewrite tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
