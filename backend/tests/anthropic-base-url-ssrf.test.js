'use strict';

/**
 * anthropic-base-url-ssrf.test.js — OPUS-1 SSRF guard.
 *
 * The provider-supplied engine base_url is fetched by the backend (verification
 * probe + /anthropic + proxyToProvider). sanitizeVllmEndpointUrl is the guard
 * now applied at the engines[] heartbeat ingest. These assert it rejects the
 * SSRF payloads and still accepts legitimate mesh + public inference endpoints.
 */

process.env.NODE_ENV = 'test';
const { sanitizeVllmEndpointUrl } = require('../src/routes/providers').__private;

describe('OPUS-1: base_url SSRF guard (sanitizeVllmEndpointUrl)', () => {
  test('rejects cloud-metadata / link-local (169.254.169.254)', () => {
    expect(sanitizeVllmEndpointUrl('http://169.254.169.254:8000/v1')).toBeNull();
  });
  test('rejects loopback (127.0.0.1)', () => {
    expect(sanitizeVllmEndpointUrl('http://127.0.0.1:8000/v1')).toBeNull();
  });
  test('rejects non-mesh private (192.168 / 172.16 / non-mesh 10.x)', () => {
    expect(sanitizeVllmEndpointUrl('http://192.168.1.10:8000/v1')).toBeNull();
    expect(sanitizeVllmEndpointUrl('http://172.16.0.5:8000/v1')).toBeNull();
    expect(sanitizeVllmEndpointUrl('http://10.0.0.5:8000/v1')).toBeNull(); // not the 10.8.0.0/24 mesh
  });
  test('rejects FQDN (would need DNS → rebinding vector)', () => {
    expect(sanitizeVllmEndpointUrl('http://evil.example.com:8000/v1')).toBeNull();
  });
  test('rejects a non-allowlisted port (e.g. the VPS backend :8083)', () => {
    expect(sanitizeVllmEndpointUrl('http://10.8.0.1:8083/v1')).toBeNull();
  });
  test('rejects non-http(s) scheme', () => {
    expect(sanitizeVllmEndpointUrl('file:///etc/passwd')).toBeNull();
    expect(sanitizeVllmEndpointUrl('gopher://10.8.0.6:8000')).toBeNull();
  });
  test('ACCEPTS a legitimate mesh inference endpoint (Node 2)', () => {
    expect(sanitizeVllmEndpointUrl('http://10.8.0.6:8000/v1')).toBe('http://10.8.0.6:8000');
  });
  test('ACCEPTS a public inference endpoint on an allowlisted port', () => {
    expect(sanitizeVllmEndpointUrl('http://203.0.113.9:11434/v1')).toBe('http://203.0.113.9:11434');
  });
});
