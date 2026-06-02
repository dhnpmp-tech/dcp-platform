'use strict';

const fs = require('fs');
const path = require('path');

describe('v1 settlement wiring', () => {
  const sourcePath = path.join(__dirname, '../../src/routes/v1.js');
  const source = fs.readFileSync(sourcePath, 'utf8');

  test('routes inference balance debits through billingService.settleInferenceOnce', () => {
    expect(source).toContain('billingService.settleInferenceOnce');
    expect(source).not.toMatch(/UPDATE\s+renters\s+SET\s+balance_halala\s*=\s*balance_halala\s*-/i);
  });

  test('queued job fallback waits until completion before settlement', () => {
    const fallbackStart = source.indexOf('// Fallback: create job in queue');
    const pollingStart = source.indexOf('// Poll for completion', fallbackStart);
    const completionStart = source.indexOf("if (job.status === 'completed')", pollingStart);
    const fallbackSetup = source.slice(fallbackStart, pollingStart);
    const completionPath = source.slice(completionStart, source.indexOf("if (['failed'", completionStart));

    expect(fallbackStart).toBeGreaterThan(-1);
    expect(pollingStart).toBeGreaterThan(fallbackStart);
    expect(completionStart).toBeGreaterThan(pollingStart);
    expect(fallbackSetup).toContain('Do not debit or reserve balance here');
    expect(fallbackSetup).not.toMatch(/balance_halala\s*=\s*balance_halala\s*-/i);
    expect(completionPath).toContain('debitAndPersistUsage');
  });
});
