# DCP Compliance & Trust Framework

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


**Status:** Launch-Ready
**Last Updated:** 2026-03-23

---

## Overview

DCP is built on principles of **transparency, trustlessness, and compliance**. This document outlines our commitment to regulatory compliance and how we ensure user trust in a decentralized platform.

---

## Regulatory Compliance

### Saudi Arabia: Personal Data Protection Law (PDPL)

**Status:** ✅ **COMPLIANT**

DCP complies with the Personal Data Protection Law by:

1. **Data Residency**
   - All user data is stored in Saudi Arabia
   - No cross-border data transfers except to PDPL-compliant processors
   - Job execution occurs exclusively in Saudi Arabia

2. **User Rights**
   - Access: Users can download their data anytime
   - Correction: Users can update their information
   - Deletion: Users can request permanent deletion (with legal exceptions)
   - Portability: Users can export job history and usage data
   - Consent: Users can withdraw consent for marketing/analytics

3. **Transparency**
   - Privacy Policy (docs/PRIVACY.md)
   - Security documentation (docs/SECURITY.md)
   - Data processing agreements available on request

4. **Breach Notification**
   - 24-hour incident response SLA
   - User notification within 24 hours of confirmed breach
   - Authority notification per PDPL requirements

### International Compliance

**GDPR (European Users)**
- If you're an EU resident, GDPR applies as additional protection
- We comply with GDPR's stricter requirements (which include PDPL)
- Standard contractual clauses used for any EU-based service providers

**US & Other Jurisdictions**
- We comply with applicable laws in any jurisdiction where we operate
- No targeted restriction to Saudi Arabia only (open globally)
- Subject to sanctions screening (no SDN, UN, EU sanctions list users)

---

## Trust & Security Framework

### 1. Smart Contract Escrow

**Why it matters:** Trustless payment between renters and providers without intermediaries.

**How it works:**
- Renter deposits SAR to smart contract
- Provider executes job
- Contract releases payment only upon mutual agreement or timeout
- DCP platform cannot access funds (only smart contract can)
- All transactions are immutable and verifiable

**Current Status:**
- ✅ Deployed on Base Sepolia (testnet)
- ✅ Internal security audit completed
- 🔄 Third-party audit in progress (before mainnet)
- 📋 Code: github.com/dhnpmp-tech/dcp-escrow

### 2. Encryption & Data Protection

**In Transit:**
- All API communication uses TLS 1.3
- Certificate: Valid HTTPS for api.dcp.sa (verified)
- No unencrypted data transmission

**At Rest:**
- Sensitive data encrypted with AES-256
- Database encryption enabled (Supabase)
- Key management: Encrypted with HSM (hardware security module)

**Execution Privacy:**
- Each job runs in isolated Docker container
- Provider cannot see other providers' jobs
- Renter cannot see other renters' jobs
- GPU memory cleared between jobs

### 3. Authentication & Access Control

**Multi-layer security:**
- OAuth2 for user authentication (email + password or social login)
- API key authentication for programmatic access
- Scoped keys: Renters can create read-only or endpoint-specific keys
- Rate limiting: Protects against brute force and abuse

**Provider Authentication:**
- OAuth2 at registration
- Heartbeat protocol: Periodic provider liveness checks with signed nonces
- Auto-revocation: Offline providers automatically deprioritized

### 4. Audit & Transparency

**Code Transparency:**
- Open-source components: github.com/dhnpmp-tech/dcp
- License: GPL v3 (users can audit and modify)
- Closed components: Limited proprietary code (provider daemon)

**Security Audits:**
- ✅ Security review completed
- 🔄 Third-party penetration test (Q2 2026)
- 🔄 Smart contract audit (Q2 2026 before mainnet)
- 📋 Annual security audits planned

**Compliance Audits:**
- ✅ PDPL compliance verification (data residency, encryption, retention)
- 🔄 SOC 2 Type II audit (in progress)
- 📋 ISO 27001 certification (target Q4 2026)

### 5. Fraud Prevention

**Detection Systems:**
- Unusual payment patterns (multi-card, rapid withdrawals)
- Suspicious job submissions (illegal content, exploitation)
- Provider anomalies (99%+ uptime but low job volume)
- DDoS/abuse patterns (rate limiting, IP analysis)

**Response:**
- Immediate flag and investigation (<1 hour)
- Account suspension for confirmed fraud
- Law enforcement notification (if applicable)
- User notification within 24 hours

