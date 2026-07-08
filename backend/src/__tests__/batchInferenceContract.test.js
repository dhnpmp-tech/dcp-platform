'use strict';

const {
  BatchInferenceContractError,
  parseBatchJsonl,
} = require('../services/batchInferenceContract');

function line(value) {
  return JSON.stringify(value);
}

describe('batch inference JSONL contract foundation', () => {
  test('normalizes valid chat and completion batch requests deterministically', () => {
    const input = [
      line({
        custom_id: 'chat-1',
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: 'qwen/qwen3-coder',
          messages: [{ role: 'user', content: 'hello' }],
        },
      }),
      line({
        custom_id: 'complete-1',
        method: 'post',
        url: '/v1/complete',
        body: {
          model: 'mistral',
          prompt: 'hello',
        },
      }),
    ].join('\n');

    const parsed = parseBatchJsonl(input);
    const reparsed = parseBatchJsonl(`${input}\n`);

    expect(parsed.counts.requests).toBe(2);
    expect(parsed.requests.map((request) => request.custom_id)).toEqual(['chat-1', 'complete-1']);
    expect(parsed.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.checksum_sha256).toBe(reparsed.checksum_sha256);
  });

  test('rejects invalid JSON with a line number', () => {
    expect(() => parseBatchJsonl('{"custom_id":')).toThrow(BatchInferenceContractError);
    try {
      parseBatchJsonl('{"custom_id":');
    } catch (error) {
      expect(error.code).toBe('invalid_json');
      expect(error.line).toBe(1);
    }
  });

  test('rejects duplicate custom ids', () => {
    const jsonl = [
      line({ custom_id: 'dup', method: 'POST', url: '/v1/complete', body: { model: 'm', prompt: 'a' } }),
      line({ custom_id: 'dup', method: 'POST', url: '/v1/complete', body: { model: 'm', prompt: 'b' } }),
    ].join('\n');

    expect(() => parseBatchJsonl(jsonl)).toThrow(/Duplicate custom_id/);
  });

  test('rejects unsupported methods and urls', () => {
    expect(() => parseBatchJsonl(line({
      custom_id: 'bad-method',
      method: 'GET',
      url: '/v1/complete',
      body: { model: 'm', prompt: 'a' },
    }))).toThrow(/method must be POST/);

    expect(() => parseBatchJsonl(line({
      custom_id: 'bad-url',
      method: 'POST',
      url: '/v1/fine_tuning/jobs',
      body: { model: 'm', prompt: 'a' },
    }))).toThrow(/url is not supported/);
  });

  test('requires model and endpoint-specific body fields', () => {
    expect(() => parseBatchJsonl(line({
      custom_id: 'missing-model',
      method: 'POST',
      url: '/v1/complete',
      body: { prompt: 'a' },
    }))).toThrow(/body.model/);

    expect(() => parseBatchJsonl(line({
      custom_id: 'missing-messages',
      method: 'POST',
      url: '/v1/chat/completions',
      body: { model: 'm' },
    }))).toThrow(/body.messages/);
  });

  test('enforces request count and byte limits', () => {
    const req = line({ custom_id: 'one', method: 'POST', url: '/v1/complete', body: { model: 'm', prompt: 'a' } });

    expect(() => parseBatchJsonl([req, req.replace('one', 'two')].join('\n'), { maxRequests: 1 })).toThrow(/count exceeds/);
    expect(() => parseBatchJsonl(req, { maxBytes: 10 })).toThrow(/max byte/);
  });
});
