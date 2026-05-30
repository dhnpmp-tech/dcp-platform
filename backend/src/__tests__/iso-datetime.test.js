'use strict';

const { toRfc3339 } = require('../lib/iso-datetime');

describe('toRfc3339', () => {
  it('converts SQLite datetime text (UTC, space-separated) to RFC 3339 without shifting the instant', () => {
    // SQLite datetime('now') format — UTC, no zone marker.
    expect(toRfc3339('2026-05-30 23:15:00')).toBe('2026-05-30T23:15:00.000Z');
  });

  it('passes through an already-ISO string unchanged', () => {
    expect(toRfc3339('2026-05-30T19:15:00.000Z')).toBe('2026-05-30T19:15:00.000Z');
    expect(toRfc3339('2026-05-30T19:15:00Z')).toBe('2026-05-30T19:15:00Z');
  });

  it('passes through null/undefined unchanged', () => {
    expect(toRfc3339(null)).toBeNull();
    expect(toRfc3339(undefined)).toBeUndefined();
  });

  it('returns an unparseable value unchanged rather than throwing or emitting Invalid Date', () => {
    expect(toRfc3339('not a date')).toBe('not a date');
    expect(toRfc3339('')).toBe('');
  });

  it('produces a value that satisfies the OpenAPI date-time format (round-trips through Date)', () => {
    const out = toRfc3339('2026-01-02 03:04:05');
    expect(new Date(out).toISOString()).toBe(out);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });
});
