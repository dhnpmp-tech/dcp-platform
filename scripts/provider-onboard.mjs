#!/usr/bin/env node

/**
 * DCP Provider Onboarding CLI
 *
 * One-command provider setup: from zero to active in ~5 minutes
 * Guides a provider through GPU verification, registration, and initial setup.
 *
 * Usage:
 *   node provider-onboard.mjs
 *   DCP_API_URL=https://api.custom.com node provider-onboard.mjs
 *
 * Environment:
 *   DCP_API_URL - API base URL (default: https://api.dcp.sa)
 */

import https from 'https';
import { createReadStream, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Configuration
const DCP_API_URL = process.env.DCP_API_URL || 'https://api.dcp.sa';
const RESULTS_FILE = 'dcp-onboarding-results.json';

// Get directory of current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Utilities ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function prompt(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

function printBanner() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                    🚀 DCP PROVIDER ONBOARDING                         ║
║                                                                       ║
║  Transform your GPU into passive income with DCP compute marketplace  ║
╚═══════════════════════════════════════════════════════════════════════╝
`);
}

function printSuccess(message) {
  console.log(`✓ ${message}`);
}

function printError(message) {
  console.error(`✗ ${message}`);
}

function printInfo(message) {
  console.log(`ℹ ${message}`);
}

function printWarning(message) {
  console.log(`⚠ ${message}`);
}

// ── Prerequisite Checks ───────────────────────────────────────────────

async function checkNvidiaSmi() {
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader | head -1');
    return { success: true, gpuName: stdout.trim() };
  } catch (error) {
    return { success: false, error: 'nvidia-smi not found. Ensure NVIDIA GPU drivers are installed.' };
  }
}

async function checkInternetConnectivity() {
  try {
    // Try to reach a simple endpoint without full HTTPS verification for quick check
    return new Promise((resolve) => {
      const req = https.get(DCP_API_URL + '/api/health', { timeout: 5000 }, (res) => {
        resolve({ success: res.statusCode >= 200 && res.statusCode < 500 });
      });
      req.on('error', () => resolve({ success: false }));
      req.setTimeout(5000, () => {
        req.abort();
        resolve({ success: false });
      });
    });
  } catch (error) {
    return { success: false };
  }
}

async function checkNodejs() {
  try {
    const { stdout } = await execAsync('node --version');
    const version = stdout.trim();
    return { success: true, version };
  } catch (error) {
    return { success: false, error: 'Node.js not found in PATH' };
  }
}

async function detectOS() {
  const osType = platform();
  const osMap = {
    'linux': 'linux',
    'darwin': 'darwin',
    'win32': 'windows',
  };
  return osMap[osType] || 'linux';
}

// ── GPU Benchmark ────────────────────────────────────────────────────

async function runGpuBenchmark() {
  try {
    console.log('\n🔍 Running GPU benchmark...\n');

    const benchmarkScript = path.join(__dirname, 'provider-gpu-benchmark.mjs');
    if (!existsSync(benchmarkScript)) {
      printError('GPU benchmark script not found at ' + benchmarkScript);
      return null;
    }

    const { stdout, stderr } = await execAsync(`node "${benchmarkScript}"`, {
      timeout: 120000, // 2 minutes timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Parse the JSON benchmark report from stdout
    const lines = stdout.split('\n');
    let jsonLine = '';
    let inJson = false;

    for (const line of lines) {
      if (line.includes('{') && line.includes('}')) {
        jsonLine = line;
        break;
      }
      if (line.includes('{')) {
        inJson = true;
      }
      if (inJson) {
        jsonLine += line;
      }
      if (inJson && line.includes('}')) {
        break;
      }
    }

    if (jsonLine) {
      try {
        const benchmark = JSON.parse(jsonLine);
        return benchmark;
      } catch (e) {
        printError('Failed to parse benchmark results: ' + e.message);
        return null;
      }
    }

    printError('Benchmark did not produce valid output');
    return null;
  } catch (error) {
    printError('GPU benchmark failed: ' + error.message);
    return null;
  }
}

// ── Provider Earnings Calculation ─────────────────────────────────────

function estimateMonthlyEarnings(tier, gpuModel, vram) {
  // Based on strategic brief pricing
  const tierRates = {
    'A': 0.45,  // Enterprise: H100/H200 - $0.45/hr
    'B': 0.30,  // High-end: RTX 4090/4080 - $0.30/hr
    'C': 0.15,  // Standard: RTX 3090/4070 - $0.15/hr
  };

  const hourlyRate = tierRates[tier] || 0.15;
  const hoursPerMonth = 730; // Average hours per month
  const utilizationRate = 0.70; // 70% utilization assumption

  return {
    hourlyRate,
    estimatedMonthlyEarnings: (hourlyRate * hoursPerMonth * utilizationRate).toFixed(2),
    utilizationAssumption: '70% utilization',
    hourlyRate: hourlyRate.toFixed(2),
  };
}

// ── API Calls ──────────────────────────────────────────────────────────

function apiRequest(method, endpoint, data = null, apiKey = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, DCP_API_URL);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'DCP-Provider-CLI/1.0',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const bodyString = data ? JSON.stringify(data) : null;
    if (bodyString) {
      headers['Content-Length'] = Buffer.byteLength(bodyString);
    }

    const options = {
      method,
      headers,
      timeout: 30000, // 30 second timeout
    };

    const req = https.request(url, options, (res) => {
      let responseBody = '';

      res.on('data', chunk => {
        responseBody += chunk;
      });

      res.on('end', () => {
        try {
          const responseData = responseBody ? JSON.parse(responseBody) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, status: res.statusCode, data: responseData });
          } else {
            resolve({ success: false, status: res.statusCode, data: responseData });
          }
        } catch (e) {
          resolve({ success: false, status: res.statusCode, error: 'Invalid JSON response', body: responseBody });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('API request timeout'));
    });

    if (bodyString) {
      req.write(bodyString);
    }

    req.end();
  });
}

// ── Main Flow ──────────────────────────────────────────────────────────

async function main() {
  try {
    printBanner();

    // ── Step 1: Check Prerequisites ───
    console.log('📋 Checking prerequisites...\n');

    // Check Node.js
    const nodeCheck = await checkNodejs();
    if (nodeCheck.success) {
      printSuccess(`Node.js ${nodeCheck.version}`);
    } else {
      printError(nodeCheck.error);
      process.exit(1);
    }

    // Check NVIDIA GPU
    const gpuCheck = await checkNvidiaSmi();
    if (gpuCheck.success) {
      printSuccess(`NVIDIA GPU detected: ${gpuCheck.gpuName}`);
    } else {
      printError(gpuCheck.error);
      process.exit(1);
    }

    // Check internet (non-blocking)
    const internetCheck = await checkInternetConnectivity();
    if (internetCheck.success) {
      printSuccess(`Internet connectivity to ${DCP_API_URL}`);
    } else {
      printWarning('Could not reach DCP API - will save results for manual submission');
    }

    // Detect OS
    const detectedOS = await detectOS();
    printSuccess(`Operating system: ${detectedOS}`);

    // ── Step 2: Run GPU Benchmark ────
    const benchmark = await runGpuBenchmark();
    if (!benchmark) {
      printError('GPU benchmark failed. Cannot proceed.');
      process.exit(1);
    }

    console.log('\n📊 Benchmark Results:\n');
    console.log(`  GPU Model:       ${benchmark.gpu_model}`);
    console.log(`  VRAM:            ${benchmark.vram_gb}GB`);
    console.log(`  TFLOPS:          ${benchmark.tflops}`);
    console.log(`  Memory BW:       ${benchmark.bandwidth_gbps} GB/s`);
    console.log(`  Token Throughput: ${benchmark.tokens_per_sec} tokens/sec`);
    console.log(`  Assigned Tier:   ${benchmark.tier}`);

    const earnings = estimateMonthlyEarnings(benchmark.tier, benchmark.gpu_model, benchmark.vram_gb);
    console.log(`\n💰 Estimated Monthly Earnings (70% utilization):`);
    console.log(`  ${earnings.estimatedMonthlyEarnings} SAR/month (at ${earnings.hourlyRate} SAR/hour)`);

    // ── Step 3: Ask for Registration ─
    const proceed = await prompt('\n\nRegister as a DCP provider? (y/n): ', 'y');
    if (proceed.toLowerCase() !== 'y') {
      printInfo('Onboarding cancelled.');
      process.exit(0);
    }

    // ── Step 4: Collect Provider Info ─
    console.log('\n📝 Please provide your information:\n');

    const name = await prompt('  Provider Name: ');
    if (!name) {
      printError('Provider name is required');
      process.exit(1);
    }

    const email = await prompt('  Email Address: ');
    if (!email || !email.includes('@')) {
      printError('Valid email address is required');
      process.exit(1);
    }

    const location = await prompt('  Location (City/Country): ');

    // ── Step 5: Register Provider ────
    console.log('\n📤 Registering with DCP...\n');

    const registrationPayload = {
      name,
      email,
      gpu_model: benchmark.gpu_model,
      os: detectedOS,
      phone: '', // Optional
      resource_spec: {
        vram_gb: benchmark.vram_gb,
        tflops: benchmark.tflops,
        tier: benchmark.tier,
      },
    };

    let providerId, apiKey, registrationResponse;

    try {
      registrationResponse = await apiRequest('POST', '/api/providers/register', registrationPayload);

      if (!registrationResponse.success) {
        if (registrationResponse.status === 409) {
          printError('A provider with this email already exists. Please use a different email.');
          process.exit(1);
        }
        throw new Error(registrationResponse.data?.error || 'Registration failed');
      }

      providerId = registrationResponse.data.provider_id;
      apiKey = registrationResponse.data.api_key;

      printSuccess(`Provider registered (ID: ${providerId})`);
      printSuccess(`API Key: ${apiKey}`);
    } catch (error) {
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        printWarning('Could not reach DCP API. Saving results to ' + RESULTS_FILE);
        // Save offline results
        const offlineResults = {
          status: 'offline_registration',
          timestamp: new Date().toISOString(),
          registration: registrationPayload,
          benchmark,
          savedAt: new Date().toISOString(),
        };
        writeFileSync(RESULTS_FILE, JSON.stringify(offlineResults, null, 2));
        printInfo('You can submit results later by sending: ' + RESULTS_FILE + ' to support@dcp.sa');
        process.exit(0);
      }
      printError(`Registration failed: ${error.message}`);
      process.exit(1);
    }

    // ── Step 6: Submit Benchmark ─────
    console.log('\n📊 Submitting benchmark results...\n');

    try {
      const benchmarkResponse = await apiRequest(
        'POST',
        `/api/providers/${providerId}/benchmark`,
        benchmark,
        apiKey
      );

      if (!benchmarkResponse.success) {
        printWarning(`Benchmark submission: ${benchmarkResponse.data?.error || 'Status: ' + benchmarkResponse.status}`);
      } else {
        printSuccess('Benchmark submitted successfully');
      }
    } catch (error) {
      printWarning(`Benchmark submission failed: ${error.message}`);
    }

    // ── Step 7: Show Success ──────────
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║           🎉 WELCOME TO DCP! YOU\'RE ALL SET 🎉               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`Provider ID:     ${providerId}`);
    console.log(`API Key:         ${apiKey}`);
    console.log(`GPU Tier:        ${benchmark.tier}`);
    console.log(`Monthly Est:     ${earnings.estimatedMonthlyEarnings} SAR\n`);

    console.log('⚠️  IMPORTANT: Save your API key somewhere safe. You will need it to start serving jobs.\n');

    // ── Step 8: Show Next Steps ──────
    console.log('📚 Next Steps:\n');
    console.log('  1. Download the DCP provider daemon');
    console.log('  2. Configure your API key and provider ID');
    console.log('  3. Start serving jobs and earn passively\n');

    console.log('Documentation: https://dcp.sa/docs/provider-guide');
    console.log('💬 Support: support@dcp.sa\n');

    // Save results to local file for backup
    const finalResults = {
      status: 'registered',
      providerId,
      apiKey,
      gpuModel: benchmark.gpu_model,
      tier: benchmark.tier,
      timestamp: new Date().toISOString(),
      providerInfo: {
        name,
        email,
        location,
      },
    };

    writeFileSync('dcp-provider-config.json', JSON.stringify(finalResults, null, 2));
    printSuccess(`Configuration saved to dcp-provider-config.json`);

    process.exit(0);
  } catch (error) {
    printError(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
