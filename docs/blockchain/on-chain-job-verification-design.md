# On-Chain Job Verification Design

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


> **Purpose:** Define how completed DCP compute jobs are recorded on-chain for auditability and dispute resolution.
> **Status:** Architectural Decision Record (ADR) — not yet implemented
> **DCP-810** | Blockchain Engineer | 2026-03-24

---

## 1. Problem Statement

When a job completes on DCP:
- The off-chain ledger (`job_settlements` table) records halala amounts
- The escrow contract (`Escrow.sol`) records USDC movement per job
- **Gap:** There is no tamper-evident, auditable record linking job execution metadata (tokens used, model, provider) to the on-chain payment

For enterprise customers (Saudi government, legal, fintech) and investor due-diligence, we need proof that compute was delivered as billed. This is also the foundation for future dispute arbitration.

---

## 2. Design Goals

1. **Auditability** — any party can verify that a billed job matches on-chain evidence
2. **Dispute resolution** — provider or renter can challenge an incorrect settlement
3. **Low gas cost** — must not materially increase per-job cost on Base L2
4. **No new trust assumptions** — uses the existing oracle signing key already in Escrow.sol

---

## 3. Data Model

Each verified job record contains:

```solidity
struct JobVerification {
    bytes32 jobId;           // DCP internal job ID (keccak256 of UUID)
    address renterAddress;   // renter's EVM wallet
    address providerAddress; // provider's EVM wallet (or fallback settlement address)
    uint256 tokensUsed;      // total tokens generated (0 for non-LLM jobs)
    uint256 costWei;         // amount paid in USDC (6 decimals × 1e12 → wei for uniformity)
    uint256 durationSeconds; // wall-clock job duration
    bytes32 modelHash;       // keccak256 of model name string (e.g. "meta-llama/Meta-Llama-3-8B")
    uint256 timestamp;       // block.timestamp at recording
}
```

This maps directly to the `job_settlements` row plus the vLLM session data.

---

## 4. Approaches

### Option A — Per-Job Event Emission (Recommended)

**How it works:**
- Each job completion emits a `JobVerified` event from the escrow contract
- No new storage slots — events live in transaction receipts (cheaper than storage)
- The DC1 oracle (existing signing key) signs the job data; the backend submits it

**Solidity addition to Escrow.sol:**

```solidity
event JobVerified(
    bytes32 indexed jobId,
    address indexed renter,
    address indexed provider,
    uint256 tokensUsed,
    uint256 costUsdc,       // USDC 6-decimal amount
    uint256 durationSeconds,
    bytes32 modelHash,
    uint256 timestamp
);

function recordJobVerification(
    bytes32 jobId,
    address provider,
    uint256 tokensUsed,
    uint256 costUsdc,
    uint256 durationSeconds,
    bytes32 modelHash,
    bytes calldata oracleSignature
) external {
    // Verify oracle signature over the job data
    bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
        JOB_VERIFY_TYPEHASH,
        jobId, provider, tokensUsed, costUsdc, durationSeconds, modelHash
    )));
    require(ECDSA.recover(digest, oracleSignature) == oracle, "invalid oracle sig");

    emit JobVerified(
        jobId,
        msg.sender,   // renter (caller)
        provider,
        tokensUsed,
        costUsdc,
        durationSeconds,
        modelHash,
        block.timestamp
    );
}
```

**Gas cost estimate (Base L2):**
- Event emission: ~3,000–5,000 gas per job
- Base L2 gas price: ~0.001 gwei (conservative)
- ETH price: ~$3,200
- **Cost per job: ~$0.00001–$0.00002** (effectively free)
- At 1,000 jobs/day: ~$0.02/day gas cost for DCP

**Pros:**
- Zero per-job storage cost (events are not state)
- Events are queryable via Basescan and The Graph
- No contract upgrade required — add as new function
- Renter or provider can call it (oracle sig verifies authenticity)

**Cons:**
- Events are not callable from other contracts (read-only via logs)
- No on-chain dispute contract can read them directly
- Requires backend change to submit the extra tx after job completion

---

### Option B — Batched Merkle Root

**How it works:**
- Backend accumulates daily job verifications
- Once per day, submits a Merkle root of all job records
- Individual jobs proven against the root via inclusion proof

**Gas cost:**
- One tx per day regardless of job count: ~50,000 gas
- At 1,000 jobs/day: **1/1000th the cost of per-job approach**
- But requires additional off-chain infrastructure to maintain Merkle trees

**Pros:**
- Extremely gas efficient for high job volumes
- Supports fraud proofs (inclusion/exclusion proofs)

**Cons:**
- Significantly more engineering complexity
- Proves "this job was in the batch" but not "this batch was executed correctly"
- Overkill for current scale (43 providers, early stage)

---

## 5. Recommendation: Option A (Per-Job Events)

**Rationale:**

At DCP's current scale and on Base L2, per-job gas costs are negligible ($0.00002/job). The simplicity of Option A far outweighs the marginal gas savings of batching. Batching should be revisited when:
- Daily job volume exceeds 10,000
- Base L2 gas costs increase materially
- Smart contract dispute resolution is needed

**Implementation scope (Option A):**
1. Add `recordJobVerification()` to `Escrow.sol` (non-breaking, additive)
2. Add backend call to `escrowChain.recordJobVerification(...)` in the job completion handler
3. Events immediately queryable on Basescan

---

## 6. Dispute Resolution Flow

With per-job events recorded:

```
Renter claims: "I was charged 500 halala but only got 200 tokens"
                          ↓
Backend produces: job_id, settlement row (200 tokens, 500 halala billed)
                          ↓
On-chain event shows: job_id, 200 tokens, 500 USDC × 0.01 = same amount
                          ↓
Match → charge was correct
No match → escrow can trigger refund via cancelExpiredLock or admin path
```

A dedicated `DisputeResolution.sol` is a Phase 2 item (post-mainnet launch).

---

## 7. Integration with Existing Escrow

The `claimLock()` flow already records payment on-chain implicitly (via `Claimed` event).
`recordJobVerification()` adds the compute metadata layer on top:

```
depositAndLock  → payment locked
   job runs
claimLock       → payment released (75% provider, 25% DC1) — already on-chain
recordJobVerification → compute evidence written — NEW
```

The two events together provide a complete audit trail: "how much was paid" + "what compute was delivered."

---

## 8. Data Off-Chain Index

The backend maintains a local index of on-chain events for fast lookup:
- `job_settlements` table already stores the off-chain record
- Add `verification_tx_hash TEXT` column to link the settlement row to its on-chain proof
- Query via Basescan API or a local viem/ethers event listener

---

## 9. Timeline & Effort

| Task | Effort | When |
|------|--------|------|
| Add `recordJobVerification()` to Escrow.sol | 2h | After escrow deployment |
| Backend integration (call from job completion handler) | 3h | After escrow deployment |
| Off-chain index (`verification_tx_hash` column) | 1h | Same sprint |
| Basescan explorer integration in renter dashboard | 4h | Phase 2 |

Total: **~6h engineering** post-escrow deployment to have full on-chain job audit trail.

---

*Source: Escrow.sol, settlementService.js, DCP-810*
*Last updated: 2026-03-24*
