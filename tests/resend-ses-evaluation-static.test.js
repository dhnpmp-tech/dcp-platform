const fs = require('fs');
const path = require('path');
const assert = require('assert');

const repoRoot = path.join(__dirname, '..');
const docPath = path.join(repoRoot, 'docs/backend/resend-to-ses-evaluation-2026-07-26.md');
const doc = fs.readFileSync(docPath, 'utf8');
const normalizedDoc = doc.replace(/\s+/g, ' ');

for (const required of [
  'Keep Resend as the launch provider',
  '62K free emails per month on SES',
  'not safe for launch planning',
  'https://aws.amazon.com/ses/pricing/',
  'https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html',
  'https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim-easy.html',
  'https://resend.com/pricing',
  'Free: 3,000 emails per month, 100 emails per day',
  'Pro: 50,000 emails per month',
  'Essentials 0 to 10M tier: $0.16 per 1,000 outbound emails',
  'backend/src/services/emailService.js',
  'backend/src/services/auth-otp.js',
  'backend/src/services/notificationsV2.js',
  'backend/src/services/dailyDigest.js',
  'EMAIL_PROVIDER=resend|ses',
  'AWS_SES_REGION',
  'AWS_SES_CONFIGURATION_SET',
  'Request SES production access',
  'DKIM DNS records',
  'bounce/complaint',
  'Do not remove Resend',
]) {
  assert(normalizedDoc.includes(required), `SES evaluation doc missing required evidence: ${required}`);
}

console.log('Resend to SES evaluation static checks passed');
