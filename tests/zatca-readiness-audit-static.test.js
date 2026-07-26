const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const auditPath = path.join(root, 'docs/compliance/zatca-phase2-readiness-audit-2026-07-26.md');
const audit = fs.readFileSync(auditPath, 'utf8');
const auditLower = audit.toLowerCase();
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

[
  'not ready to claim ZATCA Phase 2 readiness',
  'not legal or tax advice',
  'FATOORA',
  'Cryptographic Stamp Identifier (CSID)',
  'not an SDAIA seal',
  'UBL XML',
  'PDF/A-3 with embedded XML',
  'within 24 hours',
  'Moyasar should be treated as the payment gateway and payout rail only',
  'wallet top-ups',
  'Auto top-up',
  'payment_refund_requests',
  'provider payouts',
  'No `tax_invoices`',
  'Do not represent DCP as ZATCA Phase 2 ready today',
].forEach((required) => {
  assert(auditLower.includes(required.toLowerCase()), `ZATCA audit should include: ${required}`);
});

[
  'https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx',
  'https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-Invoicing_Detailed__Guideline.pdf',
  'https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf',
  'https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf',
  'https://docs.moyasar.com/api/invoices/01-create-invoice',
  'https://docs.moyasar.com/api/payouts/04-create-payout',
].forEach((url) => {
  assert(audit.includes(url), `ZATCA audit should cite ${url}`);
});

assert(
  changelog.includes('docs(compliance): add ZATCA Phase 2 readiness audit'),
  'canonical changelog should include the ZATCA audit entry',
);

console.log('zatca readiness audit static checks passed');
