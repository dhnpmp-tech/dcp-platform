'use strict';

const crypto = require('crypto');

const SUPPORTED_BATCH_URLS = Object.freeze(['/v1/chat/completions', '/v1/complete']);
const MAX_BATCH_REQUESTS = 1000;
const MAX_BATCH_BYTES = 10 * 1024 * 1024;

class BatchInferenceContractError extends Error {
  constructor(message, { code = 'invalid_batch', line = null, details = undefined } = {}) {
    super(message);
    this.name = 'BatchInferenceContractError';
    this.code = code;
    this.line = line;
    this.details = details;
  }
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function parseBatchJsonl(input, options = {}) {
  if (typeof input !== 'string') {
    throw new BatchInferenceContractError('Batch input must be a JSONL string', { code: 'invalid_input' });
  }
  const maxBytes = options.maxBytes || MAX_BATCH_BYTES;
  const byteLength = Buffer.byteLength(input, 'utf8');
  if (byteLength > maxBytes) {
    throw new BatchInferenceContractError('Batch input exceeds max byte size', {
      code: 'batch_too_large',
      details: { max_bytes: maxBytes, byte_length: byteLength },
    });
  }

  const maxRequests = options.maxRequests || MAX_BATCH_REQUESTS;
  const seenCustomIds = new Set();
  const requests = [];

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) return;
    if (requests.length >= maxRequests) {
      throw new BatchInferenceContractError('Batch request count exceeds limit', {
        code: 'too_many_requests',
        line: lineNumber,
        details: { max_requests: maxRequests },
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new BatchInferenceContractError('Invalid JSONL line', {
        code: 'invalid_json',
        line: lineNumber,
      });
    }

    const request = normalizeBatchRequest(parsed, lineNumber);
    if (seenCustomIds.has(request.custom_id)) {
      throw new BatchInferenceContractError('Duplicate custom_id in batch', {
        code: 'duplicate_custom_id',
        line: lineNumber,
        details: { custom_id: request.custom_id },
      });
    }
    seenCustomIds.add(request.custom_id);
    requests.push(request);
  });

  if (requests.length === 0) {
    throw new BatchInferenceContractError('Batch must contain at least one request', { code: 'empty_batch' });
  }

  const normalizedJsonl = requests.map(stableStringify).join('\n') + '\n';
  return {
    requests,
    counts: {
      requests: requests.length,
    },
    checksum_sha256: crypto.createHash('sha256').update(normalizedJsonl).digest('hex'),
    normalized_bytes: Buffer.byteLength(normalizedJsonl, 'utf8'),
  };
}

function normalizeBatchRequest(value, lineNumber) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BatchInferenceContractError('Batch line must be an object', { code: 'invalid_line', line: lineNumber });
  }
  const customId = normalizeCustomId(value.custom_id, lineNumber);
  const method = String(value.method || '').trim().toUpperCase();
  if (method !== 'POST') {
    throw new BatchInferenceContractError('Batch request method must be POST', {
      code: 'unsupported_method',
      line: lineNumber,
      details: { method },
    });
  }
  const url = String(value.url || '').trim();
  if (!SUPPORTED_BATCH_URLS.includes(url)) {
    throw new BatchInferenceContractError('Batch request url is not supported', {
      code: 'unsupported_url',
      line: lineNumber,
      details: { url, supported_urls: SUPPORTED_BATCH_URLS },
    });
  }
  const body = normalizeBody(value.body, url, lineNumber);
  return {
    custom_id: customId,
    method,
    url,
    body,
  };
}

function normalizeCustomId(value, lineNumber) {
  if (typeof value !== 'string') {
    throw new BatchInferenceContractError('custom_id is required', { code: 'missing_custom_id', line: lineNumber });
  }
  const customId = value.trim();
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(customId)) {
    throw new BatchInferenceContractError('custom_id must be 1-128 URL-safe characters', {
      code: 'invalid_custom_id',
      line: lineNumber,
    });
  }
  return customId;
}

function normalizeBody(body, url, lineNumber) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BatchInferenceContractError('body must be an object', { code: 'invalid_body', line: lineNumber });
  }
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!model) {
    throw new BatchInferenceContractError('body.model is required', { code: 'missing_model', line: lineNumber });
  }
  if (url === '/v1/chat/completions') {
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new BatchInferenceContractError('body.messages is required for chat completions', {
        code: 'missing_messages',
        line: lineNumber,
      });
    }
  }
  if (url === '/v1/complete') {
    if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
      throw new BatchInferenceContractError('body.prompt is required for completions', {
        code: 'missing_prompt',
        line: lineNumber,
      });
    }
  }
  return JSON.parse(JSON.stringify({ ...body, model }));
}

module.exports = {
  SUPPORTED_BATCH_URLS,
  MAX_BATCH_REQUESTS,
  MAX_BATCH_BYTES,
  BatchInferenceContractError,
  parseBatchJsonl,
  __test: {
    stableStringify,
    normalizeBatchRequest,
  },
};
