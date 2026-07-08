const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8');

assert(
  source.includes('const redirectTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`'),
  'middleware auth redirects must preserve the originally requested query string',
);
assert(
  source.includes('redirect: redirectTarget'),
  'middleware auth redirects should pass pathname plus search to buildAuthHref',
);
assert(
  !source.includes('redirect: request.nextUrl.pathname,'),
  'middleware auth redirects must not drop deep-link query strings',
);

console.log('middleware auth redirect static checks passed');
