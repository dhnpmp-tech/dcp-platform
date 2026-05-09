const crypto = require('crypto');
const db = require('../db');

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'DCP Platform <noreply@dcp.sa>';
const OTP_TTL_MINUTES = 15;
const SITE_URL = (process.env.FRONTEND_URL || 'https://dcp.sa').replace(/\/+$/, '');

// ── Ensure OTP table exists ───────────────────────────────────────────────
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    magic_token TEXT,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
  // Index for fast lookup
  try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email, used)`).run(); } catch (_) {}
  try { db.prepare(`CREATE INDEX IF NOT EXISTS idx_otp_magic ON otp_codes(magic_token)`).run(); } catch (_) {}
  // Add magic_token column if upgrading from older schema
  try { db.prepare(`ALTER TABLE otp_codes ADD COLUMN magic_token TEXT`).run(); } catch (_) {}
} catch (_) {}

// ── Generate a 6-digit code ───────────────────────────────────────────────
function generateCode() {
  return String(crypto.randomInt(100000, 999999));
}

// ── Send OTP via Resend ───────────────────────────────────────────────────
//
// `requestedRole` ('provider' | 'renter') is optional. When set, it's
// persisted on the otp_codes row and surfaced by verifyMagicToken so the
// /api/auth/magic-link handler can pick the right dashboard even when the
// link is opened on a different device with no sessionStorage breadcrumb.
async function sendOtp(email, { requestedRole = null } = {}) {
  try {
    // Invalidate any existing unused codes for this email
    db.prepare(`UPDATE otp_codes SET used = 1 WHERE email = ? AND used = 0`).run(email.toLowerCase());

    const code = generateCode();
    const magicToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
    const role = requestedRole === 'provider' || requestedRole === 'renter' ? requestedRole : null;

    // Store in DB
    db.prepare(
      `INSERT INTO otp_codes (email, code, magic_token, expires_at, requested_role) VALUES (?, ?, ?, ?, ?)`
    ).run(email.toLowerCase(), code, magicToken, expiresAt, role);

    // Send via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[AUTH] RESEND_API_KEY not set — cannot send magic link');
      return { success: false, error: 'Email service not configured. Contact support.' };
    }

    const magicUrl = `${SITE_URL}/auth/verify?token=${magicToken}`;
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: email,
        subject: 'Sign in to DCP | تسجيل الدخول إلى DCP',
        html: buildMagicLinkEmailHtml(magicUrl),
        text: `Sign in to DCP\n\nClick this link to sign in:\n${magicUrl}\n\nThis link expires in ${OTP_TTL_MINUTES} minutes and can only be used once.\n\nIf you didn't request this, you can safely ignore this email.\n\n---\n\nتسجيل الدخول إلى DCP\n\nاضغط على الرابط لتسجيل الدخول:\n${magicUrl}\n\nينتهي هذا الرابط خلال ${OTP_TTL_MINUTES} دقيقة ويمكن استخدامه مرة واحدة فقط.\n\nإذا لم تطلب هذا، يمكنك تجاهل هذه الرسالة.`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[AUTH] Resend failed (${res.status}):`, err);
      return { success: false, error: 'Failed to send sign-in email. Please try again.' };
    }

    console.log(`[AUTH] Magic link sent to ${email}`);
    return { success: true };
  } catch (err) {
    console.error('[AUTH] Magic link send exception:', err.message);
    return { success: false, error: 'Failed to send sign-in link. Please try again.' };
  }
}

// ── Verify OTP ────────────────────────────────────────────────────────────
function cleanToken(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[\s\-]/g, '').trim();
}

