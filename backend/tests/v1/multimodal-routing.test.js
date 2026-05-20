/**
 * Tests for the upstream-message build path used by /v1/chat/completions.
 *
 * Sibling to multimodal-passthrough.test.js (which covers the local token-
 * estimator). This file covers the OTHER half of PR #409: the renter-
 * supplied `messages` array must be normalised into the body that the
 * gateway forwards to the upstream provider, and a multimodal `content`
 * array MUST survive that normalisation as an array (not stringified).
 *
 * Regression target: the original handler had a single inline loop that
 * stringified content via normalizeString. PR #409 added an Array.isArray
 * branch. If a future refactor accidentally drops that branch, content
 * arrays would silently become empty strings and vision routing would
 * fail with a 400 — but only against live providers, which CI doesn't
 * have. This test catches that statically.
 */

'use strict';

// Required env for `require('../../src/routes/v1')` (same shape used by
// multimodal-passthrough.test.js).
process.env.DC1_DB_PATH = ':memory:';
process.env.DC1_ADMIN_TOKEN = 'test-admin-multimodal-routing';
process.env.DC1_HMAC_SECRET = 'test-hmac-secret-multimodal-routing-32!!';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: { signInWithOtp: jest.fn(), getUser: jest.fn() } })),
}));

const v1Router = require('../../src/routes/v1');
const {
  normalizeMessagesForUpstream,
  estimatePromptFromMessages,
  approximateTokenCount,
  VISION_IMAGE_TOKEN_ESTIMATE,
} = v1Router.__test;

