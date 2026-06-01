# GossipSub Job Bidding Specification

## Executive Summary

This document specifies a **decentralized job bidding mechanism** using libp2p's GossipSub protocol. Instead of a central backend dispatching jobs to providers, renters publish jobs to a pubsub topic, and eligible providers compete by bidding within a 3-second window. The renter (or backend on their behalf) accepts the lowest-price bid.

**Status:** Specification only. Implementation is planned for a later release.
**Fall-back:** If no bids received within 3 seconds, the system reverts to HTTP provider discovery (DCP-783).

## Architecture Overview

```
┌──────────┐                          ┌──────────────┐
│  Renter  │ (subscribes + publishes) │  GossipSub   │ (pub-sub mesh)
└──────────┘                          └──────────────┘
     │                                       △
     │ 1. submit job                        / \
     └──────────────────────────────────> /   \
                                         /     \
                                     ┌─────────────┐
                                     │  Providers  │
                                     │ (subscribe) │
                                     └─────────────┘
                                           │
                                           │ 2. bid on job
                                           │
                                     ┌──────────────┐
                                     │ /dcp/jobs/  │
                                     │ {jobId}/bids│ topic
                                     └──────────────┘
                                           │
                                           V
                                        Renter
                                    (selects winner)
```

## Topic Structure

### Job Publication Topic
**Topic:** `/dcp/jobs/new`

Published by: Backend (on behalf of renter)
Subscribers: All providers
Message Frequency: One per job submission

### Bid Topic (Per-Job)
**Topic:** `/dcp/jobs/{jobId}/bids`

Published by: Eligible providers
Subscribers: Backend, renter
Message Frequency: One bid per provider per job (typically 1-5 messages per job)

## Message Schemas

### Job Announcement Message

**Topic:** `/dcp/jobs/new`

```json
{
  "jobId": "job-uuid-v4",
  "renterId": "renter-uuid",
  "createdAt": "2026-03-24T08:15:00Z",
  "expiresAt": "2026-03-24T08:15:03Z",
  "modelId": "llama3-8b",
  "requiredVRAM": 16,
  "jobType": "inference",
  "estimatedTokens": 2000,
  "floorPriceUSD": 0.05,
  "input": {
    "prompt": "Explain quantum computing in 100 words",
    "temperature": 0.7,
    "maxTokens": 500
  },
  "requirements": {
    "minUptime": 0.90,
    "minReputation": 60,
    "modelsCached": ["llama3-8b"],
    "networkLatencyMaxMs": 100
  }
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | UUID | Yes | Unique job identifier |
| `renterId` | UUID | Yes | Renter's provider address |
| `createdAt` | ISO8601 | Yes | Timestamp of job creation |
| `expiresAt` | ISO8601 | Yes | Deadline for bids (typically 3s from createdAt) |
| `modelId` | String | Yes | AI model to run (e.g., `llama3-8b`, `vllm-serve`) |
| `requiredVRAM` | Integer | Yes | Minimum GPU VRAM in GB |
| `jobType` | String | Yes | `inference`, `finetune`, or `training` |
| `estimatedTokens` | Integer | Yes | Projected output tokens (for renter budgeting) |
| `floorPriceUSD` | Float | Yes | Minimum acceptable price per output token |
| `input` | Object | Yes | Job-specific input (prompt, config, etc.) |
| `requirements` | Object | No | Provider filtering criteria |

### Provider Bid Message

**Topic:** `/dcp/jobs/{jobId}/bids`

```json
{
  "batchId": "batch-uuid-v4",
  "jobId": "job-uuid-v4",
  "providerId": "provider-uuid",
  "bidTime": "2026-03-24T08:15:01Z",
  "pricePerToken": 0.035,
  "estimatedTokensPerSec": 65,
  "estimatedTimeSeconds": 31,
  "totalEstimatedCost": 1.40,
  "confidence": 0.92,
  "providerReputation": 87.5,
  "signature": "0x1234...abcd"
}
```

**Field Descriptions:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `batchId` | UUID | Yes | Unique bid identifier |
| `jobId` | UUID | Yes | References the job being bid on |
| `providerId` | UUID | Yes | Bidding provider's ID |
| `bidTime` | ISO8601 | Yes | Timestamp when bid was published |
| `pricePerToken` | Float | Yes | Offered price (USD) per output token |
| `estimatedTokensPerSec` | Float | Yes | Provider's throughput estimate |
| `estimatedTimeSeconds` | Integer | Yes | Projected job duration |
| `totalEstimatedCost` | Float | Yes | pricePerToken × estimatedTokens (from job) |
| `confidence` | Float | Yes | Provider's confidence (0.0–1.0) in meeting estimate |
| `providerReputation` | Float | Yes | Provider's current reputation score (0–100) |
| `signature` | String | Yes | Ed25519 signature (signing providerId + jobId + pricePerToken) |

### Bid Selection Message (Renter → Provider)

**Topic:** `/dcp/jobs/{jobId}/accepted`

```json
{
  "jobId": "job-uuid-v4",
  "acceptedBatch": "batch-uuid-v4",
  "selectedProviderId": "provider-uuid",
  "selectedPrice": 0.035,
  "selectionReason": "lowest_price",
  "jobStartTime": "2026-03-24T08:15:04Z",
  "jobSecret": "secret-api-key-for-this-job"
}
```

Published after renter selects winning bid. Signals to all other bidders and the selected provider.

## Bidding Flow & Timing

### Timeline

```
T+0.000s: Renter submits job via API
T+0.010s: Backend publishes to /dcp/jobs/new (GossipSub)
T+0.050s: Providers receive job message
T+0.100s: Provider 1 calculates bid, publishes to /dcp/jobs/{jobId}/bids
T+0.120s: Provider 2 publishes bid
T+0.150s: Provider 3 publishes bid
T+2.500s: (bid window still open)
T+3.000s: Bid window closes
         Renter (backend) selects lowest-price bid from received bids
