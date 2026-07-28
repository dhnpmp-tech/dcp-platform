const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message || `Expected source to include ${needle}`);
}

function assertNotIncludes(source, needle, message) {
  assert(!source.includes(needle), message || `Expected source not to include ${needle}`);
}

const keysPage = read('app/(site)/renter/keys/page.tsx');
assertIncludes(keysPage, "signOut: { en: 'Sign out', ar:", 'renter keys sign-out label must be bilingual');
assertIncludes(keysPage, "menu: { en: 'Menu', ar:", 'renter keys menu label must be bilingual');
assertIncludes(keysPage, "placeholder={lang === 'ar'", 'new key label placeholder must switch by language');
assertNotIncludes(keysPage, 'title="Sign out"', 'do not hardcode sign-out title');
assertNotIncludes(keysPage, 'aria-label="Menu"', 'do not hardcode menu aria label');
assertNotIncludes(keysPage, 'aria-label="Toggle language"', 'do not hardcode language-toggle aria label');
assertNotIncludes(keysPage, 'placeholder="production-server"', 'do not hardcode new-key placeholder');

const modelBrowsing = read('app/components/marketplace/ModelBrowsing.tsx');
assertIncludes(modelBrowsing, "label('marketplace.tier'", 'model browser tier label must use i18n fallback helper');
assertIncludes(modelBrowsing, "tierLabel('tier_a')", 'tier A option must be localized');
assertIncludes(modelBrowsing, "computeTypeLabel(type)", 'compute type options must be localized');
assertIncludes(modelBrowsing, "label('marketplace.tokens'", 'context-window token unit must be localized');
assertNotIncludes(modelBrowsing, '<option value="tier_a">Tier A</option>', 'tier A option must not be hardcoded');
assertNotIncludes(modelBrowsing, 'type.charAt(0).toUpperCase()', 'compute labels must not be English-derived only');

const i18n = read('app/lib/i18n.tsx');
[
  'marketplace.tier_a',
  'marketplace.compute_type',
  'marketplace.arabic_only',
  'marketplace.sort_availability',
  'marketplace.price_per_min',
  'marketplace.tokens',
  'marketplace.deploy_model',
  'marketplace.no_models',
].forEach((key) => {
  const occurrences = i18n.match(new RegExp(`'${key}'`, 'g')) || [];
  assert.strictEqual(occurrences.length, 2, `${key} must exist in both English and Arabic dictionaries`);
});

const featuredModels = read('app/components/marketplace/FeaturedArabicModels.tsx');
assertIncludes(featuredModels, "sarPerMinute = isRTL ? 'ريال/دقيقة' : 'SAR/min'", 'featured model SAR unit must be bilingual');
assertIncludes(featuredModels, "usdPerMinute = isRTL ?", 'featured model USD unit must be bilingual');
assertIncludes(featuredModels, "approxSar = isRTL ?", 'featured model approximate SAR note must be bilingual');

const publicMarketplace = read('app/(site)/marketplace/page.tsx');
[
  'Arabic-first LLM',
  'Fast · cheap',
  'Frontier-class',
  'Cross-border · opt-in',
  'Roadmap',
].forEach((literal) => {
  assert(
    publicMarketplace.includes(`<Bi en="${literal}"`) || publicMarketplace.includes(`<Bi en={${JSON.stringify(literal)}}`),
    `${literal} must be wrapped in the V2 bilingual helper`,
  );
});

console.log('i18n round 3 static checks passed');
