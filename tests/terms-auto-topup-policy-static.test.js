const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const termsPage = fs.readFileSync(path.join(root, 'app/(site)/terms/page.tsx'), 'utf8');
const termsDoc = fs.readFileSync(path.join(root, 'docs/TERMS.md'), 'utf8');

for (const source of [termsPage, termsDoc]) {
  assert(source.includes('Auto top-up authorization'), 'terms should include saved-card auto top-up authorization');
  assert(source.includes('saved Moyasar payment token'), 'terms should identify the saved Moyasar token authorization');
  assert(source.includes('threshold'), 'terms should mention the configured auto top-up threshold');
  assert(source.includes('monthly cap'), 'terms should mention the configured monthly cap');
  assert(source.includes('remove the saved card'), 'terms should explain how auto top-up can be disabled');
  assert(source.includes('unused paid credit'), 'terms should limit refunds to unused paid credit');
  assert(source.includes('payment reference and reason'), 'terms should require refund request evidence');
  assert(source.includes('thirty (30) days'), 'terms should include a 30-day payment dispute window');
  assert(source.includes('non-waivable rights'), 'terms should preserve statutory rights');
}

assert(termsPage.includes('lastUpdated="July 26, 2026"'), 'public terms page should carry the current last-updated date');
assert(termsDoc.includes('**Last Updated:** 2026-07-26'), 'docs/TERMS.md should carry the current last-updated date');

console.log('terms auto-topup policy static checks passed');
