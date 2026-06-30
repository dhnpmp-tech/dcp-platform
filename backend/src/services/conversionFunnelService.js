'use strict';

const crypto = require('crypto');
const db = require('../db');
const analytics = require('./analyticsService');

const VALID_JOURNEYS = new Set(['provider', 'renter']);
// Revenue funnel stages. The service dedupes per (journey, stage, actor), so
// the `first_*` / `*_launched` / `*_initiated` / `payment_success` stages
// naturally record once per renter/provider even though the call sites fire
// on every relevant transaction.
//   view → register → first_action → first_success   (baseline funnel)
//   topup_initiated → payment_success                (revenue: wallet funding)
//   pod_launched                                    (revenue: first pod launch)
//   first_inference                                 (revenue: first /v1 completion)
//   agent_self_serve                                (provider self-serve onboarding)
//   pending_email_verification                      (provider email-verify gate)
const VALID_STAGES = new Set([
  'view',
  'register',
  'first_action',
  'first_success',
  'topup_initiated',
  'payment_success',
  'pod_launched',
  'first_inference',
  'agent_self_serve',
  'pending_email_verification',
]);
const VALID_ACTOR_TYPES = new Set(['provider', 'renter', 'anonymous', 'admin', 'system']);

const PATH_SURFACE_HINTS = [
  { needle: '/provider/register', value: 'provider_register_page' },
  { needle: '/renter/register', value: 'renter_register_page' },
  { needle: '/provider', value: 'provider_dashboard' },
  { needle: '/renter', value: 'renter_dashboard' },
  { needle: '/api/providers/register', value: 'provider_register_api' },
  { needle: '/api/renters/register', value: 'renter_register_api' },
  { needle: '/api/jobs/submit', value: 'renter_jobs_submit_api' },
  { needle: '/api/providers/heartbeat', value: 'provider_heartbeat_api' },
  { needle: '/api/jobs/', value: 'jobs_api' },
];

function normalizeString(value, { maxLen = 200, trim = true, lowercase = false, uppercase = false } = {}) {
  if (typeof value !== 'string') return null;
  const base = trim ? value.trim() : value;
  if (!base) return null;
  let sliced = base.slice(0, maxLen);
  if (lowercase) sliced = sliced.toLowerCase();
  if (uppercase) sliced = sliced.toUpperCase();
  return sliced;
}

function parseLocale(rawLocale) {
  const localeRaw = normalizeString(rawLocale, { maxLen: 32 });
  if (!localeRaw) {
    return {
      locale: 'unknown',
      locale_raw: null,
      language: 'unknown',
      country_code: null,
    };
  }

  const normalized = localeRaw.replace('_', '-').toLowerCase();
  const [languagePart, regionPart] = normalized.split('-');
  const language = languagePart === 'ar' || languagePart === 'en' ? languagePart : 'other';

  return {
    locale: language === 'other' ? normalized : language,
    locale_raw: localeRaw,
    language,
    country_code: regionPart ? regionPart.toUpperCase().slice(0, 8) : null,
  };
}

function getAcceptLanguage(req) {
  const raw = normalizeString(req?.headers?.['accept-language'], { maxLen: 120, trim: true });
  if (!raw) return null;
  return raw.split(',')[0]?.split(';')[0]?.trim() || null;
}

function parseReferrer(req) {
  const raw = normalizeString(req?.headers?.referer || req?.headers?.referrer, { maxLen: 500 });
  if (!raw) return { referrer: null, referrer_host: null, referrer_path: null };
  try {
    const parsed = new URL(raw);
    return {
      referrer: raw,
      referrer_host: parsed.host || null,
      referrer_path: parsed.pathname || null,
    };
  } catch (_) {
    return { referrer: raw, referrer_host: null, referrer_path: null };
  }
}

function inferSurface(req) {
  const path = normalizeString(req?.originalUrl || req?.path || '', { maxLen: 200, trim: true, lowercase: true });
  if (!path) return null;
  const hint = PATH_SURFACE_HINTS.find((entry) => path.includes(entry.needle));
  return hint ? hint.value : null;
}

