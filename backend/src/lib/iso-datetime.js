'use strict';

/**
 * Normalize a stored timestamp to an RFC 3339 / ISO-8601 string with a UTC `Z`.
 *
 * The backend stores timestamps in two shapes:
 *   - already-ISO  ("2026-05-30T19:15:00.000Z")  → returned unchanged
 *   - SQLite text  ("2026-05-30 23:15:00", UTC)   → "2026-05-30T23:15:00.000Z"
 *
 * SQLite's datetime('now') yields the space-separated, zone-less UTC form,
 * which is NOT valid RFC 3339 and fails OpenAPI `format: date-time` validation.
 * This converts it without shifting the instant (it is already UTC).
 *
 * null/undefined pass through; an unparseable value is returned unchanged so a
 * response is never broken by a surprising stored format.
 *
 * @param {string|null|undefined} value
 * @returns {string|null|undefined}
 */
function toRfc3339(value) {
  if (value == null) return value;
  const s = String(value);
  // Already ISO-ish (has the date/time `T` separator) — trust it as-is.
  if (s.includes('T')) return s;
  // SQLite "YYYY-MM-DD HH:MM:SS" is UTC; make it RFC 3339 without shifting time.
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

module.exports = { toRfc3339 };
