# Job Attestation Spec

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


> **Type:** Integration Specification
> **Status:** Implementation-ready
> **Purpose:** How `JobAttestation.sol` integrates with backend and renter flow for tamper-evident job completion proof
> **DCP-913** | Blockchain Engineer | 2026-03-24

---

## 1. Overview

`JobAttestation.sol` (audited, DCP-901) provides EIP-712 signed job completion records:

1. **Fraud prevention** — provider signs exact token counts with their wallet; inflation is on-chain detectable
2. **Dispute resolution** — renter has a 24-hour challenge window; DC1 arbitrates if challenged

---

## 2. Contract Architecture

### 2.1 Job Lifecycle

```
EMPTY → DEPOSITED → ATTESTED → RELEASED       (normal)
                       └──────→ CHALLENGED → RESOLVED  (dispute)
```

| State | Triggered By | When |
|-------|-------------|------|
| `DEPOSITED` | Renter: `depositForJob(jobId, provider, amount)` | Before job starts |
| `ATTESTED` | Backend: `attestJob(data, sig)` | Job completes |
| `CHALLENGED` | Renter: `challengeAttestation(jobId, reason)` | Within 24h |
| `RESOLVED` | Owner: `resolveChallenge(jobId, fault)` | After review |
| `RELEASED` | Anyone: `releasePayment(jobId)` | After 24h, no challenge |

### 2.2 EIP-712 Attestation Struct

```solidity
struct AttestationData {
    bytes32 jobId;        // keccak256(abi.encodePacked(dcpJobUUID))
    address provider;     // provider's registered EVM wallet
    address renter;       // renter's EVM wallet
    uint256 tokensUsed;   // input + output tokens from vLLM metering
    uint256 durationSecs; // wall-clock seconds start→last token
    uint256 completedAt;  // Unix timestamp of final token
    bytes32 outputHash;   // keccak256(outputText)
}
```

**Domain:**
```
name: "DCP JobAttestation"  version: "1"
chainId: 84532 (Base Sepolia) / 8453 (Base Mainnet)
verifyingContract: <JobAttestation.sol address>
```

---

## 3. Provider Signing Flow

### 3.1 Worker Agent Signs on Completion

```js
const attestationData = {
  jobId:        ethers.keccak256(ethers.toUtf8Bytes(dcpJobId)),
  provider:     providerWalletAddress,
  renter:       renterWalletAddress,
  tokensUsed:   inputTokens + outputTokens,
  durationSecs: Math.floor((completedAt - startedAt) / 1000),
  completedAt:  Math.floor(completedAt / 1000),
  outputHash:   ethers.keccak256(ethers.toUtf8Bytes(outputText))
};

const domain = {
  name: 'DCP JobAttestation', version: '1',
  chainId: 84532,
  verifyingContract: JOB_ATTESTATION_ADDRESS
};
const types = {
  JobAttestation: [
    { name: 'jobId',        type: 'bytes32' },
    { name: 'provider',     type: 'address' },
    { name: 'renter',       type: 'address' },
    { name: 'tokensUsed',   type: 'uint256' },
    { name: 'durationSecs', type: 'uint256' },
    { name: 'completedAt',  type: 'uint256' },
    { name: 'outputHash',   type: 'bytes32' }
  ]
};
const signature = await providerWallet.signTypedData(domain, types, attestationData);

await fetch(`/api/providers/${providerId}/jobs/${jobId}/complete`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ attestationData, signature })
});
```

### 3.2 Backend Completion Handler

`POST /api/providers/:id/jobs/:jobId/complete`:

```js
const job = await db.get(
  `SELECT * FROM jobs WHERE id=? AND provider_id=? AND status='running'`,
  [req.params.jobId, req.params.id]
);
if (!job) return res.status(400).json({ error: 'Invalid or already-completed job' });

const tx = await jobAttestationContract.attestJob(attestationData, signature);
const receipt = await tx.wait();

const challengeDeadline = Math.floor(Date.now() / 1000) + 86400;
await db.run(
  `UPDATE jobs SET status='attested', attestation_tx_hash=?, tokens_used=?,
   completed_at=?, challenge_deadline=?, output_hash=? WHERE id=?`,
  [receipt.hash, attestationData.tokensUsed, attestationData.completedAt,
   challengeDeadline, attestationData.outputHash, job.id]
);
await notifyRenter(job.renter_id, { type: 'job_attested', jobId: job.id, tokensUsed: attestationData.tokensUsed });
res.json({ success: true, txHash: receipt.hash });
```

---

## 4. Fraud Prevention: Token Inflation

