/**
 * Regression guard: the global express.json body-size limit is clamped to
 * 2MB. A per-route 10MB lane exists only for /api/providers/job-result
 * (SDXL/Stable-Diffusion base64 image results).
 *
 * Tito audit flagged the previous 50MB global limit as a trivial DoS vector
 * (any unauthenticated POST could force a 50MB JSON parse).
 */

const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.resolve(__dirname, '..', '..', 'src', 'server.js');

describe('security: body-size limits', () => {
  const src = fs.readFileSync(SERVER, 'utf8');

  test('no 50mb limit anywhere', () => {
    expect(src).not.toMatch(/limit:\s*['"]50mb['"]/i);
  });

  test('global limit defaults to 2mb', () => {
    expect(src).toMatch(/GLOBAL_BODY_LIMIT\s*=\s*process\.env\.DCP_GLOBAL_BODY_LIMIT\s*\|\|\s*['"]2mb['"]/);
  });

  test('/api/providers/job-result gets its own 10mb parser', () => {
    expect(src).toMatch(/app\.use\(\s*['"]\/api\/providers\/job-result['"]\s*,\s*express\.json\(\s*\{\s*limit:\s*LARGE_BODY_LIMIT/);
  });

  test('large-body route parser is registered BEFORE the global parser', () => {
    const largeIdx = src.indexOf("'/api/providers/job-result'");
    const globalIdx = src.indexOf('express.json({ limit: GLOBAL_BODY_LIMIT })');
    expect(largeIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeGreaterThan(-1);
    expect(largeIdx).toBeLessThan(globalIdx);
  });
});
