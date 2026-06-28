# EIP-712 Escrow Integration Guide

> ⚠️ **STATUS — ON-CHAIN SETTLEMENT IS BUILT BUT DORMANT (not live as of 2026-06-28).**
> DCP's **live** settlement runs on **fiat SAR via Moyasar** (PCI-DSS processor); provider earnings settle in fiat.
> The smart-contract escrow / staking / on-chain-verification layer described in this document — Escrow, ProviderStake,
> JobAttestation; ERC-20 on Base L2 — is deployed only to **Base Sepolia testnet**, holds **no live funds**, and is
> pending third-party audit + mainnet. It is a planned **future agent-to-agent settlement rail**. Treat every
> "smart-contract escrow / non-custodial / blockchain-verified" statement below as **design intent, not current
> production behavior**. See `docs/blockchain/` for the full (dormant) design set.


**Contract:** `contracts/contracts/Escrow.sol`
**Domain:** `DCP Escrow` v1 on Base L2 (Base Sepolia for testnet)
**Target Audience:** Frontend developers (renter signing) and backend engineers (oracle proof generation)

---

## Overview

DCP uses an EIP-712 typed-data escrow contract to secure GPU compute payments. Instead of signing
arbitrary bytes, both the frontend and the DC1 oracle sign structured, human-readable data that
wallets surface to the user with clear field names.

The full payment lifecycle:

```
Renter (browser)                Backend / Oracle              Smart Contract
      |                               |                              |
      |-- USDC.approve(escrow, amt) ->|                              |
      |-- depositAndLock(jobId, ...) -------------------------------->|
      |                               |                              | LOCKED
      |        (job executes)         |                              |
      |                               |-- sign Claim struct -------> |
      |                               |<- EIP-712 proof             |
      |                               |-- claimLock(jobId, proof) -> |
      |                               |                              | CLAIMED
```

---

## EIP-712 Domain

The contract constructor registers this domain:

```solidity
EIP712("DCP Escrow", "1")
```

The domain separator bound to chain + contract address is:

```js
const domain = {
  name: "DCP Escrow",
  version: "1",
  chainId: 84532,          // Base Sepolia (84532) | Base mainnet (8453)
  verifyingContract: "0x<EscrowContractAddress>",
};
```

---

## TypedData Structs

Only one struct is used: `Claim`. It authorises a provider to withdraw a specific amount for a
specific job.

### Claim (Solidity TYPEHASH)

```solidity
bytes32 private constant CLAIM_TYPEHASH =
    keccak256("Claim(bytes32 jobId,address provider,uint256 amount)");
```

### Claim (JavaScript — ethers.js v6)

```js
const types = {
  Claim: [
    { name: "jobId",    type: "bytes32"  },
    { name: "provider", type: "address"  },
    { name: "amount",   type: "uint256"  },
  ],
};
```

---

## Renter Signing Flow

Renters do NOT sign EIP-712 data — they call `depositAndLock` directly with a standard on-chain
transaction. The EIP-712 signature is only used by the **DC1 oracle backend** to prove job
completion when the provider calls `claimLock`.

However, renters must first approve the Escrow contract to spend their USDC:

### Step 1 — Approve USDC spend (renter browser)

```js
import { ethers } from "ethers";

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia
const ESCROW_ADDRESS = "0x<deployed-escrow-address>";
const USDC_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

const provider = new ethers.BrowserProvider(window.ethereum);
const signer   = await provider.getSigner();
const usdc     = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);

// USDC has 6 decimals. 10 USDC = 10_000_000n
const amountMicroUsdc = 10_000_000n;
const tx = await usdc.approve(ESCROW_ADDRESS, amountMicroUsdc);
await tx.wait();
```

### Step 2 — Deposit and lock (renter browser)

```js
const ESCROW_ABI = [
  "function depositAndLock(bytes32 jobId, address provider, uint256 amount, uint256 expiry)",
];
const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);

// jobId = keccak256 of the DC1 job UUID (UTF-8 encoded)
const jobUuid = "550e8400-e29b-41d4-a716-446655440000";
const jobId   = ethers.keccak256(ethers.toUtf8Bytes(jobUuid));

const providerAddress = "0x<provider-wallet-address>";
const amount          = 10_000_000n;                          // 10 USDC (6 dec)
const expiry          = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

const depositTx = await escrow.depositAndLock(jobId, providerAddress, amount, expiry);
await depositTx.wait();

console.log("Escrow locked:", depositTx.hash);
```

