# Audit L3 — admin audit logging — false positive memo

**Status:** Closed, no change required.
**Date:** 2026-04-29
**Auditor finding:** L3 — admin audit logging missing/incomplete.

## Conclusion

The audit infrastructure called out by L3 is already in place and covers
every action the audit flagged. No code change is required.

## Evidence

### 1. Schema is provisioned

`db/migrations/003_admin_audit_log.sql` creates `admin_audit_log` with
indexed columns (action, target_type, target_id, admin_user_id,
timestamp, details). Verified live on the VPS:

```sql
CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id INTEGER,
  details TEXT,
  timestamp TEXT NOT NULL,
  admin_user_id TEXT NOT NULL DEFAULT 'system'
);
CREATE INDEX idx_admin_audit_admin  ON admin_audit_log(admin_user_id, timestamp DESC);
CREATE INDEX idx_admin_audit_target ON admin_audit_log(target_type, target_id, timestamp DESC);
```

### 2. Per-request admin requests are logged

`backend/src/middleware/adminAuth.js` exposes `requireAdminRbac` middleware
that authenticates admin requests AND fire-and-forget inserts into
`admin_audit_log` on every successful admission. Source comment line 24:

> Audit log: every admitted request is written to admin_audit_log
> asynchronously (fire-and-forget). Errors are swallowed so a DB hiccup
> never rejects a legitimate admin request.

Helper `logAdminAction(db, adminUserId, action, targetType, targetId, details)`
is exported for routes that need fine-grained logging beyond the per-request
catch-all.

### 3. High-risk action coverage

Direct grep over `backend/src/routes/admin.js` finds 28+ explicit
`INSERT INTO admin_audit_log` sites, including all the actions L3 was
concerned about:

| L3-flagged action     | Audit-log site (admin.js line) | Action string |
|-----------------------|--------------------------------|---------------|
| Admin auth event      | adminAuth.js per-request       | (route-derived) |
| API key rotation      | 3449 (provider), 3469 (renter) | `key_rotated` |
| Balance adjustment    | 2939                           | `balance_adjusted` |
| Provider suspend      | 2799, 2845                     | `provider_suspended` |
| Provider unsuspend    | 2816, 2849                     | `provider_unsuspended` / `provider_reactivated` |
| Renter suspend        | 2867                           | `renter_suspended` |
| Renter unsuspend      | 2883                           | `renter_unsuspended` |
| Notification config   | 4281                           | `notification_config_updated` |
| Approval queue ops    | 683, 2704, 2746, 2779          | (queue-action-specific) |

Plus the `admin_audit_log` reader endpoints (lines 3658, 3693, 3721,
3746-3748) for the admin UI to display the log.

### 4. Parallel structured-event service

`backend/src/services/auditService.ts` provides a separate Supabase-backed
`audit_logs` table for richer event payloads (method, url, status_code,
duration_ms, ip_address, user_agent, body hash) used by the GUARDIAN
agent and the broader system-event pipeline. This is complementary, not
overlapping, with the SQLite `admin_audit_log` — the SQLite table is the
source of truth for human-readable admin actions surfaced in the UI.

## Why the auditor likely flagged it

The H1 + H2 audit batch (PR #320) and the M-batch findings come from
static review. The auditor probably did not have shell access to the
DB or the running middleware to confirm the per-request logging path,
and the inline `INSERT INTO admin_audit_log` calls are easy to miss
when there are 28+ of them scattered across a 4000-line route file.

## Action

None required. This finding is closed.
