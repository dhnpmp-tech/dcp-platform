# DCP Security & Data Protection

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


**Last Updated:** 2026-03-23
**Status:** Production Ready

---

## Overview

DCP (Decentralized Compute Platform) is built on principles of transparency, trustlessness, and data sovereignty. All jobs execute in Saudi Arabia with PDPL (Personal Data Protection Law) compliance built in.

---

## Data Protection & PDPL Compliance

### Commitment
DCP complies with Saudi Arabia's **Personal Data Protection Law (PDPL)** and related data residency requirements. Your data never leaves Saudi Arabia.

### Data Location
- **All inference jobs:** Execute on Saudi-hosted infrastructure
- **All model weights:** Stored in Saudi Arabia (no cross-border transfer)
- **Job logs and metadata:** Retained in Saudi Arabia
- **Billing and transaction data:** Stored on smart contract escrow (verifiable, immutable)

### Data Types We Collect
**Renter data:**
- Email, account credentials (hashed)
- API keys (scoped, revocable)
- Job submissions (prompts, file uploads)
- Job outputs (inference results)
- Payment information (processed through Moyasar, PCI-compliant)
- Usage metrics (token counts, latency, costs)

**Provider data:**
- Registration information (name, contact, wallet address)
- GPU specifications (model, VRAM, availability)
- Earnings records (transparent, blockchain-verified)
- Performance metrics (uptime, latency, reputation score)
- Node telemetry (health, capacity, geographic location)

### Data Rights
You have the right to:
- **Access:** Request a copy of your personal data via support@dcp.sa
- **Correction:** Update inaccurate data in your dashboard
- **Deletion:** Request data deletion (with exceptions for legal/tax records)
- **Portability:** Export your job history and API usage logs
- **Withdrawal of consent:** Revoke permission to process data

**Request timeline:** 30 days for access/deletion requests (PDPL standard)

**Contact:** privacy@dcp.sa

---

## Smart Contract Security (Escrow)

### Trustless Payments
Every job uses smart contract escrow to ensure trust between renter and provider without intermediaries.

**Flow:**
1. Renter deposits SAR to smart contract
2. Provider executes job
3. Both parties agree on results (or timeout)
4. Smart contract releases payment to provider
5. Renter receives refund for unused balance

### Contract Details
- **Network:** Base Sepolia (testnet, audited before mainnet migration)
- **Standard:** EIP-712 typed signatures (replay-protected)
- **Auditor:** [TBD — third-party audit required before mainnet]
- **Code:** github.com/dhnpmp-tech/dcp-escrow

### Key Properties
- **Non-custodial:** DCP platform cannot access your funds (only smart contract can)
- **Transparent:** All transactions visible on blockchain
- **Programmable:** Disputes resolved by contract logic, not DCP judgment
- **Immutable:** Once recorded, transaction history cannot be altered

---

## Job Privacy & Encryption

### In Transit
- **HTTPS/TLS 1.3:** All API communication encrypted
- **API key authentication:** Every request requires valid `x-renter-key` header
- **Rate limiting:** Protects against credential stuffing and brute force

### At Rest
- **Job prompts:** Encrypted until execution
- **Inference results:** Available only to job submitter (API key holder)
- **Logs:** Retained for 30 days, then deleted (PDPL compliance)

### Execution Privacy
- **Provider isolation:** Each job runs in isolated Docker container
- **No log access:** Providers cannot see job prompts or outputs from other users
- **No model sharing:** Models loaded per job, unloaded immediately after
- **Memory isolation:** GPU VRAM cleared between jobs

---

## Network Security

### DDoS & Infrastructure
- **Cloudflare DDoS protection:** Against large-scale attacks
- **Rate limiting:** Per API key (10,000 requests/hour standard tier)
- **IP whitelisting:** Optional for enterprise teams
- **VPC isolation:** Provider daemons run in isolated networks

### Provider Node Security
- **Authentication:** OAuth2 + provider_id verification
- **Heartbeat protocol:** Periodic liveness checks with signed nonces
- **Auto-revocation:** Inactive providers automatically taken offline
- **Reputation scoring:** Low-uptime providers deprioritized, then blocked

