// DCP Payment Routes — Moyasar SAR integration (DCP-31)
// Moyasar: Saudi-first gateway supporting mada, Apple Pay, VISA/MC in SAR
// Docs: https://moyasar.com/docs
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const router = express.Router();
const db = require('../db');
const { looksLikeProviderKey } = require('../middleware/auth');
const { withFinancialIdempotency } = require('../lib/financial-idempotency');

function flattenRunParams(params) {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params.reduce((acc, p) => (Array.isArray(p) ? acc.concat(p) : acc.concat([p])), []);
}

function runStatement(sql, ...params) {
  return db.prepare(sql).run(...flattenRunParams(params));
}

const MOYASAR_BASE = 'https://api.moyasar.com/v1';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dcp.sa';
const getMoyasarSecret = () => process.env.MOYASAR_SECRET_KEY || '';
const getMoyasarWebhookSecret = () => process.env.MOYASAR_WEBHOOK_SECRET || '';
const getPayoutWebhookSecret = () => process.env.MOYASAR_PAYOUT_WEBHOOK_SECRET || getMoyasarWebhookSecret();
const WEBHOOK_STATUSES = new Set(['initiated', 'paid', 'failed', 'refunded']);
const isProduction = () => process.env.NODE_ENV === 'production';

// Phase 1 bank transfer constants (manual Saudi IBAN flow)
const BANK_TRANSFER_IBAN = process.env.DCP_BANK_IBAN || 'SA0000000000000000000000';
const BANK_TRANSFER_ACCOUNT_NAME = process.env.DCP_BANK_ACCOUNT_NAME || 'DC1 Compute Platform';
const BANK_TRANSFER_BANK_NAME = process.env.DCP_BANK_NAME || 'Al Rajhi Bank';
const BANK_TRANSFER_EXPIRY_HOURS = 48;
const ALLOWED_CALLBACK_ORIGINS = new Set(
  [
    FRONTEND_URL,
    ...(process.env.PAYMENT_CALLBACK_ORIGINS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  ]
    .map((entry) => {
      try {
        return new URL(entry).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
);

if (isProduction() && !getMoyasarWebhookSecret()) {
  console.warn('[payments] MOYASAR_WEBHOOK_SECRET is not set; /api/payments/webhook will return 503 until configured');
}

function toFiniteNumber(value, { min = null, max = null } = {}) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

function toFiniteInt(value, { min = null, max = null } = {}) {
  const num = toFiniteNumber(value, { min, max });
  if (num == null || !Number.isInteger(num)) return null;
  return num;
}

function normalizeCallbackUrl(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(parsed.protocol)) return null;
  if (isProduction() && parsed.protocol !== 'https:') return null;
  if (isProduction() && !ALLOWED_CALLBACK_ORIGINS.has(parsed.origin)) return null;
  return parsed.toString();
}

// ─── Moyasar API helper ────────────────────────────────────────────────────────

function moyasarRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const moyasarSecret = getMoyasarSecret();
    if (!moyasarSecret) {
      return reject(new Error('MOYASAR_SECRET_KEY not configured'));
    }

    const bodyStr = body ? JSON.stringify(body) : null;
    const auth = Buffer.from(`${moyasarSecret}:`).toString('base64');
    const url = new URL(MOYASAR_BASE + path);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    if (bodyStr) options.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.message || parsed.type || 'Moyasar API error');
            err.statusCode = res.statusCode;
            err.moyasarError = parsed;
            return reject(err);
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error('Invalid Moyasar response: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Webhook HMAC verification ─────────────────────────────────────────────────

function verifyMoyasarWebhook(rawBody, signatureHeader, webhookSecret) {
  if (!webhookSecret || !signatureHeader) return false;
  const signature = String(signatureHeader).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex')
    );
  } catch {
    return false;
  }
}

function markPaymentPaidOnce(paymentId, renterId, amountHalala, nowIso, gatewayPayload) {
  const tx = db._db.transaction(() => {
    const paymentUpdate = runStatement(
      `UPDATE payments
         SET status = 'paid', confirmed_at = ?, gateway_response = ?
       WHERE payment_id = ?
         AND status IN ('pending', 'initiated', 'failed')`,
      nowIso,
      gatewayPayload,
      paymentId
    );
    if (!paymentUpdate.changes) return false;

    runStatement(
      `UPDATE renters
          SET balance_halala = balance_halala + ?, updated_at = ?
        WHERE id = ?`,
      amountHalala,
      nowIso,
      renterId
    );
    return true;
  });
  return tx();
}

function markPaymentRefundedOnce(paymentId, renterId, refundAmountHalala, nowIso, gatewayPayload) {
  const tx = db._db.transaction(() => {
    const paymentUpdate = runStatement(
      `UPDATE payments
          SET status = 'refunded',
              refunded_at = ?,
              refund_amount_halala = ?,
              gateway_response = ?
        WHERE payment_id = ?
          AND status = 'paid'
          AND refunded_at IS NULL`,
      nowIso,
      refundAmountHalala,
      gatewayPayload,
      paymentId
    );
    if (!paymentUpdate.changes) return false;

    runStatement(
      `UPDATE renters
          SET balance_halala = MAX(0, balance_halala - ?), updated_at = ?
        WHERE id = ?`,
      refundAmountHalala,
      nowIso,
      renterId
    );
    return true;
  });
  return tx();
}

// ─── Renter auth helper ────────────────────────────────────────────────────────

function getRenter(req) {
  const key = req.headers['x-renter-key'] || req.query.key;
  if (!key) return null;
  // H1 — reject provider-prefixed keys before DB lookup.
  if (looksLikeProviderKey(key)) return null;
  return db.get('SELECT * FROM renters WHERE api_key = ? AND status = ?', key, 'active');
}

function requireRenter(req, res, next) {
  const renter = getRenter(req);
  if (!renter) {
    return res.status(401).json({ error: 'API key required (x-renter-key header or key query)' });
  }
  req.renter = renter;
  return next();
}

// ─── GET /api/payments/balance ─────────────────────────────────────────────────
// Renter checks their current SAR balance.
router.get('/balance', requireRenter, (req, res) => {
  const renter = req.renter;
  const fresh = db.get('SELECT balance_halala FROM renters WHERE id = ?', renter.id);
  const balanceHalala = (fresh && fresh.balance_halala) || 0;
  return res.json({
    balance_sar: Number((balanceHalala / 100).toFixed(2)),
    balance_halala: balanceHalala,
    renter_id: renter.id,
    name: renter.name,
    email: renter.email,
  });
});

// ─── POST /api/payments/topup ──────────────────────────────────────────────────
// Initiate a SAR top-up. bank_transfer returns IBAN instructions (Phase 1, manual).
// creditcard/applepay go through Moyasar (Phase 2).
// Body: { amount_halala: number, payment_method: "creditcard"|"applepay"|"bank_transfer" }
router.post('/topup', requireRenter, withFinancialIdempotency({
  subjectType: 'renter',
  subjectId: (req) => req.renter && req.renter.id,
}), (req, res) => {
  const renter = req.renter;
  const { amount_halala, payment_method, amount_sar, source_type, callback_url } = req.body || {};
  const methodRaw = payment_method || source_type || 'creditcard';
  const paymentMethod = String(methodRaw).trim().toLowerCase();
  const allowedMethods = ['creditcard', 'applepay', 'bank_transfer'];
  if (!allowedMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: 'payment_method must be one of: creditcard, applepay, bank_transfer' });
  }

  let amountHalala = toFiniteInt(amount_halala, { min: 100, max: 1000000 });
  if (amountHalala == null) {
    if (amount_sar != null) {
      const legacyAmountSar = toFiniteNumber(amount_sar);
      if (legacyAmountSar == null) {
        return res.status(400).json({ error: 'amount_sar must be a finite number' });
      }
      if (legacyAmountSar < 1) {
        return res.status(400).json({ error: 'amount_sar below minimum (1 SAR)' });
      }
      if (legacyAmountSar > 10000) {
        return res.status(400).json({ error: 'amount_sar exceeds maximum (10,000 SAR)' });
      }
      amountHalala = Math.round(legacyAmountSar * 100);
    }
  }
  if (amountHalala == null) {
    return res.status(400).json({ error: 'amount_halala must be an integer between 100 and 1000000' });
  }

  const amountSar = Number((amountHalala / 100).toFixed(2));

  // ── Phase 1: bank transfer (manual IBAN, no gateway required) ──────────────
  if (paymentMethod === 'bank_transfer') {
    const topupId = `pay_bt_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + BANK_TRANSFER_EXPIRY_HOURS * 3600 * 1000).toISOString();
    const reference = `DCP-${renter.id}-${topupId.slice(-8).toUpperCase()}`;
    runStatement(
      `INSERT INTO payments
         (payment_id, renter_id, amount_sar, amount_halala, status, source_type, payment_method,
          description, created_at)
       VALUES (?, ?, ?, ?, 'pending', 'bank_transfer', 'bank_transfer', ?, ?)`,
      topupId, renter.id, amountSar, amountHalala,
      `DCP bank transfer top-up — ${renter.name} (${renter.email})`, now
    );
    return res.json({
      topup_id: topupId,
      payment_method: 'bank_transfer',
      amount_sar: amountSar,
      amount_halala: amountHalala,
      status: 'pending',
      expires_at: expiresAt,
      instructions: {
        step1: `Transfer exactly SAR ${amountSar.toFixed(2)} to the account below`,
        step2: `Include reference "${reference}" in the transfer notes/memo`,
        step3: 'Balance will be credited within 1 business day after admin confirmation',
        bank_name: BANK_TRANSFER_BANK_NAME,
        account_name: BANK_TRANSFER_ACCOUNT_NAME,
        iban: BANK_TRANSFER_IBAN,
        reference,
      },
    });
  }

  // ── Phase 2: Moyasar gateway (creditcard / applepay) ──────────────────────
  const normalizedCallbackUrl = normalizeCallbackUrl(callback_url);
  const callbackUrl = normalizedCallbackUrl || `${FRONTEND_URL}/renter/billing?payment=callback`;
  if (callback_url != null && !normalizedCallbackUrl) {
    return res.status(400).json({
      error: isProduction()
        ? 'callback_url must be an https URL on an allowlisted origin'
        : 'callback_url must be a valid http(s) URL',
    });
  }
  const description = `DCP balance top-up — ${renter.name} (${renter.email})`;

  const moyasarBody = {
    amount: amountHalala,
    currency: 'SAR',
    description,
    callback_url: callbackUrl,
    source: { type: paymentMethod },
    metadata: {
      renter_id: renter.id,
      renter_email: renter.email,
    },
  };

  moyasarRequest('POST', '/payments', moyasarBody)
    .then(payment => {
      const internalPaymentId = `pay_${crypto.randomBytes(12).toString('hex')}`;
      const moyasarId = payment.id;
      const paymentUrl = payment.source?.transaction_url || payment.source?.checkout_url || null;
      const now = new Date().toISOString();

      // Store payment record (status=pending until webhook confirms)
      runStatement(
        `INSERT INTO payments
           (payment_id, moyasar_id, renter_id, amount_sar, amount_halala, status, source_type, payment_method,
            description, callback_url, checkout_url, gateway_response, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
        internalPaymentId, moyasarId, renter.id, amountSar, amountHalala, paymentMethod, paymentMethod,
        description, callbackUrl, paymentUrl,
        JSON.stringify(payment), now
      );

      res.json({
        payment_url: paymentUrl,
        payment_id: internalPaymentId,
      });
    })
    .catch(err => {
      console.error('[payments] Moyasar topup error:', err.message, err.moyasarError);
      if (err.message === 'MOYASAR_SECRET_KEY not configured') {
        const sandboxAllowed = !isProduction() && !getMoyasarSecret();
        return res.status(503).json({
          error: 'Payment gateway not configured. Set MOYASAR_SECRET_KEY.',
          action_required: 'Configure MOYASAR_SECRET_KEY and MOYASAR_WEBHOOK_SECRET.',
          ...(sandboxAllowed ? { sandbox_hint: 'Use POST /api/payments/topup-sandbox for dev/test.' } : {}),
        });
      }
      const statusCode = err.statusCode === 422 ? 422 : 502;
      res.status(statusCode).json({
        error: 'Payment initiation failed',
        details: err.moyasarError || err.message,
      });
    });
});