| Attack | Mitigation |
|--------|-----------|
| Inflate `tokensUsed` | Renter re-tokenises output against `outputHash`; mismatch = proof |
| Wrong `outputHash` | Renter has actual output — hash mismatch is immediate verifiable proof |
| Replay previous attestation | `jobId` unique; `attestJob` reverts if `status != DEPOSITED` |
| Unregistered wallet signs | `ECDSA.recover(digest)` must equal `rec.provider` |
| Zero tokens | Contract requires `job.tokensUsed > 0` |

### 4.1 Automated Discrepancy Check

```js
const onChain = await jobAttestationContract.getAttestation(bytes32JobId);
const metered = await db.get('SELECT total_tokens FROM job_metering WHERE job_id=?', [jobId]);
const discrepancyPct = Math.abs(Number(onChain.tokensUsed) - metered.total_tokens) / metered.total_tokens;
if (discrepancyPct > 0.05) await flagForSlashReview(providerId, jobId, { onChainTokens: onChain.tokensUsed.toString(), metered: metered.total_tokens });
```

---

## 5. Renter Challenge Flow

- Window: 24h from `attestedAt` (configurable via `setChallengeWindow()`)
- Only renter can challenge

```js
// POST /api/renters/:id/jobs/:jobId/challenge
if (Date.now() > job.challenge_deadline * 1000)
  return res.status(400).json({ error: 'Challenge window has closed' });

const tx = await jobAttestationContract.challengeAttestation(
  ethers.keccak256(ethers.toUtf8Bytes(job.id)), reason
);
await tx.wait();
await db.run(`UPDATE jobs SET status='challenged', challenge_reason=? WHERE id=?`, [reason, job.id]);
await createSupportTicket({ type: 'dispute', jobId: job.id, reason });
```

### 5.1 Auto-Release (settlement service, every 5 min)

```js
const matured = await db.all(
  `SELECT * FROM jobs WHERE status='attested' AND challenge_deadline BETWEEN ? AND ?`,
  [Math.floor(Date.now()/1000) - 3600, Math.floor(Date.now()/1000)]
);
for (const job of matured) {
  const tx = await jobAttestationContract.releasePayment(
    ethers.keccak256(ethers.toUtf8Bytes(job.id))
  );
  await tx.wait();
  await db.run(`UPDATE jobs SET status='released' WHERE id=?`, [job.id]);
}
```

**Fee:** `FEE_BPS = 2500` → 75% to provider, 25% to DC1 on `releasePayment`.

---

## 6. `verifyJob` vs `attestJob`

| Method | Who | When | Purpose |
|--------|-----|------|---------|
| `attestJob(data, sig)` | Backend | Job completion | Full escrow + challenge window |
| `verifyJob(jobId, provider, in, out, sig)` | Anyone | Post-hoc | Lightweight proof, no escrow |

**`verifyJob` signature** (personal sign, not EIP-712):
```js
const msgHash = ethers.keccak256(
  ethers.solidityPacked(['bytes32','uint256','uint256'], [jobIdBytes32, inputTokens, outputTokens])
);
await jobAttestationContract.verifyJob(
  jobIdBytes32, provider, inputTokens, outputTokens,
  await providerWallet.signMessage(ethers.getBytes(msgHash))
);
```

---

## 7. Database Schema

```sql
-- migration: 005_job_attestation_fields.sql
ALTER TABLE jobs ADD COLUMN attestation_tx_hash TEXT;
ALTER TABLE jobs ADD COLUMN challenge_deadline INTEGER;
ALTER TABLE jobs ADD COLUMN challenge_reason TEXT;
ALTER TABLE jobs ADD COLUMN output_hash TEXT;
ALTER TABLE jobs ADD COLUMN tokens_used INTEGER;
ALTER TABLE jobs ADD COLUMN duration_secs INTEGER;
ALTER TABLE jobs ADD COLUMN completed_at INTEGER;
```

---

## 8. Contract Addresses

| Network | Contract | Constructor arg |
|---------|----------|----------------|
| Base Sepolia | JobAttestation.sol | MockUSDC address |
| Base Mainnet | JobAttestation.sol | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

Both pending DCP-909.

---

## 9. Gas Costs (Base L2)

| Operation | Est. Gas | Cost @ $3,200 ETH, 0.001 gwei |
|-----------|---------|-------------------------------|
| `depositForJob()` | ~65,000 | ~$0.0002 |
| `attestJob()` | ~85,000 | ~$0.0003 |
| `challengeAttestation()` | ~45,000 | ~$0.00014 |
| `releasePayment()` | ~55,000 | ~$0.00018 |

Full round-trip: **~$0.0007** — negligible vs. compute cost.

---

*Related: `contracts/contracts/JobAttestation.sol`, `docs/blockchain/on-chain-job-verification-design.md`, `docs/blockchain/provider-stake-integration.md`*
*DCP-913 | 2026-03-24*