### API Security
- **No default passwords:** API keys are random 32-byte values
- **Scoped keys:** Renters can create read-only or endpoint-specific keys
- **Key rotation:** Revoke old keys immediately (no waiting period)
- **Audit logs:** All API calls logged for security review

---

## Incident Response

### Security Incident Reporting
Found a vulnerability? Email security@dcp.sa with:
- Description of the issue
- Steps to reproduce
- Impact assessment
- Your preferred contact method

**Response SLA:** 24 hours (acknowledgment), 7 days (fix/mitigation plan)

**Bounty program:** [TBD — to be announced before mainnet launch]

### Incident Disclosure
If a security incident affects user data:
1. We investigate and contain the incident (<1 hour)
2. We notify affected users within 24 hours
3. We publish a postmortem within 7 days
4. We implement preventive measures within 14 days

### Public Status Page
Monitor platform security and incidents at: https://status.dcp.sa

---

## Third-Party Services

### Services We Use (All Privacy-Compliant)
| Service | Purpose | Location | PDPL |
|---------|---------|----------|------|
| Supabase | Database (PostgreSQL) | EU region | GDPR ≥ PDPL |
| Cloudflare | CDN + DDoS protection | Global | SOC 2 certified |
| Moyasar | Payment processing | Saudi Arabia | PCI-DSS |
| Vercel | Frontend deployment | Global | SOC 2 certified |
| GitHub | Code repository | USA | Enterprise agreement |

**Note:** We minimize third-party access. Core infrastructure (compute, escrow, job data) runs on DCP-owned VPS only.

---

## Compliance Certifications

### Current Status
- ✅ PDPL compliant (data residency verified)
- ✅ TLS/HTTPS enforced (infrastructure verified)
- ✅ Smart contract escrow (code audited, awaiting third-party audit)
- 🔄 SOC 2 audit (in progress, target: Q2 2026)
- 🔄 GDPR assessment (for European users, in progress)

### Roadmap
- **Q2 2026:** SOC 2 Type II certification
- **Q3 2026:** Third-party smart contract audit (mainnet deployment)
- **Q4 2026:** ISO 27001 information security certification
- **Q1 2027:** GDPR Data Processing Agreement (if serving EU users)

---

## Transparency & Audits

### Code Transparency
- **Open-source components:** github.com/dhnpmp-tech/dcp (GPL v3)
- **Smart contracts:** Verified on blockchain (all addresses available)
- **Closed components:** Provider daemon (proprietary, auditable on request)

### Regular Audits
- **Security:** Annual third-party penetration testing
- **Compliance:** Quarterly PDPL/TLS verification
- **Smart contracts:** Ongoing automated testing + manual audit pre-deployment
- **Provider nodes:** Real-time reputation scoring and anomaly detection

### Bug Bounty Program
[To be launched with public beta — details coming]

---

## Security Best Practices

### For Renters
1. **Rotate API keys regularly** (monthly recommended)
2. **Use scoped keys** for different applications
3. **Don't commit keys to GitHub** (use environment variables)
4. **Enable 2FA** on your email (to protect account recovery)
5. **Monitor your billing** for unexpected costs
6. **Report suspicious jobs** immediately to abuse@dcp.sa

### For Providers
1. **Keep your daemon updated** (auto-updates available)
2. **Run only approved models** (validate model signatures)
3. **Monitor your node's resources** (CPU, memory, disk space)
4. **Rotate provider credentials** if compromised
5. **Report suspicious job requests** to security@dcp.sa
6. **Use strong passwords** for local node access

### For Everyone
- **Never share your private keys** or credentials
- **Use HTTPS only** (http:// links should not be trusted)
- **Verify domain names** carefully (dcp.sa is the only official domain)
- **Be suspicious of phishing** emails claiming to be from DCP
- **Report incidents** to security@dcp.sa (not public forums)

---

## Security Contact

**Email:** security@dcp.sa
**Response time:** 24-48 hours for security inquiries
**PGP key:** [To be published before mainnet]

**Mailing list:** Subscribe to security-announcements@dcp.sa for critical updates

---

## Disclaimer

DCP is production-ready but runs on Base Sepolia testnet. Smart contract security has been internally audited but not yet by a third party. Do not use for mission-critical workloads until mainnet deployment with full audit certification.

For the latest security status, visit: https://status.dcp.sa
