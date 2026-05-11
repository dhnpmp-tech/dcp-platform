/**
 * DC1 Email Service
 * Sends transactional emails via Resend (resend.com).
 *
 * Config: RESEND_API_KEY env var (from ecosystem.config.js)
 * Free tier: 100 emails/day, $0/mo
 *
 * Usage:
 *   const { sendWelcomeEmail } = require('./email');
 *   sendWelcomeEmail('provider', { name, email, apiKey }); // fire-and-forget
 *
 * Failure is intentionally silent — email errors NEVER block registration.
 */

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'DC1 Platform <noreply@dcp.sa>';

// ── Template builders ──────────────────────────────────────────────────────

function buildProviderEmail(name, apiKey) {
  const daemonUrl = `${process.env.BACKEND_URL || 'https://api.dcp.sa'}/api/providers/download/daemon`;
  const dashboardUrl = `${process.env.FRONTEND_URL || 'https://dcp.sa'}/provider`;

  return {
    subject: 'Welcome to DC1 — Your Provider API Key',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070E;font-family:'Inter',Arial,sans-serif;color:#E5E5E5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070E;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:12px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr><td style="background:#F5A524;padding:24px 32px;">
          <h1 style="margin:0;color:#07070E;font-size:24px;font-weight:700;letter-spacing:-0.5px;">DCP — AI Inference</h1>
          <p style="margin:4px 0 0;color:#07070E;opacity:0.75;font-size:14px;">Saudi-hosted, PDPL-compliant inference network</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="color:#F5A524;margin:0 0 16px;font-size:20px;">Welcome, ${escapeHtml(name)}!</h2>
          <p style="color:#A0A0B0;line-height:1.6;margin:0 0 24px;">
            Your provider account is ready. You're now part of the DCP inference network — share your GPU, earn 70% of the inference revenue it serves.
            Save your API key — it won't be shown again.
          </p>

          <!-- API Key box -->
          <div style="background:#07070E;border:1px solid #2A2A3A;border-radius:8px;padding:20px;margin:0 0 24px;">
            <p style="color:#6B6B7A;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Your Provider API Key</p>
            <code style="color:#F5A524;font-size:14px;font-family:'Courier New',monospace;word-break:break-all;">${escapeHtml(apiKey)}</code>
          </div>

          <!-- Next steps -->
          <h3 style="color:#E5E5E5;font-size:16px;margin:0 0 12px;">Get Started</h3>
          <ol style="color:#A0A0B0;line-height:1.8;margin:0 0 24px;padding-left:20px;">
            <li>Download the DCP provider app — auto-detects your GPU, installs Ollama, joins the mesh</li>
            <li>Let it run — the agent auto-pulls models on demand and serves inference traffic</li>
            <li>Monitor earnings and uptime on the provider dashboard</li>
          </ol>

          <!-- Buttons -->
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td style="padding-right:12px;">
                <a href="${daemonUrl}" style="display:inline-block;background:#F5A524;color:#07070E;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;">Download Provider App</a>
              </td>
              <td>
                <a href="${dashboardUrl}" style="display:inline-block;background:#1A1A28;color:#E5E5E5;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;border:1px solid #2A2A3A;">Provider Dashboard</a>
              </td>
            </tr>
          </table>

          <p style="color:#6B6B7A;font-size:12px;margin:0;">
            DCP — Saudi-hosted AI inference network<br>
            You are receiving this because you registered as a provider on dcp.sa.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Welcome to DCP, ${name}!\n\nYour provider account is ready.\n\nYour API Key: ${apiKey}\n\nNext steps:\n1. Download the DCP provider app: ${daemonUrl}\n2. Let it run — auto-detects GPU, joins the inference mesh, starts earning\n3. View your dashboard: ${dashboardUrl}\n\nSave your API key — it won't be shown again.\n\nDCP — Saudi-hosted AI inference network — dcp.sa`,
  };
}