// ─── POST /api/payments/topup-sandbox ─────────────────────────────────────────
// Dev-only sandbox top-up: directly credits balance without Moyasar (when key not set).
// Disabled in production (requires MOYASAR_SECRET_KEY to be absent).
router.post('/topup-sandbox', (req, res) => {
  if (isProduction()) {
    return res.status(403).json({
      error: 'Sandbox top-up is disabled in production.',
    });
  }

  if (getMoyasarSecret()) {
    return res.status(403).json({
      error: 'Sandbox top-up disabled when MOYASAR_SECRET_KEY is configured. Use /api/payments/topup.',
    });
  }

  const renter = getRenter(req);
  if (!renter) {
    return res.status(401).json({ error: 'API key required (x-renter-key header or key query)' });
  }

  const { amount_sar } = req.body;
  const amountSar = toFiniteNumber(amount_sar, { min: 0.01, max: 10000 });
  if (amountSar == null) {
    return res.status(400).json({ error: 'amount_sar must be between 0 and 10,000' });
  }

  const amountHalala = Math.round(amountSar * 100);
  const paymentId = 'sandbox-' + crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();

  runStatement(
    `INSERT INTO payments
       (payment_id, moyasar_id, renter_id, amount_sar, amount_halala, status, source_type, payment_method,
        description, created_at, confirmed_at)
     VALUES (?, ?, ?, ?, ?, 'paid', 'sandbox', 'creditcard', ?, ?, ?)`,
    paymentId, paymentId, renter.id, amountSar, amountHalala,
    'Sandbox top-up (dev mode)', now, now
  );

  runStatement(
    `UPDATE renters SET balance_halala = balance_halala + ?, updated_at = ? WHERE id = ?`,
    amountHalala, now, renter.id
  );

  const updated = db.get('SELECT balance_halala FROM renters WHERE id = ?', renter.id);

  res.json({
    success: true,
    sandbox: true,
    payment_id: paymentId,
    amount_sar: amountSar,
    credited_halala: amountHalala,
    new_balance_sar: updated.balance_halala / 100,
    new_balance_halala: updated.balance_halala,
  });
});

