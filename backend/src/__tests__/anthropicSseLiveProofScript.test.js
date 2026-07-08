const fs = require('fs');
const path = require('path');
const {
  buildUrl,
  detectAnthropicSse,
  redactSecret,
} = require('../../tests/anthropic-sse-live-proof');

const scriptPath = path.resolve(__dirname, '../../tests/anthropic-sse-live-proof.js');

describe('anthropic SSE live proof script', () => {
  test('keeps live inference gated and probes the Anthropic messages stream', () => {
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).toContain('DCP_ANTHROPIC_PROOF_ALLOW_LIVE');
    expect(source).toContain('/anthropic/v1/messages');
    expect(source).toContain('anthropic-version');
    expect(source).toContain('text/event-stream');
    expect(source).toContain('message_start');
    expect(source).toContain('message_stop');
    expect(source).toContain('docs/reports/reliability');
  });

  test('detects valid Anthropic SSE frames without requiring provider text in reports', () => {
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1","type":"message"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');
    const result = detectAnthropicSse(sse);
    expect(result.valid).toBe(true);
    expect(result.saw_start).toBe(true);
    expect(result.saw_delta).toBe(true);
    expect(result.saw_stop).toBe(true);
  });

  test('normalizes api base URLs and redacts scoped keys', () => {
    expect(buildUrl('https://api.dcp.sa/api', '/anthropic/v1/messages')).toBe('https://api.dcp.sa/api/anthropic/v1/messages');
    expect(buildUrl('https://dcp.sa', '/anthropic/v1/messages')).toBe('https://dcp.sa/anthropic/v1/messages');
    expect(redactSecret('dcp_test_1234567890')).toBe('dcp_test...7890');
  });
});
