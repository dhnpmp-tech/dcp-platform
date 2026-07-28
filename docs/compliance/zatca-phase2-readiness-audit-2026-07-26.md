# ZATCA Phase 2 E-Invoicing Readiness Audit

Date: 2026-07-26  
Owner: Codex, Mission Control task `task_post_zatca_phase2_audit`  
Status: **not ready to claim ZATCA Phase 2 readiness**

This is an engineering readiness audit, not legal or tax advice. DC Power
Solutions Company should have Saudi tax counsel or its appointed accountant
confirm the final invoicing model, wave status, and go-live obligations before
opening high-value B2B billing.

## Executive Conclusion

DCP currently has strong payment, balance, refund-request, payout, and internal
invoice evidence rails, but it does **not** have a ZATCA Phase 2 e-invoicing
implementation. The current repo can record top-ups, auto top-up attempts,
refund requests, inference billing attempts, job settlement hashes, renter
invoice JSON/PDF, and provider payout requests. It does not generate compliant
UBL XML tax invoices, does not onboard an E-Invoice Generation Solution (EGS),
does not hold/manage a ZATCA Cryptographic Stamp Identifier (CSID), does not
clear tax invoices with FATOORA, does not report simplified tax invoices within
24 hours, and does not archive cleared/reported XML/PDF-A-3 artifacts.

Moyasar should be treated as the payment gateway and payout rail only. I found
no public Moyasar documentation that says Moyasar clears or reports the
merchant's ZATCA tax invoices on the merchant's behalf. The task wording
mentions an "SDAIA seal"; the official ZATCA sources reviewed here refer to a
ZATCA cryptographic stamp / CSID, not an SDAIA seal.

## Official Sources Checked

- ZATCA e-invoicing portal:
  https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx
- ZATCA guidelines index:
  https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Pages/default.aspx
- ZATCA Detailed Guideline PDF:
  https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-Invoicing_Detailed__Guideline.pdf
- ZATCA XML Implementation Standard PDF:
  https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf
- ZATCA Security Features Implementation Standards PDF:
  https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf
- Moyasar API introduction:
  https://docs.moyasar.com/api/api-introduction
- Moyasar create invoice API:
  https://docs.moyasar.com/api/invoices/01-create-invoice
- Moyasar refund payment API:
  https://docs.moyasar.com/api/payments/05-refund-payment
- Moyasar create payout API:
  https://docs.moyasar.com/api/payouts/04-create-payout

## Key ZATCA Requirements Relevant To DCP

ZATCA Phase 2 is the Integration Phase. Persons subject to the E-Invoicing
Regulations must integrate their systems with FATOORA. The phase started from
2023-01-01 onward in targeted waves, with target groups notified at least six
months in advance.

Scope applies to resident KSA taxable persons, and to customers or third
parties that issue a tax invoice on behalf of a resident taxable person.
DCP's public terms identify DC Power Solutions Company with a Saudi CR and VAT
number, so the conservative engineering assumption is that DCP must be ready for
e-invoicing unless finance/tax counsel confirms an exemption or that DCP is not
yet in a mandated integration wave.

For Phase 2 tax invoices, the taxpayer must generate XML or PDF/A-3 with
embedded XML from an onboarded compliant EGS. Tax invoices must be submitted as
XML to FATOORA for clearance. Once accepted, FATOORA clears the XML by adding
the cryptographic stamp and QR code, and the cleared XML is returned by API.

For Phase 2 simplified tax invoices, the taxpayer must generate XML or PDF/A-3
with embedded XML, stamp the XML with a ZATCA-issued CSID, include the Phase 2
QR code, present the invoice immediately, and report the XML to FATOORA within
24 hours of issuance.

For B2B transactions, the 1,000 SAR point is not a universal e-invoicing
trigger. ZATCA guidance says taxpayers may choose simplified tax invoices for
B2B only when taxable supplies are less than 1,000 SAR. B2B/B2G should otherwise
be treated as regular tax invoice territory unless counsel confirms a different
classification.