async function verifyOtp(email, token) {
  const clean = cleanToken(token);

  if (!clean) {
    return { success: false, error: 'Please enter the 6-digit code from your email.' };
  }
  if (!/^\d{6}$/.test(clean)) {
    return { success: false, error: `Enter exactly 6 digits. You entered: "${clean}" (${clean.length} chars).` };
  }

  try {
    const row = db.prepare(`
      SELECT id, code, expires_at FROM otp_codes
      WHERE email = ? AND used = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(email.toLowerCase());

    if (!row) {
      return { success: false, error: 'No verification code found. Click "Send Code" to get a new one.' };
    }

    // Check expiration
    if (new Date(row.expires_at) < new Date()) {
      db.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(row.id);
      return { success: false, error: `Code expired. Codes are valid for ${OTP_TTL_MINUTES} minutes. Click "Resend" to get a new one.` };
    }

    // Check code (timing-safe comparison)
    if (!crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(row.code))) {
      return { success: false, error: 'Wrong code. Check your email for the latest 6-digit code and try again.' };
    }

    // Mark as used
    db.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(row.id);

    console.log(`[AUTH] OTP verified for ${email}`);
    return { success: true, user: { email: email.toLowerCase() } };
  } catch (err) {
    console.error('[AUTH] OTP verify exception:', err.message);
    return { success: false, error: 'Verification failed. Please request a new code and try again.' };
  }
}

// ── Verify magic link token ───────────────────────────────────────────────
//
// Idempotency window: the same link clicked twice within 60 seconds returns
// success on both calls. This protects against:
//   - browsers / mobile mail clients that pre-fetch links before the user
//     even sees the page (and thus burn the token);
//   - users who refresh /auth/verify after the first response loads;
//   - double-clicks on slow networks.
//
// We track first-use time on the row (used_at) and treat tokens used <60s
// ago as still valid. After the window expires the row is treated as fully
// used and the user is asked to request a new link.
const _MAGIC_REUSE_WINDOW_MS = 60 * 1000;
try { db.prepare(`ALTER TABLE otp_codes ADD COLUMN used_at TEXT`).run(); } catch (_) {}
// requested_role: 'provider' | 'renter'. Set by sendOtp() so that when the
// email is opened on a different device (no sessionStorage breadcrumb),
// /api/auth/magic-link still picks the right dashboard.
try { db.prepare(`ALTER TABLE otp_codes ADD COLUMN requested_role TEXT`).run(); } catch (_) {}

function verifyMagicToken(token) {
  if (!token || typeof token !== 'string') {
    return { success: false, error: 'Invalid link.' };
  }
  try {
    const row = db.prepare(`
      SELECT id, email, expires_at, used, used_at, requested_role FROM otp_codes
      WHERE magic_token = ? LIMIT 1
    `).get(token.trim());

    if (!row) {
      return { success: false, error: 'This link is invalid.' };
    }

    if (new Date(row.expires_at) < new Date()) {
      if (!row.used) {
        db.prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(row.id);
      }
      return { success: false, error: 'This link has expired. Please request a new one.' };
    }

    // Re-use within idempotency window: replay first-click result.
    if (row.used) {
      const usedAtMs = row.used_at ? new Date(row.used_at).getTime() : 0;
      if (usedAtMs > 0 && (Date.now() - usedAtMs) < _MAGIC_REUSE_WINDOW_MS) {
        console.log(`[AUTH] Magic link replayed for ${row.email} (within idempotency window)`);
        return {
          success: true,
          user: { email: row.email },
          requested_role: row.requested_role || null,
          replayed: true,
        };
      }
      return { success: false, error: 'This link has already been used. Please request a new one.' };
    }

    db.prepare(
      `UPDATE otp_codes SET used = 1, used_at = datetime('now') WHERE id = ?`
    ).run(row.id);
    console.log(`[AUTH] Magic link verified for ${row.email}`);
    return {
      success: true,
      user: { email: row.email },
      requested_role: row.requested_role || null,
    };
  } catch (err) {
    console.error('[AUTH] Magic token verify error:', err.message);
    return { success: false, error: 'Verification failed.' };
  }
}

// ── DCP-branded magic-link email template ────────────────────────────────
// Magic-link-only flow (state-of-the-art, like GitHub/Anthropic). No 6-digit
// code is shown to the user — clicking the link is the only sign-in path.
function buildMagicLinkEmailHtml(magicUrl) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070E;font-family:'Inter',Arial,sans-serif;color:#E5E5E5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070E;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:12px;overflow:hidden;max-width:480px;">
        <tr><td style="background:#F5A524;padding:20px 32px;">
          <h1 style="margin:0;color:#07070E;font-size:22px;font-weight:700;">DCP</h1>
        </td></tr>
        <tr><td style="padding:40px 32px;text-align:center;">
          <h2 style="color:#E5E5E5;font-size:22px;font-weight:700;margin:0 0 12px;">Sign in to DCP</h2>
          <p style="color:#A0A0B0;font-size:15px;margin:0 0 32px;line-height:1.5;">Click the button below to sign in to your DCP account.</p>
          <a href="${magicUrl}" style="display:inline-block;background:#F5A524;color:#07070E;text-decoration:none;padding:16px 40px;border-radius:8px;font-weight:700;font-size:16px;margin:0 0 24px;">Sign In to DCP</a>
          <p style="color:#6B6B7A;font-size:12px;margin:0 0 8px;">Or copy and paste this link into your browser:</p>
          <p style="color:#A0A0B0;font-size:11px;margin:0 0 32px;word-break:break-all;font-family:'Courier New',monospace;">${magicUrl}</p>
          <p style="color:#6B6B7A;font-size:12px;margin:0 0 8px;">This link expires in ${OTP_TTL_MINUTES} minutes and can only be used once.</p>
          <p style="color:#6B6B7A;font-size:12px;margin:0;">If you didn't request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #2A2A3A;margin:32px 0;" />
          <h2 style="color:#E5E5E5;font-size:22px;font-weight:700;margin:0 0 12px;direction:rtl;">تسجيل الدخول إلى DCP</h2>
          <p style="color:#A0A0B0;font-size:15px;margin:0 0 32px;line-height:1.6;direction:rtl;">اضغط على الزر أدناه لتسجيل الدخول إلى حسابك.</p>
          <a href="${magicUrl}" style="display:inline-block;background:#F5A524;color:#07070E;text-decoration:none;padding:16px 40px;border-radius:8px;font-weight:700;font-size:16px;margin:0 0 24px;direction:rtl;">تسجيل الدخول</a>
          <p style="color:#6B6B7A;font-size:12px;margin:0 0 8px;direction:rtl;">ينتهي هذا الرابط خلال ${OTP_TTL_MINUTES} دقيقة ويمكن استخدامه مرة واحدة فقط.</p>
          <p style="color:#6B6B7A;font-size:12px;margin:0;direction:rtl;">إذا لم تطلب هذا، يمكنك تجاهل هذه الرسالة.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Cleanup old codes (call periodically) ─────────────────────────────────
function cleanupExpiredCodes() {
  try {
    const deleted = db.prepare(`DELETE FROM otp_codes WHERE expires_at < datetime('now', '-1 hour')`).run();
    if (deleted.changes > 0) console.log(`[AUTH] Cleaned ${deleted.changes} expired OTP codes`);
  } catch (_) {}
}

// Run cleanup every 30 minutes
setInterval(cleanupExpiredCodes, 30 * 60 * 1000);

module.exports = { sendOtp, verifyOtp, verifyMagicToken };
