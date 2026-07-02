'use strict';

// anthropic-proxy.js — forward an Anthropic Messages API request to a provider
// engine's NATIVE /v1/messages (vLLM ≥0.20 implements the Anthropic protocol).
//
// Deliberately no Anthropic↔OpenAI translation here: the engine speaks
// Anthropic natively, and translation layers are where streaming tool-call
// corruption lives (LiteLLM id-drift class of bugs). Pass through, don't map.
//
// Header policy: only the anthropic-* protocol headers cross the boundary.
// The renter's Authorization header must NOT leak to the provider box.

const FORWARD_HEADERS = ['anthropic-version', 'anthropic-beta'];

// provider_engines.base_url in production looks like "http://10.8.0.6:8000/v1"
// (WG mesh IP). Normalize to <origin><basePath>/v1/messages without doubling
// the /v1 segment.
function upstreamMessagesUrl(engineBaseUrl, subpath = '/v1/messages') {
  const u = new URL(engineBaseUrl);
  const basePath = u.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
  return `${u.origin}${basePath}${subpath}`;
}

// Returns the raw fetch Response so the caller chooses .json() (non-streaming)
// or .body piping (SSE). The abort timer covers the WHOLE exchange — callers
// must call `done()` once they've finished consuming the body.
async function forwardAnthropic({ engineBaseUrl, body, headers = {}, timeoutMs = 120000, subpath }) {
  const url = upstreamMessagesUrl(engineBaseUrl, subpath);
  const outHeaders = { 'content-type': 'application/json' };
  for (const name of FORWARD_HEADERS) {
    if (headers[name]) outHeaders[name] = headers[name];
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: outHeaders,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
  return { response, done: () => clearTimeout(timer) };
}

module.exports = { forwardAnthropic, upstreamMessagesUrl };
