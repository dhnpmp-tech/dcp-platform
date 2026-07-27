'use strict';

/**
 * dispatcher/client.js — Thin fetch wrapper for the Mission Control HTTP API.
 *
 * All methods are async. Base URL and agent key are injected via the
 * constructor — this module NEVER reads from process.env directly.
 * The fetchImpl parameter defaults to the global fetch (Node 18+) and can
 * be replaced with a jest.fn() in tests.
 *
 * Error policy:
 *   - Non-2xx responses (except the documented 409 case in resetLease) throw
 *     an Error with the HTTP status code and route in the message.
 *   - The agent key is NEVER included in thrown error messages.
 */

class MissionClient {
  /**
   * @param {object} opts
   * @param {string}   opts.baseUrl      — e.g. 'http://127.0.0.1:8083'
   * @param {string}   opts.agentKey     — value for x-mission-agent-key header
   * @param {Function} [opts.fetchImpl]  — injectable fetch (default: global fetch)
   * @param {number}   [opts.timeoutMs]  — per-request timeout in ms (default: 30 000)
   */
  constructor({ baseUrl, agentKey, fetchImpl = fetch, timeoutMs = 30_000 }) {
    this._base = baseUrl.replace(/\/$/, '');
    this._key = agentKey;
    this._fetch = fetchImpl;
    this._timeoutMs = timeoutMs;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  _headers(extra = {}) {
    return {
      'x-mission-agent-key': this._key,
      ...extra,
    };
  }

  /** Return a fresh AbortSignal that times out after this._timeoutMs. */
  _signal() {
    return AbortSignal.timeout(this._timeoutMs);
  }

  /**
   * Throw a sanitised error (no key leak) for non-2xx responses.
   * @param {Response} res
   * @param {string}   route  — human-readable, e.g. 'GET /api/mission/tasks'
   */
  _throwForStatus(res, route) {
    throw new Error(`MissionClient: ${route} returned HTTP ${res.status}`);
  }

  _url(path, params = {}) {
    const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
    if (!entries.length) return `${this._base}${path}`;
    const qs = new URLSearchParams(entries).toString();
    return `${this._base}${path}?${qs}`;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * GET /api/mission/tasks
   * Optional params: { status, assignee, external_id, goal, milestone }
   * Returns body.tasks (array).
   */
  async getTasks(params = {}) {
    const url = this._url('/api/mission/tasks', params);
    const res = await this._fetch(url, {
      method: 'GET',
      headers: this._headers(),
      signal: this._signal(),
    });
    if (!res.ok) this._throwForStatus(res, 'GET /api/mission/tasks');
    const body = await res.json();
    return body.tasks;
  }

  /**
   * GET /api/mission/tasks?external_id=<externalId>
   * Returns the first matching task or null.
   */
  async getTaskByExternalId(externalId) {
    const tasks = await this.getTasks({ external_id: externalId });
    return tasks.length > 0 ? tasks[0] : null;
  }

  /**
   * POST /api/mission/tasks/:id/reset-lease
   * Returns { ok: true } on success.
   * Returns { ok: false, skipped: true } on 409 (lease not yet expired — fine to skip).
   * Throws on any other non-2xx.
   */
  async resetLease(taskId) {
    const route = `POST /api/mission/tasks/${taskId}/reset-lease`;
    const res = await this._fetch(`${this._base}/api/mission/tasks/${taskId}/reset-lease`, {
      method: 'POST',
      headers: this._headers(),
      signal: this._signal(),
    });
    if (res.status === 409) return { ok: false, skipped: true };
    if (!res.ok) this._throwForStatus(res, route);
    return { ok: true };
  }

  /**
   * POST /api/mission/tasks
   * Creates a Mission Control task from an external source.
   * Returns the created task object.
   */
  async createTask({
    externalId,
    title,
    detail,
    description,
    source = 'dispatcher',
    sourceUrl,
    priority = 'p2',
    assigneeId,
    goalId,
    milestoneId,
  }) {
    const route = 'POST /api/mission/tasks';
    const payload = {
      title,
      description: description ?? detail,
      external_id: externalId,
      source,
      source_url: sourceUrl,
      priority,
      assignee_id: assigneeId,
      goal_id: goalId,
      milestone_id: milestoneId,
    };
    for (const [key, value] of Object.entries(payload)) {
      if (value == null || value === '') delete payload[key];
    }
    const res = await this._fetch(`${this._base}/api/mission/tasks`, {
      method: 'POST',
      headers: this._headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
      signal: this._signal(),
    });
    if (!res.ok) this._throwForStatus(res, route);
    const body = await res.json();
    return body.task;
  }

  /**
   * POST /api/mission/tasks
   * Creates a dispatcher repair task.
   * Returns the created task object.
   */
  async createRepairTask({ externalId, title, detail }) {
    return this.createTask({
      externalId,
      title,
      detail,
      source: 'dispatcher',
      priority: 'p1',
    });
  }

  /**
   * GET /api/mission/digest
   * Returns the markdown digest as a string.
   */
  async getDigest() {
    const route = 'GET /api/mission/digest';
    const res = await this._fetch(`${this._base}/api/mission/digest`, {
      method: 'GET',
      headers: this._headers(),
      signal: this._signal(),
    });
    if (!res.ok) this._throwForStatus(res, route);
    return res.text();
  }

  /**
   * GET /api/mission/fleet
   * Returns the full fleet body: { online, stale, unreachable, offline_recent, paused, counts, ... }
   * Providers classified as 'offline' or 'unreachable' may be used to generate providerIncidents.
   */
  async getFleet() {
    const route = 'GET /api/mission/fleet';
    const res = await this._fetch(`${this._base}/api/mission/fleet`, {
      method: 'GET',
      headers: this._headers(),
      signal: this._signal(),
    });
    if (!res.ok) this._throwForStatus(res, route);
    return res.json();
  }
}

module.exports = { MissionClient };
