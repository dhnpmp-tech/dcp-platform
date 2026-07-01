'use strict';

// ── Rentable persistent volumes ─────────────────────────────────────────────
// A renter rents a fixed-size volume (10/20/30 GB) → a per-renter MinIO bucket
// with a hard quota on the in-Kingdom Node-2 store. Paid (cost-plus, $0.05/GB/mo),
// exclusive, monthly-billed. A renter's pod /workspace snapshots to this bucket
// and restores on the next pod on any provider (see daemon snapshot/restore).
//
// Reuses pods.js requireRenter (identical renter-auth contract). All money moves
// are atomic against renters.balance_halala. The 100 GB pool ceiling is enforced
// here at rent time.

const express = require('express');
const db = require('../db');
const { requireRenter } = require('./pods');
const { provisionVolume, deprovisionVolume, volumeUsedBytes, bucketFor } = require('../lib/volume-store');
const { withFinancialIdempotency } = require('../lib/financial-idempotency');
const { paymentRequiredPayload } = require('../lib/error-response');

const router = express.Router();

// ── Pricing + policy (single source) ────────────────────────────────────────
const VOLUME_SIZES_GB = [10, 20, 30];
const SAR_PER_USD = 3.75;
const USD_PER_GB_MONTH = 0.05; // Peter, 2026-06-11
// halala/GB/month = 0.05 USD * 3.75 SAR/USD * 100 halala/SAR = 18.75
const HALALA_PER_GB_MONTH = USD_PER_GB_MONTH * SAR_PER_USD * 100;
const POOL_CEILING_GB = 100; // total Node-2 allocation cap
const PERIOD_DAYS = 30;

function monthlyHalala(sizeGb) {
  return Math.round(sizeGb * HALALA_PER_GB_MONTH);
}

function activePoolGb() {
  const row = db.get(`SELECT COALESCE(SUM(size_gb), 0) AS gb FROM renter_volumes WHERE status = 'active'`);
  return Number(row && row.gb) || 0;
}

function toView(vol) {
  if (!vol) return null;
  return {
    id: vol.id,
    size_gb: vol.size_gb,
    status: vol.status,
    price_sar_per_month: Number((vol.price_halala_per_month / 100).toFixed(2)),
    price_halala_per_month: vol.price_halala_per_month,
    rented_at: vol.rented_at,
    current_period_end: vol.current_period_end,
  };
}