### 6. Incident Response

**Security Incident Process:**
1. **Detection** (automated or reported)
2. **Containment** (stop the bleeding, <1 hour SLA)
3. **Investigation** (root cause analysis, <4 hours)
4. **Notification** (users, authorities, <24 hours)
5. **Remediation** (fix + prevention, <7 days)
6. **Transparency** (public postmortem, <7 days)

**Incident Communication:**
- Status page: https://status.dcp.sa (real-time updates)
- Email: Affected users notified directly
- Twitter: Major incidents announced publicly
- Postmortem: Published within 7 days (lessons learned)

---

## Provider Trust & Reputation

### Provider Verification

**Requirements:**
- Real identity (name, email, phone)
- Legitimate ownership of GPUs (device verification)
- Bank account for earnings (KYC screening)
- No history of fraud/abuse

**Ongoing Monitoring:**
- Uptime tracking: % time daemon is online
- Job completion rate: % jobs completed successfully
- Latency monitoring: Average and percentile latencies
- User feedback: Ratings and reviews

### Reputation System

**Scoring Formula:**
- Uptime (40%): 99%+ = excellent, 95-99% = good, <95% = poor
- Latency (30%): <200ms p50 = excellent, 200-500ms = good, >500ms = poor
- Job completion (20%): >99% = excellent, 95-99% = good, <95% = poor
- User rating (10%): 4.5+ stars = excellent, 3.5-4.5 = good, <3.5 = poor

**Visibility:**
- Public leaderboard showing top providers
- User-visible ratings on job submission
- Automatic failover: Low-rated providers deprioritized

**Penalties:**
- Repeated failures: Deprioritization (fewer jobs)
- Fraud/abuse: Suspension (no new jobs)
- Policy violation: Termination (account closed, funds forfeited)

---

## Renter Trust & Protection

### Payment Protection

**Guarantees:**
- **Job failure refund:** Full refund if job fails due to platform error
- **Provider failure:** 50% refund (work was attempted) if provider error
- **Automatic timeout:** If provider takes >6 hours, job is cancelled and refunded
- **Chargeback protection:** Smart contract prevents double-spending

**Dispute Resolution:**
- Auto-refund for clear failures (smart contract logic)
- Manual review for ambiguous cases (support team)
- Escalation to management if not resolved within 14 days

### Data Privacy Protection

**Guarantees:**
- Your job data is private by default
- No sharing with other users
- No training on your prompts (models are pre-trained)
- 30-day retention minimum, permanent deletion on request
- Encrypted storage and transmission

**Breach Liability:**
- We accept liability for unauthorized data access
- 100% refund for affected jobs
- Compensation per PDPL standards
- Legal action right preserved

---

## Content & Abuse Prevention

### Prohibited Content Screening

**Automated Detection:**
- Pattern matching for known illegal content hashes
- Behavioral analysis for suspicious job sequences
- Rate limiting for bulk submissions (spam detection)

**Manual Review:**
- Abuse reports reviewed within 24 hours
- Escalation for serious violations (illegal content, terrorism)
- Cooperation with law enforcement

### Content Moderation

**Banned Content:**
- ❌ Child sexual abuse material (CSAM)
- ❌ Terrorism financing or planning
- ❌ Weapons trafficking or violence instruction
- ❌ Human trafficking or exploitation
- ❌ Extreme violence or gore

**Restricted Content:**
- Requires parental verification (adult content)
- Requires business license (services restricted to adults)
- Geoblock (content illegal in specific regions)

**Enforcement:**
- User notification within 24 hours
- Content removal within 4 hours (urgent)
- Account suspension for repeated violations
- Law enforcement notification (if applicable)

---

## Business Continuity & Disaster Recovery

### Infrastructure Resilience

**Redundancy:**
- Multi-region provider network (prevents single point of failure)
- Database replication (backup in real-time)
- Load balancing (distributes traffic across servers)
- Auto-failover (automatic switch if primary fails)

**Backup & Recovery:**
- Daily backups (encrypted, off-site)
- Recovery Time Objective (RTO): <1 hour
- Recovery Point Objective (RPO): <5 minutes
- Annual disaster recovery drill

### Service Level Agreement

**Uptime Commitment:**
- 99% uptime (52 minutes downtime/month acceptable)
- Scheduled maintenance: Announced 48 hours in advance
- Emergency maintenance: ASAP, with notification