T+3.010s: Renter publishes acceptance to /dcp/jobs/{jobId}/accepted
T+3.100s: Selected provider receives acceptance, begins job execution
T+3.500s: (other providers clean up their bid state)
```

**Key Constraints:**
- Bid window: Exactly 3 seconds from `createdAt` to `expiresAt`
- After window closes, no new bids are accepted
- If zero bids received by T+3s, fallback to HTTP discovery (DCP-783)
- Renter publishes acceptance within 100ms of selection

## Selection Algorithm

### Renter Selection Logic

```
1. Collect all bids received by T+3s
2. Filter out:
   - Bids from providers with reputation < minReputation
   - Bids with price > (floorPrice × 1.5)  // 50% tolerance
   - Bids from providers that don't have model cached (if known)
3. If no bids pass filters → fallback to HTTP discovery
4. Otherwise: Select bid with lowest pricePerToken
5. Publish acceptance message
6. Begin job execution with selected provider
```

### Anti-Gaming Measures

1. **Provider Stake Requirement**
   - Providers must lock 0.10 USDC per bid
   - Stake returned after job completion confirmation
   - Slashed if provider fails to execute after bid acceptance
   - Prevents spam bidding and enforces commitment

2. **Reputation Decay on Bid Flaking**
   - If provider accepts job but fails to execute: reputation −10 points
   - If bid accepted but provider goes offline: reputation −20 points

3. **Rate Limiting**
   - Providers can publish max 10 bids per minute
   - Renter can submit max 100 jobs per minute

## Fallback to HTTP Discovery

If the GossipSub bidding window closes with zero valid bids:

```
1. Log event: "No GossipSub bids for {jobId}"
2. Switch to HTTP Provider Discovery (DCP-783)
3. Query eligible providers via REST API
4. Select provider (HTTP dispatch logic)
5. Begin execution
```

Fallback adds ~1-2 seconds latency, but ensures job completion.

## Message Signing & Verification

### Signature Scheme

- **Algorithm:** Ed25519 (native libp2p support)
- **Signed Fields:** `providerId || jobId || pricePerToken` (concatenated as bytes)
- **Verification:** Backend and renter verify signature before accepting bid

### Example (pseudo-code)

```javascript
const message = providerId + jobId + pricePerToken;
const signature = cryptoSign(message, providerPrivateKey);
// Later, verify:
const verified = cryptoVerify(message, signature, providerPublicKey);
```

## Topic Subscription & Synchronization

### What Backend Subscribes To

1. `/dcp/jobs/new` → publishes (does not subscribe; backend is publisher)
2. `/dcp/jobs/{jobId}/bids` → subscribes (receives all provider bids)
3. `/dcp/jobs/{jobId}/accepted` → publishes (does not subscribe)

### What Providers Subscribe To

1. `/dcp/jobs/new` → subscribes (listens for job announcements)
2. `/dcp/jobs/{jobId}/bids` → publishes only (writes bids, does not read others')
3. `/dcp/jobs/{jobId}/accepted` → subscribes (learns when job is assigned elsewhere)

### Message Deduplication

GossipSub implements automatic deduplication:
- Each message gets a unique `message_id`
- Nodes cache recent message IDs to prevent re-gossipping duplicates
- TTL: 60 seconds (messages older than 60s are dropped)

## Failure Modes & Recovery

| Scenario | Recovery |
|----------|----------|
| Provider offline during bid window | Bid not received; renter falls back to HTTP |
| Renter offline during bid collection | Backend has auto-backup timer; uses HTTP fallback at T+3s |
| Network partition (GossipSub splinters) | Fallback to HTTP; GossipSub re-converges when partition heals |
| Provider publishes invalid signature | Bid rejected; provider reputation −5 points |
| Bid accepted but provider ignores acceptance | Job times out; provider reputation −20 points, stake slashed |

## Future Extensions

### 1. Multi-Provider Bidding
Renter could accept multiple bids and split a large job across providers:
```json
{
  "jobId": "job-123",
  "accepted_bids": [
    { "providerId": "p1", "tokens": 500 },
    { "providerId": "p2", "tokens": 500 }
  ]
}
```

### 2. Reputation-Weighted Selection
Instead of lowest price, select bid that minimizes (price × 1/(reputation/50)):
```
score = price / (1 + reputation_factor)
→ prefer high-reputation providers even if slightly more expensive
```

### 3. SLA-Based Bidding
Providers commit to SLAs (e.g., "99.5% uptime guarantee"):
```json
{
  "batchId": "...",
  "slaDuration": 24,
  "slaUptime": 0.995,
  "slaCompensation": 0.01  // 1% discount if SLA breached
}
```

## Implementation Readiness

**Prerequisite Systems Ready:**
- ✅ libp2p peer discovery (DCP-612, DCP-783)
- ✅ GossipSub pubsub (p2p/dc1-node.js)
- ✅ Provider reputation scores (DCP-859 Task 1)
- ✅ HTTP fallback mechanism (DCP-783)

**Implementation Steps (Future Sprint):**
1. Add job announcement publishing to backend
2. Add bid publishing to provider daemon
3. Add bid collection & selection logic to backend
4. Add stake management (ledger, slashing)
5. Add monitoring & fallback triggers
6. Load test with 50+ providers simultaneously

## Testing & Validation

See `test/gossipsub-bidding.test.js` for:
- Bid window timing verification
- Multi-provider simultaneous bidding
- Signature validation
- Selection algorithm correctness
- Fallback trigger scenarios
- Network partition recovery

## See Also

- DCP-612: P2P Bootstrap Node Deployment
- DCP-783: HTTP Provider Discovery Fallback
- DCP-859 Task 1: Provider Reputation Scoring
