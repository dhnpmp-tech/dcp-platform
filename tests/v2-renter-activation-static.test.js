const assert = require('assert');
const fs = require('fs');
const path = require('path');

const setup = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/setup/page.tsx'), 'utf8');
const playground = fs.readFileSync(path.join(__dirname, '..', 'app/(site)/renter/playground/page.tsx'), 'utf8');

assert(!setup.includes('dcp-renter-XXXXXXXXXXXXXXXXXXXX'), 'v2 setup must not reveal a placeholder renter key');
assert(setup.includes('getRenterKey'), 'v2 setup should read the real authenticated renter key');
assert(setup.includes('/renters/me?key='), 'v2 setup should verify the stored renter key before revealing it');
assert(setup.includes('DCP only reveals real keys after email verification'), 'v2 setup should be honest when no key exists');
assert(setup.includes("keyStatus === 'ready'"), 'v2 setup should only link to the console after key verification');
assert(!setup.includes('Skip to console'), 'v2 setup should not advertise a bypass action to unauthenticated renters');
assert(setup.includes('Sign in to continue'), 'v2 setup should route clean browsers into renter auth');

assert(!playground.includes('demo — no live model request is sent'), 'v2 playground must not keep demo response copy');
assert(playground.includes("fetch('/v1/chat/completions'"), 'v2 playground should call the OpenAI-compatible inference route');
assert(playground.includes('Authorization: `Bearer ${key}`'), 'v2 playground should authenticate with the stored renter key');
assert(playground.includes('getRenterKey'), 'v2 playground should require a real renter key');

console.log('v2 renter activation static checks passed');