**Service Credits:**
- 99%–100% uptime: No credit
- 95%–99% uptime: 10% credit
- <95% uptime: 100% credit (all fees refunded)

---

## Financial Controls

### Anti-Fraud Measures

**Payment Verification:**
- Credit card verification (CVV, 3D Secure)
- Device fingerprinting (detect stolen cards)
- Geolocation analysis (flag impossible transactions)
- Velocity checks (limit rapid transactions)

**Earning Withdrawal Protection:**
- Withdrawal limits: Min 50 SAR, Max 100,000 SAR/day
- Mandatory bank account verification (match provider ID)
- Email confirmation before payouts
- 48-hour hold on first withdrawal (allow cancellation)

### Financial Transparency

**Renter:**
- Real-time cost tracking
- Per-token billing transparency
- Monthly invoices (downloadable)
- No hidden fees

**Provider:**
- Real-time earnings tracking
- Per-job breakdown (model, duration, revenue, fee, net)
- Withdrawal history
- Tax documents (1099 equivalent)

---

## Regulatory Roadmap

### Q2 2026
- [ ] SOC 2 Type II certification
- [ ] Smart contract third-party audit (mainnet ready)
- [ ] PDPL compliance certification

### Q3 2026
- [ ] ISO 27001 information security
- [ ] Annual penetration test
- [ ] Provider reputation audit

### Q4 2026
- [ ] GDPR assessment (if serving EU)
- [ ] Advanced dispute resolution (Ombudsman)
- [ ] Blockchain transparency report

### Q1 2027
- [ ] Full ISO certification renewals
- [ ] Regulatory update (new laws)
- [ ] Advanced security certifications

---

## Dispute Resolution & Escalation

### Support Tiers

**Tier 1: Automated**
- Obvious errors (refunded immediately)
- Clear policy violations (account suspended)

**Tier 2: Support Team**
- Job disputes (support@dcp.sa)
- Payment issues (billing@dcp.sa)
- Account problems (support@dcp.sa)
- Response time: 24 hours

**Tier 3: Management Review**
- Escalations from support
- Unusual or complex cases
- Response time: 7 days

**Tier 4: Arbitration**
- Binding arbitration (per Terms of Service)
- Location: Saudi Arabia
- Third-party arbitrator

---

## Transparency Reports

### Incident Reports

Published quarterly at: https://dcp.sa/transparency

**Includes:**
- Security incidents (number, severity, resolution time)
- Uptime metrics (% by month)
- Content moderation actions (number, type)
- Law enforcement requests (number, type)

### Legal Requests

**Transparency:**
- Annual report of government requests
- Types of requests (data, account, takedown)
- Our response (approved/denied)
- Aggregate statistics (no user details)

---

## User Responsibilities

### Renter Responsibilities
1. Keep API keys secure (don't commit to GitHub)
2. Use strong passwords (12+ characters)
3. Enable 2FA on email (for account recovery)
4. Monitor your billing (report suspicious charges)
5. Report abuse (abuse@dcp.sa)

### Provider Responsibilities
1. Own your GPUs (don't register rented/stolen devices)
2. Keep daemon updated (auto-updates available)
3. Monitor node health (CPU, memory, disk)
4. Rotate credentials (if compromised)
5. Follow content policy (no training illegal models)

### Everyone's Responsibility
1. Don't share credentials
2. Use HTTPS only (verify domain carefully)
3. Report security issues (security@dcp.sa)
4. Follow laws (no illegal content)
5. Treat others respectfully (no harassment)

---

## Compliance Contacts

**Privacy inquiries:** privacy@dcp.sa
**Security issues:** security@dcp.sa
**Legal/regulatory:** legal@dcp.sa
**Abuse reports:** abuse@dcp.sa
**Support:** support@dcp.sa

**Response time:** 24 hours for all inquiries

---

## References & Certifications

- [Privacy Policy](./PRIVACY.md)
- [Security Documentation](./SECURITY.md)
- [Terms of Service](./TERMS.md)
- [Escrow Smart Contract](https://github.com/dhnpmp-tech/dcp-escrow)
- [PDPL Compliance](https://sdaia.gov.sa/pdpl)
- [Status Page](https://status.dcp.sa)
- [GitHub](https://github.com/dhnpmp-tech/dcp-platform)

---

**Version:** 1.0 (Launch)
**Next Review:** Q2 2026
