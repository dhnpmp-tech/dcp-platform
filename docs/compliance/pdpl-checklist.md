# DCP PDPL Compliance Checklist

**Law:** Saudi Arabia Personal Data Protection Law (PDPL), Royal Decree M/19, 2021
**Enforced by:** SDAIA (Saudi Data & AI Authority)
**Enforcement date:** September 2023
**Last reviewed:** 2026-03-24
**Reviewer:** Security Engineer (DCP-933)
**Status:** ✅ Substantially Compliant — see open items below

---

## Summary

| Article | Requirement | Status |
|---------|-------------|--------|
| Art. 5 — Lawful Basis | Contract/legitimate interest | ✅ Compliant |
| Art. 6 — Data Minimisation | Minimal PII at registration | ✅ Compliant |
| Art. 14 — Data Subject Rights | Access, erasure, portability | ✅ Implemented |
| Art. 19 — Cross-Border Transfer | Data stays in KSA | ✅ Compliant |
| Art. 21 — Security Measures | TLS, access control, audit log | ✅ Compliant (minor gaps noted) |

---

## Article 5 — Lawful Basis for Processing

**Requirement:** Personal data must be processed on a lawful basis (contract, consent, or legitimate interest).

| Check | Item | Status | Notes |
|-------|------|--------|-------|
| 5.1 | Renter data processed under compute service contract | ✅ | Terms of Service at `/docs/TERMS.md` |
| 5.2 | Provider data processed under provider agreement | ✅ | Provider Agreement in provider onboarding flow |
| 5.3 | Payment data processed under contract (Moyasar, PCI-compliant) | ✅ | Moyasar is a Saudi-licensed payment gateway |
| 5.4 | No data processed beyond stated purpose | ✅ | No marketing analytics, no profiling |
| 5.5 | Purpose limitation documented in Privacy Policy | ✅ | `/docs/PRIVACY.md` |

**Finding:** Lawful basis is established for all processing. No consent-based processing requiring opt-in mechanisms was identified.

---

## Article 6 — Data Minimisation

**Requirement:** Only collect personal data adequate and necessary for the stated purpose.

### Renter Data Collected

| Field | Necessity | Status |
|-------|-----------|--------|
| Email | Account identification / billing notifications | ✅ Necessary |
| API key (hashed/scoped) | Service authentication | ✅ Necessary |
| Job history (prompt metadata, token counts) | Billing & dispute resolution | ✅ Necessary |
| Usage metrics (latency, costs) | Billing accuracy | ✅ Necessary |
| Payment info | Processed via Moyasar — not stored on DCP infrastructure | ✅ Minimised |

**Fields NOT collected:** Full name, phone number, national ID, physical address, IP geolocation beyond KSA-confirmation.

### Provider Data Collected

| Field | Necessity | Status |
|-------|-----------|--------|
| Name, email | Account management | ✅ Necessary |
| Organization | KYB (provider vetting) | ✅ Necessary |
| GPU specs, VRAM | Job routing and pricing | ✅ Necessary |
| Wallet address | On-chain earnings settlement | ✅ Necessary |
| Heartbeat/telemetry | Provider liveness & job dispatch | ✅ Necessary |
| Earnings records | Transparent payout ledger | ✅ Necessary |
| IP address | Network connectivity, abuse prevention | ✅ Necessary |

**Finding:** Data collection is minimal and purpose-bound. No unnecessary PII is collected at registration.

> **Note:** Renter job prompts (inference inputs) are stored in job history for billing. If prompts contain PII submitted by the renter's end-users, DCP becomes a data processor on their behalf. Enterprise contracts should include a Data Processing Agreement (DPA). **Action item:** Prepare a standard DPA template for B2B contracts. (See: DCP-934)

---

## Article 14 — Data Subject Rights

**Requirement:** Data subjects must be able to exercise rights to access, correction, deletion, and portability.