// ─── POST /api/payments/webhook ────────────────────────────────────────────────
// Moyasar webhook handler. Verifies HMAC-SHA256 signature, credits balance on `paid`.
// Moyasar retries webhooks on non-2xx response.
// Raw body is mounted in server.js before express.json()
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  let rawBody = req.body; // Buffer (express.raw)
  const signature = req.headers['x-moyasar-signature'];

  if (!Buffer.isBuffer(rawBody)) {
    if (typeof rawBody === 'string') rawBody = Buffer.from(rawBody);
    else if (rawBody && typeof rawBody === 'object') rawBody = Buffer.from(JSON.stringify(rawBody));
  }
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const webhookSecret = getMoyasarWebhookSecret();
  if (!webhookSecret) {
    console.warn("[payments/webhook] MOYASAR_WEBHOOK_SECRET not configured - rejecting webhook");
    return res.status(503).json({ error: "Webhook secret not configured" });
  }
  let verified = verifyMoyasarWebhook(rawBody, signature, webhookSecret);
    if (!verified) {
      try {
        const parsed = JSON.parse(rawBody.toString('utf8'));
        if (parsed && parsed.type === 'Buffer' && Array.isArray(parsed.data)) {
          const decodedBody = Buffer.from(parsed.data);
          if (verifyMoyasarWebhook(decodedBody, signature, webhookSecret)) {
            rawBody = decodedBody;
            verified = true;
          }
        }
      } catch (_) {}
    }
    if (!verified) {
      console.warn('[payments/webhook] Invalid HMAC signature — rejected');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
    if (event && event.type === 'Buffer' && Array.isArray(event.data)) {
      event = JSON.parse(Buffer.from(event.data).toString('utf8'));
    }
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const paymentId = typeof event?.id === 'string' ? event.id.trim() : '';
  const status = typeof event?.status === 'string' ? event.status.trim().toLowerCase() : ''; // 'paid' | 'failed' | 'refunded' | 'initiated'
  if (!paymentId) {
    return res.status(400).json({ error: 'Webhook payload missing payment id' });
  }
  if (!WEBHOOK_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Unsupported payment status in webhook payload' });
  }
  if (event?.currency && String(event.currency).toUpperCase() !== 'SAR') {
    return res.status(400).json({ error: 'Unsupported currency in webhook payload' });
  }
  const now = new Date().toISOString();

  // Look up stored payment record
  const payment = db.get(
    'SELECT * FROM payments WHERE moyasar_id = ? OR payment_id = ?',
    paymentId,
    paymentId
  );

  if (!payment) {
    // Unknown payment — return 200 to prevent Moyasar retries for stale events
    console.warn(`[payments/webhook] Unknown payment_id: ${paymentId} — acknowledging`);
    return res.json({ received: true, action: 'ignored_unknown' });
  }

  if (payment.status === status) {
    // Idempotent: already processed
    return res.json({ received: true, action: 'already_processed' });
  }

  // Ignore stale/out-of-order terminal regressions.
  if (payment.status === 'paid' && (status === 'initiated' || status === 'failed')) {
    return res.json({ received: true, action: 'ignored_stale_status', current_status: payment.status });
  }
  if (payment.status === 'refunded' && status !== 'refunded') {
    return res.json({ received: true, action: 'ignored_refunded_terminal_status' });
  }

  if (status === 'paid') {
    const changed = markPaymentPaidOnce(
      payment.payment_id,
      payment.renter_id,
      payment.amount_halala,
      now,
      JSON.stringify(event)
    );
    if (changed) {
      console.log(`[payments/webhook] Payment ${payment.payment_id} paid — credited ${payment.amount_halala} halala to renter ${payment.renter_id}`);
      // Codex P1 (PR #428): if this payment originated from an auto-top-up
      // 3DS step-up, finalize the auto_topup_attempts row + send the paid
      // email + bump monthly cap. Idempotent — safe on webhook retries.
      try {
        const autoTopup = require('../services/autoTopupService');
        const fin = autoTopup.finalizeFrom3dsCallback(db._db || db, payment.moyasar_id || payment.payment_id);
        if (fin.finalized) {
          console.log(`[payments/webhook] auto-topup attempt ${fin.attemptId} finalized via 3DS callback`);
        }
      } catch (e) {
        console.warn('[payments/webhook] auto-topup finalize failed:', e?.message || e);
      }
      return res.json({ received: true, action: 'balance_credited', amount_halala: payment.amount_halala });
    }
    return res.json({ received: true, action: 'already_processed' });
  }

  if (status === 'failed') {
    if (payment.status === 'paid' || payment.status === 'refunded') {
      return res.json({ received: true, action: 'ignored_stale_status', current_status: payment.status });
    }
    runStatement(
      `UPDATE payments SET status = 'failed', gateway_response = ? WHERE payment_id = ?`,
      JSON.stringify(event), payment.payment_id
    );
    // Auto-top-up parity: mark the attempt failed too so monthly_used isn't
    // bumped and the renter gets the failed email.
    try {
      const autoTopup = require('../services/autoTopupService');
      const attempt = db.get(
        "SELECT * FROM auto_topup_attempts WHERE moyasar_payment_id = ? AND status IN ('3ds_required','initiated')",
        payment.moyasar_id || payment.payment_id
      );
      if (attempt) {
        runStatement(
          `UPDATE auto_topup_attempts SET status = 'failed', error_message = ?, gateway_response = ?, completed_at = ? WHERE id = ?`,
          '3DS verification failed or card declined',
          JSON.stringify(event),
          now,
          attempt.id
        );
      }
    } catch (e) {
      console.warn('[payments/webhook] auto-topup failure-mirror failed:', e?.message || e);
    }
    console.log(`[payments/webhook] Payment ${payment.payment_id} failed`);
    return res.json({ received: true, action: 'marked_failed' });
  }

  if (status === 'refunded') {
    const parsedRefundAmount = toFiniteInt(event.amount_refunded, { min: 1, max: payment.amount_halala });
    const refundAmount = parsedRefundAmount == null ? payment.amount_halala : parsedRefundAmount;
    const changed = markPaymentRefundedOnce(
      payment.payment_id,
      payment.renter_id,
      refundAmount,
      now,
      JSON.stringify(event)
    );
    if (changed) {
      console.log(`[payments/webhook] Payment ${payment.payment_id} refunded — ${refundAmount} halala`);
      return res.json({ received: true, action: 'refund_processed' });
    }
    return res.json({ received: true, action: 'already_processed' });
  }

  // For non-terminal status (e.g. 'initiated'), sync status but do not mutate balance.
  runStatement(
    `UPDATE payments SET status = ?, gateway_response = ? WHERE payment_id = ?`,
    status, JSON.stringify(event), payment.payment_id
  );
  res.json({ received: true, action: 'status_updated', new_status: status });
});

