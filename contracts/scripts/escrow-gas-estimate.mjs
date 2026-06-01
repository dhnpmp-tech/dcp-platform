/**
 * DCP Escrow — Gas Estimation Script (DCP-957)
 *
 * Runs against a local Hardhat fork and prints gas costs for each escrow function.
 * No real testnet or wallet funding required.
 *
 * Usage:
 *   cd contracts
 *   node scripts/escrow-gas-estimate.mjs
 *
 * Or via npx:
 *   npx hardhat run scripts/escrow-gas-estimate.mjs --network hardhat
 */

import hre from "hardhat";

const { ethers } = hre;

// ─── EIP-712 oracle signing helper ───────────────────────────────────────────

async function oracleSign(escrowAddress, jobId, providerAddr, amount, oracleSigner) {
  const { chainId } = await ethers.provider.getNetwork();
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
  return oracleSigner.signTypedData(domain, types, { jobId, provider: providerAddr, amount });
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

function gasRow(label, gas) {
  const padded = label.padEnd(32);
  const gasStr = gas.toString().padStart(8);
  // Rough USD estimate at 0.001 gwei Base L2 fee, ETH=$2,500
  const costUsd = ((Number(gas) * 0.001e9 * 2500) / 1e18).toFixed(6);
  return `  ${padded} ${gasStr} gas   ~$${costUsd} USD`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer, oracle, renter, provider] = await ethers.getSigners();

  // Deploy MockUSDC
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  // Deploy Escrow
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(await usdc.getAddress(), oracle.address);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();

  // Mint USDC and approve
  const AMOUNT = ethers.parseUnits("10", 6); // 10 USDC
  await usdc.mint(renter.address, ethers.parseUnits("1000000", 6));
  await usdc.connect(renter).approve(escrowAddress, ethers.MaxUint256);

  const latestBlock = await ethers.provider.getBlock("latest");
  const now = Number(latestBlock.timestamp);
  // Mine a fresh block to ensure we have the current timestamp, then set expiry well ahead
  await ethers.provider.send("evm_mine", []);
  const expiry = now + 7200; // 2 hours from current block

  console.log("\n════════════════════════════════════════════════════");
  console.log("  DCP Escrow — Gas Estimates (Hardhat local network)");
  console.log("════════════════════════════════════════════════════");
  console.log(`  Network: hardhat (local)  |  Block: ${await ethers.provider.getBlockNumber()}`);
  console.log(`  Oracle:  ${oracle.address}`);
  console.log(`  Escrow:  ${escrowAddress}`);
  console.log("────────────────────────────────────────────────────\n");

  const results = {};

  // ── Deployment ───────────────────────────────────────────────────────────────
  {
    const EscrowFactory = await ethers.getContractFactory("Escrow");
    const deployTx = await EscrowFactory.getDeployTransaction(await usdc.getAddress(), oracle.address);
    const estimated = await ethers.provider.estimateGas({ ...deployTx, from: deployer.address });
    results["Escrow.sol deployment"] = estimated;
  }

  // ── depositAndLock ───────────────────────────────────────────────────────────
  {
    const JOB_ID = ethers.keccak256(ethers.toUtf8Bytes("gas-estimate-job-1"));
    const tx = await escrow.connect(renter).depositAndLock(JOB_ID, provider.address, AMOUNT, expiry);
    const receipt = await tx.wait();
    results["depositAndLock"] = receipt.gasUsed;
  }

  // ── claimLock ────────────────────────────────────────────────────────────────
  {
    const JOB_ID = ethers.keccak256(ethers.toUtf8Bytes("gas-estimate-job-1"));
    const proof = await oracleSign(escrowAddress, JOB_ID, provider.address, AMOUNT, oracle);
    const tx = await escrow.connect(provider).claimLock(JOB_ID, proof);
    const receipt = await tx.wait();
    results["claimLock (provider claims)"] = receipt.gasUsed;
  }

  // ── cancelExpiredLock ────────────────────────────────────────────────────────
  {
    const JOB_ID = ethers.keccak256(ethers.toUtf8Bytes("gas-estimate-job-cancel"));
    const cancelBlock = await ethers.provider.getBlock("latest");
    // +2 so expiry is strictly > block.timestamp when mined (next block is T+1)
    const pastExpiry = cancelBlock.timestamp + 2;
    await escrow.connect(renter).depositAndLock(JOB_ID, provider.address, AMOUNT, pastExpiry);

    // Fast-forward 10 seconds past the 2-second expiry
    await ethers.provider.send("evm_increaseTime", [10]);
    await ethers.provider.send("evm_mine", []);

    const tx = await escrow.connect(renter).cancelExpiredLock(JOB_ID);
    const receipt = await tx.wait();
    results["cancelExpiredLock (renter refund)"] = receipt.gasUsed;
  }

  // ── setOracle ────────────────────────────────────────────────────────────────
  {
    const tx = await escrow.connect(deployer).setOracle(renter.address);
    const receipt = await tx.wait();
    results["setOracle (admin)"] = receipt.gasUsed;
    // Reset oracle
    await escrow.connect(deployer).setOracle(oracle.address);
  }

  // ── setRelayer ───────────────────────────────────────────────────────────────
  {
    const tx = await escrow.connect(deployer).setRelayer(renter.address);
    const receipt = await tx.wait();
    results["setRelayer (admin)"] = receipt.gasUsed;
  }

  // ── getEscrow (view — no gas on-chain, but estimate for gas reporter) ────────
  {
    const JOB_ID = ethers.keccak256(ethers.toUtf8Bytes("gas-estimate-job-1"));
    const estimated = await escrow.getEscrow.estimateGas(JOB_ID);
    results["getEscrow (view call)"] = estimated;
  }

  // ── Print results ─────────────────────────────────────────────────────────────
  console.log("  Function                          Gas Used    Est. Cost (Base L2)");
  console.log("  ────────────────────────────────  ────────    ───────────────────");
  for (const [label, gas] of Object.entries(results)) {
    console.log(gasRow(label, gas));
  }

  console.log("\n  Note: Gas prices on Base L2 are typically 0.001–0.01 gwei.");
  console.log("  At 0.01 gwei and ETH=$2,500 a depositAndLock costs < $0.01 USD.");
  console.log("\n  Assumptions for cost estimate:");
  console.log("    - Gas price: 0.001 gwei (Base L2 typical)");
  console.log("    - ETH price: $2,500 USD");
  console.log("    - Multiply by 10x for 0.01 gwei scenario");
  console.log("\n════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
