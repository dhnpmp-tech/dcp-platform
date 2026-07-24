'use strict';

/**
 * TDD: dispatcherTelegram.test.js
 *
 * Tests for backend/src/dispatcher/telegram.js — write-only Telegram notifier.
 *
 * All HTTP is injected via fetchImpl (jest.fn) — no real network calls.
 *
 * Run from backend/:
 *   NODE_ENV=test npx jest src/__tests__/dispatcherTelegram --runInBand --forceExit
 */

const { createTelegramNotifier } = require('../dispatcher/telegram');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkFetch() {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve('{"ok":true}'),
  });
}

function makeFailFetch(status = 500, body = '{"ok":false}') {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// 1. sendTeam / sendAlert POST to the correct Telegram endpoint
// ---------------------------------------------------------------------------

describe('createTelegramNotifier: routing', () => {
  it('sendTeam POSTs to sendMessage with topicTeam thread id', async () => {
    const fetchImpl = makeOkFetch();
    const notifier = createTelegramNotifier({
      token: 't',
      chatId: '-100123',
      topicTeam: 7,
      topicAlerts: 4,
      fetchImpl,
    });

    await notifier.sendTeam('hello');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bott/sendMessage');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      chat_id: '-100123',
      message_thread_id: 7,
      text: 'hello',
      disable_web_page_preview: true,
    });
  });

  it('sendAlert POSTs to sendMessage with topicAlerts thread id', async () => {
    const fetchImpl = makeOkFetch();
    const notifier = createTelegramNotifier({
      token: 't',
      chatId: '-100123',
      topicTeam: 7,
      topicAlerts: 4,
      fetchImpl,
    });

    await notifier.sendAlert('fire!');

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bott/sendMessage');

    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      chat_id: '-100123',
      message_thread_id: 4,
      text: 'fire!',
      disable_web_page_preview: true,
    });
  });

  it('uses Content-Type: application/json header', async () => {
    const fetchImpl = makeOkFetch();
    const notifier = createTelegramNotifier({ token: 't', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl });

    await notifier.sendTeam('hi');

    const [, opts] = fetchImpl.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('returns {ok:true} on success', async () => {
    const fetchImpl = makeOkFetch();
    const notifier = createTelegramNotifier({ token: 't', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl });

    const result = await notifier.sendTeam('hi');

    expect(result).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// 2. Truncation: text > 4000 chars → truncated with trailing '…'
// ---------------------------------------------------------------------------

describe('createTelegramNotifier: truncation', () => {
  it('truncates text longer than 4000 chars and appends ellipsis', async () => {
    const fetchImpl = makeOkFetch();
    const notifier = createTelegramNotifier({ token: 't', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl });
    const longText = 'x'.repeat(5000);

    await notifier.sendTeam(longText);

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.text.length).toBe(4000);
    expect(body.text.endsWith('…')).toBe(true);
  });

  it('does not truncate text of exactly 4000 chars', async () => {
    const fetchImpl = makeOkFetch();
    const notifier = createTelegramNotifier({ token: 't', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl });
    const exactText = 'y'.repeat(4000);

    await notifier.sendTeam(exactText);

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.text.length).toBe(4000);
    expect(body.text.endsWith('…')).toBe(false);
  });

  it('does not truncate short text', async () => {
    const fetchImpl = makeOkFetch();
    const notifier = createTelegramNotifier({ token: 't', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl });

    await notifier.sendTeam('short');

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.text).toBe('short');
  });
});

// ---------------------------------------------------------------------------
// 3. Failure handling: fetch rejects OR non-2xx → resolves {ok:false}, logs, no throw
// ---------------------------------------------------------------------------

describe('createTelegramNotifier: failure handling', () => {
  it('resolves {ok:false} when fetch rejects (network error)', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    const log = jest.fn();
    const notifier = createTelegramNotifier({ token: 'secret-token', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl, log });

    const result = await notifier.sendTeam('test');

    expect(result).toEqual({ ok: false });
  });

  it('never throws even when fetch rejects', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('timeout'));
    const notifier = createTelegramNotifier({ token: 't', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl, log: jest.fn() });

    await expect(notifier.sendTeam('x')).resolves.not.toThrow();
  });

  it('resolves {ok:false} when Telegram returns non-2xx', async () => {
    const fetchImpl = makeFailFetch(400, '{"ok":false,"description":"Bad Request"}');
    const log = jest.fn();
    const notifier = createTelegramNotifier({ token: 't', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl, log });

    const result = await notifier.sendAlert('test');

    expect(result).toEqual({ ok: false });
  });

  it('logs on network error without including the token in the log message', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('refused'));
    const log = jest.fn();
    const notifier = createTelegramNotifier({ token: 'super-secret-bot-token', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl, log });

    await notifier.sendTeam('x');

    // log must have been called
    expect(log).toHaveBeenCalled();
    // the token must NOT appear in any log call
    const logOutput = log.mock.calls.map(args => args.join(' ')).join('\n');
    expect(logOutput).not.toContain('super-secret-bot-token');
  });

  it('logs on non-2xx without including the token in the log message', async () => {
    const fetchImpl = makeFailFetch(429, 'Too Many Requests');
    const log = jest.fn();
    const notifier = createTelegramNotifier({ token: 'another-secret', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl, log });

    await notifier.sendAlert('x');

    expect(log).toHaveBeenCalled();
    const logOutput = log.mock.calls.map(args => args.join(' ')).join('\n');
    expect(logOutput).not.toContain('another-secret');
  });
});