// ── GET /api/volumes/me — the renter's active volume + usage ─────────────────
router.get('/me', requireRenter, (req, res) => {
  try {
    const vol = db.get(
      `SELECT * FROM renter_volumes WHERE renter_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
      req.renter.id
    );
    const view = toView(vol);
    if (view) {
      const usedBytes = volumeUsedBytes(req.renter.id);
      view.used_gb = Number((usedBytes / 1073741824).toFixed(3));
      view.used_pct = vol.size_gb > 0 ? Math.min(100, Math.round((usedBytes / (vol.size_gb * 1073741824)) * 100)) : 0;
    }
    return res.json({
      volume: view,
      options: VOLUME_SIZES_GB.map((gb) => ({
        size_gb: gb,
        price_sar_per_month: Number((monthlyHalala(gb) / 100).toFixed(2)),
        price_halala_per_month: monthlyHalala(gb),
      })),
      pool: { ceiling_gb: POOL_CEILING_GB, used_gb: activePoolGb(), available_gb: Math.max(0, POOL_CEILING_GB - activePoolGb()) },
    });
  } catch (error) {
    console.error('[volumes] me error:', error.message);
    return res.status(500).json({ error: 'Failed to load volume' });
  }
});

// ── POST /api/volumes/rent { size_gb } ───────────────────────────────────────
router.post('/rent', requireRenter, withFinancialIdempotency({
  subjectType: 'renter',
  subjectId: (req) => req.renter && req.renter.id,
}), (req, res) => {
  try {
    const sizeGb = Number(req.body && req.body.size_gb);
    if (!VOLUME_SIZES_GB.includes(sizeGb)) {
      return res.status(400).json({ error: `size_gb must be one of ${VOLUME_SIZES_GB.join(', ')}`, code: 'INVALID_SIZE' });
    }

    // One active volume per renter (resize = release + rent again, kept simple).
    const existing = db.get(`SELECT id FROM renter_volumes WHERE renter_id = ? AND status = 'active'`, req.renter.id);
    if (existing) {
      return res.status(409).json({ error: 'You already have an active volume. Release it before renting a different size.', code: 'ALREADY_RENTED' });
    }

    // Pool ceiling — refuse if this rental would exceed the Node-2 allocation.
    const poolGb = activePoolGb();
    if (poolGb + sizeGb > POOL_CEILING_GB) {
      return res.status(409).json({
        error: `Not enough capacity in the storage pool. ${Math.max(0, POOL_CEILING_GB - poolGb)} GB free, you requested ${sizeGb} GB.`,
        code: 'POOL_FULL',
        available_gb: Math.max(0, POOL_CEILING_GB - poolGb),
      });
    }

    const priceHalala = monthlyHalala(sizeGb);
    const now = new Date();
    const nowIso = now.toISOString();
    const periodEnd = new Date(now.getTime() + PERIOD_DAYS * 86400000).toISOString();
    const bucket = bucketFor(req.renter.id);

    // Atomic first-month debit. If balance can't cover it, refuse before provisioning.
    const debit = db.prepare(
      `UPDATE renters SET balance_halala = balance_halala - ?, updated_at = ?
        WHERE id = ? AND balance_halala >= ?`
    ).run(priceHalala, nowIso, req.renter.id, priceHalala);
    if (debit.changes !== 1) {
      const row = db.get(`SELECT balance_halala FROM renters WHERE id = ?`, req.renter.id);
      const balanceHalala = Math.max(0, Number(row && row.balance_halala) || 0);
      return res.status(402).json(paymentRequiredPayload({
        requiredHalala: priceHalala,
        balanceHalala,
        message: `Insufficient balance for a ${sizeGb} GB volume. Available: ${(balanceHalala / 100).toFixed(2)} SAR, needed: ${(priceHalala / 100).toFixed(2)} SAR/month. Top up and retry.`,
      }));
    }

    // Provision the quota'd MinIO bucket. If it fails, REFUND and surface the error
    // (never leave the renter debited with no volume).
    try {
      provisionVolume(req.renter.id, sizeGb);
    } catch (provErr) {
      db.prepare(`UPDATE renters SET balance_halala = balance_halala + ?, updated_at = ? WHERE id = ?`)
        .run(priceHalala, new Date().toISOString(), req.renter.id);
      console.error('[volumes] provision failed, refunded:', provErr.message);
      return res.status(502).json({ error: 'Could not provision the volume — you were not charged. Please try again.', code: 'PROVISION_FAILED' });
    }

    // ── Persist the rental row ──────────────────────────────────────────────
    // The bucket name is deterministic per renter (dcp-vol-r<id>) and a released
    // rental keeps its row (status='released') for audit. So a re-rent after a
    // release must UPDATE the existing row back to active — a fresh INSERT
    // collides with the UNIQUE(bucket) constraint. This bug double-charged renters
    // who released then re-rented: the debit (above) succeeded, provisionVolume
    // succeeded, then INSERT threw → the outer catch returned 500 with NO refund.
    // Reuse the existing row; and if the DB write still fails, refund the debit
    // so a renter is never charged for a volume they didn't get.
    const prior = db.get(`SELECT id FROM renter_volumes WHERE bucket = ?`, bucket);
    let volId;
    try {
      if (prior) {
        db.prepare(
          `UPDATE renter_volumes
             SET size_gb = ?, status = 'active', price_halala_per_month = ?,
                 rented_at = ?, current_period_start = ?, current_period_end = ?,
                 last_billed_at = ?, released_at = NULL
           WHERE id = ?`
        ).run(sizeGb, priceHalala, nowIso, nowIso, periodEnd, nowIso, prior.id);
        volId = prior.id;
      } else {
        const result = db.prepare(
          `INSERT INTO renter_volumes
             (renter_id, size_gb, bucket, status, price_halala_per_month, rented_at, current_period_start, current_period_end, last_billed_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)`
        ).run(req.renter.id, sizeGb, bucket, priceHalala, nowIso, nowIso, periodEnd, nowIso);
        volId = Number(result.lastInsertRowid);
      }
    } catch (dbErr) {
      // Debit already succeeded — refund it, and deprovision the MinIO bucket we
      // just (re)created so we don't leave an orphan bucket with no DB row.
      db.prepare(`UPDATE renters SET balance_halala = balance_halala + ?, updated_at = ? WHERE id = ?`)
        .run(priceHalala, new Date().toISOString(), req.renter.id);
      try { deprovisionVolume(req.renter.id); } catch (e) { console.error('[volumes] deprovision-after-db-fail warn:', e.message); }
      console.error('[volumes] rent persist failed, refunded:', dbErr.message);
      return res.status(500).json({ error: 'Failed to rent volume — you were not charged. Please try again.', code: 'RENT_PERSIST_FAILED' });
    }

    const vol = db.get(`SELECT * FROM renter_volumes WHERE id = ?`, volId);
    console.log(`[volumes] Renter ${req.renter.id} rented ${sizeGb}GB (-${priceHalala} halala) bucket=${bucket}${prior ? ' (re-rent)' : ''}`);
    return res.json({
      ...toView(vol),
      charged_sar: Number((priceHalala / 100).toFixed(2)),
      note: `Your ${sizeGb} GB volume is ready. Pod /workspace now persists here and reattaches to every future pod, on any provider. Billed ${(priceHalala / 100).toFixed(2)} SAR/month; release any time.`,
    });
  } catch (error) {
    console.error('[volumes] rent error:', error.message);
    return res.status(500).json({ error: 'Failed to rent volume' });
  }
});

// ── DELETE /api/volumes — release the active volume (stops billing) ──────────
// Frees the quota back to the pool. Data is removed on release (renter-initiated),
// so we warn in the UI. No refund of the current month (prepaid).
router.delete('/', requireRenter, (req, res) => {
  try {
    const vol = db.get(`SELECT * FROM renter_volumes WHERE renter_id = ? AND status = 'active'`, req.renter.id);
    if (!vol) return res.status(404).json({ error: 'No active volume to release' });

    try { deprovisionVolume(req.renter.id); } catch (e) { console.error('[volumes] deprovision warn:', e.message); }

    db.prepare(`UPDATE renter_volumes SET status = 'released', released_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), vol.id);
    console.log(`[volumes] Renter ${req.renter.id} released volume ${vol.id} (${vol.size_gb}GB) — ${activePoolGb()}GB pool now in use`);
    return res.json({ id: vol.id, status: 'released', freed_gb: vol.size_gb });
  } catch (error) {
    console.error('[volumes] release error:', error.message);
    return res.status(500).json({ error: 'Failed to release volume' });
  }
});

// Exported for the monthly billing sweep + pod launch (task_spec wiring).
function activeVolumeForRenter(renterId) {
  return db.get(`SELECT * FROM renter_volumes WHERE renter_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`, renterId);
}

module.exports = router;
module.exports.activeVolumeForRenter = activeVolumeForRenter;
module.exports.HALALA_PER_GB_MONTH = HALALA_PER_GB_MONTH;
module.exports.monthlyHalala = monthlyHalala;