function getAttributionInput(req, overrides = {}) {
  const query = req?.query || {};
  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const headers = req?.headers || {};

  const localeCandidate =
    overrides.locale ||
    normalizeString(body.locale, { maxLen: 32 }) ||
    normalizeString(body.lang, { maxLen: 32 }) ||
    normalizeString(query.locale, { maxLen: 32 }) ||
    normalizeString(query.lang, { maxLen: 32 }) ||
    normalizeString(headers['x-dcp-locale'], { maxLen: 32 }) ||
    getAcceptLanguage(req);

  const sourceSurface =
    normalizeString(overrides.source_surface, { maxLen: 100, lowercase: true }) ||
    normalizeString(body.source_surface, { maxLen: 100, lowercase: true }) ||
    normalizeString(query.source_surface, { maxLen: 100, lowercase: true }) ||
    normalizeString(headers['x-source-surface'], { maxLen: 100, lowercase: true }) ||
    inferSurface(req) ||
    'unknown';

  const sourceChannel =
    normalizeString(overrides.source_channel, { maxLen: 100, lowercase: true }) ||
    normalizeString(body.source_channel, { maxLen: 100, lowercase: true }) ||
    normalizeString(query.source_channel, { maxLen: 100, lowercase: true }) ||
    normalizeString(headers['x-source-channel'], { maxLen: 100, lowercase: true }) ||
    normalizeString(query.utm_medium, { maxLen: 100, lowercase: true }) ||
    'unknown';

  const sessionId =
    normalizeString(overrides.session_id, { maxLen: 120 }) ||
    normalizeString(body.session_id, { maxLen: 120 }) ||
    normalizeString(query.session_id, { maxLen: 120 }) ||
    normalizeString(headers['x-session-id'], { maxLen: 120 }) ||
    normalizeString(headers['x-dcp-session-id'], { maxLen: 120 });

  const anonymousId =
    normalizeString(overrides.anonymous_id, { maxLen: 120 }) ||
    normalizeString(body.anonymous_id, { maxLen: 120 }) ||
    normalizeString(query.anonymous_id, { maxLen: 120 }) ||
    normalizeString(headers['x-anonymous-id'], { maxLen: 120 }) ||
    normalizeString(headers['x-dcp-anonymous-id'], { maxLen: 120 });

  const campaign = {
    utm_source: normalizeString(overrides.utm_source || body.utm_source || query.utm_source || headers['x-utm-source'], { maxLen: 120, lowercase: true }),
    utm_medium: normalizeString(overrides.utm_medium || body.utm_medium || query.utm_medium || headers['x-utm-medium'], { maxLen: 120, lowercase: true }),
    utm_campaign: normalizeString(overrides.utm_campaign || body.utm_campaign || query.utm_campaign || headers['x-utm-campaign'], { maxLen: 160, lowercase: true }),
    utm_content: normalizeString(overrides.utm_content || body.utm_content || query.utm_content || headers['x-utm-content'], { maxLen: 160, lowercase: true }),
    utm_term: normalizeString(overrides.utm_term || body.utm_term || query.utm_term || headers['x-utm-term'], { maxLen: 160, lowercase: true }),
  };

  const locale = parseLocale(localeCandidate);
  const referrer = parseReferrer(req);

  return {
    ...locale,
    ...campaign,
    source_surface: sourceSurface,
    source_channel: sourceChannel,
    session_id: sessionId,
    anonymous_id: anonymousId,
    correlation_id: normalizeString(headers['x-request-id'], { maxLen: 120 }),
    request_path: normalizeString(req?.originalUrl || req?.path, { maxLen: 300 }),
    request_method: normalizeString(req?.method, { maxLen: 16, uppercase: true }),
    ...referrer,
  };
}

function normalizeActor({ actorType, actorId }) {
  const normalizedActorType = normalizeString(actorType, { maxLen: 32, lowercase: true }) || null;
  if (!normalizedActorType || !VALID_ACTOR_TYPES.has(normalizedActorType)) {
    return { actor_type: 'anonymous', actor_id: null };
  }
  if (actorId == null) {
    return { actor_type: normalizedActorType, actor_id: null };
  }
  const actorIdNumber = Number(actorId);
  if (!Number.isFinite(actorIdNumber) || actorIdNumber <= 0) {
    return { actor_type: normalizedActorType, actor_id: null };
  }
  return { actor_type: normalizedActorType, actor_id: Math.floor(actorIdNumber) };
}