// Minimal stand-in for the production normalizeString helper. The pure
// helper accepts an injected normalizer so tests can keep behaviour
// deterministic without pulling in the full utils module.
function normalizeStringStub(value, { maxLen = 200, trim = true } = {}) {
  if (value == null) return '';
  let s = String(value);
  if (trim) s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

const stubOpts = {
  normalizeString: normalizeStringStub,
  makeToolCallId: () => 'call_deterministic',
};

describe('normalizeMessagesForUpstream — basic shape', () => {
  test('returns empty array for empty / non-array input', () => {
    expect(normalizeMessagesForUpstream([], stubOpts)).toEqual([]);
    expect(normalizeMessagesForUpstream(null, stubOpts)).toEqual([]);
    expect(normalizeMessagesForUpstream(undefined, stubOpts)).toEqual([]);
  });

  test('throws if normalizeString helper missing', () => {
    expect(() => normalizeMessagesForUpstream([{ role: 'user', content: 'hi' }]))
      .toThrow(/normalizeString is required/);
  });

  test('plain string content survives as string', () => {
    const out = normalizeMessagesForUpstream(
      [{ role: 'user', content: 'hello' }],
      stubOpts,
    );
    expect(out).toEqual([{ role: 'user', content: 'hello' }]);
  });

  test('role defaults to user, lowercased', () => {
    const out = normalizeMessagesForUpstream(
      [{ role: 'USER', content: 'hi' }, { content: 'no role' }],
      stubOpts,
    );
    expect(out[0].role).toBe('user');
    expect(out[1].role).toBe('user');
  });

  test('messages with no content are dropped (not pushed as empty)', () => {
    const out = normalizeMessagesForUpstream(
      [{ role: 'user', content: '' }, { role: 'user', content: 'kept' }],
      stubOpts,
    );
    expect(out).toEqual([{ role: 'user', content: 'kept' }]);
  });

  test('caps input at 100 messages', () => {
    const big = Array.from({ length: 250 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const out = normalizeMessagesForUpstream(big, stubOpts);
    expect(out.length).toBe(100);
    expect(out[0].content).toBe('m0');
    expect(out[99].content).toBe('m99');
  });
});

describe('normalizeMessagesForUpstream — multimodal content arrays', () => {
  // Tiny but recognisable base64 payload so test failures are obvious in CI logs.
  const tinyPngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const dataUrl = `data:image/png;base64,${tinyPngB64}`;

  test('text + image_url(object) survives as content array', () => {
    const input = [{
      role: 'user',
      content: [
        { type: 'text', text: 'What color is this image?' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }];

    const out = normalizeMessagesForUpstream(input, stubOpts);

    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('user');
    // CRITICAL: content stays an array, not a stringified blob.
    expect(Array.isArray(out[0].content)).toBe(true);
    expect(out[0].content).toEqual([
      { type: 'text', text: 'What color is this image?' },
      { type: 'image_url', image_url: { url: dataUrl } },
    ]);
  });

  test('text + image_url(string url) also survives', () => {
    const input = [{
      role: 'user',
      content: [
        { type: 'text', text: 'caption please' },
        { type: 'image_url', image_url: 'https://example.com/cat.jpg' },
      ],
    }];

    const out = normalizeMessagesForUpstream(input, stubOpts);

    expect(out[0].content).toEqual([
      { type: 'text', text: 'caption please' },
      { type: 'image_url', image_url: 'https://example.com/cat.jpg' },
    ]);
  });

  test('input_image part is passed through verbatim', () => {
    const part = { type: 'input_image', image_url: dataUrl, detail: 'high' };
    const out = normalizeMessagesForUpstream(
      [{ role: 'user', content: [part] }],
      stubOpts,
    );
    // Pass-through means EXACTLY this object's contents (helper makes a
    // shallow copy via .push(part); we assert by deep-equal).
    expect(out[0].content[0]).toEqual(part);
  });

  test('unknown part types are dropped (not forwarded)', () => {
    const out = normalizeMessagesForUpstream(
      [{
        role: 'user',
        content: [
          { type: 'mystery', payload: 'nope' },
          { type: 'text', text: 'kept' },
        ],
      }],
      stubOpts,
    );
    expect(out[0].content).toEqual([{ type: 'text', text: 'kept' }]);
  });

  test('content array with no usable parts drops the message', () => {
    const out = normalizeMessagesForUpstream(
      [
        { role: 'user', content: [{ type: 'mystery' }, { type: 'mystery' }] },
        { role: 'user', content: 'survivor' },
      ],
      stubOpts,
    );
    // The empty multimodal message must NOT be pushed; only the survivor.
    expect(out).toEqual([{ role: 'user', content: 'survivor' }]);
  });

  test('content array is capped at 32 parts', () => {
    const parts = Array.from({ length: 64 }, (_, i) => ({ type: 'text', text: `t${i}` }));
    const out = normalizeMessagesForUpstream(
      [{ role: 'user', content: parts }],
      stubOpts,
    );
    expect(out[0].content.length).toBe(32);
    expect(out[0].content[0].text).toBe('t0');
    expect(out[0].content[31].text).toBe('t31');
  });

  test('text part text is trimmed to 20k chars', () => {
    const huge = 'a'.repeat(50000);
    const out = normalizeMessagesForUpstream(
      [{ role: 'user', content: [{ type: 'text', text: huge }] }],
      stubOpts,
    );
    expect(out[0].content[0].text.length).toBe(20000);
  });
});

describe('normalizeMessagesForUpstream — tool messages', () => {
  test('role:tool with tool_call_id preserves the id and stringifies content', () => {
    const out = normalizeMessagesForUpstream(
      [{
        role: 'tool',
        tool_call_id: 'call_xyz',
        content: { result: 42 },
      }],
      stubOpts,
    );
    expect(out[0]).toEqual({
      role: 'tool',
      tool_call_id: 'call_xyz',
      content: JSON.stringify({ result: 42 }),
    });
  });

  test('role:assistant with tool_calls preserves the tool_calls shape', () => {
    const out = normalizeMessagesForUpstream(
      [{
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call_existing',
          function: { name: 'get_weather', arguments: '{"city":"Riyadh"}' },
        }, {
          // Missing id — handler must mint one via the injected factory.
          function: { name: 'lookup', arguments: '{}' },
        }],
      }],
      stubOpts,
    );
    expect(out[0].role).toBe('assistant');
    expect(out[0].tool_calls).toHaveLength(2);
    expect(out[0].tool_calls[0]).toEqual({
      id: 'call_existing',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"Riyadh"}' },
    });
    expect(out[0].tool_calls[1].id).toBe('call_deterministic');
    expect(out[0].tool_calls[1].type).toBe('function');
  });
});

describe('cost estimation reflects multimodal payload', () => {
  // PR #409 contract: image parts MUST contribute to prompt-token estimate
  // even though the gateway doesn't decode the image. Otherwise we'd
  // under-bill vision calls. This catches regressions in the estimator.
  test('image_url part inflates prompt-token estimate to >=765 tokens', () => {
    const messages = normalizeMessagesForUpstream(
      [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
        ],
      }],
      stubOpts,
    );
    const prompt = estimatePromptFromMessages(messages);
    const tokens = approximateTokenCount(prompt);
    expect(tokens).toBeGreaterThanOrEqual(VISION_IMAGE_TOKEN_ESTIMATE);
  });

  test('text-only prompts cost dramatically less than one with an image', () => {
    const textOnly = normalizeMessagesForUpstream(
      [{ role: 'user', content: 'hello there' }],
      stubOpts,
    );
    const withImage = normalizeMessagesForUpstream(
      [{
        role: 'user',
        content: [
          { type: 'text', text: 'hello there' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
        ],
      }],
      stubOpts,
    );
    const textTokens = approximateTokenCount(estimatePromptFromMessages(textOnly));
    const imgTokens = approximateTokenCount(estimatePromptFromMessages(withImage));
    // Vision overhead is the 765-token image placeholder; >100x text-only.
    expect(imgTokens).toBeGreaterThan(textTokens * 50);
  });
});
