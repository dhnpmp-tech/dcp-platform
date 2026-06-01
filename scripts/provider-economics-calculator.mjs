#!/usr/bin/env node
/**
 * provider-economics-calculator.mjs
 *
 * Calculates monthly GPU provider revenue and profit projections for DCP.
 * Based on DCP floor prices from backend/src/config/pricing.js.
 *
 * Usage:
 *   node scripts/provider-economics-calculator.mjs
 *   node scripts/provider-economics-calculator.mjs --gpu "RTX 4090" --count 20 --utilization 70
 */

// DCP floor prices (USD/hr) — 23.7% below Vast.ai per strategic brief
const GPU_PRICES = {
  'RTX 4090':  { dcp_floor: 0.267, vast_ai: 0.350, vram_gb: 24 },
  'RTX 3090':  { dcp_floor: 0.180, vast_ai: 0.240, vram_gb: 24 },
  'RTX 3080':  { dcp_floor: 0.120, vast_ai: 0.160, vram_gb: 10 },
  'RTX 4080':  { dcp_floor: 0.200, vast_ai: 0.265, vram_gb: 16 },
  'RTX 3070':  { dcp_floor: 0.080, vast_ai: 0.105, vram_gb: 8  },
  'A100 80GB': { dcp_floor: 1.490, vast_ai: 1.900, vram_gb: 80 },
  'A100 40GB': { dcp_floor: 0.990, vast_ai: 1.250, vram_gb: 40 },
  'H100':      { dcp_floor: 2.490, vast_ai: 3.100, vram_gb: 80 },
};

// Electricity cost per kWh by region (USD)
const ELECTRICITY_COSTS = {
  'Saudi Arabia': 0.048,
  'UAE':          0.080,
  'US (avg)':     0.120,
  'EU (avg)':     0.230,
  'UK':           0.290,
};

// Typical GPU power draw (watts) at load
const GPU_POWER_W = {
  'RTX 4090':  450,
  'RTX 3090':  350,
  'RTX 3080':  320,
  'RTX 4080':  320,
  'RTX 3070':  220,
  'A100 80GB': 400,
  'A100 40GB': 300,
  'H100':      700,
};

// DCP takes 25% commission; provider earns 75%
const PROVIDER_SHARE = 0.75;
const HOURS_PER_MONTH = 730;

function calcEconomics({ gpu, count, utilizationPct, region }) {
  const prices = GPU_PRICES[gpu];
  const powerW = GPU_POWER_W[gpu];
  const kwh = ELECTRICITY_COSTS[region];

  if (!prices || !powerW || !kwh === undefined) return null;

  const hoursUtilized = HOURS_PER_MONTH * (utilizationPct / 100);

  // Revenue
  const grossRevenue = prices.dcp_floor * count * hoursUtilized;
  const providerRevenue = grossRevenue * PROVIDER_SHARE;

  // Electricity cost (power at load during utilization + idle draw ~20% at rest)
  const idleHours = HOURS_PER_MONTH - hoursUtilized;
  const kwhActive = (powerW / 1000) * count * hoursUtilized;
  const kwhIdle   = (powerW * 0.20 / 1000) * count * idleHours;
  const electricityCost = (kwhActive + kwhIdle) * kwh;

  // Profit
  const profit = providerRevenue - electricityCost;
  const roi = electricityCost > 0 ? (profit / electricityCost) * 100 : Infinity;

  return {
    gpu, count, utilizationPct, region,
    grossRevenue, providerRevenue, electricityCost, profit, roi,
    perGpuProfit: profit / count,
  };
}

function fmt(n) { return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); }
function pct(n) { return n.toFixed(1) + '%'; }

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const cliGpu   = getArg('--gpu');
const cliCount = getArg('--count');
const cliUtil  = getArg('--utilization');
const cliRegion= getArg('--region');

