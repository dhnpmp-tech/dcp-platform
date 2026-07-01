/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // Use an in-memory SQLite DB for all tests — keeps tests isolated from production data
  testEnvironmentOptions: {},
  globals: {},
  // Set DC1_DB_PATH before any module is loaded in each test worker
  setupFiles: ['<rootDir>/tests/jest-setup.js'],
  // Run tests sequentially (SQLite in-memory is per-process)
  testPathIgnorePatterns: [
    '/node_modules/',
    // Standalone Node harness scripts — they call process.exit() and are run via dedicated npm scripts
    'dcp-922-vllm-inference-proxy.test.js',
    'dcp-907-heartbeat-job-queue.test.js',
    'dcp-892-heartbeat-metrics.test.js',
    'g47-heartbeat-is-paused.test.js',
    'provider-install-token.test.js',
    'provider-me.test.js',
    'transactions.test.js',
    'e2e-rvin.test.js',
    'windows-installer.test.js',
    // node:test suites (not Jest describe/it)
    'billing-split-fix.test.js',
    'billing-lifecycle.test.js',
    'reconciliation.test.js',
    'recovery.test.js',
    'job-scheduler.test.js',
    'job-scheduler-integration.test.js',
    'job-scheduler-unit.test.js',
    'jobs-schema-fix.test.js',
    'fallback.test.js',
    'renter-dashboard-api.test.js',
  ],
};