// ─── GET /api/payments/verify/:paymentId ──────────────────────────────────────
// Fetch live payment status from Moyasar. Used by frontend to poll after redirect.
// Auth: renter key must own the payment.
router.get('/verify/:paymentId', (req, res) => {
  const renter = getRenter(req);
  if (!renter) {
    return res.status(401).json({ error: 'API key required' });
  }

  const { paymentId } = req.params;
  const localPayment = db.get(
    'SELECT * FROM payments WHERE renter_id = ? AND (payment_id = ? OR moyasar_id = ?)',
    renter.id, paymentId, paymentId
  );
  if (!localPayment) {
    return res.status(404).json({ error: 'Payment not found' });
  }

  // If already confirmed, return local record. Parse the cached gateway_response
  // so callers (e.g. the renter billing UI's save-card flow) can still retrieve
  // source.token/brand/last4 after the webhook has marked the row 'paid'.
  // (Codex PR #427 P2 fix — without this the second verify call returns no
  // source fields and the auto-top-up save-card flow can never persist.)
  if (localPayment.status === 'paid') {
    let source = null;
    try {
      const cached = localPayment.gateway_response ? JSON.parse(localPayment.gateway_response) : null;
      if (cached && cached.source && typeof cached.source === 'object') {
        source = cached.source;
      }
    } catch (_) {
      // gateway_response unparseable — fall through with source=null.
    }
    return res.json({
      payment_id: localPayment.payment_id,
      moyasar_id: localPayment.moyasar_id || null,
      status: 'paid',
      amount_sar: localPayment.amount_sar,
      amount_halala: localPayment.amount_halala,
      confirmed_at: localPayment.confirmed_at,
      source_type: localPayment.source_type || source?.type || null,
      source: source ? {
        type: source.type || null,
        token: source.token || null,
        brand: source.company || source.brand || null,
        last4: source.number ? String(source.number).slice(-4) : (source.last_4 || null),
      } : null,
    });
  }

  // Fetch live status from Moyasar
  if (!getMoyasarSecret()) {
    return res.json({
      payment_id: localPayment.payment_id,
      status: localPayment.status,
      amount_sar: localPayment.amount_sar,
      amount_halala: localPayment.amount_halala,
      note: 'Gateway not configured — showing local status',
    });
  }

  const externalPaymentId = localPayment.moyasar_id || localPayment.payment_id;
  moyasarRequest('GET', `/payments/${externalPaymentId}`, null)
    .then(payment => {
      const now = new Date().toISOString();

      // Sync local record if Moyasar reports paid
      if (payment.status === 'paid' && localPayment.status !== 'paid') {
        const changed = markPaymentPaidOnce(
          localPayment.payment_id,
          renter.id,
          localPayment.amount_halala,
          now,
          JSON.stringify(payment)
        );
        if (changed) {
          console.log(`[payments/verify] Late sync: payment ${localPayment.payment_id} paid — credited ${localPayment.amount_halala} halala`);
        }
      }

      res.json({
        payment_id: localPayment.payment_id,
        moyasar_id: payment.id,
        status: payment.status,
        amount_sar: payment.amount / 100,
        amount_halala: payment.amount,
        source_type: payment.source?.type,
        // Surface source fields so the save-card flow can capture the token id
        // on the same call (Codex PR #427 P2 fix).
        source: payment.source ? {
          type: payment.source.type || null,
          token: payment.source.token || null,
          brand: payment.source.company || payment.source.brand || null,
          last4: payment.source.number ? String(payment.source.number).slice(-4) : (payment.source.last_4 || null),
        } : null,
        created_at: payment.created_at,
      });
    })
    .catch(err => {
      console.error('[payments/verify] Moyasar fetch error:', err.message);
      // Fallback to local record
      res.json({
        payment_id: localPayment.payment_id,
        moyasar_id: localPayment.moyasar_id || null,
        status: localPayment.status,
        amount_sar: localPayment.amount_sar,
        amount_halala: localPayment.amount_halala,
        gateway_error: 'Could not reach Moyasar — showing local status',
      });
    });
});

