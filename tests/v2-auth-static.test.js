const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app/v2/auth/page.tsx'), 'utf8');

assert(source.includes("setSession"), 'v2 auth should create the shared session cookie');
assert(source.includes("renters/send-otp"), 'v2 auth should send renter magic links');
assert(source.includes("providers/send-otp"), 'v2 auth should send provider magic links');
assert(source.includes("renters/me?key="), 'v2 auth should validate renter API keys');
assert(source.includes("providers/me?key="), 'v2 auth should validate provider API keys');
assert(source.includes("dc1_renter_key"), 'v2 auth should store renter API keys');
assert(source.includes("dc1_provider_key"), 'v2 auth should store provider API keys');
assert(!source.includes('defaultValue="fatima@nextwave.sa"'), 'v2 auth must not ship prototype email defaults');
assert(!source.includes('href="/v2/terms"'), 'v2 auth legal links should not point to missing v2 terms');
assert(!source.includes('href="/v2/privacy"'), 'v2 auth legal links should not point to missing v2 privacy');
assert(source.includes("Nafath · coming soon"), 'Nafath should be explicit coming soon until integrated');
assert(source.includes("Google · coming soon"), 'Google should be explicit coming soon until integrated');

console.log('v2 auth static checks passed');
