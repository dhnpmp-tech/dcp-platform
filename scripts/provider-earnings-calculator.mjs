#!/usr/bin/env node

/**
 * DCP Provider Earnings Calculator
 * Calculates monthly and yearly earnings for GPU providers at various utilization rates
 *
 * Usage:
 *   node scripts/provider-earnings-calculator.mjs --gpu rtx-4090 --utilization 70 --hours-per-day 20
 *   node scripts/provider-earnings-calculator.mjs --gpu h100 --utilization 80
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// GPU pricing data from platform pricing model
// Monthly revenue at baseline utilization (typically 70% for mid-range scenarios)
const GPU_PRICING = {
  'rtx-4090': {
    name: 'RTX 4090',
    monthly_revenue_usd_at_70pct: 265, // $180-350/mo baseline
    monthly_electricity_usd: 30, // $25-35/mo baseline
    vram_gb: 24,
    tier: 'a',
    segment: 'internet-cafe'
  },
  'rtx-4080': {
    name: 'RTX 4080',
    monthly_revenue_usd_at_70pct: 185, // $120-250/mo baseline
    monthly_electricity_usd: 25, // $20-30/mo baseline
    vram_gb: 16,
    tier: 'a',
    segment: 'gaming-centre'
  },
  'rtx-3090-ti': {
    name: 'RTX 3090 Ti',
    monthly_revenue_usd_at_70pct: 145, // extrapolated
    monthly_electricity_usd: 22,
    vram_gb: 24,
    tier: 'a',
    segment: 'internet-cafe'
  },
  'l40s': {
    name: 'NVIDIA L40S',
    monthly_revenue_usd_at_70pct: 380,
    monthly_electricity_usd: 35,
    vram_gb: 48,
    tier: 'a+',
    segment: 'dedicated-rack'
  },
  'a100-40gb': {
    name: 'NVIDIA A100 (40GB)',
    monthly_revenue_usd_at_70pct: 620,
    monthly_electricity_usd: 55,
    vram_gb: 40,
    tier: 'b',
    segment: 'dedicated-rack'
  },
  'h100': {
    name: 'NVIDIA H100 (80GB)',
    monthly_revenue_usd_at_70pct: 2650, // $1800-3500/mo baseline
    monthly_electricity_usd: 200, // $150-250/mo baseline
    vram_gb: 80,
    tier: 'b',
    segment: 'dedicated-rack'
  },
  'h200': {
    name: 'NVIDIA H200 (141GB)',
    monthly_revenue_usd_at_70pct: 3500, // $2500-4500/mo baseline
    monthly_electricity_usd: 240, // $180-300/mo baseline
    vram_gb: 141,
    tier: 'b',
    segment: 'dedicated-rack'
  }
};

// USD to SAR conversion rate
const USD_TO_SAR = 3.75;

// Platform take rate
const PLATFORM_TAKE_RATE = 0.15;

// GPU purchase prices (for payback period calculation)
const GPU_PURCHASE_PRICES = {
  'rtx-4090': 1600,
  'rtx-4080': 800,
  'rtx-3090-ti': 1200,
  'l40s': 2800,
  'a100-40gb': 10000,
  'h100': 30000,
  'h200': 40000
};

/**
 * Calculate earnings for a GPU at a given utilization rate
 * @param {string} gpuModel - GPU model key
 * @param {number} utilizationPct - Utilization percentage (0-100)
 * @param {number} hoursPerDay - Hours per day the GPU is active (default 20)
 * @returns {object} Earnings breakdown
 */
