'use strict';
// Regression test for the Moyasar webhook body bug: upstream middleware handed
// the handler a Buffer spread into an indexed object {"0":123,...}, and the old
// normalization re-serialized it (Buffer.from(JSON.stringify(obj))) into DIFFERENT
// bytes — so the HMAC never matched and NO webhook was ever verified. Mirrors the
// exported coerceRawBody (avoids loading better-sqlite3, same pattern as
// webhook-hmac.test.js).

function coerceRawBody(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody);
  if (rawBody && typeof rawBody === 'object') {
    if (rawBody.type === 'Buffer' && Array.isArray(rawBody.data)) {
      return Buffer.from(rawBody.data);
    }
    const keys = Object.keys(rawBody);
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      const bytes = keys.sort((a, b) => Number(a) - Number(b)).map((k) => rawBody[k]);
      if (bytes.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
        return Buffer.from(bytes);
      }
    }
    return Buffer.from(JSON.stringify(rawBody));
  }
  return null;
}

const PAYLOAD = '{"id":"pay_x","status":"paid","invoice_id":"inv_y","amount":100,"currency":"SAR"}';

describe('coerceRawBody', () => {
  test('a real Buffer passes through unchanged', () => {
    const buf = Buffer.from(PAYLOAD);
    expect(coerceRawBody(buf).equals(buf)).toBe(true);
  });

  test('a string becomes the same bytes', () => {
    expect(coerceRawBody(PAYLOAD).toString('utf8')).toBe(PAYLOAD);
  });

  test('THE BUG: indexed-object Buffer {"0":n,...} rebuilds the ORIGINAL bytes', () => {
    const spread = { ...Buffer.from(PAYLOAD) }; // exactly what the middleware produced
    const out = coerceRawBody(spread);
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.toString('utf8')).toBe(PAYLOAD); // not the JSON.stringify(spread) garbage
  });

  test('{type:"Buffer",data:[...]} round-trip rebuilds the original bytes', () => {
    const toJson = Buffer.from(PAYLOAD).toJSON(); // {type:'Buffer', data:[...]}
    expect(coerceRawBody(toJson).toString('utf8')).toBe(PAYLOAD);
  });

  test('HMAC over the recovered bytes matches HMAC over the original (the whole point)', () => {
    const crypto = require('crypto');
    const secret = 'a'.repeat(64);
    const truth = crypto.createHmac('sha256', secret).update(Buffer.from(PAYLOAD)).digest('hex');
    const spread = { ...Buffer.from(PAYLOAD) };
    const recovered = crypto.createHmac('sha256', secret).update(coerceRawBody(spread)).digest('hex');
    expect(recovered).toBe(truth);
  });

  test('a genuine non-Buffer object (not indexed) falls back to JSON bytes', () => {
    const out = coerceRawBody({ hello: 'world' });
    expect(out.toString('utf8')).toBe('{"hello":"world"}');
  });

  test('null / undefined return null (handler then 400s)', () => {
    expect(coerceRawBody(null)).toBeNull();
    expect(coerceRawBody(undefined)).toBeNull();
  });
});
