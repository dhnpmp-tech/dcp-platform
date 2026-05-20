/**
 * Tests for OpenAI multimodal content-array support in /v1/chat/completions.
 *
 * The gateway is a dumb proxy for vision: it must accept content arrays
 * (text + image_url parts), pass them through to the upstream provider
 * unchanged, and produce a sane local token estimate that accounts for
 * image parts (~765 tokens per image, per OpenAI's vision spec).
 *
 * Scope: helper-level unit tests via the route module's __test export.
 * A full end-to-end multimodal proxy test would require seeding providers,
 * heartbeats, and model registry rows — out of scope for this PR. The
 * inline parsing logic in router.post('/chat/completions', ...) is
 * covered indirectly by the helper tests + manual smoke (see PR test plan).
 */

'use strict';

process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = 'test-admin-multimodal';
process.env.DC1_HMAC_SECRET = 'test-hmac-secret-multimodal-32-byte-key!!';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { signInWithOtp: jest.fn(), getUser: jest.fn() } })),
}));

const v1Router = require('../../src/routes/v1');
const {
  renderMessageContentForEstimate,
  estimatePromptFromMessages,
  approximateTokenCount,
  VISION_IMAGE_TOKEN_ESTIMATE,
} = v1Router.__test;

describe('multimodal content rendering for token estimate', () => {
  test('string content passes through unchanged', () => {
    expect(renderMessageContentForEstimate('hello world')).toBe('hello world');
  });

  test('empty content returns empty string', () => {
    expect(renderMessageContentForEstimate('')).toBe('');
    expect(renderMessageContentForEstimate(null)).toBe('');
    expect(renderMessageContentForEstimate(undefined)).toBe('');
  });

  test('text-only content array is joined', () => {
    const out = renderMessageContentForEstimate([
      { type: 'text', text: 'foo' },
      { type: 'text', text: 'bar' },
    ]);
    expect(out).toContain('foo');
    expect(out).toContain('bar');
  });

  test('image_url part contributes ~VISION_IMAGE_TOKEN_ESTIMATE tokens', () => {
    const out = renderMessageContentForEstimate([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/...' } },
    ]);
    // approximateTokenCount = ceil(len/4); placeholder is VISION_IMAGE_TOKEN_ESTIMATE*4 chars.
    const tokens = approximateTokenCount(out);
    expect(tokens).toBeGreaterThanOrEqual(VISION_IMAGE_TOKEN_ESTIMATE);
    expect(tokens).toBeLessThanOrEqual(VISION_IMAGE_TOKEN_ESTIMATE + 1);
  });

  test('mixed text + image part gives text tokens plus image estimate', () => {
    const out = renderMessageContentForEstimate([
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: 'http://example.com/cat.jpg' },
    ]);
    const tokens = approximateTokenCount(out);
    // Text alone is < 10 tokens; full output should be roughly text + 765.
    expect(tokens).toBeGreaterThanOrEqual(VISION_IMAGE_TOKEN_ESTIMATE);
  });

  test('unknown part types are ignored', () => {
    const out = renderMessageContentForEstimate([
      { type: 'mystery', payload: 'should be skipped' },
      { type: 'text', text: 'kept' },
    ]);
    expect(out).toBe('kept');
  });

  test('estimatePromptFromMessages handles multimodal mid-conversation', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful vision assistant.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this:' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBOR...' } },
        ],
      },
    ];
    const prompt = estimatePromptFromMessages(messages);
    expect(prompt).toContain('system:');
    expect(prompt).toContain('You are a helpful vision assistant.');
    expect(prompt).toContain('user:');
    expect(prompt).toContain('Describe this:');
    // Image placeholder should make the estimate clear ~765 tokens for the
    // image alone, plus a small amount of text.
    expect(approximateTokenCount(prompt)).toBeGreaterThanOrEqual(VISION_IMAGE_TOKEN_ESTIMATE);
  });
});

describe('multimodal helpers behaviour contract', () => {
  test('VISION_IMAGE_TOKEN_ESTIMATE matches OpenAI vision-spec 765-token figure', () => {
    expect(VISION_IMAGE_TOKEN_ESTIMATE).toBe(765);
  });

  test('image part shape variants (string url vs object) are both accepted', () => {
    const a = renderMessageContentForEstimate([
      { type: 'image_url', image_url: 'http://x/y.jpg' },
    ]);
    const b = renderMessageContentForEstimate([
      { type: 'image_url', image_url: { url: 'http://x/y.jpg' } },
    ]);
    // Same length placeholder regardless of url shape.
    expect(a.length).toBe(b.length);
  });
});