### Step 3 — Notify the DCP backend

After the transaction is confirmed, the frontend should call:

```
POST /api/jobs/{jobId}/escrow-confirmed
{ "txHash": "0x...", "chainId": 84532 }
```

The backend verifies the on-chain state and begins job assignment.

---

## Oracle Signing Flow (DC1 Backend)

When a job completes successfully, the backend oracle signs a `Claim` struct and returns the
signature. The provider (or DC1 relayer) submits it to the contract via `claimLock`.

### Signing with ethers.js v6

```js
import { ethers } from "ethers";

const ESCROW_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS;
const ORACLE_PRIVATE_KEY = process.env.DC1_ORACLE_PRIVATE_KEY;

const domain = {
  name: "DCP Escrow",
  version: "1",
  chainId: parseInt(process.env.CHAIN_ID || "84532"),
  verifyingContract: ESCROW_ADDRESS,
};

const types = {
  Claim: [
    { name: "jobId",    type: "bytes32" },
    { name: "provider", type: "address" },
    { name: "amount",   type: "uint256" },
  ],
};

/**
 * Sign a job completion claim.
 * @param {string} jobUuid  DC1 job UUID string
 * @param {string} provider Provider wallet address (checksummed)
 * @param {bigint} amount   USDC amount in micro-USDC (6 decimals)
 * @returns {Promise<string>} 65-byte ECDSA signature (hex)
 */
async function signClaim(jobUuid, provider, amount) {
  const wallet = new ethers.Wallet(ORACLE_PRIVATE_KEY);

  const jobId = ethers.keccak256(ethers.toUtf8Bytes(jobUuid));

  const value = { jobId, provider, amount };

  const signature = await wallet.signTypedData(domain, types, value);
  return signature; // "0x{130 hex chars}"
}
```

### Signing with ethers.js v5 (legacy)

```js
const { ethers } = require("ethers");

const wallet = new ethers.Wallet(process.env.DC1_ORACLE_PRIVATE_KEY);

const domain = {
  name: "DCP Escrow",
  version: "1",
  chainId: 84532,
  verifyingContract: process.env.ESCROW_CONTRACT_ADDRESS,
};

const types = {
  Claim: [
    { name: "jobId",    type: "bytes32" },
    { name: "provider", type: "address" },
    { name: "amount",   type: "uint256" },
  ],
};

async function signClaim(jobUuid, provider, amount) {
  const jobId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(jobUuid));
  return wallet._signTypedData(domain, types, { jobId, provider, amount });
}
```

---

## Backend Verification of the Claim Signature

The **contract itself** verifies the oracle signature on-chain via `claimLock`. However, the
backend should also verify locally before broadcasting the proof to avoid wasting gas:

```js
import { ethers } from "ethers";

/**
 * Verify that a Claim signature was produced by the known oracle.
 * Mirrors the Solidity logic in Escrow.claimLock().
 */
function verifyClaim({ jobUuid, provider, amount, signature, escrowAddress, chainId }) {
  const domain = {
    name: "DCP Escrow",
    version: "1",
    chainId,
    verifyingContract: escrowAddress,
  };

  const types = {
    Claim: [
      { name: "jobId",    type: "bytes32" },
      { name: "provider", type: "address" },
      { name: "amount",   type: "uint256" },
    ],
  };

  const jobId = ethers.keccak256(ethers.toUtf8Bytes(jobUuid));
  const value = { jobId, provider, amount: BigInt(amount) };

  const recovered = ethers.verifyTypedData(domain, types, value, signature);
  const expectedOracle = process.env.DC1_ORACLE_ADDRESS;

  return recovered.toLowerCase() === expectedOracle.toLowerCase();
}
```

---

## Claiming Escrowed Funds (Provider / Relayer)

Once the oracle signature is available, the relayer (or provider directly) calls `claimLock`:

```js
const ESCROW_ABI = [
  "function claimLock(bytes32 jobId, bytes calldata proof)",
];

const relayerWallet = new ethers.Wallet(process.env.DC1_RELAYER_PRIVATE_KEY, rpcProvider);
const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, relayerWallet);

const jobId     = ethers.keccak256(ethers.toUtf8Bytes(jobUuid));
const signature = await signClaim(jobUuid, providerAddress, amount);

const claimTx = await escrow.claimLock(jobId, signature);
const receipt = await claimTx.wait();

console.log("Claimed at block:", receipt.blockNumber);
```

Fee split enforced by the contract:
- **75%** → provider wallet
- **25%** → DC1 owner (platform fee)

---

## Cancelling an Expired Escrow (Renter)

If the job expires without being claimed, the renter recovers the full amount:

```js
const ESCROW_ABI = [
  "function cancelExpiredLock(bytes32 jobId)",
  "function getEscrow(bytes32 jobId) view returns (tuple(address renter, uint8 status, address provider, uint256 amount, uint256 expiry))",
];

const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signer);
const jobId  = ethers.keccak256(ethers.toUtf8Bytes(jobUuid));

// Check expiry before attempting cancel
const record = await escrow.getEscrow(jobId);
if (BigInt(record.expiry) > BigInt(Math.floor(Date.now() / 1000))) {
  throw new Error("Job has not expired yet");
}

const cancelTx = await escrow.cancelExpiredLock(jobId);
await cancelTx.wait();
console.log("Refunded:", cancelTx.hash);
```

---

## Reading Escrow State

```js
const ESCROW_STATUS = { 0: "EMPTY", 1: "LOCKED", 2: "CLAIMED", 3: "CANCELLED" };

const record = await escrow.getEscrow(jobId);
console.log({
  renter:   record.renter,
  provider: record.provider,
  amount:   ethers.formatUnits(record.amount, 6) + " USDC",
  expiry:   new Date(Number(record.expiry) * 1000).toISOString(),
  status:   ESCROW_STATUS[record.status],
});
```

---

## Environment Variables Required

| Variable                   | Description                                              |
|---------------------------|----------------------------------------------------------|
| `ESCROW_CONTRACT_ADDRESS` | Deployed Escrow contract address on Base                 |
| `DC1_ORACLE_PRIVATE_KEY`  | Private key of the oracle signing address                |
| `DC1_ORACLE_ADDRESS`      | Public address corresponding to oracle key               |
| `DC1_RELAYER_PRIVATE_KEY` | Private key of the relayer that submits `claimLock` txs  |
| `CHAIN_ID`                | `84532` (Base Sepolia) or `8453` (Base mainnet)          |
| `BASE_RPC_URL`            | RPC endpoint (e.g. `https://sepolia.base.org`)           |

---

## Error Reference

| Contract revert              | Cause                                                     |
|-----------------------------|-----------------------------------------------------------|
| `Job already exists`        | `depositAndLock` called twice for same jobId              |
| `Invalid provider address`  | Provider address is zero address                          |
| `Amount must be > 0`        | Zero USDC amount                                          |
| `Expiry must be in future`  | Expiry timestamp already passed                           |
| `Not locked`                | Escrow is not in LOCKED state (already claimed/cancelled) |
| `Not authorized to claim`   | Caller is not provider, relayer, or owner                 |
| `Expired`                   | `claimLock` called after expiry timestamp                 |
| `Invalid oracle proof`      | Signature does not recover to oracle address              |
| `Not expired yet`           | `cancelExpiredLock` called before expiry                  |
| `Not authorized to cancel`  | Caller is not renter, relayer, or owner                   |

---

## Security Notes

1. **Replay protection** — `jobId` is unique per job; the contract reverts on duplicate `depositAndLock`.
2. **Cross-chain replay** — `chainId` and `verifyingContract` in the EIP-712 domain prevent signatures from being replayed on other chains or contracts.
3. **Oracle key custody** — `DC1_ORACLE_PRIVATE_KEY` must be stored in a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault). Never commit it to git.
4. **Amount binding** — The signed `amount` must exactly match the locked amount. The contract verifies this on-chain.
5. **USDC approve hygiene** — Frontend should use `approve(escrow, amount)` with the exact job amount rather than `approve(escrow, MaxUint256)`.
