const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildUrl,
  detectOpenAiSse,
  redactSecret,
  run,
} = require('../../tests/openai-sse-live-proof');

const scriptPath = path.resolve(__dirname, '../../tests/openai-sse-live-proof.js');

describe('OpenAI-compatible SSE live proof script', () => {
  test('keeps live inference gated and probes the OpenAI chat completions stream', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).toContain('DCP_OPENAI_SSE_PROOF_ALLOW_LIVE');
    expect(source).toContain('/v1/chat/completions');
    expect(source).toContain('text/event-stream');
    expect(source).toContain('data: [DONE]');
    expect(source).toContain('docs/reports/reliability');
  });

  test('detects valid OpenAI SSE frames without requiring provider text in reports', () => {
    const sse = [
      'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"allam-2-7b","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"allam-2-7b","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}',
      '',
      'data: {"id":"chatcmpl_1","object":"chat.completion.chunk","model":"allam-2-7b","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const result = detectOpenAiSse(sse);
    expect(result.valid).toBe(true);
    expect(result.saw_delta).toBe(true);
    expect(result.saw_done).toBe(true);
    expect(result.delta_count).toBe(2);
    expect(result.model_ids).toContain('allam-2-7b');
  });

  test('normalizes api base URLs and redacts scoped keys', () => {
    expect(buildUrl('https://api.dcp.sa/api', '/api/pods')).toBe('https://api.dcp.sa/api/pods');
    expect(buildUrl('https://api.dcp.sa/api', '/v1/chat/completions')).toBe('https://api.dcp.sa/v1/chat/completions');
    expect(buildUrl('https://dcp.sa', '/v1/chat/completions')).toBe('https://dcp.sa/v1/chat/completions');
    expect(redactSecret('dcp_test_1234567890')).toBe('dcp_test...7890');
  });

  test('writes a blocked report by default without running paid inference', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openai-sse-proof-'));
    const { report, exitCode } = await run({ outputDir });

    expect(exitCode).toBe(2);
    expect(report.verdict).toBe('FAIL');
    expect(report.failure).toMatchObject({
      code: 'LIVE_PROOF_NOT_ENABLED',
    });
    expect(report.command).toBe('DCP_OPENAI_SSE_PROOF_ALLOW_LIVE=1 npm run proof:openai-sse');
    expect(fs.existsSync(path.join(outputDir, 'openai-sse-live-proof-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'openai-sse-live-proof-latest.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'openai-sse-live-proof-latest.log'))).toBe(true);
  });
});