The XML standard expects UBL 2.1, EN 16931/CIUS validation, seller and buyer
identification, VAT registration numbers, official addresses, VAT breakdowns,
currency rules, invoice totals, and payment/settlement references. Credit and
debit notes are subject to the same issuing requirements as the invoices they
correct.

The security standard expects EGS onboarding, CSID issuance/renewal/revocation,
private-key protection, PKCS#10 CSR generation, XAdES/PAdES signatures, SHA-256,
ECDSA, certificate-chain inclusion, QR code data, and previous-invoice hash
behavior.

## DCP Flows That Cross The Risk Boundary

### Renter wallet top-ups

Code evidence:

- `backend/src/routes/payments.js`: `POST /api/payments/topup`
- `backend/src/routes/payments.js`: `POST /api/payments/webhook`
- `backend/src/db.js`: `payments`

Current behavior:

- Manual bank transfer creates a pending payment and returns DCP IBAN
  instructions.
- Card/Apple Pay creates a Moyasar hosted invoice and stores the Moyasar id,
  checkout URL, amount in halala, source type, payment method, and status.
- Moyasar webhook marks a payment paid/refunded and mutates renter balance.
- The top-up maximum is currently 10,000 SAR.

Readiness finding:

- A top-up can easily exceed 1,000 SAR.
- If finance treats prepaid credit top-up as an advance payment for taxable
  services, DCP needs a ZATCA invoice or a clearly documented tax treatment at
  top-up time.
- If finance treats invoice issuance as occurring only when compute is consumed,
  DCP still needs a ZATCA-compliant invoice/credit-note chain that reconciles
  top-up, usage, and unused-balance refunds.
- The current Moyasar hosted invoice is a payment collection object, not a
  ZATCA-cleared tax invoice in this repo.

### Auto top-up

Code evidence:

- `backend/src/routes/payments.js`: `GET/POST /api/payments/auto-topup-settings`
- `backend/src/routes/payments.js`: `GET /api/payments/auto-topup-attempts/:id/status`
- `backend/src/db.js`: `auto_topup_attempts`

Current behavior:

- DCP tracks auto top-up settings and attempt outcomes.
- Attempts can create/track recurring prepaid credit charges.

Readiness finding:

- Auto top-up repeats the same invoice obligation as manual/card top-up.
- The audit needs each successful auto top-up to be classified as either an
  advance payment invoice event or a wallet-funding event that later maps to a
  consumption invoice.

### Inference usage and job settlement

Code evidence:

- `backend/src/routes/invoices.js`
- `backend/src/db.js`: `invoices`
- `backend/src/db/migrations/001_job_settlements.sql`
- `backend/src/routes/payouts.js`: admin payments audit feed includes
  `billing_attempts`

Current behavior:

- DCP can generate invoice JSON and PDF/text receipts for completed jobs.
- Those artifacts include job id, renter, model, GPU type, USD/SAR equivalent,
  platform fee, total, timestamp, and settlement hash.

Readiness finding:

- These are useful internal receipts and audit records, but they are not
  ZATCA Phase 2 invoices.
- Missing fields include legal seller/buyer identity, VAT registration and
  address completeness, ZATCA invoice UUID/sequence, UBL XML, VAT category and
  breakdown lines, QR code, CSID, cryptographic stamp, previous invoice hash,
  FATOORA clearance/reporting status, and archive identifiers.

### Refund requests and chargebacks

Code evidence:

- `backend/migrations/023_payment_refund_requests.sql`
- `backend/src/routes/payments.js`: `POST /api/payments/:id/refund-request`
- `backend/src/routes/payouts.js`:
  `POST /api/admin/payments/refund-requests/:id/approve`
- `backend/src/services/moyasarPaymentRefundService.js`

Current behavior:

- Renters can request refunds for paid top-ups.
- Admin can approve/reject refund requests.
- Approved live Moyasar refunds call Moyasar's refund endpoint when configured.
- The payment row and renter balance are updated.

Readiness finding:

- Refunds that correct a taxable invoice require credit-note/debit-note design.
- The current refund queue does not generate or submit a ZATCA credit note
  linked to an original invoice.

### Provider payouts

Code evidence:

- `backend/src/routes/payouts.js`
- `backend/src/services/payoutService.js`
- `backend/src/services/moyasarPayoutService.js`
- `backend/src/services/payoutBatchService.js`
- `app/(site)/provider/payouts/page.tsx`
- `app/admin/payments/page.tsx`

Current behavior:

- Providers request payout of earned balances.
- Admin can approve/reject/sync payout requests.
- Moyasar payout service can disburse funds from DCP's payout source to a
  recipient IBAN.

Readiness finding:

- Provider payout is not DCP's customer sales invoice by itself. It is the
  supplier/payables side of the marketplace.
- DCP needs a finance decision: providers issue their own tax invoices to DCP,
  or DCP creates self-billed/third-party invoices on providers' behalf.
- If DCP self-bills or issues invoices on behalf of resident taxable providers,
  ZATCA's third-party/self-billing rules become in-scope and require a separate
  EGS/invoice pipeline.

## Current Repo Gaps

P0 before public enterprise B2B billing:

- No `tax_invoices`, `tax_invoice_lines`, `tax_invoice_events`, or
  `zatca_submissions` persistence model.
- No invoice number sequence, ZATCA UUID, previous-invoice hash chain, or
  immutable XML/PDF-A-3 archive pointer.
- No UBL 2.1 XML generation.
- No VAT engine for line-level VAT category, rate, taxable amount, VAT amount,
  exempt/zero-rated/out-of-scope reason, or SAR VAT accounting currency.
- No buyer profile gate for legal entity, CR, VAT number, national address, and
  buyer type. PR #958 adds richer renter signup/profile fields, but this audit
  branch is based on `origin/main`, where those fields are not yet merged.
- No EGS onboarding or CSID lifecycle.
- No FATOORA clearance API integration for tax invoices.
- No FATOORA reporting API integration for simplified invoices within 24 hours.
- No credit-note/debit-note generation for refunds or invoice corrections.
- No admin tax queue for failed clearance/reporting, retry, manual lock, or
  accountant review.
- No statement that Moyasar contractually handles ZATCA e-invoicing for DCP.

P1 after P0 design is approved:

- No tax treatment decision for prepaid wallet top-ups versus consumption-time
  invoices.
- No provider payout tax classification or self-billing decision.
- No sandbox EGS/prod EGS environment split.
- No redaction policy for stored XML/PDF-A-3 buyer details.
- No monitoring for clearance/reporting failures or 24-hour simplified invoice
  SLA.

## Go-Live Recommendation

Do not represent DCP as ZATCA Phase 2 ready today.

Before allowing public B2B or enterprise payments that can exceed 1,000 SAR,
DCP should either:

1. Keep those customers on a manual finance-operated invoice process outside the
   product until the ZATCA flow is live and evidenced, or
2. Gate/cap public self-serve B2B top-ups and auto top-ups until finance signs
   off on the tax treatment, or
3. Integrate a ZATCA-compliant e-invoicing provider that explicitly handles XML,
   CSID/stamping, clearance/reporting, credit notes, and archive obligations for
   DCP as the taxpayer.

Moyasar production keys and 1-SAR live smoke tests should not be treated as
ZATCA readiness evidence. They prove money movement, not tax-invoice compliance.

## Implementation Plan

### Phase 0 - Finance decisions

- Confirm DCP's ZATCA Phase 2 wave/notification status.
- Confirm whether wallet top-ups are taxable advance payments, non-taxable
  deposits until usage, or another accountant-approved treatment.
- Confirm whether B2B renters receive regular tax invoices by default.
- Confirm provider payout model: provider-issued invoices, self-billed
  invoices, or third-party invoice issuance.
- Ask Moyasar support or account management for a written answer on whether
  Moyasar handles ZATCA clearance/reporting for merchant sales invoices. Public
  docs reviewed here do not establish that.

### Phase 1 - Data model

Add a tax ledger separate from payment and job receipts:

- `tax_invoices`
- `tax_invoice_lines`
- `tax_invoice_events`
- `zatca_submissions`
- `tax_invoice_archives`

Minimum fields:

