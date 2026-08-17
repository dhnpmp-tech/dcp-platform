'use strict';
// Disposable / temp-mail domain blocklist. Free signup credit + a throwaway
// email was the fuel for the 2026-08-17 crypto-mining abuse (accounts on
// onldm.net / vtmpj.* / *.dpdns.org launching GPU pods to mine on free credit).
// Reject these at signup so the abuse can't start.

// Exact-match domains (lowercased). Includes the domains seen in the incident
// plus the most common public temp-mail providers.
const BLOCKED_DOMAINS = new Set([
  // seen in the incident
  'onldm.net', 'vtmpj.com', 'vtmpj.net', 'lovadio.com', 'kinws.com', 'yzcalo.com', 'raceco.com',
  // common disposable/temp-mail providers
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la',
  '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'tempmailo.com', 'tmail.com',
  'throwawaymail.com', 'yopmail.com', 'yopmail.net', 'getnada.com', 'nada.email',
  'trashmail.com', 'trashmail.net', 'dispostable.com', 'maildrop.cc', 'mailnesia.com',
  'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'mintemail.com', 'moakt.com',
  'inboxbear.com', 'tempr.email', 'discard.email', 'mailto.plus', 'fexbox.org',
  'rteet.com', 'byom.de', 'cevipsa.com', 'dpptd.com', 'spymail.one', 'ema-sofia.eu',
]);

// Suffix-match: dynamic-DNS / abuse platforms that mint endless random subdomains.
// Matching the whole registrable suffix blocks the entire family (e.g.
// "7yyvdj6y@raceco.dpdns.org" and any other "*.dpdns.org").
const BLOCKED_SUFFIXES = [
  '.dpdns.org', '.dpptd.com', '.mail.tm', '.1secmail.com', '.1secmail.org',
  '.1secmail.net', '.qwertydsw.com', '.chapmail.info',
];

function extractDomain(email) {
  if (typeof email !== 'string') return '';
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

function isDisposableEmail(email) {
  const domain = extractDomain(email);
  if (!domain) return false;
  if (BLOCKED_DOMAINS.has(domain)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

module.exports = { isDisposableEmail, extractDomain, BLOCKED_DOMAINS, BLOCKED_SUFFIXES };
