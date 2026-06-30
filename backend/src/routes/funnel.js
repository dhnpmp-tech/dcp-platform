'use strict';

// Public conversion-funnel beacon endpoint.
//
// POST /api/funnel/view — records a `view` stage event from the client. Used by
// the marketing surfaces (marketplace, containers, pricing) to measure
// top-of-funnel reach independently of the server-side `register`-inferred
// view (conversionFunnelService.inferViewOnRegister). Anonymous visitors are
// allowed (no renter key) — they record actor_type='anonymous' with the
// client-supplied anonymous_id; logged-in renters (x-renter-key header
// present + valid) record actor_type='renter' with their id, which the service
// dedupes to their FIRST view.
//
// Best-effort + fire-and-forget from the client (sendBeacon-friendly). Returns
// 204 No Content so a beacon can fire on page unload without awaiting.

const express = require('express');
const rateLimit = require('express-rate-limit');
const conversionFunnel = require('../services/conversionFunnelService');
const db = require('../db');
const { looksLikeProviderKey } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_SURFACES = new Set([
  'marketplace',
  'containers',
  'pricing',
  'home',
  'docs',
  'provider_register_page',
  'renter_register_page',
]);

const viewBeaconLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 views/min/IP — generous (multi-tab, SPA nav)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many view beacons, slow down.' },
});

function resolveRenter(req) {
  const key = req.headers['x-renter-key'];
  if (!key || looksLikeProviderKey(key)) return null;
  try {
    return db.get('SELECT id FROM renters WHERE api_key = ? AND status = ?', key, 'active') || null;
  } catch {
    return null;
  }
}

// POST /api/funnel/view
// Body (all optional): { surface?: string, anonymous_id?: string, session_id?: string }
router.post('/view', viewBeaconLimiter, (req, res) => {
  const body = req.body || {};
  const surface = typeof body.surface === 'string' ? body.surface.toLowerCase() : null;

  const renter = resolveRenter(req);
  try {
    conversionFunnel.trackStage({
      journey: 'renter',
      stage: 'view',
      actorType: renter ? 'renter' : 'anonymous',
      actorId: renter ? renter.id : null,
      req,
      success: true,
      metadata: surface ? { surface, marketing: true } : { marketing: true },
      attribution: surface ? { source_surface: ALLOWED_SURFACES.has(surface) ? surface : 'unknown' } : {},
    });
  } catch (_) { /* funnel best-effort */ }
  return res.status(204).end();
});

module.exports = router;