| Right | Endpoint | Implementation | Status |
|-------|----------|----------------|--------|
| **Right to Access (Renters)** | `GET /api/renters/me/data-export` | JSON export of all renter data: account, jobs, payments, API keys | ✅ Implemented |
| **Right to Access (Providers)** | `GET /api/providers/me/data-export` | JSON export of all provider data: profile, jobs, earnings, withdrawals | ✅ Implemented |
| **Right to Erasure (Renters)** | `DELETE /api/renters/me` | Soft-delete + anonymisation: email → `deleted-renter-{id}@dcp.sa`, API key tombstoned, active jobs cancelled | ✅ Implemented |
| **Right to Erasure (Providers)** | `DELETE /api/providers/me` | Provider self-deletion implemented | ✅ Implemented |
| **Right to Correction** | `PATCH /api/renters/settings`, `PATCH /api/providers/me/gpu-profile` | Self-service profile updates | ✅ Implemented |
| **Right to Portability** | `GET /api/renters/me/jobs/export?format=csv` | CSV export of job history | ✅ Implemented |

### PDPL Request Log

All data subject requests (export, deletion) are logged in the `pdpl_request_log` database table with:
- `account_type` (renter/provider)
- `account_id`
- `request_type` (export/delete)
- `requested_at` timestamp
- `metadata_json` (request context)

**Response timeline:** 30 days maximum per PDPL Article 14(2).

**Manual deletion procedure** (for support-assisted requests via support@dcp.sa):
1. Verify identity via registered email + API key challenge
2. Call `DELETE /api/renters/me` or `DELETE /api/providers/me` via admin API
3. Log request in `pdpl_request_log` with `request_type = 'manual_delete'`
4. Send confirmation email within 72 hours

**Retention exception:** Billing/earnings records may be retained for 7 years per Saudi VAT and zakat regulations even after account deletion. Retained records are stripped of PII beyond the minimum required for tax compliance.

---

## Article 19 — Cross-Border Transfer Prohibition

**Requirement:** Personal data must not be transferred outside Saudi Arabia without adequate safeguards or SDAIA approval.

| Check | Item | Status | Notes |
|-------|------|--------|-------|
| 19.1 | Production VPS (api.dcp.sa) located in Saudi Arabia | ✅ | KSA-hosted VPS — data stays in-kingdom |
| 19.2 | SQLite database stored on VPS (KSA) | ✅ | `backend/data/providers.db` on VPS filesystem |
| 19.3 | Inference jobs execute on provider GPUs in KSA | ✅ | All registered providers are KSA-based (Phase 1) |
| 19.4 | Model weights downloaded from HuggingFace — **user data not sent** | ✅ | Only model weights transferred; no renter/provider PII leaves KSA |
| 19.5 | Moyasar payment gateway (Saudi-licensed) | ✅ | Moyasar is a Saudi company (api.moyasar.com); processes SAR payments under Saudi jurisdiction |
| 19.6 | No third-party analytics or tracking services | ✅ | No Google Analytics, Mixpanel, Amplitude, or equivalent |
| 19.7 | Smart contract escrow on Base Sepolia (EVM testnet) | ⚠️ | Wallet addresses stored on public blockchain — not PII under PDPL, but document when mainnet goes live |

### Data Flow Diagram

```
Renter Browser
    │
    ▼ HTTPS/TLS (Let's Encrypt)
api.dcp.sa:443 (nginx)
    │
    ▼ localhost:8083
Express Backend (VPS · KSA · api.dcp.sa)
    │
    ├──► SQLite DB (/backend/data/providers.db · KSA)
    │       ├── providers table (provider PII)
    │       ├── renters table (renter PII)
    │       ├── jobs table (job metadata)
    │       └── pdpl_request_log (audit trail)
    │
    ├──► Provider vLLM instances (KSA · via P2P/HTTP)
    │       └── Inference output returned to renter (no PII stored at provider)
    │
    └──► Moyasar API (api.moyasar.com · Saudi-licensed)
            └── Payment card data only — processed under Moyasar's PCI/PDPL compliance

CROSS-BORDER:
    └──► HuggingFace (model weight downloads only)
            └── ✅ No user PII transmitted — model weights only
```