function calculateEarnings(gpuModel, utilizationPct = 70, hoursPerDay = 20) {
  if (!GPU_PRICING[gpuModel]) {
    throw new Error(`Unknown GPU model: ${gpuModel}. Available: ${Object.keys(GPU_PRICING).join(', ')}`);
  }

  const gpu = GPU_PRICING[gpuModel];
  const utilizationFactor = utilizationPct / 70; // Normalize from 70% baseline

  // Calculate monthly metrics
  // Hours per month = days per month * hours per day * utilization factor
  const hoursPerMonth = 30 * hoursPerDay * (utilizationPct / 100);

  // Revenue calculation
  // Base revenue at 70% is given; scale it for actual utilization
  const monthlyRevenueUsd = gpu.monthly_revenue_usd_at_70pct * utilizationFactor;

  // Electricity costs (pro-rated with utilization)
  const monthlyElectricityUsd = gpu.monthly_electricity_usd * utilizationFactor;

  // Provider receives 85% after 15% platform fee
  const platformFeeUsd = monthlyRevenueUsd * PLATFORM_TAKE_RATE;
  const providerMonthlyUsd = monthlyRevenueUsd * (1 - PLATFORM_TAKE_RATE);

  // Net profit (after electricity)
  const netMonthlyUsd = providerMonthlyUsd - monthlyElectricityUsd;

  // Annual metrics
  const netYearlyUsd = netMonthlyUsd * 12;

  // SAR conversion
  const monthlyRevenueSar = monthlyRevenueUsd * USD_TO_SAR;
  const netMonthlySar = netMonthlyUsd * USD_TO_SAR;
  const netYearlySar = netYearlyUsd * USD_TO_SAR;

  // Payback period (months to recoup GPU cost)
  const gpuPrice = GPU_PURCHASE_PRICES[gpuModel] || 0;
  const paybackMonths = gpuPrice > 0 ? Math.ceil(gpuPrice / netMonthlyUsd) : 0;

  // Hourly rate
  const hourlyRate = monthlyRevenueUsd / hoursPerMonth;

  return {
    gpu: gpu.name,
    gpuKey: gpuModel,
    utilization_pct: utilizationPct,
    hours_per_day: hoursPerDay,
    hours_per_month: Math.round(hoursPerMonth * 100) / 100,
    // Revenue
    monthly_revenue_usd: Math.round(monthlyRevenueUsd * 100) / 100,
    yearly_revenue_usd: Math.round(monthlyRevenueUsd * 12 * 100) / 100,
    // Costs
    monthly_electricity_usd: Math.round(monthlyElectricityUsd * 100) / 100,
    yearly_electricity_usd: Math.round(monthlyElectricityUsd * 12 * 100) / 100,
    // Platform fee
    monthly_platform_fee_usd: Math.round(platformFeeUsd * 100) / 100,
    yearly_platform_fee_usd: Math.round(platformFeeUsd * 12 * 100) / 100,
    // Provider net (after platform fee and electricity)
    net_monthly_usd: Math.round(netMonthlyUsd * 100) / 100,
    net_yearly_usd: Math.round(netYearlyUsd * 100) / 100,
    // SAR equivalents
    net_monthly_sar: Math.round(netMonthlySar * 100) / 100,
    net_yearly_sar: Math.round(netYearlySar * 100) / 100,
    // Hourly rate (buyer pays)
    hourly_rate_usd: Math.round(hourlyRate * 100) / 100,
    // Payback period
    gpu_price_usd: gpuPrice,
    payback_months: paybackMonths,
    payback_days: Math.round((paybackMonths % 1) * 30)
  };
}

/**
 * Generate reference table for documentation
 */
function generateReferenceTable() {
  const utilizationLevels = [50, 70, 90];
  const table = [];

  for (const [key, gpu] of Object.entries(GPU_PRICING)) {
    const row = {
      gpu: gpu.name,
      gpuKey: key,
      vram: gpu.vram_gb,
      tier: gpu.tier,
      segment: gpu.segment,
      earnings: {}
    };

    for (const util of utilizationLevels) {
      const earnings = calculateEarnings(key, util);
      row.earnings[util] = earnings;
    }

    table.push(row);
  }

  return table;
}

/**
 * Pretty print earnings
 */
function printEarnings(earnings) {
  console.log(`\n💰 ${earnings.gpu} Earnings Calculator`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Utilization: ${earnings.utilization_pct}% | Hours/day: ${earnings.hours_per_day}`);
  console.log(`\nMonthly:`);
  console.log(`  Revenue:        $${earnings.monthly_revenue_usd} (SR${Math.round(earnings.monthly_revenue_usd * USD_TO_SAR)})`);
  console.log(`  Electricity:    -$${earnings.monthly_electricity_usd}`);
  console.log(`  Platform fee:   -$${earnings.monthly_platform_fee_usd} (15%)`);
  console.log(`  ────────────────`);
  console.log(`  Net profit:     $${earnings.net_monthly_usd} (SR${earnings.net_monthly_sar})`);
  console.log(`\nYearly:`);
  console.log(`  Net profit:     $${earnings.net_yearly_usd} (SR${earnings.net_yearly_sar})`);
  console.log(`\nPayback Period: ${earnings.payback_months}mo ${earnings.payback_days}d`);
  console.log(`Hourly Rate (buyer pays): $${earnings.hourly_rate_usd}/hr\n`);
}

/**
 * CLI interface
 */
function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    options[key] = value;
  }

  // Default values
  const gpuModel = options.gpu || 'rtx-4090';
  const utilization = parseInt(options.utilization || options.util) || 70;
  const hoursPerDay = parseInt(options['hours-per-day'] || options.hours) || 20;

  try {
    const earnings = calculateEarnings(gpuModel, utilization, hoursPerDay);
    printEarnings(earnings);

    // If only one model, also show reference table
    if (options.all) {
      console.log('\n📊 Reference Table: All GPU Models at 70% Utilization (20 hrs/day)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const reference = generateReferenceTable();
      for (const entry of reference) {
        const e = entry.earnings[70];
        console.log(`${entry.gpu.padEnd(25)} | $${e.net_monthly_usd.toString().padEnd(7)} /mo | SR${e.net_monthly_sar.toString().padEnd(9)} /mo | $${e.hourly_rate_usd}/hr`);
      }
    }

    // Export as JSON if requested
    if (options.json) {
      console.log(JSON.stringify(earnings, null, 2));
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Export functions for use as module
export { calculateEarnings, generateReferenceTable, GPU_PRICING, USD_TO_SAR, PLATFORM_TAKE_RATE };

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
