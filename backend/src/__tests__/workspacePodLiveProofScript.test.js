const fs = require('fs');
const path = require('path');
const {
  buildJupyterContentsUrl,
  buildUrl,
  encodeJupyterPath,
  redactSecret,
} = require('../../tests/workspace-pod-live-proof');

const scriptPath = path.resolve(__dirname, '../../tests/workspace-pod-live-proof.js');

describe('workspace pod live proof script', () => {
  test('keeps live launch gated and covers the full upload-to-Jupyter proof path', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).toContain('DCP_WORKSPACE_POD_ALLOW_LAUNCH');
    expect(source).toContain('/api/workspace/upload-url');
    expect(source).toContain('putObject(upload.json.url');
    expect(source).toContain('/api/workspace/files?prefix=');
    expect(source).toContain('/api/pods');
    expect(source).toContain('/api/contents/');
    expect(source).toContain('DELETE');
    expect(source).toContain('docs/reports/reliability');
    expect(source).toContain('DCP_WORKSPACE_POD_KEEP_RUNNING');
  });

  test('builds safe URLs for api-base variants and Jupyter nested paths', () => {
    expect(buildUrl('https://api.dcp.sa/api', '/api/pods')).toBe('https://api.dcp.sa/api/pods');
    expect(buildUrl('https://dcp.sa', '/api/pods')).toBe('https://dcp.sa/api/pods');
    expect(encodeJupyterPath('smoke/workspace-pod/a b.txt')).toBe('smoke/workspace-pod/a%20b.txt');
    const proof = buildJupyterContentsUrl('https://api.dcp.sa:41001/?token=secret-token', 'smoke/workspace-pod/a b.txt');
    expect(proof.url).toBe('https://api.dcp.sa:41001/api/contents/smoke/workspace-pod/a%20b.txt?content=1&token=secret-token');
    expect(proof.redacted_url).toContain(redactSecret('secret-token'));
    expect(proof.redacted_url).not.toContain('secret-token');
  });
});