// ─── GET /api/payments/history ─────────────────────────────────────────────────
// Renter's own payment history (paginated).
router.get('/history', (req, res) => {
  const renter = getRenter(req);
  if (!renter) {
    return res.status(401).json({ error: 'API key required' });
  }

  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  const payments = db.all(
    `SELECT payment_id, moyasar_id, amount_sar, amount_halala, status, source_type, payment_method,
            description, created_at, confirmed_at, refunded_at, refund_amount_halala
     FROM payments WHERE renter_id = ?
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    renter.id, limit, offset
  );

  const total = db.get('SELECT COUNT(*) as count FROM payments WHERE renter_id = ?', renter.id);
  const totalPaid = db.get(
    `SELECT COALESCE(SUM(amount_halala), 0) as total FROM payments WHERE renter_id = ? AND status = 'paid'`,
    renter.id
  );

  res.json({
    payments,
    pagination: { limit, offset, total: total.count },
    summary: {
      total_paid_sar: totalPaid.total / 100,
      total_paid_halala: totalPaid.total,
    },
  });
});

// ─── Auto-top-up routes ────────────────────────────────────────────────────────
const autoTopupService = require('../services/autoTopupService');

// GET /api/payments/auto-topup-settings — read current config + card on file.
router.get('/auto-topup-settings', requireRenter, (req, res) => {
  const r = autoTopupService.readSettings(db._db || db, req.renter.id);
  if (!r) return res.status(404).json({ error: 'Renter not found' });
  return res.json({
    enabled: !!r.auto_topup_enabled,
    threshold_halala: r.auto_topup_threshold_halala || 0,
    threshold_sar: (r.auto_topup_threshold_halala || 0) / 100,
    amount_halala: r.auto_topup_amount_halala || 0,
    amount_sar: (r.auto_topup_amount_halala || 0) / 100,
    monthly_cap_halala: r.auto_topup_monthly_cap_halala || 0,
    monthly_cap_sar: (r.auto_topup_monthly_cap_halala || 0) / 100,
    monthly_used_halala: r.auto_topup_monthly_used_halala || 0,
    monthly_used_sar: (r.auto_topup_monthly_used_halala || 0) / 100,
    paused_until: r.auto_topup_paused_until,
    consecutive_failures: r.auto_topup_consecutive_failures || 0,
    last_attempt_at: r.auto_topup_last_attempt_at,
    card_on_file: r.moyasar_card_token
      ? {
          brand: r.moyasar_card_brand,
          last4: r.moyasar_card_last4,
          saved_at: r.moyasar_card_saved_at,
        }
      : null,
  });
});

// POST /api/payments/auto-topup-settings — update config.
// Body: { enabled, threshold_sar?, amount_sar?, monthly_cap_sar? }
//   OR  { enabled, threshold_halala?, amount_halala?, monthly_cap_halala? }
router.post('/auto-topup-settings', requireRenter, (req, res) => {
  const b = req.body || {};
  const thresholdHalala = b.threshold_halala != null
    ? toFiniteInt(b.threshold_halala, { min: 0, max: 100_000_000 })
    : Math.round(toFiniteNumber(b.threshold_sar, { min: 0, max: 1_000_000 }) * 100);
  const amountHalala = b.amount_halala != null
    ? toFiniteInt(b.amount_halala, { min: 0, max: 100_000_000 })
    : Math.round(toFiniteNumber(b.amount_sar, { min: 0, max: 1_000_000 }) * 100);
  const capHalala = b.monthly_cap_halala != null
    ? toFiniteInt(b.monthly_cap_halala, { min: 0, max: 1_000_000_000 })
    : Math.round(toFiniteNumber(b.monthly_cap_sar, { min: 0, max: 10_000_000 }) * 100);

  const result = autoTopupService.updateSettings(db._db || db, req.renter.id, {
    enabled: !!b.enabled,
    thresholdHalala,
    amountHalala,
    monthlyCapHalala: capHalala,
  });
  if (result.error) {
    const statusMap = {
      INVALID_AMOUNT: 400,
      INVALID_THRESHOLD: 400,
      CAP_BELOW_AMOUNT: 400,
      NO_CARD_ON_FILE: 412,
    };
    return res.status(statusMap[result.error] || 400).json(result);
  }
  return res.json({ ok: true });
});

// POST /api/payments/save-card-token — receive a token id from the frontend.
// The frontend uses Moyasar's publishable key to call POST /v1/tokens directly
// (PAN never touches our backend); on success the frontend POSTs the resulting
// token id to this endpoint along with the display fields. Verification (3DS)
// must have completed on the frontend before this is called.
//
// Body: { token: string, brand?: string, last4?: string, holder_name?: string }
router.post('/save-card-token', requireRenter, (req, res) => {
  const { token, brand, last4, holder_name } = req.body || {};
  if (typeof token !== 'string' || !token.startsWith('token_')) {
    return res.status(400).json({ error: 'INVALID_TOKEN', message: 'token must be a Moyasar token id (token_...)' });
  }
  const updated = autoTopupService.saveCardToken(db._db || db, req.renter.id, {
    token, brand, last4, holderName: holder_name,
  });
  return res.json({
    ok: true,
    card_on_file: {
      brand: updated.moyasar_card_brand,
      last4: updated.moyasar_card_last4,
      saved_at: updated.moyasar_card_saved_at,
    },
  });
});

// DELETE /api/payments/saved-card — forget the token + disable auto-top-up.
router.delete('/saved-card', requireRenter, (req, res) => {
  const rawDb = db._db || db;
  rawDb.prepare(`
    UPDATE renters
       SET moyasar_card_token = NULL,
           moyasar_card_brand = NULL,
           moyasar_card_last4 = NULL,
           moyasar_card_saved_at = NULL,
           auto_topup_enabled = 0
     WHERE id = ?
  `).run(req.renter.id);
  return res.json({ ok: true });
});

// ─── POST /api/payments/payout-webhook ─────────────────────────────────────────
// Moyasar webhook handler for payout status transitions. Mirrors the /webhook
// flow but updates payout_requests rows instead of payments.
//
// If Moyasar emits payout.* events to this URL, this is the fast path. Otherwise
// the syncPayoutStatus poller (admin button or cron) catches up.
//
// Raw body is mounted in server.js before express.json().
router.post('/payout-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let rawBody = req.body;
  const signature = req.headers['x-moyasar-signature'];

  if (!Buffer.isBuffer(rawBody)) {
    if (typeof rawBody === 'string') rawBody = Buffer.from(rawBody);
    else if (rawBody && typeof rawBody === 'object') rawBody = Buffer.from(JSON.stringify(rawBody));
  }
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const webhookSecret = getPayoutWebhookSecret();
  if (!webhookSecret) {
    console.warn('[payout-webhook] No webhook secret configured — rejecting');
    return res.status(503).json({ error: 'Webhook secret not configured' });
  }

  let verified = verifyMoyasarWebhook(rawBody, signature, webhookSecret);
  if (!verified) {
    try {
      const parsed = JSON.parse(rawBody.toString('utf8'));
      if (parsed && parsed.type === 'Buffer' && Array.isArray(parsed.data)) {
        const decoded = Buffer.from(parsed.data);
        if (verifyMoyasarWebhook(decoded, signature, webhookSecret)) {
          rawBody = decoded;
          verified = true;
        }
      }
    } catch (_) {}
  }
  if (!verified) {
    console.warn('[payout-webhook] Invalid HMAC — rejected');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
    if (event && event.type === 'Buffer' && Array.isArray(event.data)) {
      event = JSON.parse(Buffer.from(event.data).toString('utf8'));
    }
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  // Moyasar event shape (assumed mirror of payment_paid):
  //   { type: 'payout_paid'|'payout_failed'|..., data: { id, status, ... } }
  // We tolerate both top-level payout objects and wrapped event envelopes.
  const payload = event && event.data && typeof event.data === 'object' ? event.data : event;
  const moyasarPayoutId = typeof payload?.id === 'string' ? payload.id.trim() : '';
  if (!moyasarPayoutId) {
    return res.status(400).json({ error: 'Webhook payload missing payout id' });
  }

  const row = db.get('SELECT id FROM payout_requests WHERE moyasar_payout_id = ?', moyasarPayoutId);
  if (!row) {
    console.warn(`[payout-webhook] Unknown moyasar_payout_id=${moyasarPayoutId} — acking`);
    return res.json({ received: true, action: 'ignored_unknown' });
  }

  // Defer to syncPayoutStatus — it pulls live state from Moyasar (authoritative),
  // handles fund return on failure, and is idempotent.
  const { syncPayoutStatus } = require('../services/payoutService');
  try {
    const result = await syncPayoutStatus(db._db || db, row.id);
    return res.json({ received: true, ...result });
  } catch (err) {
    console.error('[payout-webhook] sync error:', err);
    return res.status(500).json({ error: 'sync_failed' });
  }
});

module.exports = router;