**Conclusion:** No renter or provider personal data leaves Saudi Arabia under normal platform operation.

---

## Article 21 — Security Measures

**Requirement:** Implement appropriate technical and organisational measures to protect personal data.

### Technical Measures

| Check | Control | Status | Notes |
|-------|---------|--------|-------|
| 21.1 | Encryption in transit | ✅ | TLS 1.2/1.3 via Let's Encrypt (api.dcp.sa, valid 2026-06-21) |
| 21.2 | Encryption at rest | ⚠️ | SQLite file uses OS filesystem permissions. Full-disk encryption depends on VPS provider config. Recommend: verify VPS disk encryption status. |
| 21.3 | API key access control (renters) | ✅ | Scoped sub-keys with expiry; rotation endpoint available |
| 21.4 | API key access control (providers) | ✅ | Provider API keys required for all data-bearing endpoints |
| 21.5 | Admin authentication | ✅ | Separate admin token; `adminAuth` middleware on all `/api/admin/` routes |
| 21.6 | Rate limiting | ✅ | Per-endpoint rate limits implemented (DCP-894); brute-force protection on auth endpoints |
| 21.7 | Input validation | ✅ | SSRF protection on webhook URLs; image allowlist for container jobs |
| 21.8 | Security audit trail | ✅ | `pdpl_request_log` table; access logs via PM2/nginx |
| 21.9 | Dependency scanning | ⚠️ | No automated SCA (software composition analysis) in CI. Recommend: add `npm audit` to CI pipeline. |
| 21.10 | Secrets management | ✅ | API keys in environment variables; `secrets-rotation-policy.md` documented |

### Incident Notification — SDAIA 72-hour Requirement

Under PDPL Article 21(3), DCP must notify SDAIA within **72 hours** of becoming aware of a personal data breach.

**Notification procedure:**
1. Detect and confirm breach (Security Engineer + Founding Engineer)
2. Assess scope: which data subjects affected, what data exposed
3. Within 72 hours: submit notification via SDAIA online portal (https://sdaia.gov.sa)
4. Required fields: incident date/time, data types exposed, estimated data subject count, remediation steps taken
5. Notify affected data subjects within 5 business days if breach poses significant risk
6. Full incident report filed within 30 days

**Incident response owner:** Security Engineer
**Escalation:** DCP support team (support@dcp.sa)
**Runbook:** `docs/security/incident-response-runbook.md`

---

## Open Items / Gaps

| ID | Severity | Gap | Recommendation | Owner |
|----|----------|-----|----------------|-------|
| GAP-001 | Medium | Data Processing Agreement (DPA) for enterprise B2B clients | Create standard DPA template for customers who submit prompts containing end-user PII | Security Engineer |
| GAP-002 | Low | VPS disk encryption not verified | Confirm with hosting provider that disk-at-rest encryption is enabled | DevOps |
| GAP-003 | Low | `npm audit` not in CI pipeline | Add `npm audit --audit-level=high` to GitHub Actions CI | DevOps |
| GAP-004 | Low | Blockchain wallet addresses documented when mainnet escrow goes live | Add PDPL note to escrow deployment docs re: public blockchain disclosure | Blockchain Engineer |
| GAP-005 | Info | No formal Data Protection Officer (DPO) appointed | Consider appointing DPO when headcount permits; PDPL requires for large-scale processing | CEO |

---

## Audit Trail

| Date | Event | Reviewer |
|------|-------|----------|
| 2026-03-24 | Initial PDPL compliance checklist created | Security Engineer (DCP-933) |
| — | Next review scheduled | — |

**Next scheduled review:** 2026-09-24 (6-month cycle)

---

*This checklist is maintained by the Security Engineer. For questions: security@dcp.sa*