function buildDedupeKey(journey, stage, actorType, actorId) {
  if (actorId == null) return null;
  return `${journey}:${actorType}:${actorId}:${stage}`;
}

function insertEvent({
  occurredAt,
  journey,
  stage,
  actorType,
  actorId,
  success,
  req,
  overrides,
  metadata,
}) {
  const attribution = getAttributionInput(req, overrides);
  const dedupeKey = buildDedupeKey(journey, stage, actorType, actorId);

  if (dedupeKey) {
    const existing = db
      .prepare('SELECT id FROM conversion_funnel_events WHERE dedupe_key = ? LIMIT 1')
      .get(dedupeKey);
    if (existing) {
      return { inserted: false, deduped: true, dedupe_key: dedupeKey };
    }
  }

  const actorKey = actorId != null
    ? crypto.createHash('sha256').update(`${journey}:${actorType}:${actorId}`).digest('hex')
    : null;

  db.prepare(
    `INSERT INTO conversion_funnel_events (
      event_id,
      occurred_at,
      journey,
      stage,
      actor_type,
      actor_id,
      actor_key,
      anonymous_id,
      session_id,
      correlation_id,
      locale,
      locale_raw,
      language,
      country_code,
      source_surface,
      source_channel,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      referrer,
      referrer_host,
      referrer_path,
      request_path,
      request_method,
      success,
      metadata_json,
      dedupe_key,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `funnel_${crypto.randomBytes(12).toString('hex')}`,
    occurredAt,
    journey,
    stage,
    actorType,
    actorId,
    actorKey,
    attribution.anonymous_id,
    attribution.session_id,
    attribution.correlation_id,
    attribution.locale,
    attribution.locale_raw,
    attribution.language,
    attribution.country_code,
    attribution.source_surface,
    attribution.source_channel,
    attribution.utm_source,
    attribution.utm_medium,
    attribution.utm_campaign,
    attribution.utm_content,
    attribution.utm_term,
    attribution.referrer,
    attribution.referrer_host,
    attribution.referrer_path,
    attribution.request_path,
    attribution.request_method,
    success ? 1 : 0,
    metadata ? JSON.stringify(metadata) : null,
    dedupeKey,
    new Date().toISOString()
  );

  const props = {
    journey,
    stage,
    actor_type: actorType,
    actor_id: actorId,
    locale: attribution.locale,
    language: attribution.language,
    source_surface: attribution.source_surface,
    source_channel: attribution.source_channel,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    success: Boolean(success),
    ...metadata,
  };

  if (actorId != null) {
    analytics.track(`${journey}:${actorType}:${actorId}`, 'conversion_funnel_stage', props).catch(() => {});
  } else if (attribution.anonymous_id) {
    analytics.trackAnonymous(attribution.anonymous_id, 'conversion_funnel_stage', props).catch(() => {});
  }

  return { inserted: true, deduped: false, dedupe_key: dedupeKey };
}

function trackStage({
  journey,
  stage,
  actorType,
  actorId,
  req,
  success = true,
  metadata = null,
  attribution = {},
  inferViewOnRegister = false,
}) {
  const normalizedJourney = normalizeString(journey, { maxLen: 16, lowercase: true });
  const normalizedStage = normalizeString(stage, { maxLen: 32, lowercase: true });

  if (!normalizedJourney || !VALID_JOURNEYS.has(normalizedJourney)) {
    return { inserted: false, error: 'invalid_journey' };
  }
  if (!normalizedStage || !VALID_STAGES.has(normalizedStage)) {
    return { inserted: false, error: 'invalid_stage' };
  }

  const actor = normalizeActor({ actorType, actorId });
  const occurredAt = new Date().toISOString();

  if (inferViewOnRegister && normalizedStage === 'register' && actor.actor_id != null) {
    insertEvent({
      occurredAt,
      journey: normalizedJourney,
      stage: 'view',
      actorType: actor.actor_type,
      actorId: actor.actor_id,
      success: true,
      req,
      overrides: attribution,
      metadata: { synthetic: true, source: 'register_inference' },
    });
  }

  return insertEvent({
    occurredAt,
    journey: normalizedJourney,
    stage: normalizedStage,
    actorType: actor.actor_type,
    actorId: actor.actor_id,
    success,
    req,
    overrides: attribution,
    metadata,
  });
}

function buildFunnelReport({ sinceDays = 30, journey = 'all' } = {}) {
  const safeSinceDays = Math.min(365, Math.max(1, Number.parseInt(sinceDays, 10) || 30));
  const sinceIso = new Date(Date.now() - safeSinceDays * 24 * 60 * 60 * 1000).toISOString();
  const journeyNormalized = normalizeString(journey, { maxLen: 16, lowercase: true });
  const journeyFilter = journeyNormalized && journeyNormalized !== 'all' && VALID_JOURNEYS.has(journeyNormalized)
    ? journeyNormalized
    : null;

  const params = [sinceIso];
  const whereJourneySql = journeyFilter ? 'AND journey = ?' : '';
  if (journeyFilter) params.push(journeyFilter);

  const stageRows = db.prepare(
    `SELECT journey, stage, COUNT(DISTINCT actor_key) AS actors
     FROM conversion_funnel_events
     WHERE occurred_at >= ?
       AND actor_key IS NOT NULL
       ${whereJourneySql}
     GROUP BY journey, stage
     ORDER BY journey, stage`
  ).all(...params);

  const attributionRows = db.prepare(
    `SELECT journey,
            COUNT(*) AS total,
            SUM(CASE WHEN source_surface IS NOT NULL AND source_surface != 'unknown' THEN 1 ELSE 0 END) AS with_surface,
            SUM(CASE WHEN locale IN ('en','ar') THEN 1 ELSE 0 END) AS with_supported_locale,
            SUM(CASE WHEN utm_source IS NOT NULL OR referrer_host IS NOT NULL THEN 1 ELSE 0 END) AS with_attribution
     FROM conversion_funnel_events
     WHERE occurred_at >= ?
       ${whereJourneySql}
     GROUP BY journey
     ORDER BY journey`
  ).all(...params);

  const localeSurfaceRows = db.prepare(
    `SELECT journey, stage, locale, source_surface, COUNT(*) AS events
     FROM conversion_funnel_events
     WHERE occurred_at >= ?
       ${whereJourneySql}
     GROUP BY journey, stage, locale, source_surface
     ORDER BY journey, stage, events DESC
     LIMIT 200`
  ).all(...params);

  const stageMap = {};
  for (const row of stageRows) {
    if (!stageMap[row.journey]) {
      stageMap[row.journey] = {
        view: 0,
        register: 0,
        first_action: 0,
        first_success: 0,
      };
    }
    stageMap[row.journey][row.stage] = Number(row.actors || 0);
  }

  const journeys = Object.entries(stageMap).map(([name, counts]) => {
    const registerCount = counts.register || 0;
    const firstActionCount = counts.first_action || 0;
    const firstSuccessCount = counts.first_success || 0;

    return {
      journey: name,
      stages: counts,
      conversion: {
        register_to_first_action_pct: registerCount > 0 ? Number(((firstActionCount / registerCount) * 100).toFixed(2)) : 0,
        register_to_first_success_pct: registerCount > 0 ? Number(((firstSuccessCount / registerCount) * 100).toFixed(2)) : 0,
      },
    };
  });

  const attribution = attributionRows.map((row) => ({
    journey: row.journey,
    total_events: Number(row.total || 0),
    source_surface_completeness_pct: row.total > 0 ? Number(((row.with_surface / row.total) * 100).toFixed(2)) : 0,
    locale_en_ar_completeness_pct: row.total > 0 ? Number(((row.with_supported_locale / row.total) * 100).toFixed(2)) : 0,
    attribution_completeness_pct: row.total > 0 ? Number(((row.with_attribution / row.total) * 100).toFixed(2)) : 0,
  }));

  return {
    window_days: safeSinceDays,
    since: sinceIso,
    journey_filter: journeyFilter || 'all',
    journeys,
    attribution,
    locale_source_segments: localeSurfaceRows,
  };
}

module.exports = {
  trackStage,
  buildFunnelReport,
  constants: {
    VALID_JOURNEYS: Array.from(VALID_JOURNEYS),
    VALID_STAGES: Array.from(VALID_STAGES),
    VALID_ACTOR_TYPES: Array.from(VALID_ACTOR_TYPES),
  },
};