// ---------------------------------------------------------------------------
// 4. Missing config → no-op notifier, logs once, dispatcher runs fine
// ---------------------------------------------------------------------------

describe('createTelegramNotifier: missing config (no-op fallback)', () => {
  it('returns a no-op notifier (with disabled:true) when token is missing', async () => {
    const log = jest.fn();
    const notifier = createTelegramNotifier({ token: '', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl: jest.fn(), log });

    const result = await notifier.sendTeam('x');

    expect(result).toMatchObject({ ok: false, disabled: true });
  });

  it('returns a no-op notifier when chatId is missing', async () => {
    const log = jest.fn();
    const notifier = createTelegramNotifier({ token: 'tok', chatId: '', topicTeam: 7, topicAlerts: 4, fetchImpl: jest.fn(), log });

    const result = await notifier.sendAlert('y');

    expect(result).toMatchObject({ ok: false, disabled: true });
  });

  it('logs exactly once when token is missing', () => {
    const log = jest.fn();
    createTelegramNotifier({ token: '', chatId: '-1', topicTeam: 7, topicAlerts: 4, fetchImpl: jest.fn(), log });

    expect(log).toHaveBeenCalledTimes(1);
  });

  it('logs exactly once when chatId is missing', () => {
    const log = jest.fn();
    createTelegramNotifier({ token: 'tok', chatId: '', topicTeam: 7, topicAlerts: 4, fetchImpl: jest.fn(), log });

    expect(log).toHaveBeenCalledTimes(1);
  });

  it('no-op notifier sendAlert also resolves {ok:false, disabled:true}', async () => {
    const notifier = createTelegramNotifier({ token: '', chatId: '', fetchImpl: jest.fn(), log: jest.fn() });

    const result = await notifier.sendAlert('alert');

    expect(result).toMatchObject({ ok: false, disabled: true });
  });

  it('does not call fetchImpl when in no-op mode', async () => {
    const fetchImpl = jest.fn();
    const notifier = createTelegramNotifier({ token: '', chatId: '-1', fetchImpl, log: jest.fn() });

    await notifier.sendTeam('x');

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Structural guarantee: module source contains no getUpdates call
// ---------------------------------------------------------------------------

describe('createTelegramNotifier: structural write-only guarantee', () => {
  it('module source does not contain any getUpdates call', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../dispatcher/telegram'), 'utf8');
    expect(source).not.toMatch(/getUpdates/);
  });
});