if (cliGpu) {
  // Single calculation
  const gpu    = cliGpu;
  const count  = parseInt(cliCount || '1', 10);
  const util   = parseInt(cliUtil  || '70', 10);
  const region = cliRegion || 'Saudi Arabia';

  if (!GPU_PRICES[gpu]) {
    console.error(`Unknown GPU: "${gpu}". Valid options: ${Object.keys(GPU_PRICES).join(', ')}`);
    process.exit(1);
  }

  const r = calcEconomics({ gpu, count, utilizationPct: util, region });
  console.log(`\nDCP Provider Economics: ${count}x ${gpu} in ${region} @ ${util}% utilization\n`);
  console.log(`  Floor price:        $${GPU_PRICES[gpu].dcp_floor}/hr (vs Vast.ai $${GPU_PRICES[gpu].vast_ai}/hr)`);
  console.log(`  Gross revenue:      ${fmt(r.grossRevenue)}/mo`);
  console.log(`  Provider share:     ${fmt(r.providerRevenue)}/mo  (75% after DCP 25% commission)`);
  console.log(`  Electricity cost:   ${fmt(r.electricityCost)}/mo  ($${ELECTRICITY_COSTS[region]}/kWh)`);
  console.log(`  NET PROFIT:         ${fmt(r.profit)}/mo`);
  console.log(`  Per-GPU profit:     ${fmt(r.perGpuProfit)}/GPU/mo`);
  console.log(`  Electricity ROI:    ${pct(r.roi)}`);
} else {
  // Full report: internet cafe scenarios per strategic brief
  console.log('\n=== DCP PROVIDER ECONOMICS CALCULATOR ===');
  console.log('Based on DCP floor prices from Pricing Guide (March 2026)\n');

  // Scenario table: 20-GPU internet cafe
  console.log('--- INTERNET CAFE SCENARIO: 20-GPU Setup ---\n');
  console.log('  GPU             | Saudi Arabia | US (avg)  | EU (avg)');
  console.log('  ─────────────────────────────────────────────────────');

  for (const [gpu, _] of Object.entries(GPU_PRICES)) {
    const sa = calcEconomics({ gpu, count: 20, utilizationPct: 70, region: 'Saudi Arabia' });
    const us = calcEconomics({ gpu, count: 20, utilizationPct: 70, region: 'US (avg)' });
    const eu = calcEconomics({ gpu, count: 20, utilizationPct: 70, region: 'EU (avg)' });
    const pad = (s, n) => s.padEnd(n);
    console.log(`  ${pad(gpu, 15)} | ${pad(fmt(sa.profit), 12)} | ${pad(fmt(us.profit), 9)} | ${fmt(eu.profit)}`);
  }

  console.log('\n--- STRATEGIC BRIEF TARGETS: RTX 4090 ---\n');
  const configs = [
    { count: 5,  label: 'Small cafe (5 GPUs)' },
    { count: 20, label: 'Internet cafe (20 GPUs)' },
    { count: 50, label: 'University lab (50 GPUs)' },
    { count: 100,label: 'Server farm (100 GPUs)' },
  ];

  for (const { count, label } of configs) {
    const sa50 = calcEconomics({ gpu: 'RTX 4090', count, utilizationPct: 50, region: 'Saudi Arabia' });
    const sa70 = calcEconomics({ gpu: 'RTX 4090', count, utilizationPct: 70, region: 'Saudi Arabia' });
    const sa90 = calcEconomics({ gpu: 'RTX 4090', count, utilizationPct: 90, region: 'Saudi Arabia' });
    console.log(`  ${label}:`);
    console.log(`    50% util → ${fmt(sa50.profit)}/mo profit  |  70% → ${fmt(sa70.profit)}/mo  |  90% → ${fmt(sa90.profit)}/mo`);
  }

  console.log('\n--- STRATEGIC BRIEF RANGE (20x RTX 4090, Saudi Arabia) ---');
  const low  = calcEconomics({ gpu: 'RTX 4090', count: 20, utilizationPct: 50, region: 'Saudi Arabia' });
  const high = calcEconomics({ gpu: 'RTX 4090', count: 20, utilizationPct: 70, region: 'Saudi Arabia' });
  const sa80 = calcEconomics({ gpu: 'RTX 4090', count: 20, utilizationPct: 80, region: 'Saudi Arabia' });
  const sa90 = calcEconomics({ gpu: 'RTX 4090', count: 20, utilizationPct: 90, region: 'Saudi Arabia' });
  console.log(`  Strategic brief target: $2,140 - $2,980/mo`);
  console.log(`  @ 70-80% utilization:   ${fmt(high.profit)} - ${fmt(sa80.profit)}/mo`);
  console.log(`  @ 80-90% utilization:   ${fmt(sa80.profit)} - ${fmt(sa90.profit)}/mo`);

  console.log('Usage: node scripts/provider-economics-calculator.mjs --gpu "RTX 4090" --count 20 --utilization 70 --region "Saudi Arabia"');
  console.log('');
}
