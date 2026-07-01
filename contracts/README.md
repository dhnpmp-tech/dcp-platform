> # ⚠️ DORMANT — NOT DEPLOYED — NOT LIVE
>
> **This contract workspace is not part of how DCP works today.** It is dormant
> code kept as a **future roadmap item: the agent-to-agent settlement rail** for
> when autonomous agents pay each other directly.
>
> - **Live settlement on DCP today is fiat Saudi Riyal (SAR) via Moyasar** —
>   renters top up SAR (Moyasar pay-in, card), providers are paid out in SAR
>   (Moyasar pay-out rails). This on-chain escrow does **not** custody, hold, or
>   settle any funds today; DCP custodies SAR balances via Moyasar.
> - **Nothing here is deployed.** Targets **Base Sepolia (testnet) only** — there
>   is **no mainnet deployment**.
> - The build/test/deploy instructions below are for **local development of this
>   dormant roadmap component**, not a description of production behavior.

# DC1 Smart Contracts — Escrow on Base L2 (Roadmap — NOT live yet)

Roadmap design for trustless agent-to-agent payment escrow for DC1 GPU compute jobs. In this future model, USDC would be held on-chain while jobs run; providers would claim funds on completion; renters would get refunded if jobs expire unclaimed. **None of this is live** — live settlement today is fiat SAR via Moyasar (see banner above).

**Network**: Base Sepolia (testnet) only — no mainnet deployment
**Token**: USDC (6 decimals)
**Fee split**: 75 % provider / 25 % DC1 (hardcoded as `FEE_BPS = 2500`)

---

## Contract Architecture

### `Escrow.sol`

| Function | Caller | Description |
|---|---|---|
| `depositAndLock(jobId, provider, amount, expiry)` | Renter | Pulls USDC from renter and locks it against a jobId |
| `claimLock(jobId, proof)` | Provider / authorized relayer / owner | Claims after job completes; verifies DC1 oracle ECDSA signature |
| `cancelExpiredLock(jobId)` | Renter / authorized relayer / owner | Reclaims full amount if job expired without a claim |
| `getEscrow(jobId)` | Anyone | Read-only: returns `EscrowRecord` struct |
| `setOracle(address)` | Owner | Updates the DC1 oracle signing address |
| `setRelayer(address)` | Owner | Updates the backend relayer/operator address used for service-initiated settlement |

#### EscrowRecord struct

```solidity
struct EscrowRecord {
    address renter;
    address provider;
    uint256 amount;      // USDC micro-units (6 decimals)
    uint256 expiry;      // Unix timestamp
    EscrowStatus status; // EMPTY(0) | LOCKED(1) | CLAIMED(2) | CANCELLED(3)
}
```

#### Oracle proof format

The DC1 backend signs job completion using an EIP-712 typed signature scoped to
the current chain and escrow contract address:

- Domain: `{ name: "DCP Escrow", version: "1", chainId, verifyingContract }`
- Type: `Claim(bytes32 jobId,address provider,uint256 amount)`

```js
const domain = {
  name: "DCP Escrow",
  version: "1",
  chainId,
  verifyingContract: escrowAddress,
};

const types = {
  Claim: [
    { name: "jobId", type: "bytes32" },
    { name: "provider", type: "address" },
    { name: "amount", type: "uint256" },
  ],
};

const proof = await oracleWallet.signTypedData(domain, types, {
  jobId,
  provider: providerAddress,
  amount,
});
```

### `MockUSDC.sol`

Test-only ERC20 token with 6 decimals and open `mint()`. **Do not deploy to mainnet.**

---

## Setup

```bash
cd contracts
npm install
```

---

## Running Tests

Tests use Hardhat's local in-process EVM — no external RPC needed.

```bash
npm test
# or with gas report:
npm run test:gas
```

### What the tests cover

| Suite | Tests |
|---|---|
| `depositAndLock` | happy path, duplicate jobId, past expiry, zero amount, zero provider |
| `claimLock` | 75/25 split, operator claim, invalid oracle sig, wrong caller, post-expiry, double-claim |
| `cancelExpiredLock` | happy path, relayer cancel, pre-expiry revert, wrong caller, double-cancel |
| `setOracle` | owner update, non-owner revert, zero-address revert |
| `setRelayer` | owner update, non-owner revert, zero-address revert |
| `getEscrow` | unknown jobId returns EMPTY |

