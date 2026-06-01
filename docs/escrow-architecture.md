# DCP Escrow Architecture

## Overview

DCP uses two complementary on-chain contracts to handle GPU compute job payments
and provider accountability:

| Contract | File | Purpose |
|----------|------|---------|
| `Escrow` | `contracts/Escrow.sol` | Oracle-authorised payment release (DC1 backend signs proof) |
| `JobAttestation` | `contracts/JobAttestation.sol` | Provider-signed attestation + 24 h challenge window |

Both contracts use **EIP-712** typed data hashing over the Base L2 chain,
ensuring signatures are chain- and contract-bound (no cross-chain replay).

---

## Contract 1 — Escrow.sol (Oracle Model)

The original escrow: the DC1 backend oracle signs job completion; the provider
(or relayer) submits the proof to release payment.

```
Renter ──depositAndLock(jobId, provider, amount, expiry)──► Escrow.sol
                                                                │
                                  oracle signs EIP-712 Claim   │
                                                                ▼
Provider ──claimLock(jobId, oracleProof)─────────────────► Escrow.sol
                                                           75% → provider
                                                           25% -> DCP fee
```

**Key properties:**
- Trust anchor: DC1 oracle key
- Fee: 25 % (2 500 BPS)
- Expiry: renter can cancel after timeout if provider never claims
- Events: `Deposited`, `Claimed`, `Cancelled`

---

## Contract 2 — JobAttestation.sol (Provider-Signed Model)

An alternative settlement path where the **provider** signs the completion
attestation, and renters have a configurable window (default 24 h) to challenge.
This removes the dependency on the DC1 oracle for every job.

```
Renter ──depositForJob(jobId, provider, amount)────────────► JobAttestation.sol
                                                                     │
Provider ──attestJob(AttestationData, providerSig)──────────────────►│
             (signs jobId + outputHash + tokensUsed + durationSecs)   │
                                                                     │
         ┌──────────────────────────────────────────────────────────┤
         │ 24-hour challenge window                                  │
         │                                                           │
  Renter challenges? ──yes──► CHALLENGED ──► resolveChallenge()     │
         │                       (DAO/owner)                         │
         │                     providerFault=true  → refund renter   │
         │                     providerFault=false → release + fee   │
         │                                                           │
         └──no──► window expires ──► releasePayment() (anyone)      │
                                        75% → provider              │
                                        25% -> DCP fee              │
```

### AttestationData EIP-712 Struct

```solidity
struct AttestationData {  // EIP-712 type name: "JobAttestation"
    bytes32 jobId;        // off-chain UUID as keccak256
    address provider;     // provider wallet (must match depositForJob)
    address renter;       // renter wallet (must match depositForJob)
    uint256 tokensUsed;   // GPU-tokens from vLLM metering
    uint256 durationSecs; // wall-clock runtime
    uint256 completedAt;  // unix timestamp (must be <= block.timestamp)
    bytes32 outputHash;   // keccak256 of output (privacy-preserving proof)
}
```

The `outputHash` field creates a tamper-proof, privacy-preserving commitment
to the job output without publishing raw data on-chain.

### Job Status State Machine

```
EMPTY ──depositForJob──► DEPOSITED ──attestJob──► ATTESTED
                                                      │
                                         ┌────────────┤────────────────┐
                                     challenge?     window expires?
                                         │                │
                                         ▼                ▼
                                    CHALLENGED ──resolve──► RESOLVED
                                                      │
                                                 releasePayment()
                                                      │
                                                  RELEASED
```

---

## Choosing Between the Two Models

| Criterion | Escrow.sol | JobAttestation.sol |
|-----------|------------|-------------------|
| Trust anchor | DC1 oracle | Provider + DAO arbiter |
| Renter protection | Expiry-based cancel | 24 h challenge window |
| Provider autonomy | Must wait for oracle | Self-attests completion |
| Dispute mechanism | None (oracle is final) | Formal challenge/resolve |
| Best for | Fast automated jobs | High-value / long-running jobs |

---

## EIP-712 Domain Separators

Both contracts use the same pattern but different domain names:

| Contract | `name` | `version` |
|----------|--------|-----------|
| `Escrow` | `"DCP Escrow"` | `"1"` |
| `JobAttestation` | `"DCP JobAttestation"` | `"1"` |

Signatures are **not** interchangeable between contracts.

---

## Integration with ProviderRegistry.sol

See `docs/provider-registry-architecture.md` for how `ProviderRegistry` (DCP-874)
records job completions on-chain after settlement.

After a successful `claimLock` (Escrow) or `releasePayment` / `resolveChallenge`
(JobAttestation), the DC1 backend oracle calls:

```solidity
providerRegistry.recordJobCompletion(provider, jobId, tokensUsed);
```

This creates the immutable on-chain reputation trail that renters can query
before deploying new jobs.

---

## Deployment (Base Sepolia)

```bash
cd contracts

# Deploy Escrow
npx hardhat run scripts/deploy.js --network base-sepolia

# Deploy JobAttestation
npx hardhat run scripts/deploy-attestation.js --network base-sepolia
```

USDC on Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

---

## Security Notes

- Both contracts use `ReentrancyGuard` on all token-transferring functions.
- `releasePayment` is callable by **anyone** after the window — this prevents
  the DC1 backend from becoming a liveness requirement for payment release.
- The `outputHash` field lets renters verify job output integrity off-chain
  without revealing confidential model outputs.
- Challenge window minimum is enforced at `≥ 1 hour` to prevent misconfiguration.