- Source event: top-up, auto-top-up, usage invoice, refund credit note, provider
  self-bill.
- Invoice type: tax invoice, simplified tax invoice, credit note, debit note.
- Buyer type: B2B, B2C, B2G, export/foreign if applicable.
- Seller legal profile and VAT number.
- Buyer legal name, VAT number when required, official address, CR if available.
- Line description, quantity, unit, taxable amount, VAT category, VAT rate,
  VAT amount, discount/allowance/charge fields.
- Totals in halala/SAR.
- ZATCA UUID, sequential invoice number, previous invoice hash, QR payload,
  XML hash, clearance/reporting status, failure code, retry count, archive URI.

### Phase 2 - Invoice generation

- Build or buy UBL XML generation.
- Produce PDF/A-3 with embedded XML only if needed for buyer presentment.
- Enforce Arabic numerals in machine-readable values.
- Generate credit/debit notes for refund/correction flows.
- Add static and fixture tests for 1 SAR, 1,000 SAR, 10,000 SAR, VAT rounding,
  B2B buyer VAT, B2C simplified, failed payment, refund, and partial refund.

### Phase 3 - ZATCA integration

- Onboard sandbox EGS first.
- Generate CSR and manage CSID/private key securely.
- Implement clearance for tax invoices.
- Implement reporting for simplified invoices within 24 hours.
- Store request/response artifacts and immutable archive references.
- Add retry, dead-letter, and admin review queue.

### Phase 4 - Product/admin workflow

- Add admin tax queue to `/admin/payments` or a dedicated `/admin/tax` route.
- Show top-up, usage, refund, and payout tax status per event.
- Block paid-credit release or show WARN when the associated tax invoice fails,
  depending on finance's decision.
- Add daily digest counters: pending clearance, failed clearance, reporting SLA
  risk, missing buyer VAT/profile, manual-invoice exceptions.

### Phase 5 - Acceptance gates

- One sandbox B2B tax invoice clears in FATOORA.
- One sandbox B2C simplified invoice reports within 24 hours.
- One refund creates a linked credit note.
- One top-up/usage reconciliation proves no double invoicing.
- One provider payout tax-path decision is represented in code/docs.
- Accountant signs off on the exact tax treatment.

## Follow-Up Tickets To Add

- `P0 tax`: Decide wallet top-up tax treatment before public self-serve B2B
  payments.
- `P0 tax`: Choose ZATCA vendor versus in-house EGS implementation.
- `P0 tax`: Add tax invoice ledger schema and immutable artifact archive.
- `P0 tax`: Implement B2B buyer profile gate for legal entity, VAT, CR, and
  address.
- `P0 tax`: Build tax invoice/credit note issuance for top-up, usage, and
  refund flows.
- `P0 tax`: Add FATOORA sandbox clearance/reporting smoke tests.
- `P1 tax`: Add provider payout tax classification and self-billing decision.
- `P1 tax`: Add admin tax queue and morning digest counters.

## Final Answer To The Mission Task

- **Which DCP flows cross the threshold?** Renter top-ups, auto top-ups, and
  enterprise consumption invoices can cross 1,000 SAR. Provider payouts can also
  cross 1,000 SAR, but they are supplier/payables flows unless DCP chooses
  self-billing or third-party issuance.
- **What does Phase 2 require?** A compliant EGS, UBL XML or PDF/A-3 with
  embedded XML, CSID/cryptographic stamping, QR code, FATOORA clearance for tax
  invoices, FATOORA reporting within 24 hours for simplified invoices, archive
  records, and credit/debit notes for corrections.
- **Does Moyasar handle it for us?** Not based on public docs reviewed here.
  Moyasar provides payment invoices, payments, refunds, payouts, settlements,
  tokenization, and webhooks. DCP should assume ZATCA invoicing remains DCP's
  obligation unless Moyasar provides written contractual confirmation.
- **Action before go-live?** Yes. Either keep high-value B2B/enterprise money
  on a manual accountant-operated invoicing process, cap/gate self-serve B2B
  paid flows, or implement/buy ZATCA Phase 2 e-invoicing before public launch.