function buildRenterEmail(name, apiKey) {
  const dashboardUrl = `${process.env.FRONTEND_URL || 'https://dcp.sa'}/renter`;

  return {
    subject: 'Welcome to DC1 — Your Renter API Key',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#07070E;font-family:'Inter',Arial,sans-serif;color:#E5E5E5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07070E;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:12px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr><td style="background:#F5A524;padding:24px 32px;">
          <h1 style="margin:0;color:#07070E;font-size:24px;font-weight:700;letter-spacing:-0.5px;">DCP — AI Inference</h1>
          <p style="margin:4px 0 0;color:#07070E;opacity:0.75;font-size:14px;">Saudi-hosted, PDPL-compliant inference network</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="color:#F5A524;margin:0 0 16px;font-size:20px;">Welcome, ${escapeHtml(name)}!</h2>
          <p style="color:#A0A0B0;line-height:1.6;margin:0 0 24px;">
            Your renter account is ready. You can now hit our OpenAI-compatible API to run inference on ALLaM, JAIS, Llama, Qwen, and 50+ open models — all hosted inside Saudi Arabia.
            Save your API key — it won't be shown again.
          </p>

          <!-- API Key box -->
          <div style="background:#07070E;border:1px solid #2A2A3A;border-radius:8px;padding:20px;margin:0 0 24px;">
            <p style="color:#6B6B7A;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Your Renter API Key</p>
            <code style="color:#F5A524;font-size:14px;font-family:'Courier New',monospace;word-break:break-all;">${escapeHtml(apiKey)}</code>
          </div>

          <!-- Account credit -->
          <div style="background:#0F2A1A;border:1px solid #1A4A2A;border-radius:8px;padding:16px;margin:0 0 24px;">
            <p style="color:#4ADE80;font-size:14px;margin:0;font-weight:600;">10 SAR starter credit added to your account</p>
            <p style="color:#6B6B7A;font-size:12px;margin:4px 0 0;">Use this for your first ~500K tokens on a Small-tier model — no payment required.</p>
          </div>

          <!-- Get started -->
          <h3 style="color:#E5E5E5;font-size:16px;margin:0 0 12px;">Get Started</h3>
          <ol style="color:#A0A0B0;line-height:1.8;margin:0 0 24px;padding-left:20px;">
            <li>Point your OpenAI SDK at <code style="color:#F5A524;">https://api.dcp.sa</code> with your API key</li>
            <li>Pick a model in the marketplace or call <code style="color:#F5A524;">/v1/chat/completions</code> directly</li>
            <li>You only pay for tokens used — input and output priced separately</li>
          </ol>

          <!-- Dashboard button -->
          <a href="${dashboardUrl}" style="display:inline-block;background:#F5A524;color:#07070E;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:14px;margin:0 0 24px;">Go to Dashboard</a>

          <p style="color:#6B6B7A;font-size:12px;margin:0;">
            DCP — Saudi-hosted AI inference network<br>
            You are receiving this because you registered as a renter on dcp.sa.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
    text: `Welcome to DCP, ${name}!\n\nYour renter account is ready.\n\nYour API Key: ${apiKey}\n\nYou have 10 SAR starter credit — run your first inference call now via the OpenAI-compatible API at https://api.dcp.sa.\n\nDashboard: ${dashboardUrl}\n\nSave your API key — it won't be shown again.\n\nDCP — Saudi-hosted AI inference network — dcp.sa`,
  };
}

// ── Escape helper (prevent XSS in HTML emails) ─────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Core send function ─────────────────────────────────────────────────────

async function sendEmail(to, subject, html, text) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'CHANGE_ME_resend_api_key') {
    console.warn('[email] RESEND_API_KEY not configured — skipping email to', to);
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html, text }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[email] Sent to ${to} — id: ${data.id}`);
      return { ok: true, id: data.id };
    } else {
      const err = await res.text();
      console.error(`[email] Send failed (${res.status}):`, err);
      return { ok: false, status: res.status, error: err };
    }
  } catch (e) {
    console.error('[email] Network error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Send a welcome email after registration.
 * @param {'provider'|'renter'} type
 * @param {{ name: string, email: string, apiKey: string }} recipient
 * Fire-and-forget — never throws, never blocks registration.
 */
function sendWelcomeEmail(type, { name, email, apiKey }) {
  const template = type === 'provider'
    ? buildProviderEmail(name, apiKey)
    : buildRenterEmail(name, apiKey);

  // Intentional fire-and-forget — do NOT await
  sendEmail(email, template.subject, template.html, template.text)
    .catch(e => console.error('[email] Unexpected error:', e.message));
}

module.exports = { sendWelcomeEmail };