---

## Deploying to Base Sepolia (testnet only — roadmap, not live)

Use the steps below for local testnet deployment. **There is no mainnet
deployment**, and this path is not part of live DCP settlement (fiat SAR via
Moyasar). Private launch coordination checklists should stay outside this public repository.

1. **Copy and fill env vars**

   ```bash
   cp .env.example .env
   # Edit .env: PRIVATE_KEY, USDC_ADDRESS, ORACLE_ADDRESS, BASESCAN_API_KEY
   ```

2. **Compile**

   ```bash
   npm run compile
   ```

3. **Deploy**

   ```bash
   npm run deploy:sepolia
   ```

   The script writes `abis/Escrow.json` with deployed metadata (`address`, `usdcAddress`, `oracleAddress`, `chainId`, `abi`).

4. **Verify on Basescan** (optional)

   ```bash
   npx hardhat verify --network base-sepolia <CONTRACT_ADDRESS> "<USDC_ADDRESS>" "<ORACLE_ADDRESS>"
   ```

### Base Sepolia addresses

| Token | Address |
|---|---|
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

Get testnet ETH from the [Base Sepolia faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet).

---

## Backend Integration Plan (Roadmap — NOT live yet)

The Express.js backend contains an opt-in chain bridge at `backend/src/services/escrow-chain.js`.
This bridge is **dormant**: when `ESCROW_CONTRACT_ADDRESS` and `ESCROW_ORACLE_PRIVATE_KEY` are set, job routes would call the contract in fire-and-forget mode. These envs are not set in production, and this path is not used for live settlement.

Recommended backend envs (for the roadmap path only):

- `ESCROW_CONTRACT_ADDRESS` (required)
- `ESCROW_ORACLE_PRIVATE_KEY` (required, signs completion proof)
- `ESCROW_TX_PRIVATE_KEY` (optional, tx sender; defaults to oracle key)
- `ESCROW_SETTLEMENT_PROVIDER_ADDRESS` (optional fallback provider wallet when provider has no EVM wallet)
- `ESCROW_RELAYER_ADDRESS` (optional; operator address authorized to claim/cancel when wallet addresses are routed through backend)
- `ESCROW_USDC_ADDRESS` (optional; defaults to Base Sepolia USDC)
- `BASE_RPC_URL` (optional; defaults to `https://sepolia.base.org`)
- `ESCROW_PROOF_SCHEME` (optional; `typed` default, set `personal` only for legacy contracts that still verify EIP-191 signatures)

Future on-chain workflow (not live):

1. Backend sender wallet funds and approves USDC, then calls `depositAndLock`.
2. On success completion paths, backend signs proof and calls `claimLock` (provider or relayer can submit).
3. On failure/timeout paths, backend attempts `cancelExpiredLock` once expiry is reached (renter or relayer can submit).

**Live settlement today is fiat SAR via Moyasar**, with the off-chain SQL escrow (DCP-32) as the default ledger. The on-chain path described here is a dormant roadmap item — the agent-to-agent settlement rail for when autonomous agents pay each other.

---

## Security Notes

- Contract owner receives the 25% fee — set owner to a DC1 multisig before any mainnet consideration
- `oracle` private key must be kept secret; rotate via `setOracle()` if compromised
- Expiry should be at least `job_estimated_duration + buffer` — set in the backend
- No upgradeability — contract is immutable by design; re-deploy for fixes
- **Do not deploy to mainnet without a professional audit** (and note: no mainnet deployment exists or is planned for the current product)

---

## File Structure

```
contracts/
├── contracts/
│   ├── Escrow.sol       — main escrow contract
│   └── MockUSDC.sol     — test-only ERC20
├── scripts/
│   └── deploy.js        — Hardhat deploy + ABI export
├── test/
│   └── Escrow.test.js   — full test suite
├── abis/
│   └── Escrow.json      — ABI + deployed address (consumed by backend)
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md            — you are here
```