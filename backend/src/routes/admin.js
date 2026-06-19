const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const router = express.Router();
const db = require('../db');
const { requireAdminAuth, getAdminTokenFromReq } = require('../middleware/auth');
const { requireAdminRbac } = require('../middleware/adminAuth');
const {
  normalizeImageRef,
  validateAndNormalizeImageRef,
  isDockerHubImageRef,
} = require('../lib/container-registry');
const { getConfig: getNotifConfig, sendAlert, sendTelegram } = require('../services/notifications');
const { sendWithdrawalApprovedEmail } = require('../services/emailService');
const { resolveAttemptLogPath } = require('../services/job-execution-logs');
const { buildFunnelReport } = require('../services/conversionFunnelService');
const { buildDaemonHealthSummary } = require('../services/daemonHealthSummary');
const {
  countUsableProviders,
  getVerificationMap,
  ensureSchema: ensureProviderVerificationSchema,
} = require('../services/providerVerification');
const { safeErrorPayload } = require('../lib/error-response');
const {
  listPolicies: listControlPlanePolicies,
  updatePolicy: updateControlPlanePolicy,
  getRecentSignals: getControlPlaneSignals,
  calculateControlPlaneSignals,
  listTopDemandModels,
  runDemandDrivenPrewarm,
  runControlPlaneCycle,
  listCapacityPolicies: listControlPlaneCapacityPolicies,
  updateCapacityPolicy: updateControlPlaneCapacityPolicy,
  PRICING_CLASS_ORDER,
  CAPACITY_CLASS_ORDER,
} = require('../services/controlPlane');
const DB_PATH = process.env.DC1_DB_PATH || path.join(__dirname, '..', '..', 'data', 'providers.db');
const IMAGE_REGISTRY_ALLOWLIST = Array.from(new Set(
  [
    ...(process.env.DCP_IMAGE_REGISTRY_ALLOWLIST || 'docker.io,ghcr.io')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
    ...((process.env.DCP_PRIVATE_REGISTRY || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)),
  ]
));
const IMAGE_APPROVAL_WINDOW_MINUTES = Number.parseInt(process.env.DCP_IMAGE_APPROVAL_WINDOW_MINUTES || '10', 10);
const IMAGE_APPROVAL_MAX_REQUESTS = Number.parseInt(process.env.DCP_IMAGE_APPROVAL_MAX_REQUESTS || '20', 10);
const TRIVY_TIMEOUT_MS = Number.parseInt(process.env.DCP_TRIVY_TIMEOUT_MS || '180000', 10);
const DOCKER_TIMEOUT_MS = Number.parseInt(process.env.DCP_DOCKER_TIMEOUT_MS || '30000', 10);
const PROVIDER_APPROVAL_SLA_HOURS = Number.parseInt(process.env.DCP_PROVIDER_APPROVAL_SLA_HOURS || '24', 10);
const PROVIDER_APPROVAL_SLA_SECONDS = Number.isFinite(PROVIDER_APPROVAL_SLA_HOURS) && PROVIDER_APPROVAL_SLA_HOURS > 0
  ? PROVIDER_APPROVAL_SLA_HOURS * 3600
  : 24 * 3600;

// ─── Auth middleware ───────────────────────────────────────────────────────────
// DCP-768: requireAdminRbac = token auth + RBAC role check + audit log.
// Internally delegates to requireAdminAuth for static-token verification,
// additionally sets req.adminUser and writes to admin_audit_log on every request.
router.use(requireAdminRbac);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Floor-plus-remainder split: guarantees provider_cut + dc1_cut === total exactly
function splitBilling(totalHalala) {
  const provider_cut = Math.floor(totalHalala * 0.75);
  const dc1_cut = totalHalala - provider_cut; // remainder, never diverges
  return { provider_cut, dc1_cut };
}

function normalizeString(value, { maxLen = 500, trim = true } = {}) {
  if (typeof value !== 'string') return null;
  const next = trim ? value.trim() : value;
  if (!next) return null;
  return next.slice(0, maxLen);
}

function ensureSupportContactsAdminSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS support_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT,
      provider_state TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_support_contacts_created_at ON support_contacts(created_at DESC)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_support_contacts_category ON support_contacts(category, created_at DESC)`);
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

function parseTimestampMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function buildProviderApprovalQueueEntry(provider, nowMs = Date.now()) {
  const createdAt = provider.created_at || provider.updated_at || null;
  const createdAtMs = parseTimestampMs(createdAt);
  const pendingDurationSeconds = createdAtMs == null
    ? null
    : Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));
  const slaDeadlineAt = createdAtMs == null
    ? null
    : new Date(createdAtMs + (PROVIDER_APPROVAL_SLA_SECONDS * 1000)).toISOString();
  const slaDeadlineMs = parseTimestampMs(slaDeadlineAt);
  const slaRemainingSeconds = slaDeadlineMs == null
    ? null
    : Math.max(0, Math.floor((slaDeadlineMs - nowMs) / 1000));

  return {
    provider_id: provider.id,
    name: provider.name,
    email: provider.email,
    approval_status: provider.approval_status || 'pending',
    created_at: createdAt,
    pending_duration_seconds: pendingDurationSeconds,
    pending_duration: pendingDurationSeconds == null ? null : `${pendingDurationSeconds}s`,
    reason: normalizeString(provider.rejected_reason, { maxLen: 400 }) || 'awaiting_manual_review',
    sla_target_seconds: PROVIDER_APPROVAL_SLA_SECONDS,
    sla_deadline_at: slaDeadlineAt,
    sla_remaining_seconds: slaRemainingSeconds,
    sla_breached: slaRemainingSeconds == null ? null : slaRemainingSeconds === 0,
  };
}

function parseBooleanLike(value, defaultValue = false) {
  if (value == null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off', ''].includes(normalized)) return false;
  }
  return defaultValue;
}

function getAdminCapacitySnapshot() {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let total = 0;
  let heartbeating = 0;
  let endpointReachable = 0;
  let serving = 0;

  try {
    total = db.get('SELECT COUNT(*) AS count FROM providers')?.count || 0;
  } catch (_) { total = 0; }

  try {
    heartbeating = db.get(
      "SELECT COUNT(*) AS count FROM providers WHERE status = 'online' AND last_heartbeat > ?",
      fiveMinAgo
    )?.count || 0;
  } catch (_) { heartbeating = 0; }

  try {
    endpointReachable = db.get(
      `SELECT COUNT(*) AS count
         FROM providers
        WHERE status = 'online'
          AND last_heartbeat > ?
          AND COALESCE(is_paused, 0) = 0
          AND vllm_endpoint_url IS NOT NULL
          AND COALESCE(endpoint_reachable, 0) = 1
          AND endpoint_probed_at IS NOT NULL`,
      fiveMinAgo
    )?.count || 0;
  } catch (_) { endpointReachable = 0; }

  try {
    serving = countUsableProviders(db);
  } catch (_) { serving = 0; }

  return {
    total,
    heartbeating,
    endpoint_reachable: endpointReachable,
    serving,
    capacity_reason: serving > 0 ? 'verified_serving_capacity' : 'no_verified_serving_provider',
  };
}

function buildAdminAccessPolicySnapshot() {
  const adminTokenConfigured = Boolean(String(process.env.DC1_ADMIN_TOKEN || '').trim());
  const adminIpAllowlistConfigured = Boolean(String(process.env.ADMIN_IP_ALLOWLIST || '').trim());
  const missionAgentKeyConfigured = Boolean(String(process.env.MISSION_AGENT_KEY || '').trim());
  const strictMissionWrites = parseBooleanLike(process.env.DCP_MISSION_STRICT_WRITE_AUTH, false);

  return {
    generated_at: new Date().toISOString(),
    admin_surface: {
      token_configured: adminTokenConfigured,
      ip_allowlist_configured: adminIpAllowlistConfigured,
      auth_contract: 'x-admin-token or bearer token via requireAdminRbac',
      audit_log: 'admin_audit_log',
      write_policy: 'admin_token_required',
    },
    mission_surface: {
      read_principals: [
        'admin_token',
        'renter_api_key',
        'provider_api_key',
        'mission_agent_key_when_configured',
      ],
      write_policy: strictMissionWrites ? 'strict_admin_or_agent_key' : 'legacy_authenticated_write',
      strict_write_auth_enabled: strictMissionWrites,
      mission_agent_key_configured: missionAgentKeyConfigured,
      current_risk: strictMissionWrites
        ? 'write access is gated to admins or the dedicated mission agent key'
        : 'mission task writes currently follow the legacy broad authenticated-write path',
      next_gate: 'enable DCP_MISSION_STRICT_WRITE_AUTH before exposing v2 admin or agent task mutation controls',
    },
    agent_permissions: [
      {
        level: 'read',
        state: 'enabled',
        description: 'Agents may inspect admin and mission context through guarded tokens.',
      },
      {
        level: 'notify',
        state: 'planned',
        description: 'Agents may create notifications after channel policy is explicit.',
      },
      {
        level: 'propose',
        state: 'enabled_in_ui',
        description: 'v2 admin can display agent-suggested work without executing it.',
      },
      {
        level: 'guarded_write',
        state: strictMissionWrites ? 'backend_gate_ready' : 'blocked_by_legacy_mission_write_policy',
        description: 'Writes require explicit approval policy, audit evidence, and a hardened backend gate.',
      },
    ],
  };
}

function redactedTail(value, visible = 4) {
  const normalized = normalizeString(value, { maxLen: 200 });
  if (!normalized) return null;
  if (normalized.length <= visible) return 'configured';
  const tail = normalized.slice(-visible);
  return `...${tail}`;
}

function safeUrlHost(value) {
  const normalized = normalizeString(value, { maxLen: 500 });
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    return parsed.hostname || 'configured';
  } catch (_) {
    return 'configured';
  }
}

function buildNotificationPostureSnapshot() {
  const config = getNotifConfig();
  if (!config) {
    return {
      generated_at: new Date().toISOString(),
      enabled: false,
      updated_at: null,
      channels: [],
      agent_policy: {
        notify_state: 'blocked_until_channel_configured',
        write_policy: 'admin_only_test_send',
        next_gate: 'configure at least one alert channel before granting agents notification privileges',
      },
    };
  }

  const enabled = Boolean(config.enabled);
  const webhookConfigured = Boolean(normalizeString(config.webhook_url, { maxLen: 500 }));
  const telegramBotConfigured = Boolean(normalizeString(config.telegram_bot_token, { maxLen: 500 }));
  const telegramChatConfigured = Boolean(normalizeString(config.telegram_chat_id, { maxLen: 200 }));
  const telegramConfigured = telegramBotConfigured && telegramChatConfigured;
  const anyChannelConfigured = webhookConfigured || telegramConfigured;

  return {
    generated_at: new Date().toISOString(),
    enabled,
    updated_at: config.updated_at || null,
    channels: [
      {
        id: 'webhook',
        label: 'Webhook',
        configured: webhookConfigured,
        active: enabled && webhookConfigured,
        destination: safeUrlHost(config.webhook_url),
        secret_exposed: false,
      },
      {
        id: 'telegram',
        label: 'Telegram',
        configured: telegramConfigured,
        active: enabled && telegramConfigured,
        destination: telegramChatConfigured ? redactedTail(config.telegram_chat_id) : null,
        secret_exposed: false,
      },
    ],
    agent_policy: {
      notify_state: enabled && anyChannelConfigured ? 'ready_for_human_approved_alerts' : 'blocked_until_channel_configured',
      write_policy: 'admin_only_test_send',
      next_gate: 'define event allowlist and audit envelope before agent-generated notifications',
    },
  };
}

function normalizeIdArray(value, { maxItems = 500 } = {}) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ids = [];
  for (const raw of value.slice(0, maxItems)) {
    const id = toFiniteInt(raw, { min: 1 });
    if (id == null) return null;
    ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

function normalizeGpuModel(value) {
  return normalizeString(value, { maxLen: 120 });
}

function normalizeImageType(value) {
  const normalized = normalizeString(value, { maxLen: 60 });
  return normalized ? normalized.toLowerCase() : null;
}

function parseRegistryFromImageRef(imageRef) {
  const normalized = normalizeImageRef(imageRef)?.toLowerCase();
  if (!normalized) return null;
  const first = normalized.split('/')[0] || '';
  if (!first) return 'docker.io';
  if (first.includes('.') || first.includes(':') || first === 'localhost') return first;
  return 'docker.io';
}

function isTrustedRegistry(registry) {
  return IMAGE_REGISTRY_ALLOWLIST.includes(String(registry || '').toLowerCase());
}

function stripDigest(imageRef) {
  return String(imageRef || '').split('@')[0];
}

function parsePinnedDigest(imageRef) {
  const match = String(imageRef || '').toLowerCase().match(/@sha256:([a-f0-9]{64})$/);
  return match ? `sha256:${match[1]}` : null;
}

function runCommand(command, args, timeoutMs) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      return { ok: false, error: `${command} command not found` };
    }
    return { ok: false, error: result.error.message || `${command} command failed` };
  }
  if (typeof result.status !== 'number') {
    return { ok: false, error: `${command} command timed out` };
  }
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function assertPublicImageExists(imageRef) {
  const inspect = runCommand('docker', ['manifest', 'inspect', imageRef], DOCKER_TIMEOUT_MS);
  if (!inspect.ok) {
    return { ok: false, error: 'Image does not exist or is not publicly accessible' };
  }
  return { ok: true };
}

function resolveImageDigest(imageRef) {
  const pull = runCommand('docker', ['pull', '--quiet', imageRef], DOCKER_TIMEOUT_MS);
  if (!pull.ok) {
    return { ok: false, error: 'Unable to pull image for digest resolution' };
  }

  const inspect = runCommand(
    'docker',
    ['image', 'inspect', '--format', '{{json .RepoDigests}}', stripDigest(imageRef)],
    DOCKER_TIMEOUT_MS
  );
  if (!inspect.ok) {
    return { ok: false, error: 'Unable to inspect image digest' };
  }

  let repoDigests = [];
  try {
    repoDigests = JSON.parse(inspect.stdout || '[]');
  } catch {
    return { ok: false, error: 'Failed to parse image digest metadata' };
  }

  const pinnedRef = Array.isArray(repoDigests)
    ? repoDigests.find((entry) => typeof entry === 'string' && /@sha256:[a-f0-9]{64}$/i.test(entry))
    : null;
  const digestMatch = String(pinnedRef || '').match(/@sha256:([a-f0-9]{64})$/i);
  if (!digestMatch) {
    return { ok: false, error: 'Image digest not found after pull' };
  }

  return {
    ok: true,
    resolvedDigest: `sha256:${digestMatch[1].toLowerCase()}`,
    pinnedRef,
  };
}

function runCriticalImageScan(imageRef) {
  const result = runCommand(
    'trivy',
    ['image', '--quiet', '--format', 'json', '--severity', 'CRITICAL', imageRef],
    TRIVY_TIMEOUT_MS
  );
  if (!result.ok && result.status !== 1) {
    return { ok: false, error: 'Image scan failed' };
  }

  let report = { Results: [] };
  try {
    report = result.stdout ? JSON.parse(result.stdout) : { Results: [] };
  } catch {
    return { ok: false, error: 'Image scan returned invalid JSON output' };
  }

  const findings = Array.isArray(report.Results) ? report.Results : [];
  let criticalCount = 0;
  for (const item of findings) {
    const vulns = Array.isArray(item?.Vulnerabilities) ? item.Vulnerabilities : [];
    for (const vuln of vulns) {
      if (String(vuln?.Severity || '').toUpperCase() === 'CRITICAL') criticalCount += 1;
    }
  }
  if (result.status === 1 && criticalCount === 0) criticalCount = 1;

  return {
    ok: true,
    criticalCount,
    reportJson: JSON.stringify(report),
  };
}

function adminActorFingerprint(req) {
  const token = String(getAdminTokenFromReq(req) || req.ip || 'admin');
  return crypto.createHash('sha256').update(token).digest('hex');
}

function consumeAdminRateLimit(actionKey, actorFingerprint) {
  const maxRequests = Number.isFinite(IMAGE_APPROVAL_MAX_REQUESTS) && IMAGE_APPROVAL_MAX_REQUESTS > 0
    ? IMAGE_APPROVAL_MAX_REQUESTS
    : 20;
  const windowMinutes = Number.isFinite(IMAGE_APPROVAL_WINDOW_MINUTES) && IMAGE_APPROVAL_WINDOW_MINUTES > 0
    ? IMAGE_APPROVAL_WINDOW_MINUTES
    : 10;

  const row = db.get(
    `SELECT COUNT(*) AS count
       FROM admin_rate_limit_log
      WHERE action_key = ?
        AND actor_fingerprint = ?
        AND created_at >= datetime('now', ?)`,
    actionKey,
    actorFingerprint,
    `-${windowMinutes} minutes`
  );
  if ((row?.count || 0) >= maxRequests) return false;

  db.prepare(
    `INSERT INTO admin_rate_limit_log (action_key, actor_fingerprint, created_at)
     VALUES (?, ?, datetime('now'))`
  ).run(actionKey, actorFingerprint);
  return true;
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

// Parse a provider's `cached_models` column (JSON array or comma-separated
// string) into a trimmed string array. Mirrors v1.js parseCachedModels but
// preserves original casing for display in the fleet view.
function parseCachedModelsSafe(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
  } catch (_) { /* fall through to comma-separated */ }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function heartbeatAgeSeconds(lastHeartbeat, nowMs = Date.now()) {
  const iso = toIsoOrNull(lastHeartbeat);
  if (!iso) return null;
  const age = Math.floor((nowMs - new Date(iso).getTime()) / 1000);
  return Number.isFinite(age) && age >= 0 ? age : null;
}

function resolveFleetStatus(lastHeartbeat, restartCount = 0, nowMs = Date.now()) {
  const ageSeconds = heartbeatAgeSeconds(lastHeartbeat, nowMs);
  if (ageSeconds == null || ageSeconds > 15 * 60) return { status: 'offline', ageSeconds };
  if ((Number(restartCount) || 0) > 10) return { status: 'degraded', ageSeconds };
  if (ageSeconds >= 5 * 60) return { status: 'degraded', ageSeconds };
  return { status: 'online', ageSeconds };
}

function buildProbeEvidenceGate(gate, state, detail) {
  return { gate, state, detail };
}

function firstProbeModelHint(cachedModels, verification) {
  const verifiedModels = Array.isArray(verification?.verified_models)
    ? verification.verified_models.map((model) => String(model || '').trim()).filter(Boolean)
    : [];
  return cachedModels[0] || verifiedModels[0] || '$DCP_MODEL_ID';
}

function buildOperatorProbeCommand() {
  return [
    'export DCP_API_BASE="${DCP_API_BASE:-https://api.dcp.sa}"',
    'cat >/tmp/dcp-serving-proof.json <<JSON',
    '{"model":"${DCP_MODEL_ID}","messages":[{"role":"user","content":"DCP serving proof"}],"max_tokens":1}',
    'JSON',
    'curl -fsS "$DCP_API_BASE/v1/models"',
    'curl -fsS "$DCP_API_BASE/v1/chat/completions" \\',
    '  -H "Authorization: Bearer $DCP_RENTER_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    '  --data @/tmp/dcp-serving-proof.json',
  ].join('\n');
}

function classifyProbeEvidence(row, verification, cachedModels, heartbeatAge) {
  const endpointReachable = row.endpoint_reachable == null ? null : Number(row.endpoint_reachable) === 1;
  const verifiedOnline = verification ? verification.verified_online === true : false;
  const verifyError = verification?.probe_error || null;
  const lowerVerifyError = String(verifyError || '').toLowerCase();
  const cachedModelCount = cachedModels.length;
  const wgAge = row.wg_handshake_age_s == null ? null : Number(row.wg_handshake_age_s);
  const endpointProbeError = row.endpoint_probe_error || null;
  const endpointFailures = Number(row.endpoint_probe_failures || 0);
  const gates = [
    buildProbeEvidenceGate(
      'heartbeat',
      heartbeatAge != null && heartbeatAge <= 5 * 60 ? 'pass' : 'fail',
      heartbeatAge == null ? 'heartbeat missing' : `${heartbeatAge}s since daemon heartbeat`
    ),
    buildProbeEvidenceGate(
      'endpoint_reachable',
      endpointReachable === true ? 'pass' : endpointReachable === false ? 'fail' : 'unknown',
      endpointReachable === true
        ? 'provider endpoint probe is reachable'
        : (endpointProbeError || 'provider endpoint has no current reachable verdict')
    ),
    buildProbeEvidenceGate(
      'verified_online',
      verifiedOnline ? 'pass' : 'fail',
      verifiedOnline
        ? 'earned-online verification passed'
        : (verifyError || 'earned-online verification has not passed')
    ),
    buildProbeEvidenceGate(
      'model_coverage',
      cachedModelCount > 0 || (verification?.verified_models || []).length > 0 ? 'pass' : 'fail',
      cachedModelCount > 0
        ? `${cachedModelCount} daemon cached model${cachedModelCount === 1 ? '' : 's'}`
        : `${(verification?.verified_models || []).length} models reported by verifier`
    ),
  ];

  if (endpointReachable !== true) {
    return {
      focus_code: 'endpoint_route',
      recovery_focus: 'Endpoint route',
      recommended_next_action: 'From the VPS, confirm the provider endpoint route, bind address, and runtime port before changing catalog state.',
      severity: 'critical',
      agent_mode: 'propose',
      gates,
      endpoint_failures: endpointFailures,
    };
  }
  if (!verifiedOnline) {
    const timeout = lowerVerifyError.includes('timeout') || lowerVerifyError.includes('aborted');
    return {
      focus_code: timeout ? 'inference_timeout' : 'earned_probe',
      recovery_focus: timeout ? 'Inference timeout' : 'Inference probe',
      recommended_next_action: 'Run /v1/models and a one-token inference from the VPS, then inspect runtime logs and catalog aliases.',
      severity: 'critical',
      agent_mode: 'propose',
      gates,
      endpoint_failures: endpointFailures,
    };
  }
  if (cachedModelCount <= 0 && (verification?.verified_models || []).length <= 0) {
    return {
      focus_code: 'model_coverage',
      recovery_focus: 'Model coverage',
      recommended_next_action: 'Confirm daemon-reported cached models and catalog aliases before this provider counts toward model availability.',
      severity: 'critical',
      agent_mode: 'propose',
      gates,
      endpoint_failures: endpointFailures,
    };
  }
  if (row.wg_tunnel_healthy != null && Number(row.wg_tunnel_healthy) !== 1) {
    return {
      focus_code: 'wireguard',
      recovery_focus: 'WireGuard freshness',
      recommended_next_action: 'Confirm handshake age, peer IP, and tunnel health in the verified fleet console before touching routing.',
      severity: 'watch',
      agent_mode: 'propose',
      gates,
      endpoint_failures: endpointFailures,
    };
  }
  if (heartbeatAge == null || heartbeatAge > 5 * 60) {
    return {
      focus_code: 'heartbeat',
      recovery_focus: 'Daemon heartbeat',
      recommended_next_action: 'Confirm the provider daemon is running and heartbeating before catalog or routing decisions use this provider.',
      severity: 'watch',
      agent_mode: 'notify',
      gates,
      endpoint_failures: endpointFailures,
    };
  }
  return {
    focus_code: 'ready',
    recovery_focus: 'Ready provider',
    recommended_next_action: 'Keep this provider under observation and confirm metered traffic before widening public promises.',
    severity: 'routine',
    agent_mode: 'read',
    gates,
    endpoint_failures: endpointFailures,
    wg_handshake_age_s: wgAge,
  };
}

function getProviderColumnSet() {
  return new Set((db.all('PRAGMA table_info(providers)') || []).map((row) => String(row?.name || '')));
}

function buildProviderReactivationQuery(columns) {
  const select = [
    'id',
    'name',
    'email',
    'status',
    "COALESCE(approval_status, 'pending') AS approval_status",
    'last_heartbeat',
    "COALESCE(is_paused, 0) AS is_paused",
    columns.has('daemon_version') ? 'daemon_version' : 'NULL AS daemon_version',
    columns.has('readiness_status') ? 'readiness_status' : 'NULL AS readiness_status',
    columns.has('readiness_details') ? 'readiness_details' : 'NULL AS readiness_details',
    'created_at',
  ];
  return `
    SELECT ${select.join(', ')}
    FROM providers
    WHERE deleted_at IS NULL
  `;
}

function parseReadinessDetailFailures(raw) {
  if (!raw || typeof raw !== 'string') return [];
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];

  const failedChecks = [];
  const checks = Array.isArray(parsed?.checks) ? parsed.checks : [];
  for (const check of checks) {
    const ok = typeof check?.ok === 'boolean' ? check.ok : null;
    const status = String(check?.status || '').toLowerCase();
    if (ok === false || status === 'fail' || status === 'failed' || status === 'error') {
      const code = normalizeString(check?.key || check?.code || check?.name, { maxLen: 64 });
      if (code) failedChecks.push(code.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
    }
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'checks' || key === 'status') continue;
    if (typeof value === 'boolean' && value === false) {
      failedChecks.push(String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_'));
    }
  }

  return Array.from(new Set(failedChecks));
}

function determineInstallStatus(provider) {
  if (normalizeString(provider?.daemon_version, { maxLen: 100 })) return 'installed';
  if (provider?.last_heartbeat) return 'heartbeat_detected_without_daemon_version';
  return 'not_installed';
}

function buildReactivationRecord(provider, nowMs = Date.now()) {
  const heartbeatAge = heartbeatAgeSeconds(provider.last_heartbeat, nowMs);
  const installStatus = determineInstallStatus(provider);
  const readinessStatus = normalizeString(provider.readiness_status, { maxLen: 64 })?.toLowerCase();
  const readinessFailed = ['failed', 'error', 'blocked'].includes(String(readinessStatus || ''));
  const readinessFailureChecks = parseReadinessDetailFailures(provider.readiness_details);

  const blockerReasonCodes = [];
  if (provider.approval_status !== 'approved') blockerReasonCodes.push('approval_pending');
  if (Number(provider.is_paused || 0) === 1) blockerReasonCodes.push('provider_paused');
  if (provider.status === 'suspended') blockerReasonCodes.push('provider_suspended');
  if (installStatus === 'not_installed') blockerReasonCodes.push('daemon_not_installed');
  if (installStatus === 'heartbeat_detected_without_daemon_version') blockerReasonCodes.push('daemon_version_missing');
  if (heartbeatAge == null) blockerReasonCodes.push('heartbeat_missing');
  else if (heartbeatAge > 15 * 60) blockerReasonCodes.push('heartbeat_stale_critical');
  else if (heartbeatAge > 5 * 60) blockerReasonCodes.push('heartbeat_stale');
  if (readinessFailed || readinessFailureChecks.length > 0) blockerReasonCodes.push('readiness_checks_failed');

  const readyToServe = blockerReasonCodes.length === 0 && provider.status === 'online';

  const blockerPenalties = {
    approval_pending: 35,
    provider_paused: 40,
    provider_suspended: 50,
    daemon_not_installed: 30,
    daemon_version_missing: 15,
    heartbeat_missing: 25,
    heartbeat_stale_critical: 20,
    heartbeat_stale: 10,
    readiness_checks_failed: 20,
  };

  let score = 100;
  for (const code of blockerReasonCodes) score -= blockerPenalties[code] || 0;
  if (heartbeatAge != null && heartbeatAge <= 5 * 60) score += 10;
  else if (heartbeatAge != null && heartbeatAge <= 60 * 60) score += 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    provider_id: provider.id,
    name: provider.name || null,
    email: provider.email || null,
    status: provider.status || null,
    approval_status: provider.approval_status || null,
    created_at: toIsoOrNull(provider.created_at),
    last_heartbeat: toIsoOrNull(provider.last_heartbeat),
    heartbeat_age_seconds: heartbeatAge,
    install_status: installStatus,
    readiness_status: readinessStatus || null,
    ready_to_serve: readyToServe,
    blocker_reason_codes: blockerReasonCodes,
    failed_readiness_checks: readinessFailureChecks,
    blocker_count: blockerReasonCodes.length,
    priority_score: score,
    priority_band: score >= 70 ? 'high' : (score >= 40 ? 'medium' : 'low'),
    suggested_action: readyToServe
      ? 'activate_now'
      : (blockerReasonCodes[0] || 'needs_manual_review'),
  };
}

const ACTIVATION_DOWNLOAD_EVENT_CODES = ['setup_script_downloaded', 'daemon_downloaded'];

function sanitizeReasonCode(value, fallback = 'unknown') {
  const normalized = normalizeString(String(value || ''), { maxLen: 64, lowercase: true });
  if (!normalized) return fallback;
  const safe = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function addTaxonomyReason(taxonomyMap, code, providerId, increment = 1, source = 'lifecycle') {
  const safeCode = sanitizeReasonCode(code);
  if (!taxonomyMap.has(safeCode)) {
    taxonomyMap.set(safeCode, {
      code: safeCode,
      count: 0,
      source,
      sample_provider_ids: [],
    });
  }
  const entry = taxonomyMap.get(safeCode);
  entry.count += Number(increment) || 0;
  if (providerId != null && Number.isFinite(Number(providerId))) {
    const asNumber = Number(providerId);
    if (!entry.sample_provider_ids.includes(asNumber) && entry.sample_provider_ids.length < 5) {
      entry.sample_provider_ids.push(asNumber);
    }
  }
}

function toInClause(ids) {
  const clean = Array.from(new Set((ids || []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)));
  if (clean.length === 0) return { clause: '(NULL)', params: [] };
  return { clause: `(${clean.map(() => '?').join(',')})`, params: clean };
}

function parseIsoTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function asPercent(numerator, denominator) {
  if (!(denominator > 0)) return null;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function buildActivationConversionWindowReport(windowHours, nowIso = new Date().toISOString()) {
  const now = new Date(nowIso);
  const sinceIso = new Date(now.getTime() - (windowHours * 3600 * 1000)).toISOString();

  const providers = db.all(
    `SELECT id, created_at, status, approval_status, is_paused, daemon_version, last_heartbeat
     FROM providers
     WHERE deleted_at IS NULL
       AND created_at >= ?`,
    sinceIso
  );
  const providerIds = providers.map((provider) => Number(provider.id)).filter((id) => Number.isInteger(id) && id > 0);
  const providerIdSet = new Set(providerIds);
  const taxonomy = new Map();

  if (providerIds.length === 0) {
    return {
      window_hours: windowHours,
      since: sinceIso,
      until: nowIso,
      stage_counts: {
        registered: 0,
        installer_downloaded: 0,
        first_heartbeat: 0,
        online_within_24h: 0,
      },
      conversion_rates: {
        installer_download_rate: null,
        first_heartbeat_rate: null,
        online_within_24h_rate: null,
      },
      blocker_taxonomy: [],
      sample_size: 0,
    };
  }

  const providerInClause = toInClause(providerIds);

  const downloadRows = db.all(
    `SELECT provider_id
       FROM provider_activation_events
      WHERE provider_id IN ${providerInClause.clause}
        AND event_code IN (${ACTIVATION_DOWNLOAD_EVENT_CODES.map(() => '?').join(',')})
        AND occurred_at >= ?
      GROUP BY provider_id`,
    ...providerInClause.params,
    ...ACTIVATION_DOWNLOAD_EVENT_CODES,
    sinceIso
  );
  const installerDownloadedSet = new Set(
    downloadRows
      .map((row) => Number(row.provider_id))
      .filter((providerId) => providerIdSet.has(providerId))
  );

  const heartbeatRows = db.all(
    `SELECT provider_id, MIN(received_at) AS first_heartbeat_at
       FROM heartbeat_log
      WHERE provider_id IN ${providerInClause.clause}
      GROUP BY provider_id`,
    ...providerInClause.params
  );
  const firstHeartbeatByProvider = new Map();
  for (const row of heartbeatRows) {
    const providerId = Number(row.provider_id);
    if (!providerIdSet.has(providerId)) continue;
    const firstHeartbeat = parseIsoTimestamp(row.first_heartbeat_at);
    if (!firstHeartbeat) continue;
    firstHeartbeatByProvider.set(providerId, firstHeartbeat);
  }

  const daemonRows = db.all(
    `SELECT provider_id, event_type, severity, COUNT(*) AS count
       FROM daemon_events
      WHERE provider_id IN ${providerInClause.clause}
        AND received_at >= ?
        AND severity IN ('error', 'critical')
      GROUP BY provider_id, event_type, severity`,
    ...providerInClause.params,
    sinceIso
  );
  for (const row of daemonRows) {
    const providerId = Number(row.provider_id);
    if (!providerIdSet.has(providerId)) continue;
    const reasonCode = `daemon_event_${sanitizeReasonCode(row.event_type, 'unknown')}`;
    addTaxonomyReason(taxonomy, reasonCode, providerId, Number(row.count) || 0, 'daemon_events');
  }

  let firstHeartbeatCount = 0;
  let onlineWithin24hCount = 0;

  for (const provider of providers) {
    const providerId = Number(provider.id);
    const createdAt = parseIsoTimestamp(provider.created_at);
    const firstHeartbeatAt = firstHeartbeatByProvider.get(providerId) || null;
    const hadHeartbeat = !!firstHeartbeatAt;
    if (hadHeartbeat && firstHeartbeatAt >= new Date(sinceIso)) {
      firstHeartbeatCount += 1;
    }

    const heartbeatWithin24h =
      hadHeartbeat &&
      createdAt &&
      firstHeartbeatAt.getTime() >= createdAt.getTime() &&
      firstHeartbeatAt.getTime() <= (createdAt.getTime() + (24 * 3600 * 1000));
    const onlineWithin24h = heartbeatWithin24h && provider.status === 'online';
    if (onlineWithin24h) {
      onlineWithin24hCount += 1;
      continue;
    }

    if (!installerDownloadedSet.has(providerId)) addTaxonomyReason(taxonomy, 'installer_not_downloaded', providerId, 1, 'lifecycle');
    if (!provider.daemon_version) addTaxonomyReason(taxonomy, 'daemon_not_detected', providerId, 1, 'lifecycle');
    if (!hadHeartbeat) addTaxonomyReason(taxonomy, 'heartbeat_missing', providerId, 1, 'lifecycle');
    if (hadHeartbeat && !heartbeatWithin24h) addTaxonomyReason(taxonomy, 'heartbeat_after_24h', providerId, 1, 'lifecycle');
    if (provider.status !== 'online') addTaxonomyReason(taxonomy, 'provider_not_online', providerId, 1, 'lifecycle');
    if (provider.approval_status !== 'approved') addTaxonomyReason(taxonomy, 'approval_pending', providerId, 1, 'lifecycle');
    if (Number(provider.is_paused || 0) === 1) addTaxonomyReason(taxonomy, 'provider_paused', providerId, 1, 'lifecycle');
  }

  const registeredCount = providers.length;
  const installerCount = installerDownloadedSet.size;
  const blockerTaxonomy = Array.from(taxonomy.values())
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    window_hours: windowHours,
    since: sinceIso,
    until: nowIso,
    stage_counts: {
      registered: registeredCount,
      installer_downloaded: installerCount,
      first_heartbeat: firstHeartbeatCount,
      online_within_24h: onlineWithin24hCount,
    },
    conversion_rates: {
      installer_download_rate: asPercent(installerCount, registeredCount),
      first_heartbeat_rate: asPercent(firstHeartbeatCount, registeredCount),
      online_within_24h_rate: asPercent(onlineWithin24hCount, registeredCount),
    },
    blocker_taxonomy: blockerTaxonomy,
    sample_size: registeredCount,
  };
}

function percentileFromSorted(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const p = Math.min(Math.max(Number(percentile) || 0, 0), 100);
  const idx = Math.ceil((p / 100) * values.length) - 1;
  const boundedIdx = Math.min(Math.max(idx, 0), values.length - 1);
  const selected = Number(values[boundedIdx]);
  return Number.isFinite(selected) ? selected : null;
}

function grantRenterCredit({ renterId, amountHalala, reason, grantedBy = 'admin', now = new Date().toISOString() }) {
  const normalizedReason = normalizeString(reason, { maxLen: 300 });
  if (!normalizedReason) {
    return { error: 'reason_required' };
  }

  const renter = db.get('SELECT id, name, balance_halala FROM renters WHERE id = ?', renterId);
  if (!renter) {
    return { error: 'not_found' };
  }

  const nextBalance = (renter.balance_halala || 0) + amountHalala;
  const tx = db.transaction(() => {
    db.prepare('UPDATE renters SET balance_halala = ?, updated_at = ? WHERE id = ?')
      .run(nextBalance, now, renterId);
    db.prepare(
      `INSERT INTO credit_grants (renter_id, amount_halala, reason, granted_by, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(renterId, amountHalala, normalizedReason, grantedBy, now);
    try {
      db.prepare(
        'INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)'
      ).run(
        'renter_credit_granted',
        'renter',
        renterId,
        `Granted ${amountHalala} halala to "${renter.name}": ${normalizedReason}`,
        now
      );
    } catch (e) {}
  });
  tx();

  return {
    renter_id: renter.id,
    name: renter.name,
    previous_balance: renter.balance_halala || 0,
    granted_halala: amountHalala,
    new_balance: nextBalance,
    reason: normalizedReason
  };
}

// === GET /api/admin/pricing - List GPU model prices ===
router.get('/pricing', (req, res) => {
  try {
    const rows = db.all(
      `SELECT id, gpu_model, rate_halala, updated_at
       FROM gpu_pricing
       ORDER BY LOWER(gpu_model) ASC`
    );
    res.json({ prices: rows });
  } catch (error) {
    console.error('Admin pricing list error:', error);
    res.status(500).json({ error: 'Failed to fetch GPU pricing' });
  }
});

// === POST /api/admin/pricing - Create price for a GPU model ===
router.post('/pricing', (req, res) => {
  try {
    const gpuModel = normalizeGpuModel(req.body?.gpu_model);
    const rateHalala = toFiniteInt(req.body?.rate_halala, { min: 100, max: 100000 });

    if (!gpuModel) {
      return res.status(400).json({ error: 'gpu_model is required' });
    }
    if (rateHalala == null) {
      return res.status(400).json({ error: 'rate_halala must be an integer between 100 and 100000' });
    }

    const result = db.prepare(
      `INSERT INTO gpu_pricing (gpu_model, rate_halala, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)`
    ).run(gpuModel, rateHalala);

    const row = db.get(
      `SELECT id, gpu_model, rate_halala, updated_at
       FROM gpu_pricing
       WHERE id = ?`,
      result.lastInsertRowid
    );

    res.status(201).json({ success: true, price: row });
  } catch (error) {
    if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Pricing for this gpu_model already exists. Use PATCH to update it.' });
    }
    console.error('Admin pricing create error:', error);
    res.status(500).json({ error: 'Failed to create GPU pricing' });
  }
});

// === PATCH /api/admin/pricing/:model - Update existing model price ===
router.patch('/pricing/:model', (req, res) => {
  try {
    const modelParam = decodeURIComponent(req.params.model || '');
    const gpuModel = normalizeGpuModel(modelParam);
    const rateHalala = toFiniteInt(req.body?.rate_halala, { min: 100, max: 100000 });

    if (!gpuModel) {
      return res.status(400).json({ error: 'model path parameter is required' });
    }
    if (rateHalala == null) {
      return res.status(400).json({ error: 'rate_halala must be an integer between 100 and 100000' });
    }

    const result = db.prepare(
      `UPDATE gpu_pricing
       SET rate_halala = ?, updated_at = CURRENT_TIMESTAMP
       WHERE gpu_model = ?`
    ).run(rateHalala, gpuModel);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'GPU model pricing not found' });
    }

    const row = db.get(
      `SELECT id, gpu_model, rate_halala, updated_at
       FROM gpu_pricing
       WHERE gpu_model = ?`,
      gpuModel
    );

    res.json({ success: true, price: row });
  } catch (error) {
    console.error('Admin pricing update error:', error);
    res.status(500).json({ error: 'Failed to update GPU pricing' });
  }
});

// === POST /api/admin/containers/approve-image - Allowlist custom image ===
router.post('/containers/approve-image', (req, res) => {
  try {
    const validated = validateAndNormalizeImageRef(req.body?.image_ref);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const imageRef = validated.value;
    const registry = parseRegistryFromImageRef(imageRef);
    if (!registry || !isTrustedRegistry(registry)) {
      return res.status(400).json({ error: `Registry '${registry || 'unknown'}' is not trusted` });
    }

    const actor = adminActorFingerprint(req);
    if (!consumeAdminRateLimit('image_approve', actor)) {
      return res.status(429).json({ error: 'Image approval rate limit exceeded. Try again later.' });
    }

    const existsCheck = assertPublicImageExists(imageRef);
    if (!existsCheck.ok) {
      return res.status(400).json({ error: existsCheck.error });
    }

    const digestCheck = resolveImageDigest(imageRef);
    if (!digestCheck.ok) {
      return res.status(502).json({ error: digestCheck.error });
    }

    const requestedDigest = parsePinnedDigest(imageRef);
    if (requestedDigest && requestedDigest !== digestCheck.resolvedDigest) {
      return res.status(409).json({ error: 'Provided digest does not match resolved image digest' });
    }

    const scan = runCriticalImageScan(imageRef);
    if (!scan.ok) {
      return res.status(502).json({ error: scan.error });
    }

    const description = normalizeString(req.body?.description, { maxLen: 400 });
    const imageType = normalizeImageType(req.body?.image_type)
      || (isDockerHubImageRef(imageRef) ? 'docker_hub' : 'custom');
    const approvedAt = new Date().toISOString();

    let scanId = null;
    const tx = db._db.transaction(() => {
      const scanInsert = db.prepare(
        `INSERT INTO image_scans
           (image_ref, registry, resolved_digest, scanned_at, critical_count, scan_report_json, approved, approved_at, approved_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        imageRef,
        registry,
        digestCheck.resolvedDigest,
        approvedAt,
        scan.criticalCount,
        scan.reportJson,
        scan.criticalCount === 0 ? 1 : 0,
        scan.criticalCount === 0 ? approvedAt : null,
        scan.criticalCount === 0 ? actor : null,
        approvedAt
      );
      scanId = scanInsert.lastInsertRowid;

      if (scan.criticalCount === 0) {
        db.prepare(
          `INSERT INTO allowed_images (image_ref, image_type, description, approved_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(image_ref) DO UPDATE SET
             image_type = excluded.image_type,
             description = excluded.description,
             approved_at = excluded.approved_at`
        ).run(imageRef, imageType, description || null, approvedAt);

        db.prepare(
          `INSERT INTO approved_container_images
             (image_ref, registry, resolved_digest, scan_id, is_active, approved_at, approved_by, last_validated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)
           ON CONFLICT(image_ref) DO UPDATE SET
             registry = excluded.registry,
             resolved_digest = excluded.resolved_digest,
             scan_id = excluded.scan_id,
             is_active = 1,
             approved_at = excluded.approved_at,
             approved_by = excluded.approved_by,
             last_validated_at = excluded.last_validated_at`
        ).run(
          imageRef,
          registry,
          digestCheck.resolvedDigest,
          scanId,
          approvedAt,
          actor,
          approvedAt
        );
      }
    });
    tx();

    if (scan.criticalCount > 0) {
      return res.status(400).json({
        error: 'Image contains CRITICAL vulnerabilities and cannot be approved',
        image_ref: imageRef,
        critical_count: scan.criticalCount,
        scan_id: scanId,
      });
    }

    const row = db.get(
      `SELECT id, image_ref, image_type, description, approved_at
       FROM allowed_images
       WHERE lower(image_ref) = lower(?)
       LIMIT 1`,
      imageRef
    );

    res.status(201).json({
      success: true,
      image: row,
      scan_id: scanId,
      critical_count: scan.criticalCount,
      resolved_digest: digestCheck.resolvedDigest,
      pinned_ref: digestCheck.pinnedRef || `${stripDigest(imageRef)}@${digestCheck.resolvedDigest}`,
    });
  } catch (error) {
    console.error('Admin approve-image error:', error);
    res.status(500).json({ error: 'Failed to approve container image' });
  }
});

// === POST /api/admin/containers/scan-image - Scan without approval ===
router.post('/containers/scan-image', (req, res) => {
  try {
    const validated = validateAndNormalizeImageRef(req.body?.image_ref);
    if (validated.error) return res.status(400).json({ error: validated.error });
    const imageRef = validated.value;
    const registry = parseRegistryFromImageRef(imageRef);
    if (!registry || !isTrustedRegistry(registry)) {
      return res.status(400).json({ error: `Registry '${registry || 'unknown'}' is not trusted` });
    }

    const actor = adminActorFingerprint(req);
    if (!consumeAdminRateLimit('image_scan', actor)) {
      return res.status(429).json({ error: 'Image scan rate limit exceeded. Try again later.' });
    }

    const existsCheck = assertPublicImageExists(imageRef);
    if (!existsCheck.ok) return res.status(400).json({ error: existsCheck.error });

    const digestCheck = resolveImageDigest(imageRef);
    if (!digestCheck.ok) return res.status(502).json({ error: digestCheck.error });

    const requestedDigest = parsePinnedDigest(imageRef);
    if (requestedDigest && requestedDigest !== digestCheck.resolvedDigest) {
      return res.status(409).json({ error: 'Provided digest does not match resolved image digest' });
    }

    const scan = runCriticalImageScan(imageRef);
    if (!scan.ok) return res.status(502).json({ error: scan.error });

    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO image_scans
         (image_ref, registry, resolved_digest, scanned_at, critical_count, scan_report_json, approved, approved_at, approved_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?)`
    ).run(
      imageRef,
      registry,
      digestCheck.resolvedDigest,
      now,
      scan.criticalCount,
      scan.reportJson,
      now
    );

    return res.json({
      success: true,
      scan_id: insert.lastInsertRowid,
      image_ref: imageRef,
      resolved_digest: digestCheck.resolvedDigest,
      critical_count: scan.criticalCount,
      blocked: scan.criticalCount > 0,
    });
  } catch (error) {
    console.error('Admin scan-image error:', error);
    return res.status(500).json({ error: 'Failed to scan image' });
  }
});

// === GET /api/admin/containers/security-status - Approved images + scan status ===
router.get('/containers/security-status', (req, res) => {
  try {
    const approvedImages = db.all(
      `SELECT a.id,
              a.image_ref,
              a.registry,
              a.resolved_digest,
              a.approved_at,
              a.last_validated_at,
              s.scanned_at,
              s.critical_count,
              s.approved
         FROM approved_container_images a
         LEFT JOIN image_scans s ON s.id = a.scan_id
        WHERE a.is_active = 1
        ORDER BY a.approved_at DESC`
    );
    const recentScans = db.all(
      `SELECT id, image_ref, registry, resolved_digest, scanned_at, critical_count, approved
         FROM image_scans
        ORDER BY scanned_at DESC
        LIMIT 100`
    );

    return res.json({
      allowed_registries: IMAGE_REGISTRY_ALLOWLIST,
      approved_images: approvedImages.map((row) => ({
        ...row,
        pinned_ref: `${stripDigest(row.image_ref)}@${row.resolved_digest}`,
      })),
      recent_scans: recentScans,
    });
  } catch (error) {
    console.error('Admin containers security-status error:', error);
    return res.status(500).json({ error: 'Failed to fetch container security status' });
  }
});

// === GET /api/admin/providers - All providers (api_key intentionally excluded) ===
router.get('/providers', (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 0, 0); // 0 = all (legacy), 1+ = paginated
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const search = (req.query.search || '').trim().toLowerCase();
    const statusFilter = req.query.status || '';

    let where = '1=1';
    const wParams = [];
    if (search) {
      where += ` AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(gpu_model) LIKE ?)`;
      wParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (statusFilter === 'online') { where += ` AND last_heartbeat > datetime('now', '-5 minutes')`; }
    else if (statusFilter === 'offline') { where += ` AND last_heartbeat IS NOT NULL AND last_heartbeat <= datetime('now', '-5 minutes')`; }
    else if (statusFilter === 'registered') { where += ` AND last_heartbeat IS NULL`; }
    else if (statusFilter === 'suspended') { where += ` AND status = 'suspended'`; }
    else if (statusFilter === 'pending_approval') { where += ` AND COALESCE(approval_status, 'pending') = 'pending'`; }
    const gpuModelFilter = (req.query.gpu_model || '').trim();
    if (gpuModelFilter) { where += ` AND LOWER(gpu_model) = LOWER(?)`; wParams.push(gpuModelFilter); }

    const countRow = db.get(`SELECT COUNT(*) as total FROM providers WHERE ${where}`, ...wParams);
    const total = countRow?.total || 0;

    let paginationSql = '';
    if (page > 0) {
      const offset = (page - 1) * limit;
      paginationSql = `LIMIT ${limit} OFFSET ${offset}`;
    }

    // api_key omitted from SELECT — never expose raw credentials in admin responses
    const providers = db.all(
      `SELECT id, name, email, gpu_model, gpu_count, vram_gb, os,
              status, gpu_status, provider_ip, provider_hostname,
              last_heartbeat, gpu_name_detected, gpu_vram_mib, gpu_driver,
              gpu_compute, total_earnings, total_jobs, uptime_percent,
              run_mode, is_paused, approval_status, approved_at, rejected_reason, created_at, updated_at
       FROM providers WHERE ${where} ORDER BY
         CASE WHEN status = 'online' THEN 0 ELSE 1 END,
         last_heartbeat DESC, created_at DESC ${paginationSql}`,
      ...wParams
    );

    const now = new Date();
    const since24h = new Date(Date.now() - 24*60*60*1000).toISOString();
    const expectedIn24h = (24 * 60 * 60) / 30; // 2880 heartbeats at 30s interval

    const enriched = providers.map(p => {
      let gpu_status_parsed = null;
      try { gpu_status_parsed = p.gpu_status ? JSON.parse(p.gpu_status) : null; } catch(e) {}

      const lastBeat = p.last_heartbeat ? new Date(p.last_heartbeat) : null;
      const minutesSinceHeartbeat = lastBeat ? (now - lastBeat) / 60000 : null;
      const isOnline = minutesSinceHeartbeat !== null && minutesSinceHeartbeat < 5;

      // Calculate 24h uptime from heartbeat_log
      let uptime_24h = null;
      try {
        const hbRow = db.get('SELECT COUNT(*) as cnt FROM heartbeat_log WHERE provider_id = ? AND received_at > ?', p.id, since24h);
        if (hbRow && hbRow.cnt > 0) {
          uptime_24h = Math.min(100, Math.round((hbRow.cnt / expectedIn24h) * 100));
        }
      } catch(e) {}

      return {
        ...p,
        gpu_status: gpu_status_parsed,
        approval_status: p.approval_status || 'pending',
        is_online: isOnline,
        minutes_since_heartbeat: minutesSinceHeartbeat !== null ? Math.round(minutesSinceHeartbeat) : null,
        status: isOnline ? 'online' : (p.last_heartbeat ? 'offline' : 'registered'),
        uptime_24h
      };
    });

    const response = {
      total,
      online: enriched.filter(p => p.is_online).length,
      offline: enriched.filter(p => !p.is_online && p.last_heartbeat).length,
      registered: enriched.filter(p => !p.last_heartbeat).length,
      pending_approval: enriched.filter(p => (p.approval_status || 'pending') === 'pending').length,
      providers: enriched
    };
    if (page > 0) {
      response.pagination = { page, limit, total, total_pages: Math.ceil(total / limit) };
    }
    res.json(response);
  } catch (error) {
    console.error('Admin providers error:', error);
    res.status(500).json({ error: 'Failed to fetch providers' });
  }
});

// === GET /api/admin/providers/approval-queue - Pending approval providers with SLA metadata ===
router.get('/providers/approval-queue', (req, res) => {
  try {
    const limit = toFiniteInt(req.query.limit, { min: 1, max: 500 }) || 100;
    const nowMs = Date.now();
    const pending = db.all(
      `SELECT id, name, email, approval_status, rejected_reason, created_at, updated_at
       FROM providers
       WHERE COALESCE(approval_status, 'pending') = 'pending'
       ORDER BY datetime(created_at) ASC, id ASC
       LIMIT ?`,
      limit
    );

    const providers = pending.map((provider) => buildProviderApprovalQueueEntry(provider, nowMs));

    return res.json({
      count: providers.length,
      generated_at: new Date(nowMs).toISOString(),
      sla_target_seconds: PROVIDER_APPROVAL_SLA_SECONDS,
      providers,
    });
  } catch (error) {
    console.error('Admin provider approval-queue error:', error);
    return res.status(500).json({ error: 'Failed to fetch provider approval queue' });
  }
});

// === PATCH /api/admin/providers/:id/approval-decision - Explicit approve/reject with immutable audit row ===
router.patch('/providers/:id/approval-decision', (req, res) => {
  try {
    const providerId = toFiniteInt(req.params.id, { min: 1 });
    if (providerId == null) return res.status(400).json({ error: 'Invalid provider id' });

    const decisionRaw = normalizeString(req.body?.decision, { maxLen: 20 });
    const decision = decisionRaw ? decisionRaw.toLowerCase() : null;
    if (!decision || !['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approve or reject' });
    }

    const reason = normalizeString(req.body?.reason, { maxLen: 400 });
    if (decision === 'reject' && !reason) {
      return res.status(400).json({ error: 'reason is required when decision is reject' });
    }

    const provider = db.get(
      `SELECT id, name, approval_status
       FROM providers
       WHERE id = ?`,
      providerId
    );
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    if ((provider.approval_status || 'pending') !== 'pending') {
      return res.status(409).json({ error: `Provider approval_status is already ${provider.approval_status}` });
    }

    const now = new Date().toISOString();
    const actor = normalizeString(getAdminTokenFromReq(req), { maxLen: 120 }) || 'system';
    let action;
    let details;
    let nextStatus;
    let approvedAt = null;
    let rejectedReason = null;

    if (decision === 'approve') {
      nextStatus = 'approved';
      approvedAt = now;
      action = 'provider_approved';
      details = `Approved provider "${provider.name}"`;
      db.prepare(
        `UPDATE providers
         SET approval_status = 'approved',
             approved_at = ?,
             rejected_reason = NULL,
             updated_at = ?
         WHERE id = ?`
      ).run(now, now, providerId);
    } else {
      nextStatus = 'rejected';
      rejectedReason = reason;
      action = 'provider_rejected';
      details = `Rejected provider "${provider.name}": ${reason}`;
      db.prepare(
        `UPDATE providers
         SET approval_status = 'rejected',
             approved_at = NULL,
             rejected_reason = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(reason, now, providerId);
    }

    db.prepare(
      `INSERT INTO admin_audit_log
         (admin_user_id, action, target_type, target_id, details, timestamp)
       VALUES (?, ?, 'provider', ?, ?, ?)`
    ).run(actor, action, String(providerId), details, now);

    const latestAudit = db.get(
      `SELECT id, admin_user_id, action, target_type, target_id, details, timestamp
       FROM admin_audit_log
       WHERE target_type = 'provider'
         AND target_id = ?
         AND action IN ('provider_approved', 'provider_rejected')
       ORDER BY id DESC
       LIMIT 1`,
      String(providerId)
    );

    return res.json({
      success: true,
      provider_id: providerId,
      approval_status: nextStatus,
      approved_at: approvedAt,
      rejected_reason: rejectedReason,
      decided_at: now,
      audit_entry: latestAudit || null,
    });
  } catch (error) {
    console.error('Provider approval-decision error:', error);
    return res.status(500).json({ error: 'Failed to update provider approval decision' });
  }
});

// === GET /api/admin/providers/:id/approval-audit - Read immutable provider approval decisions ===
router.get('/providers/:id/approval-audit', (req, res) => {
  try {
    const providerId = toFiniteInt(req.params.id, { min: 1 });
    if (providerId == null) return res.status(400).json({ error: 'Invalid provider id' });

    const provider = db.get(
      `SELECT id, approval_status, approved_at, rejected_reason
       FROM providers
       WHERE id = ?`,
      providerId
    );
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const limit = toFiniteInt(req.query.limit, { min: 1, max: 500 }) || 100;
    const entries = db.all(
      `SELECT id, admin_user_id, action, target_type, target_id, details, timestamp
       FROM admin_audit_log
       WHERE target_type = 'provider'
         AND target_id = ?
         AND action IN ('provider_approved', 'provider_rejected')
       ORDER BY id DESC
       LIMIT ?`,
      String(providerId),
      limit
    );

    return res.json({
      provider_id: providerId,
      approval_status: provider.approval_status || 'pending',
      approved_at: provider.approved_at || null,
      rejected_reason: provider.rejected_reason || null,
      count: entries.length,
      entries,
    });
  } catch (error) {
    console.error('Provider approval-audit error:', error);
    return res.status(500).json({ error: 'Failed to fetch provider approval audit' });
  }
});

// === GET /api/admin/providers/health - Fleet summary from latest telemetry ===
router.get('/providers/health', (req, res) => {
  try {
    const nowMs = Date.now();
    const providers = db.all(
      `SELECT id, email, last_heartbeat, vram_gb, vram_mb, gpu_vram_mb, gpu_vram_mib,
              gpu_name_detected, gpu_model, status
       FROM providers`
    );

    // Latest GPU telemetry per provider
    const latestTelemetry = db.all(
      `WITH latest AS (
         SELECT t.provider_id, t.gpu_util_pct, t.vram_used_gb, t.active_jobs
         FROM provider_gpu_telemetry t
         INNER JOIN (
           SELECT provider_id, MAX(recorded_at) AS max_at
           FROM provider_gpu_telemetry GROUP BY provider_id
         ) m ON m.provider_id = t.provider_id AND m.max_at = t.recorded_at
       )
       SELECT * FROM latest`
    );
    const telemetryMap = {};
    for (const row of latestTelemetry) telemetryMap[row.provider_id] = row;

    let onlineCount = 0;
    let staleCount = 0;
    let offlineCount = 0;
    let totalVramGb = 0;
    const providerList = [];

    for (const provider of providers) {
      const ageSeconds = heartbeatAgeSeconds(provider.last_heartbeat, nowMs);
      let healthStatus;
      if (ageSeconds == null || ageSeconds > 15 * 60) { healthStatus = 'offline'; offlineCount += 1; }
      else if (ageSeconds > 5 * 60) { healthStatus = 'stale'; staleCount += 1; }
      else { healthStatus = 'online'; onlineCount += 1; }

      const vramGb = Number(
        provider.vram_gb
        || (provider.vram_mb ? provider.vram_mb / 1024 : 0)
        || (provider.gpu_vram_mb ? provider.gpu_vram_mb / 1024 : 0)
        || (provider.gpu_vram_mib ? provider.gpu_vram_mib / 1024 : 0)
      );
      totalVramGb += Number.isFinite(vramGb) ? vramGb : 0;

      const t = telemetryMap[provider.id] || {};
      providerList.push({
        id: provider.id,
        email: provider.email || null,
        gpu_name: provider.gpu_name_detected || provider.gpu_model || null,
        status: healthStatus,
        last_heartbeat: provider.last_heartbeat || null,
        heartbeat_age_seconds: ageSeconds,
        gpu_utilization_pct: t.gpu_util_pct != null ? Number(Number(t.gpu_util_pct).toFixed(1)) : null,
        vram_used_gb: t.vram_used_gb != null ? Number(Number(t.vram_used_gb).toFixed(2)) : null,
        active_jobs: t.active_jobs != null ? Number(t.active_jobs) : null,
        vram_total_gb: Number.isFinite(vramGb) && vramGb > 0 ? Number(vramGb.toFixed(2)) : null,
      });
    }

    // Sort: online first, then stale, then offline
    providerList.sort((a, b) => (['online', 'stale', 'offline'].indexOf(a.status)) - (['online', 'stale', 'offline'].indexOf(b.status)));

    const telemetryAvg = db.get(
      `WITH latest AS (
         SELECT t.provider_id, t.gpu_util_pct
         FROM provider_gpu_telemetry t
         INNER JOIN (
           SELECT provider_id, MAX(recorded_at) AS max_recorded_at
           FROM provider_gpu_telemetry
           GROUP BY provider_id
         ) m
           ON m.provider_id = t.provider_id
          AND m.max_recorded_at = t.recorded_at
       )
       SELECT AVG(gpu_util_pct) AS avg_gpu_util_pct
       FROM latest
       WHERE gpu_util_pct IS NOT NULL`
    );

    const coldStartRows = db.all(
      `SELECT cold_start_ms
       FROM provider_gpu_telemetry
       WHERE cold_start_ms IS NOT NULL
         AND cold_start_ms > 0
         AND recorded_at >= datetime('now', '-24 hours')
       ORDER BY cold_start_ms ASC`
    );
    const coldStartValues = coldStartRows
      .map((row) => Number(row?.cold_start_ms))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const coldStartP50Ms = percentileFromSorted(coldStartValues, 50);
    const coldStartP95Ms = percentileFromSorted(coldStartValues, 95);

    const busiestProvider = db.get(
      `SELECT p.email, COUNT(*) AS active_jobs
       FROM jobs j
       INNER JOIN providers p ON p.id = j.provider_id
       WHERE j.status = 'running'
       GROUP BY j.provider_id
       ORDER BY active_jobs DESC, p.id ASC
       LIMIT 1`
    );

    return res.json({
      online_count: onlineCount,
      offline_count: offlineCount,
      stale_count: staleCount,
      total_vram_gb: Number(totalVramGb.toFixed(2)),
      avg_gpu_util_pct: Number(((telemetryAvg?.avg_gpu_util_pct || 0)).toFixed(2)),
      cold_start_p50_ms: coldStartP50Ms != null ? Math.round(coldStartP50Ms) : null,
      cold_start_p95_ms: coldStartP95Ms != null ? Math.round(coldStartP95Ms) : null,
      cold_start_sample_count_24h: coldStartValues.length,
      busiest_provider: busiestProvider
        ? {
            email: busiestProvider.email || null,
            active_jobs: Number(busiestProvider.active_jobs || 0),
          }
        : null,
      providers: providerList,
      generated_at: new Date(nowMs).toISOString(),
    });
  } catch (error) {
    console.error('Admin providers health error:', error);
    return res.status(500).json({ error: 'Failed to fetch provider health' });
  }
});

// === GET /api/admin/providers/status - Live provider status for admin dashboard (DCP-907) ===
// Returns all providers with: id, name, isOnline, lastSeen, gpuUtil, modelLoaded
// Auth: DC1_ADMIN_TOKEN required
router.get('/providers/status', requireAdminAuth, (req, res) => {
  try {
    const nowMs = Date.now();
    const ONLINE_THRESHOLD_MS = 90 * 1000; // 90s — provider considered online if heartbeat within this window

    const providers = db.all(
      `SELECT p.id, p.name, p.email, p.gpu_model, p.status, p.last_heartbeat,
              p.cached_models, p.vram_gb, p.vram_mb, p.gpu_vram_mb,
              t.gpu_util_pct, t.vram_used_gb, t.active_jobs
       FROM providers p
       LEFT JOIN (
         SELECT t2.provider_id, t2.gpu_util_pct, t2.vram_used_gb, t2.active_jobs
         FROM provider_gpu_telemetry t2
         INNER JOIN (
           SELECT provider_id, MAX(recorded_at) AS max_at
           FROM provider_gpu_telemetry GROUP BY provider_id
         ) m ON m.provider_id = t2.provider_id AND m.max_at = t2.recorded_at
       ) t ON t.provider_id = p.id
       WHERE p.deleted_at IS NULL
       ORDER BY p.last_heartbeat DESC NULLS LAST`
    );

    const rows = providers.map((p) => {
      const heartbeatMs = p.last_heartbeat ? Date.parse(p.last_heartbeat) : NaN;
      const ageMs = Number.isFinite(heartbeatMs) ? nowMs - heartbeatMs : null;
      const isOnline = ageMs != null && ageMs < ONLINE_THRESHOLD_MS;

      let modelLoaded = null;
      try {
        const parsed = JSON.parse(p.cached_models || '[]');
        modelLoaded = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : null;
      } catch (_) {}

      return {
        id: p.id,
        name: p.name || null,
        email: p.email || null,
        gpu_model: p.gpu_model || null,
        is_online: isOnline,
        last_seen: p.last_heartbeat || null,
        heartbeat_age_seconds: ageMs != null ? Math.floor(ageMs / 1000) : null,
        gpu_util_pct: p.gpu_util_pct != null ? Number(Number(p.gpu_util_pct).toFixed(1)) : null,
        vram_used_gb: p.vram_used_gb != null ? Number(Number(p.vram_used_gb).toFixed(2)) : null,
        vram_total_gb: p.vram_gb || (p.vram_mb ? Number((p.vram_mb / 1024).toFixed(2)) : null) || (p.gpu_vram_mb ? Number((p.gpu_vram_mb / 1024).toFixed(2)) : null) || null,
        model_loaded: modelLoaded,
        active_jobs: p.active_jobs != null ? Number(p.active_jobs) : 0,
      };
    });

    const onlineCount = rows.filter((r) => r.is_online).length;

    return res.json({
      total: rows.length,
      online: onlineCount,
      offline: rows.length - onlineCount,
      providers: rows,
      generated_at: new Date(nowMs).toISOString(),
    });
  } catch (error) {
    console.error('Admin providers status error:', error);
    return res.status(500).json({ error: 'Failed to fetch provider status' });
  }
});

// === GET /api/admin/providers/reactivation-queue - ranked provider reactivation queue (DCP-226) ===
router.get('/providers/reactivation-queue', requireAdminAuth, (req, res) => {
  try {
    const nowMs = Date.now();
    const limit = toFiniteInt(req.query.limit, { min: 1, max: 500 }) || 100;
    const readyFilterRaw = normalizeString(req.query.ready_to_serve, { maxLen: 8 });
    let readyFilter = null;
    if (readyFilterRaw != null) {
      if (['true', '1', 'yes'].includes(readyFilterRaw.toLowerCase())) readyFilter = true;
      else if (['false', '0', 'no'].includes(readyFilterRaw.toLowerCase())) readyFilter = false;
      else return res.status(400).json({ error: 'ready_to_serve must be true or false when provided' });
    }

    const columns = getProviderColumnSet();
    const providers = db.all(buildProviderReactivationQuery(columns));
    let queue = providers.map((provider) => buildReactivationRecord(provider, nowMs));

    if (readyFilter != null) {
      queue = queue.filter((entry) => entry.ready_to_serve === readyFilter);
    }

    queue.sort((a, b) => {
      if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
      if (a.blocker_count !== b.blocker_count) return a.blocker_count - b.blocker_count;
      const ageA = a.heartbeat_age_seconds == null ? Number.MAX_SAFE_INTEGER : a.heartbeat_age_seconds;
      const ageB = b.heartbeat_age_seconds == null ? Number.MAX_SAFE_INTEGER : b.heartbeat_age_seconds;
      if (ageA !== ageB) return ageA - ageB;
      return Number(a.provider_id || 0) - Number(b.provider_id || 0);
    });

    const limited = queue.slice(0, limit).map((entry, index) => ({
      ...entry,
      queue_position: index + 1,
    }));

    const readyCount = queue.filter((entry) => entry.ready_to_serve).length;
    const blockedCount = queue.length - readyCount;

    return res.json({
      total: queue.length,
      returned: limited.length,
      summary: {
        ready_to_serve: readyCount,
        blocked: blockedCount,
      },
      filters: {
        ready_to_serve: readyFilter,
        limit,
      },
      generated_at: new Date(nowMs).toISOString(),
      providers: limited,
    });
  } catch (error) {
    console.error('Admin provider reactivation queue error:', error);
    return res.status(500).json({ error: 'Failed to fetch provider reactivation queue' });
  }
});

// === GET /api/admin/providers/metrics - Aggregated provider + job metrics ===
router.get('/providers/metrics', requireAdminAuth, (req, res) => {
  try {
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fiveMinAgoIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Provider counts by status bucket
    const totalProviders = db.get('SELECT COUNT(*) AS count FROM providers WHERE deleted_at IS NULL');
    const onlineProviders = db.get(
      'SELECT COUNT(*) AS count FROM providers WHERE deleted_at IS NULL AND last_heartbeat > ?',
      fiveMinAgoIso
    );
    const pendingProviders = db.get(
      "SELECT COUNT(*) AS count FROM providers WHERE deleted_at IS NULL AND COALESCE(approval_status, 'pending') = 'pending'"
    );
    const offlineCount = (totalProviders.count || 0) - (onlineProviders.count || 0) - (pendingProviders.count || 0);

    // GPU model distribution
    const gpuDistribution = db.all(
      `SELECT COALESCE(gpu_name_detected, gpu_model, 'unknown') AS gpu_model, COUNT(*) AS provider_count
       FROM providers
       WHERE deleted_at IS NULL
       GROUP BY COALESCE(gpu_name_detected, gpu_model, 'unknown')
       ORDER BY provider_count DESC`
    );

    // Aggregate job stats for last 7 days
    const jobStats = db.get(
      `SELECT
         COUNT(*) AS total_jobs,
         ROUND(
           100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1),
           2
         ) AS success_rate,
         ROUND(
           AVG(
             CASE
               WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
               THEN (julianday(completed_at) - julianday(started_at)) * 86400.0
             END
           ),
           2
         ) AS avg_duration_s
       FROM jobs
       WHERE COALESCE(created_at, submitted_at) >= ?`,
      sevenDaysAgoIso
    );

    // Top 5 providers by job count
    const topProviders = db.all(
      `SELECT p.id, p.email, p.gpu_model, COUNT(j.id) AS job_count
       FROM providers p
       LEFT JOIN jobs j ON j.provider_id = p.id
       WHERE p.deleted_at IS NULL
       GROUP BY p.id
       ORDER BY job_count DESC
       LIMIT 5`
    );

    return res.json({
      providers: {
        total: totalProviders.count || 0,
        online: onlineProviders.count || 0,
        offline: Math.max(0, offlineCount),
        pending: pendingProviders.count || 0,
      },
      gpu_distribution: gpuDistribution,
      jobs_last_7d: {
        total_jobs: jobStats.total_jobs || 0,
        success_rate: jobStats.success_rate != null ? Number(jobStats.success_rate) : null,
        avg_duration_s: jobStats.avg_duration_s != null ? Number(jobStats.avg_duration_s) : null,
      },
      top_providers_by_job_count: topProviders.map(p => ({
        id: p.id,
        email: p.email || null,
        gpu_model: p.gpu_model || null,
        job_count: Number(p.job_count || 0),
      })),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin providers metrics error:', error);
    return res.status(500).json({ error: 'Failed to fetch provider metrics' });
  }
});

// === CONTROL PLANE: serverless readiness policies/signals/prewarm ===
router.get('/control-plane/policies', (req, res) => {
  try {
    const policies = listControlPlanePolicies();
    return res.json({
      generated_at: new Date().toISOString(),
      count: policies.length,
      policies,
    });
  } catch (error) {
    console.error('Control plane policies list error:', error);
    return res.status(500).json({ error: 'Failed to list control plane policies' });
  }
});

router.patch('/control-plane/policies/:pricingClass', (req, res) => {
  try {
    const pricingClass = normalizeString(req.params.pricingClass, { maxLen: 32 }) || '';
    if (!PRICING_CLASS_ORDER.includes(pricingClass)) {
      return res.status(400).json({ error: `pricingClass must be one of: ${PRICING_CLASS_ORDER.join(', ')}` });
    }
    const next = updateControlPlanePolicy(pricingClass, req.body || {});
    return res.json({
      success: true,
      policy: next,
      message: `Updated ${next.pricing_class} control plane policy`,
    });
  } catch (error) {
    console.error('Control plane policy update error:', error);
    return res.status(500).json({ error: 'Failed to update control plane policy' });
  }
});

router.get('/control-plane/capacity/policies', (req, res) => {
  try {
    const policies = listControlPlaneCapacityPolicies();
    return res.json({
      generated_at: new Date().toISOString(),
      capacity_classes: CAPACITY_CLASS_ORDER,
      count: policies.length,
      policies,
    });
  } catch (error) {
    console.error('Control plane capacity policies list error:', error);
    return res.status(500).json({ error: 'Failed to list control plane capacity policies' });
  }
});

router.patch('/control-plane/capacity/policies/:capacityClass', (req, res) => {
  try {
    const capacityClass = normalizeString(req.params.capacityClass, { maxLen: 32 }) || '';
    if (!CAPACITY_CLASS_ORDER.includes(capacityClass)) {
      return res.status(400).json({ error: `capacityClass must be one of: ${CAPACITY_CLASS_ORDER.join(', ')}` });
    }
    const next = updateControlPlaneCapacityPolicy(capacityClass, req.body || {});
    return res.json({
      success: true,
      policy: next,
      message: `Updated ${next.capacity_class} control plane capacity policy`,
    });
  } catch (error) {
    console.error('Control plane capacity policy update error:', error);
    return res.status(500).json({ error: 'Failed to update control plane capacity policy' });
  }
});

router.get('/control-plane/signals', (req, res) => {
  try {
    const limit = toFiniteInt(req.query.limit, { min: 1, max: 500 }) || 100;
    const recompute = parseBooleanLike(req.query.recompute, false);
    const persist = parseBooleanLike(req.query.persist, false);

    if (recompute) {
      const snapshot = calculateControlPlaneSignals({ actor: { type: 'admin', id: null }, persist });
      return res.json({
        mode: persist ? 'recompute_and_persist' : 'recompute_preview',
        snapshot,
      });
    }

    const rows = getControlPlaneSignals(limit);
    return res.json({
      mode: 'historical',
      count: rows.length,
      signals: rows,
    });
  } catch (error) {
    console.error('Control plane signals error:', error);
    return res.status(500).json({ error: 'Failed to fetch control plane signals' });
  }
});

router.post('/control-plane/signals/snapshot', (req, res) => {
  try {
    const persist = parseBooleanLike(req.body?.persist, true);
    const maxBuckets = toFiniteInt(req.body?.max_buckets, { min: 1, max: 500 }) || 500;
    const snapshot = calculateControlPlaneSignals({
      actor: { type: 'admin', id: null },
      persist,
      maxBuckets,
    });
    return res.json({
      success: true,
      persisted: persist,
      ...snapshot,
    });
  } catch (error) {
    console.error('Control plane signal snapshot error:', error);
    return res.status(500).json({ error: 'Failed to generate control plane signal snapshot' });
  }
});

router.post('/control-plane/prewarm/run', (req, res) => {
  try {
    const topModelsLimit = toFiniteInt(req.body?.top_models_limit, { min: 1, max: 50 }) || 10;
    const lookbackDays = toFiniteInt(req.body?.lookback_days, { min: 1, max: 30 }) || 7;
    const targetWarmProvidersPerModel = toFiniteInt(req.body?.target_warm_providers_per_model, { min: 1, max: 20 }) || 2;
    const result = runDemandDrivenPrewarm({
      topModelsLimit,
      lookbackDays,
      targetWarmProvidersPerModel,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Control plane prewarm run error:', error);
    return res.status(500).json({ error: 'Failed to run control plane prewarm cycle' });
  }
});

router.get('/control-plane/prewarm/top-models', (req, res) => {
  try {
    const limit = toFiniteInt(req.query.limit, { min: 1, max: 50 }) || 10;
    const lookbackDays = toFiniteInt(req.query.lookback_days, { min: 1, max: 30 }) || 7;
    const models = listTopDemandModels(limit, lookbackDays);
    return res.json({
      generated_at: new Date().toISOString(),
      lookback_days: lookbackDays,
      count: models.length,
      models,
    });
  } catch (error) {
    console.error('Control plane top-models error:', error);
    return res.status(500).json({ error: 'Failed to fetch demand-driven models' });
  }
});

router.post('/control-plane/run-cycle', (req, res) => {
  try {
    const persistSignals = parseBooleanLike(req.body?.persist_signals, true);
    const runPrewarm = parseBooleanLike(req.body?.run_prewarm, true);
    const prewarmTopModels = toFiniteInt(req.body?.prewarm_top_models, { min: 1, max: 50 }) || 10;
    const prewarmLookbackDays = toFiniteInt(req.body?.prewarm_lookback_days, { min: 1, max: 30 }) || 7;
    const prewarmTargetWarmProvidersPerModel = toFiniteInt(req.body?.prewarm_target_warm_providers_per_model, { min: 1, max: 20 }) || 2;

    const cycle = runControlPlaneCycle({
      persistSignals,
      runPrewarm,
      prewarmTopModels,
      prewarmLookbackDays,
      prewarmTargetWarmProvidersPerModel,
    });

    return res.json({
      success: true,
      ...cycle,
    });
  } catch (error) {
    console.error('Control plane run-cycle error:', error);
    return res.status(500).json({ error: 'Failed to run control plane cycle' });
  }
});

// === POST /api/admin/providers/sweep-stale - On-demand stale provider sweep ===
router.post('/providers/sweep-stale', (req, res) => {
  try {
    const nowMs = Date.now();
    const staleProviders = db.all(
      `SELECT id, name, last_heartbeat FROM providers
       WHERE last_heartbeat IS NULL OR datetime(last_heartbeat) <= datetime('now', '-15 minutes')`
    );

    if (staleProviders.length === 0) {
      return res.json({ providers_marked_offline: 0, jobs_requeued: 0, message: 'No stale providers found' });
    }

    const providerColumns = new Set(db.all(`PRAGMA table_info(providers)`).map(r => r.name));
    const jobColumns = new Set(db.all(`PRAGMA table_info(jobs)`).map(r => r.name));

    const providerSet = ["status = 'offline'"];
    if (providerColumns.has('current_job_id')) providerSet.push('current_job_id = NULL');
    if (providerColumns.has('updated_at')) providerSet.push("updated_at = datetime('now')");

    const jobSet = ["status = 'queued'", 'provider_id = NULL'];
    const jobParams = [];
    if (jobColumns.has('error')) { jobSet.push('error = ?'); jobParams.push('Provider marked offline by manual sweep'); }
    if (jobColumns.has('last_error')) { jobSet.push('last_error = ?'); jobParams.push('Provider marked offline by manual sweep'); }
    if (jobColumns.has('retry_count')) jobSet.push('retry_count = COALESCE(retry_count, 0) + 1');
    if (jobColumns.has('picked_up_at')) jobSet.push('picked_up_at = NULL');
    if (jobColumns.has('assigned_at')) jobSet.push('assigned_at = NULL');
    if (jobColumns.has('started_at')) jobSet.push('started_at = NULL');
    if (jobColumns.has('updated_at')) { jobSet.push('updated_at = ?'); jobParams.push(new Date().toISOString()); }

    const markOfflineStmt = db.prepare(`UPDATE providers SET ${providerSet.join(', ')} WHERE id = ?`);
    const requeueStmt = db.prepare(
      `UPDATE jobs SET ${jobSet.join(', ')} WHERE provider_id = ? AND status IN ('running', 'pending', 'assigned', 'pulling')`
    );

    const tx = db.transaction(() => {
      let providersMarkedOffline = 0;
      let jobsRequeued = 0;
      for (const p of staleProviders) {
        providersMarkedOffline += (markOfflineStmt.run(p.id).changes || 0);
        jobsRequeued += (requeueStmt.run(...jobParams, p.id).changes || 0);
      }
      return { providersMarkedOffline, jobsRequeued };
    });

    const result = tx();
    return res.json({
      providers_marked_offline: result.providersMarkedOffline,
      jobs_requeued: result.jobsRequeued,
      swept_at: new Date(nowMs).toISOString(),
    });
  } catch (error) {
    console.error('Admin sweep-stale error:', error);
    return res.status(500).json({ error: 'Sweep failed' });
  }
});

// === GET /api/admin/access/policy - Human/agent access posture ===
router.get('/access/policy', (req, res) => {
  try {
    res.json(buildAdminAccessPolicySnapshot());
  } catch (error) {
    console.error('Admin access policy error:', error);
    res.status(500).json({ error: 'Access policy check failed' });
  }
});

// === GET /api/admin/dashboard - Summary stats ===
router.get('/dashboard', (req, res) => {
  try {
    const total = db.get('SELECT COUNT(*) as count FROM providers');
    const now = new Date();
    const fiveMinAgo = new Date(now - 5 * 60000).toISOString();

    const online = db.get(
      'SELECT COUNT(*) as count FROM providers WHERE last_heartbeat > ?', fiveMinAgo
    );

    const gpuModels = db.all(
      `SELECT gpu_model, COUNT(*) as count FROM providers
       GROUP BY gpu_model ORDER BY count DESC`
    );

    // api_key excluded from signups and heartbeat responses
    const recentSignups = db.all(
      `SELECT id, name, email, gpu_model, os, created_at
       FROM providers ORDER BY created_at DESC LIMIT 5`
    );

    const recentHeartbeats = db.all(
      `SELECT id, name, gpu_model, provider_ip, provider_hostname, last_heartbeat, gpu_status
       FROM providers WHERE last_heartbeat IS NOT NULL
       ORDER BY last_heartbeat DESC LIMIT 10`
    );

    // Renter stats
    const renterStats = db.get('SELECT COUNT(*) as total, SUM(CASE WHEN status = \'active\' THEN 1 ELSE 0 END) as active, COALESCE(SUM(balance_halala), 0) as total_balance FROM renters') || {};

    // Job + revenue stats
    const todayStart = new Date(now); todayStart.setUTCHours(0,0,0,0);
    const jobStats = db.get(`
      SELECT COUNT(*) as total_jobs,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN status IN ('pending','running','queued') THEN 1 ELSE 0 END) as active_jobs,
             COALESCE(SUM(CASE WHEN status = 'completed' THEN actual_cost_halala ELSE 0 END), 0) as total_revenue,
             COALESCE(SUM(CASE WHEN status = 'completed' THEN dc1_fee_halala ELSE 0 END), 0) as total_dc1_fees
      FROM jobs
    `) || {};
    const todayRevenue = db.get(`SELECT COALESCE(SUM(actual_cost_halala), 0) as revenue, COALESCE(SUM(dc1_fee_halala), 0) as dc1_fees, COUNT(*) as jobs FROM jobs WHERE status = 'completed' AND completed_at >= ?`, todayStart.toISOString()) || {};

    res.json({
      stats: {
        total_providers: total.count,
        online_now: online.count,
        offline: total.count - online.count,
        total_renters: renterStats.total || 0,
        active_renters: renterStats.active || 0,
        total_renter_balance_halala: renterStats.total_balance || 0,
        total_jobs: jobStats.total_jobs || 0,
        completed_jobs: jobStats.completed || 0,
        failed_jobs: jobStats.failed || 0,
        active_jobs: jobStats.active_jobs || 0,
        total_revenue_halala: jobStats.total_revenue || 0,
        total_dc1_fees_halala: jobStats.total_dc1_fees || 0,
        today_revenue_halala: todayRevenue.revenue || 0,
        today_dc1_fees_halala: todayRevenue.dc1_fees || 0,
        today_jobs: todayRevenue.jobs || 0,
        timestamp: now.toISOString()
      },
      gpu_breakdown: gpuModels,
      recent_signups: recentSignups,
      recent_heartbeats: recentHeartbeats.map(h => {
        let gpu = null;
        try { gpu = h.gpu_status ? JSON.parse(h.gpu_status) : null; } catch(e) {}
        return { ...h, gpu_status: gpu };
      })
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// === GET /api/admin/overview - Platform snapshot for founder monitoring ===
// Returns: providersRegistered, providersOnline, jobsQueued/Running/Completed, revenueSARToday/Total
router.get('/overview', (req, res) => {
  try {
    const now = new Date();
    const fiveMinAgo = new Date(now - 5 * 60000).toISOString();
    const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);

    const providerCounts = db.get(
      `SELECT COUNT(*) as registered,
              SUM(CASE WHEN last_heartbeat > ? THEN 1 ELSE 0 END) as online
       FROM providers`,
      fiveMinAgo
    ) || {};

    const jobStats = db.get(
      `SELECT SUM(CASE WHEN status IN ('pending','queued') THEN 1 ELSE 0 END) as queued,
              SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
              COALESCE(SUM(CASE WHEN status = 'completed' AND completed_at >= ? THEN actual_cost_halala ELSE 0 END), 0) as today_revenue_halala,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN actual_cost_halala ELSE 0 END), 0) as total_revenue_halala
       FROM jobs`,
      todayStart.toISOString()
    ) || {};

    res.json({
      providersRegistered: providerCounts.registered || 0,
      providersOnline: providerCounts.online || 0,
      jobsQueued: jobStats.queued || 0,
      jobsRunning: jobStats.running || 0,
      jobsCompleted: jobStats.completed || 0,
      revenueSARToday: (jobStats.today_revenue_halala || 0) / 100,
      revenueSARTotal: (jobStats.total_revenue_halala || 0) / 100,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// === GET /api/admin/revenue - Revenue breakdown by day (platform 15% / provider 85%) ===
// Query params: days (default 30, max 365)
router.get('/revenue', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const totals = db.get(
      `SELECT COALESCE(SUM(actual_cost_halala), 0) as total_halala,
              COALESCE(SUM(dc1_fee_halala), 0) as platform_halala,
              COALESCE(SUM(provider_earned_halala), 0) as provider_halala,
              COUNT(*) as total_jobs
       FROM jobs WHERE status = 'completed'`
    ) || {};

    const daily = db.all(
      `SELECT DATE(completed_at) as date,
              COUNT(*) as jobs,
              COALESCE(SUM(actual_cost_halala), 0) as total_halala,
              COALESCE(SUM(dc1_fee_halala), 0) as platform_halala,
              COALESCE(SUM(provider_earned_halala), 0) as provider_halala
       FROM jobs
       WHERE status = 'completed' AND completed_at >= ?
       GROUP BY DATE(completed_at)
       ORDER BY date DESC`,
      since
    );

    res.json({
      period_days: days,
      totals: {
        total_sar: (totals.total_halala || 0) / 100,
        platform_fees_sar: (totals.platform_halala || 0) / 100,
        provider_payouts_sar: (totals.provider_halala || 0) / 100,
        total_jobs: totals.total_jobs || 0,
      },
      by_day: daily.map(d => ({
        date: d.date,
        jobs: d.jobs,
        total_sar: d.total_halala / 100,
        platform_fees_sar: d.platform_halala / 100,
        provider_payouts_sar: d.provider_halala / 100,
      })),
    });
  } catch (error) {
    console.error('Admin revenue error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue' });
  }
});

// === GET /api/admin/metrics - Operational system metrics ===
router.get('/metrics', (req, res) => {
  try {
    const now = new Date();
    const nowIso = now.toISOString();
    const oneHourAgoIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const oneDayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const fiveMinAgoIso = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getUTCDay(); // 0=Sun
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
    weekStart.setUTCHours(0, 0, 0, 0);

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

    const pendingJobs = db.get(`SELECT COUNT(*) as count FROM jobs WHERE status = 'pending'`);
    const runningJobs = db.get(`SELECT COUNT(*) as count FROM jobs WHERE status IN ('running', 'queued')`);
    const failedLast1h = db.get(
      `SELECT COUNT(*) as count
       FROM jobs
       WHERE status = 'failed'
         AND COALESCE(completed_at, updated_at, created_at, submitted_at) >= ?`,
      oneHourAgoIso
    );
    const avgWaitRow = db.get(
      `SELECT AVG((julianday(started_at) - julianday(submitted_at)) * 86400.0) as avg_wait_seconds
       FROM jobs
       WHERE started_at IS NOT NULL
         AND submitted_at IS NOT NULL
         AND submitted_at >= ?`,
      oneDayAgoIso
    );

    const onlineProviders = db.get('SELECT COUNT(*) as count FROM providers WHERE last_heartbeat > ?', fiveMinAgoIso);
    const totalProviders = db.get('SELECT COUNT(*) as count FROM providers');
    const pendingApproval = db.get(
      `SELECT COUNT(*) as count
       FROM providers
       WHERE COALESCE(approval_status, 'pending') = 'pending'`
    );
    const heartbeatAge = db.get(
      `SELECT AVG((julianday(?) - julianday(last_heartbeat)) * 86400.0) as avg_age_seconds
       FROM providers
       WHERE last_heartbeat IS NOT NULL`,
      nowIso
    );

    const totalRenters = db.get('SELECT COUNT(*) as count FROM renters');
    const activeRenters24h = db.get(
      `SELECT COUNT(*) as count
       FROM renters
       WHERE COALESCE(updated_at, created_at) >= ?`,
      oneDayAgoIso
    );
    const totalRenterBalance = db.get(
      `SELECT COALESCE(SUM(balance_halala), 0) as total_balance_halala
       FROM renters`
    );

    const todayRevenue = db.get(
      `SELECT COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala, 0)), 0) as total
       FROM jobs
       WHERE status = 'completed'
         AND COALESCE(completed_at, updated_at, created_at) >= ?`,
      todayStart.toISOString()
    );
    const weekRevenue = db.get(
      `SELECT COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala, 0)), 0) as total
       FROM jobs
       WHERE status = 'completed'
         AND COALESCE(completed_at, updated_at, created_at) >= ?`,
      weekStart.toISOString()
    );
    const monthRevenue = db.get(
      `SELECT COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala, 0)), 0) as total
       FROM jobs
       WHERE status = 'completed'
         AND COALESCE(completed_at, updated_at, created_at) >= ?`,
      monthStart.toISOString()
    );

    let dbSizeBytes = 0;
    try {
      dbSizeBytes = fs.statSync(DB_PATH).size;
    } catch (_) {
      dbSizeBytes = 0;
    }

    res.json({
      queue: {
        pending_jobs: pendingJobs?.count || 0,
        running_jobs: runningJobs?.count || 0,
        failed_last_1h: failedLast1h?.count || 0,
        avg_wait_seconds: Math.max(0, Math.round(avgWaitRow?.avg_wait_seconds || 0)),
      },
      providers: {
        online: onlineProviders?.count || 0,
        active: onlineProviders?.count || 0,   // alias for KPI dashboard
        registered: totalProviders?.count || 0, // alias for KPI dashboard
        total_registered: totalProviders?.count || 0,
        pending_approval: pendingApproval?.count || 0,
        avg_heartbeat_age_seconds: Math.max(0, Math.round(heartbeatAge?.avg_age_seconds || 0)),
      },
      renters: {
        total_registered: totalRenters?.count || 0,
        active_last_24h: activeRenters24h?.count || 0,
        total_balance_halala: totalRenterBalance?.total_balance_halala || 0,
      },
      revenue: {
        today_halala: todayRevenue?.total || 0,
        this_week_halala: weekRevenue?.total || 0,
        this_month_halala: monthRevenue?.total || 0,
      },
      system: {
        uptime_seconds: Math.round(process.uptime()),
        db_size_bytes: dbSizeBytes,
        node_version: process.version,
      },
    });
  } catch (error) {
    console.error('Admin metrics error:', error);
    res.status(500).json({ error: 'Failed to fetch admin metrics' });
  }
});

// === GET /api/admin/analytics - 7-day compute analytics ===
router.get('/analytics', (req, res) => {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const compute = db.get(
      `SELECT
         COUNT(*) as total_jobs,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
         COALESCE(SUM(CASE WHEN status = 'completed'
           THEN COALESCE(actual_duration_minutes, duration_minutes, 0)
           ELSE 0 END), 0) as total_duration_minutes,
         COALESCE(AVG(CASE WHEN status = 'completed'
           THEN COALESCE(actual_duration_minutes, duration_minutes, 0)
           ELSE NULL END), 0) as avg_duration_minutes
       FROM jobs
       WHERE COALESCE(completed_at, created_at) >= ?`,
      since
    ) || {};

    const revenue = db.get(
      `SELECT
         COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala, 0)), 0) as gross_halala,
         COALESCE(SUM(
           COALESCE(
             provider_earned_halala,
             CAST(COALESCE(actual_cost_halala, cost_halala, 0) * 0.75 AS INTEGER)
           )
         ), 0) as provider_halala
       FROM jobs
       WHERE status = 'completed'
         AND COALESCE(completed_at, created_at) >= ?`,
      since
    ) || {};

    const gpuBreakdown = db.all(
      `SELECT
         COALESCE(NULLIF(TRIM(p.gpu_model), ''), 'Unknown GPU') as gpu_model,
         COUNT(j.id) as jobs,
         COALESCE(SUM(COALESCE(j.actual_duration_minutes, j.duration_minutes, 0)), 0) as duration_minutes
       FROM jobs j
       LEFT JOIN providers p ON p.id = j.provider_id
       WHERE j.status = 'completed'
         AND COALESCE(j.completed_at, j.created_at) >= ?
       GROUP BY COALESCE(NULLIF(TRIM(p.gpu_model), ''), 'Unknown GPU')
       ORDER BY jobs DESC, duration_minutes DESC`,
      since
    ).map((row) => ({
      gpu_model: row.gpu_model,
      jobs: row.jobs || 0,
      compute_hours: Number((((row.duration_minutes || 0) / 60)).toFixed(2)),
    }));

    const expectedHeartbeats7d = 7 * 24 * 60 * 2; // 30-second daemon heartbeat
    const topProviders = db.all(
      `SELECT
         p.id as provider_id,
         COALESCE(NULLIF(TRIM(p.gpu_model), ''), 'Unknown GPU') as gpu_model,
         COUNT(DISTINCT j.id) as jobs_completed,
         COUNT(DISTINCT h.id) as heartbeat_count
       FROM providers p
       LEFT JOIN jobs j
         ON j.provider_id = p.id
        AND j.status = 'completed'
        AND COALESCE(j.completed_at, j.created_at) >= ?
       LEFT JOIN heartbeat_log h
         ON h.provider_id = p.id
        AND h.received_at >= ?
       GROUP BY p.id
       HAVING jobs_completed > 0
       ORDER BY jobs_completed DESC, heartbeat_count DESC
       LIMIT 5`,
      since,
      since
    ).map((row) => ({
      provider_id: row.provider_id,
      gpu_model: row.gpu_model,
      jobs_completed: row.jobs_completed || 0,
      uptime_pct: Math.min(100, Math.round(((row.heartbeat_count || 0) / expectedHeartbeats7d) * 100)),
    }));

    const grossHalala = revenue.gross_halala || 0;
    const providerHalala = revenue.provider_halala || 0;
    const dc1FeeHalala = Math.max(0, grossHalala - providerHalala);

    res.json({
      period: 'last_7d',
      compute: {
        total_jobs: compute.total_jobs || 0,
        completed_jobs: compute.completed_jobs || 0,
        failed_jobs: compute.failed_jobs || 0,
        total_compute_hours: Number((((compute.total_duration_minutes || 0) / 60)).toFixed(2)),
        avg_job_duration_minutes: Math.round(compute.avg_duration_minutes || 0),
      },
      revenue: {
        gross_compute_sar: Number((grossHalala / 100).toFixed(2)),
        dcp_fee_sar: Number((dc1FeeHalala / 100).toFixed(2)),
        provider_earnings_sar: Number((providerHalala / 100).toFixed(2)),
      },
      gpu_breakdown: gpuBreakdown,
      top_providers: topProviders,
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// === GET /api/admin/analytics/conversion-funnel - provider/renter unified funnel ===
router.get('/analytics/conversion-funnel', (req, res) => {
  try {
    const sinceDays = toFiniteInt(req.query.since_days, { min: 1, max: 365 }) || 30;
    const journey = normalizeString(req.query.journey, { maxLen: 16 }) || 'all';
    const report = buildFunnelReport({ sinceDays, journey });
    return res.json(report);
  } catch (error) {
    console.error('Admin conversion funnel analytics error:', error);
    return res.status(500).json({ error: 'Failed to fetch conversion funnel analytics' });
  }
});

// ============================================================================
// GET /api/admin/providers/activation-conversion - provider activation funnel report
// ============================================================================
router.get('/providers/activation-conversion', (req, res) => {
  try {
    const nowIso = new Date().toISOString();
    const report24h = buildActivationConversionWindowReport(24, nowIso);
    const report7d = buildActivationConversionWindowReport(24 * 7, nowIso);

    return res.json({
      generated_at: nowIso,
      windows: {
        last_24h: report24h,
        last_7d: report7d,
      },
    });
  } catch (error) {
    console.error('Provider activation conversion report error:', error);
    return res.status(500).json({ error: 'Failed to build provider activation conversion report' });
  }
});

// GET /api/admin/providers/:id - Full provider detail (api_key excluded)
router.get('/providers/:id', (req, res) => {
  try {
    // Explicit column list — api_key never returned
    const provider = db.get(
      `SELECT id, name, email, gpu_model, gpu_count, vram_gb, os,
              status, gpu_status, provider_ip, provider_hostname,
              last_heartbeat, gpu_name_detected, gpu_vram_mib, gpu_driver,
              gpu_compute, total_earnings, total_jobs, uptime_percent,
              run_mode, scheduled_start, scheduled_end,
              gpu_usage_cap_pct, vram_reserve_gb, temp_limit_c, is_paused,
              created_at, updated_at
       FROM providers WHERE id = ?`,
      req.params.id
    );
    if (!provider) return res.status(404).json({ error: 'Not found' });

    let gpuStatus = null;
    try { gpuStatus = provider.gpu_status ? JSON.parse(provider.gpu_status) : null; } catch(e) {}

    const since24h = new Date(Date.now() - 24*60*60*1000).toISOString();
    const since7d = new Date(Date.now() - 7*24*60*60*1000).toISOString();

    const hb24h = db.get('SELECT COUNT(*) as cnt FROM heartbeat_log WHERE provider_id = ? AND received_at > ?', req.params.id, since24h) || { cnt: 0 };
    const hb7d = db.get('SELECT COUNT(*) as cnt FROM heartbeat_log WHERE provider_id = ? AND received_at > ?', req.params.id, since7d) || { cnt: 0 };
    const expectedIn24h = (24 * 60 * 60) / 30; // 2880 heartbeats at 30s interval
    const expectedIn7d = 7 * expectedIn24h;
    const uptime24h = Math.min(100, Math.round((hb24h.cnt / expectedIn24h) * 100));
    const uptime7d = Math.min(100, Math.round((hb7d.cnt / expectedIn7d) * 100));

    const metrics24h = db.get(
      `SELECT AVG(gpu_util_pct) as avg_util, AVG(gpu_temp_c) as avg_temp,
              AVG(gpu_power_w) as avg_power, MAX(gpu_temp_c) as max_temp
       FROM heartbeat_log WHERE provider_id = ? AND received_at > ?`,
      req.params.id, since24h
    );

    const recentHb = db.all('SELECT * FROM heartbeat_log WHERE provider_id = ? ORDER BY received_at DESC LIMIT 20', req.params.id);
    const jobs = db.all('SELECT * FROM jobs WHERE provider_id = ? ORDER BY created_at DESC LIMIT 20', req.params.id);

    let disconnects = [];
    try { disconnects = db.all('SELECT * FROM recovery_events WHERE provider_id = ? ORDER BY timestamp DESC LIMIT 10', req.params.id); } catch(e) {}

    const now = new Date();
    const lastBeat = provider.last_heartbeat ? new Date(provider.last_heartbeat) : null;
    const minSince = lastBeat ? Math.round((now - lastBeat) / 60000) : null;

    res.json({
      provider: {
        ...provider,
        gpu_status: gpuStatus,
        is_online: minSince !== null && minSince < 5,
        minutes_since_heartbeat: minSince
      },
      uptime: { hours_24: uptime24h, days_7: uptime7d, heartbeats_24h: hb24h.cnt },
      metrics_24h: metrics24h || {},
      heartbeat_log: recentHb,
      jobs,
      disconnects
    });
  } catch (error) {
    console.error('Admin provider detail error:', error);
    res.status(500).json({ error: 'Failed to fetch provider detail' });
  }
});

// GET /api/admin/jobs/:id - Full job detail with exact billing split
router.get('/jobs/:id/history', (req, res) => {
  try {
    const job = db.get(
      `SELECT id, job_id, provider_id, renter_id, status, job_type, model,
              submitted_at, started_at, completed_at, cost_halala, actual_cost_halala
       FROM jobs
       WHERE id = ? OR job_id = ?`,
      req.params.id,
      req.params.id
    );
    if (!job) return res.status(404).json({ error: 'Not found' });

    const executions = db.all(
      `SELECT id, attempt_number, started_at, ended_at, exit_code, log_path, gpu_seconds_used, cost_halala
       FROM job_executions
       WHERE job_id = ?
       ORDER BY attempt_number ASC`,
      job.job_id
    );

    const withMetrics = executions.map((row) => {
      let providerMetrics = null;
      if (job.provider_id && row.started_at) {
        providerMetrics = db.get(
          `SELECT AVG(gpu_util_pct) AS avg_gpu_util_pct,
                  AVG(gpu_temp_c) AS avg_gpu_temp_c,
                  MAX(gpu_temp_c) AS max_gpu_temp_c,
                  AVG(gpu_power_w) AS avg_gpu_power_w,
                  MAX(gpu_count) AS max_gpu_count
           FROM heartbeat_log
           WHERE provider_id = ?
             AND received_at >= ?
             AND received_at <= ?`,
          job.provider_id,
          row.started_at,
          row.ended_at || new Date().toISOString()
        );
      }
      return {
        ...row,
        log_available: !!resolveAttemptLogPath(job.job_id, row.attempt_number),
        provider_metrics: providerMetrics || null,
      };
    });

    res.json({
      job,
      executions: withMetrics,
    });
  } catch (error) {
    console.error('Admin job history error:', error);
    res.status(500).json({ error: 'Failed to fetch job history' });
  }
});

router.get('/jobs/:id', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.id, req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });

    const provider = job.provider_id
      ? db.get(
          `SELECT id, name, email, gpu_name_detected, gpu_model, gpu_vram_mib,
                  vram_gb, provider_hostname, provider_ip
           FROM providers WHERE id = ?`,
          job.provider_id
        )
      : null;

    let recovery = [];
    try { recovery = db.all('SELECT * FROM recovery_events WHERE job_id = ? ORDER BY timestamp DESC', String(job.job_id || job.id)); } catch(e) {}

    let gpuReq = null;
    try { gpuReq = job.gpu_requirements ? JSON.parse(job.gpu_requirements) : null; } catch(e) {}

    const elapsed = job.started_at
      ? Math.floor((new Date(job.completed_at || new Date()) - new Date(job.started_at)) / 60000)
      : (job.duration_minutes || 0);

    const totalHalala = job.cost_halala || 0;
    const { provider_cut, dc1_cut } = splitBilling(totalHalala);

    res.json({
      job: { ...job, gpu_requirements: gpuReq },
      provider,
      recovery_events: recovery,
      billing: {
        duration_minutes: elapsed,
        cost_halala: totalHalala,
        cost_sar: (totalHalala / 100).toFixed(2),
        provider_cut_halala: provider_cut,
        dc1_cut_halala: dc1_cut
      }
    });
  } catch (error) {
    console.error('Admin job detail error:', error);
    res.status(500).json({ error: 'Failed to fetch job detail' });
  }
});

// ============================================================================
// GET /api/admin/daemon-health - Daemon fleet health dashboard
// ============================================================================
router.get('/daemon-health', (req, res) => {
  try {
    const hoursRaw = parseInt(req.query.hours, 10) || 24;
    const hours = Math.min(Math.max(hoursRaw, 1), 720);  // Clamp 1h - 30 days
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    // Validate provider_id if provided
    let providerFilter = null;
    if (req.query.provider_id) {
      providerFilter = parseInt(req.query.provider_id, 10);
      if (isNaN(providerFilter) || providerFilter <= 0) {
        return res.status(400).json({ error: 'Invalid provider_id — must be a positive integer' });
      }
    }

    // 1. Recent events (last N hours)
    let eventsQuery = `SELECT * FROM daemon_events WHERE received_at > ? `;
    const eventsParams = [since];
    if (providerFilter) {
      eventsQuery += `AND provider_id = ? `;
      eventsParams.push(providerFilter);
    }
    eventsQuery += `ORDER BY received_at DESC LIMIT 200`;
    const events = db.all(eventsQuery, ...eventsParams);

    // 2. Crash summary per provider
    const crashes = db.all(`
      SELECT provider_id, COUNT(*) as crash_count,
             MAX(event_timestamp) as last_crash,
             GROUP_CONCAT(DISTINCT daemon_version) as versions_seen
      FROM daemon_events
      WHERE event_type IN ('daemon_crash', 'watchdog_restart', 'watchdog_givingup')
        AND received_at > ?
      GROUP BY provider_id
      ORDER BY crash_count DESC
    `, since);

    // 3. Version distribution across providers
    const versions = db.all(`
      SELECT daemon_version, COUNT(DISTINCT provider_id) as provider_count,
             MAX(event_timestamp) as last_seen
      FROM daemon_events
      WHERE event_type = 'daemon_start'
        AND received_at > ?
      GROUP BY daemon_version
      ORDER BY daemon_version DESC
    `, since);

    // 4. Job success/failure rates
    const jobStats = db.all(`
      SELECT event_type, COUNT(*) as count
      FROM daemon_events
      WHERE event_type IN ('job_success', 'job_failure')
        AND received_at > ?
      GROUP BY event_type
    `, since);

    // 5. Event type breakdown
    const eventBreakdown = db.all(`
      SELECT event_type, severity, COUNT(*) as count
      FROM daemon_events
      WHERE received_at > ?
      GROUP BY event_type, severity
      ORDER BY count DESC
    `, since);

    // 6. Bandwidth reports (latest per provider)
    const bandwidth = db.all(`
      SELECT d.provider_id, d.details, d.event_timestamp
      FROM daemon_events d
      INNER JOIN (
        SELECT provider_id, MAX(event_timestamp) as max_ts
        FROM daemon_events
        WHERE event_type = 'bandwidth_report' AND received_at > ?
        GROUP BY provider_id
      ) latest ON d.provider_id = latest.provider_id AND d.event_timestamp = latest.max_ts
      WHERE d.event_type = 'bandwidth_report'
      ORDER BY d.provider_id
    `, since);

    // 7. Provider online status (from providers table)
    const providers = db.all(`
      SELECT id, name, gpu_model, status, daemon_version,
             last_heartbeat, gpu_name_detected
      FROM providers
      ORDER BY last_heartbeat DESC
    `);

    const successCount = jobStats.find(s => s.event_type === 'job_success')?.count || 0;
    const failCount = jobStats.find(s => s.event_type === 'job_failure')?.count || 0;
    const totalJobs = successCount + failCount;
    const reliability = buildDaemonHealthSummary(db);

    res.json({
      period_hours: parseInt(hours),
      generated_at: new Date().toISOString(),
      summary: {
        total_events: events.length,
        total_crashes: crashes.reduce((sum, c) => sum + c.crash_count, 0),
        total_jobs: totalJobs,
        job_success_rate_pct: totalJobs > 0 ? Number(((successCount / totalJobs) * 100).toFixed(2)) : null,
        providers_online: providers.filter(p => p.status === 'online').length,
        providers_total: providers.length,
      },
      reliability,
      crashes,
      versions,
      job_stats: { success: successCount, failure: failCount, total: totalJobs },
      event_breakdown: eventBreakdown,
      bandwidth,
      providers,
      recent_events: events.slice(0, 50),  // Only return first 50 in list
    });

  } catch (error) {
    console.error('Daemon health dashboard error:', error);
    res.status(500).json({ error: 'Dashboard query failed' });
  }
});

// ============================================================================
// GET /api/admin/support/contacts - Read-only support inbox for operators
// ============================================================================
router.get('/support/contacts', (req, res) => {
  try {
    ensureSupportContactsAdminSchema();

    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const search = normalizeString(String(req.query.search || '').toLowerCase(), { maxLen: 120 }) || '';
    const category = normalizeString(String(req.query.category || '').toLowerCase(), { maxLen: 40 }) || '';
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let where = '1=1';
    const params = [];
    if (category) {
      where += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      where += ' AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(category) LIKE ? OR LOWER(message) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const contacts = db.all(
      `SELECT id, name, email, category, message, source, provider_state, created_at
       FROM support_contacts
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      ...params, limit, offset
    );
    const total = db.get(`SELECT COUNT(*) as count FROM support_contacts WHERE ${where}`, ...params);
    const categoryRows = db.all(
      `SELECT category, COUNT(*) as count
       FROM support_contacts
       GROUP BY category
       ORDER BY count DESC, category ASC`
    );
    const recent24h = db.get(
      'SELECT COUNT(*) as count FROM support_contacts WHERE created_at >= ?',
      since24h
    );

    res.json({
      contacts,
      pagination: {
        limit,
        offset,
        total: total?.count || 0,
      },
      total: total?.count || 0,
      summary: {
        recent_24h: recent24h?.count || 0,
        by_category: Object.fromEntries(categoryRows.map((row) => [row.category || 'unknown', row.count || 0])),
      },
    });
  } catch (error) {
    console.error('Admin support contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch support contacts' });
  }
});

// ============================================================================
// GET /api/admin/renters - List all renters with stats
// ============================================================================
router.get('/renters', (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 0, 0);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const search = (req.query.search || '').trim().toLowerCase();
    const statusFilter = req.query.status || '';
    // Optional acquisition-source filter (e.g. ?source=agent). Matches renters.source.
    const sourceFilter = (req.query.source || '').trim();

    let where = '1=1';
    const wParams = [];
    if (search) {
      where += ` AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(organization) LIKE ?)`;
      wParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (statusFilter) { where += ` AND status = ?`; wParams.push(statusFilter); }
    if (sourceFilter) { where += ` AND source = ?`; wParams.push(sourceFilter); }

    const countRow = db.get(`SELECT COUNT(*) as total FROM renters WHERE ${where}`, ...wParams);
    const total = countRow?.total || 0;

    let paginationSql = '';
    if (page > 0) { paginationSql = `LIMIT ${limit} OFFSET ${(page - 1) * limit}`; }

    const renters = db.all(
      `SELECT id, name, email, organization, balance_halala, status, created_at,
              source, trial_grant_halala, signup_ip
       FROM renters WHERE ${where} ORDER BY created_at DESC ${paginationSql}`,
      ...wParams
    );
    const enriched = renters.map(r => {
      const jobStats = db.get(
        `SELECT COUNT(*) as total_jobs,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
                SUM(cost_halala) as total_spent_halala
         FROM jobs WHERE renter_id = ?`, r.id
      ) || {};
      return { ...r, ...jobStats };
    });
    const response = {
      total,
      active: enriched.filter(r => r.status === 'active').length,
      suspended: enriched.filter(r => r.status === 'suspended').length,
      renters: enriched
    };
    if (page > 0) { response.pagination = { page, limit, total, total_pages: Math.ceil(total / limit) }; }
    res.json(response);
  } catch (error) {
    console.error('Admin renters error:', error);
    res.status(500).json({ error: 'Failed to fetch renters' });
  }
});

// ============================================================================
// GET /api/admin/renters/:id - Renter detail
// ============================================================================
router.get('/renters/:id', (req, res) => {
  try {
    const renter = db.get(
      'SELECT id, name, email, organization, balance_halala, status, created_at FROM renters WHERE id = ?',
      req.params.id
    );
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const jobs = db.all(
      'SELECT * FROM jobs WHERE renter_id = ? ORDER BY created_at DESC LIMIT 50',
      req.params.id
    );
    const jobStats = db.get(
      `SELECT COUNT(*) as total_jobs,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
              SUM(cost_halala) as total_spent_halala
       FROM jobs WHERE renter_id = ?`, req.params.id
    ) || {};

    res.json({ renter, jobs, stats: jobStats });
  } catch (error) {
    console.error('Admin renter detail error:', error);
    res.status(500).json({ error: 'Failed to fetch renter detail' });
  }
});

// ============================================================================
// PATCH /api/admin/providers/:id/preload-model - Trigger daemon model preloading
// ============================================================================
router.patch('/providers/:id/preload-model', (req, res) => {
  try {
    const providerId = toFiniteInt(req.params.id, { min: 1 });
    if (providerId == null) return res.status(400).json({ error: 'Invalid provider id' });

    const modelName = normalizeString(req.body?.model_name, { maxLen: 200 });
    if (!modelName) {
      return res.status(400).json({ error: 'model_name is required' });
    }

    const provider = db.get(
      `SELECT id, email, model_preload_status, model_preload_model
       FROM providers
       WHERE id = ?`,
      providerId
    );
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE providers
       SET model_preload_status = 'downloading',
           model_preload_model = ?,
           model_preload_requested_at = ?,
           model_preload_updated_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(modelName, now, now, now, providerId);

    try {
      db.prepare(
        'INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)'
      ).run(
        'provider_model_preload_requested',
        'provider',
        providerId,
        `Requested preload model "${modelName}" for provider ${provider.email || providerId}`,
        now
      );
    } catch (e) {}

    return res.json({
      success: true,
      provider_id: providerId,
      model_name: modelName,
      model_preload_status: 'downloading',
      requested_at: now,
    });
  } catch (error) {
    console.error('Provider preload-model error:', error);
    return res.status(500).json({ error: 'Failed to request provider model preload' });
  }
});

// ============================================================================
// PATCH /api/admin/providers/:id/approve - Approve provider
// ============================================================================
router.patch('/providers/:id/approve', (req, res) => {
  try {
    const provider = db.get('SELECT id, name, approval_status FROM providers WHERE id = ?', req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE providers
       SET approval_status = 'approved',
           approved_at = ?,
           rejected_reason = NULL,
           updated_at = ?
       WHERE id = ?`
    ).run(now, now, req.params.id);

    try {
      db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)')
        .run('provider_approved', 'provider', provider.id, `Approved provider "${provider.name}"`, now);
    } catch (e) {}

    res.json({ success: true, provider_id: provider.id, approval_status: 'approved', approved_at: now });
  } catch (error) {
    console.error('Approve provider error:', error);
    res.status(500).json({ error: 'Failed to approve provider' });
  }
});

// ============================================================================
// PATCH /api/admin/providers/:id/reject - Reject provider
// ============================================================================
router.patch('/providers/:id/reject', (req, res) => {
  try {
    const reason = normalizeString(req.body?.reason, { maxLen: 400 });
    if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

    const provider = db.get('SELECT id, name FROM providers WHERE id = ?', req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE providers
       SET approval_status = 'rejected',
           rejected_reason = ?,
           approved_at = NULL,
           updated_at = ?
       WHERE id = ?`
    ).run(reason, now, req.params.id);

    try {
      db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)')
        .run('provider_rejected', 'provider', provider.id, `Rejected provider "${provider.name}": ${reason}`, now);
    } catch (e) {}

    res.json({ success: true, provider_id: provider.id, approval_status: 'rejected', rejected_reason: reason });
  } catch (error) {
    console.error('Reject provider error:', error);
    res.status(500).json({ error: 'Failed to reject provider' });
  }
});

// ============================================================================
// POST /api/admin/providers/:id/suspend - Suspend provider
// ============================================================================
router.post('/providers/:id/suspend', (req, res) => {
  try {
    const provider = db.get('SELECT id, name, status FROM providers WHERE id = ?', req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const now = new Date().toISOString();
    db.prepare('UPDATE providers SET status = ?, is_paused = 1, updated_at = ? WHERE id = ?').run('suspended', now, req.params.id);
    try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('provider_suspended', 'provider', provider.id, `Suspended provider "${provider.name}"`, now); } catch(e) {}
    res.json({ success: true, message: `Provider ${provider.name} suspended` });
  } catch (error) {
    console.error('Suspend provider error:', error);
    res.status(500).json({ error: 'Failed to suspend provider' });
  }
});

// ============================================================================
// POST /api/admin/providers/:id/unsuspend - Unsuspend provider
// ============================================================================
router.post('/providers/:id/unsuspend', (req, res) => {
  try {
    const provider = db.get('SELECT id, name, status FROM providers WHERE id = ?', req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });
    const now = new Date().toISOString();
    db.prepare('UPDATE providers SET status = ?, is_paused = 0, updated_at = ? WHERE id = ?').run('offline', now, req.params.id);
    try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('provider_unsuspended', 'provider', provider.id, `Unsuspended provider "${provider.name}"`, now); } catch(e) {}
    res.json({ success: true, message: `Provider ${provider.name} unsuspended` });
  } catch (error) {
    console.error('Unsuspend provider error:', error);
    res.status(500).json({ error: 'Failed to unsuspend provider' });
  }
});

// ============================================================================
// PATCH /api/admin/providers/:id/status — unified suspend/reactivate
// Body: { status: 'suspended' | 'active', reason?: string }
// ============================================================================
router.patch('/providers/:id/status', (req, res) => {
  try {
    const provider = db.get('SELECT id, name, status FROM providers WHERE id = ?', req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const { status, reason } = req.body || {};
    if (!['suspended', 'active'].includes(status)) {
      return res.status(400).json({ error: 'status must be "suspended" or "active"' });
    }

    const now = new Date().toISOString();
    const reasonStr = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
    const detail = (status === 'suspended' ? `Suspended` : `Reactivated`) +
      ` provider "${provider.name}"` + (reasonStr ? ` — reason: ${reasonStr}` : '');

    if (status === 'suspended') {
      db.prepare('UPDATE providers SET status = ?, is_paused = 1, updated_at = ? WHERE id = ?').run('suspended', now, provider.id);
      try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('provider_suspended', 'provider', provider.id, detail, now); } catch (_) {}
    } else {
      // 'active' — clear suspension; online state is driven by heartbeat, so base status is 'offline'
      db.prepare('UPDATE providers SET status = ?, is_paused = 0, updated_at = ? WHERE id = ?').run('offline', now, provider.id);
      try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('provider_reactivated', 'provider', provider.id, detail, now); } catch (_) {}
    }

    return res.json({ success: true, provider_id: provider.id, status, reason: reasonStr || null, updated_at: now });
  } catch (error) {
    console.error('Provider status PATCH error:', error);
    res.status(500).json({ error: 'Failed to update provider status' });
  }
});

// ============================================================================
// POST /api/admin/renters/:id/suspend - Suspend renter
// ============================================================================
router.post('/renters/:id/suspend', (req, res) => {
  try {
    const renter = db.get('SELECT id, name, status FROM renters WHERE id = ?', req.params.id);
    if (!renter) return res.status(404).json({ error: 'Renter not found' });
    db.prepare('UPDATE renters SET status = ? WHERE id = ?').run('suspended', req.params.id);
    try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('renter_suspended', 'renter', renter.id, `Suspended renter "${renter.name}"`, new Date().toISOString()); } catch(e) {}
    res.json({ success: true, message: `Renter ${renter.name} suspended` });
  } catch (error) {
    console.error('Suspend renter error:', error);
    res.status(500).json({ error: 'Failed to suspend renter' });
  }
});

// ============================================================================
// POST /api/admin/renters/:id/unsuspend - Unsuspend renter
// ============================================================================
router.post('/renters/:id/unsuspend', (req, res) => {
  try {
    const renter = db.get('SELECT id, name, status FROM renters WHERE id = ?', req.params.id);
    if (!renter) return res.status(404).json({ error: 'Renter not found' });
    db.prepare('UPDATE renters SET status = ? WHERE id = ?').run('active', req.params.id);
    try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('renter_unsuspended', 'renter', renter.id, `Reactivated renter "${renter.name}"`, new Date().toISOString()); } catch(e) {}
    res.json({ success: true, message: `Renter ${renter.name} reactivated` });
  } catch (error) {
    console.error('Unsuspend renter error:', error);
    res.status(500).json({ error: 'Failed to unsuspend renter' });
  }
});

// ============================================================================
// POST /api/admin/renters/:id/credit - Grant renter credits
// ============================================================================
router.post('/renters/:id/credit', (req, res) => {
  try {
    const amountHalala = toFiniteInt(req.body?.amount_halala, { min: 1, max: 100000000 });
    if (amountHalala == null) {
      return res.status(400).json({ error: 'amount_halala must be a positive integer' });
    }

    const granted = grantRenterCredit({
      renterId: req.params.id,
      amountHalala,
      reason: req.body?.reason,
      grantedBy: 'admin'
    });

    if (granted.error === 'reason_required') {
      return res.status(400).json({ error: 'reason is required' });
    }
    if (granted.error === 'not_found') {
      return res.status(404).json({ error: 'Renter not found' });
    }

    res.json({ success: true, ...granted });
  } catch (error) {
    console.error('Grant renter credit error:', error);
    res.status(500).json({ error: 'Failed to grant renter credits' });
  }
});

// ============================================================================
// POST /api/admin/renters/:id/balance - Admin balance adjustment
// ============================================================================
router.post('/renters/:id/balance', (req, res) => {
  try {
    const { amount_halala, reason } = req.body;
    const amountHalala = toFiniteInt(amount_halala, { min: -100000000, max: 100000000 });
    if (amountHalala == null) {
      return res.status(400).json({ error: 'amount_halala (number) is required' });
    }
    const renter = db.get('SELECT id, name, balance_halala FROM renters WHERE id = ?', req.params.id);
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const newBalance = renter.balance_halala + amountHalala;
    if (newBalance < 0) return res.status(400).json({ error: 'Balance cannot go below 0' });

    db.prepare('UPDATE renters SET balance_halala = ? WHERE id = ?').run(newBalance, req.params.id);
    try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('balance_adjusted', 'renter', renter.id, `Adjusted balance by ${amountHalala} halala for "${renter.name}": ${normalizeString(reason, { maxLen: 300 }) || 'No reason'}`, new Date().toISOString()); } catch(e) {}
    res.json({
      success: true,
      renter_id: renter.id,
      name: renter.name,
      previous_balance: renter.balance_halala,
      adjustment: amountHalala,
      new_balance: newBalance,
      reason: normalizeString(reason, { maxLen: 300 }) || 'Admin adjustment'
    });
  } catch (error) {
    console.error('Balance adjustment error:', error);
    res.status(500).json({ error: 'Failed to adjust balance' });
  }
});

// ============================================================================
// POST /api/admin/bulk/providers - Bulk actions on providers
// ============================================================================
router.post('/bulk/providers', (req, res) => {
  try {
    const { ids, action } = req.body;
    const safeIds = normalizeIdArray(ids);
    if (!safeIds) return res.status(400).json({ error: 'ids array required (positive integers)' });
    if (!['suspend', 'unsuspend', 'approve'].includes(action)) return res.status(400).json({ error: 'action must be suspend, unsuspend, or approve' });

    const now = new Date().toISOString();
    let success = 0, failed = 0;

    for (const id of safeIds) {
      try {
        const provider = db.get('SELECT id, name, status, approval_status FROM providers WHERE id = ?', id);
        if (!provider) { failed++; continue; }
        if (action === 'suspend') {
          db.prepare('UPDATE providers SET status = ?, is_paused = 1, updated_at = ? WHERE id = ?').run('suspended', now, id);
        } else if (action === 'unsuspend') {
          db.prepare('UPDATE providers SET status = ?, is_paused = 0, updated_at = ? WHERE id = ?').run('offline', now, id);
        } else if (action === 'approve') {
          db.prepare('UPDATE providers SET approval_status = ?, approved_at = ?, rejected_reason = NULL, updated_at = ? WHERE id = ?').run('approved', now, now, id);
        }
        try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run(
          `bulk_provider_${action}`, 'provider', id, `Bulk ${action}: "${provider.name}"`, now); } catch(e) {}
        success++;
      } catch (e) { failed++; }
    }

    res.json({ success: true, action, processed: success, failed, total: safeIds.length });
  } catch (error) {
    console.error('Bulk provider action error:', error);
    res.status(500).json({ error: 'Bulk action failed' });
  }
});

// ============================================================================
// POST /api/admin/bulk/renters - Bulk actions on renters
// ============================================================================
router.post('/bulk/renters', (req, res) => {
  try {
    const { ids, action, amount_halala, reason } = req.body;
    const safeIds = normalizeIdArray(ids);
    if (!safeIds) return res.status(400).json({ error: 'ids array required (positive integers)' });
    if (!['suspend', 'unsuspend', 'credit'].includes(action)) return res.status(400).json({ error: 'action must be suspend, unsuspend, or credit' });
    const amountHalala = action === 'credit'
      ? toFiniteInt(amount_halala, { min: 1, max: 100000000 })
      : null;
    if (action === 'credit' && amountHalala == null) return res.status(400).json({ error: 'amount_halala required for credit' });

    const now = new Date().toISOString();
    let success = 0, failed = 0;

    for (const id of safeIds) {
      try {
        const renter = db.get('SELECT id, name, status, balance_halala FROM renters WHERE id = ?', id);
        if (!renter) { failed++; continue; }
        if (action === 'suspend') {
          db.prepare('UPDATE renters SET status = ? WHERE id = ?').run('suspended', id);
        } else if (action === 'unsuspend') {
          db.prepare('UPDATE renters SET status = ? WHERE id = ?').run('active', id);
        } else if (action === 'credit') {
          const granted = grantRenterCredit({
            renterId: id,
            amountHalala,
            reason: reason || 'bulk credit',
            grantedBy: 'admin_bulk'
          });
          if (granted.error) {
            failed++;
            continue;
          }
        }
        if (action !== 'credit') {
          try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run(
            `bulk_renter_${action}`, 'renter', id, `Bulk ${action}: "${renter.name}"`, now); } catch(e) {}
        }
        success++;
      } catch (e) { failed++; }
    }

    res.json({ success: true, action, processed: success, failed, total: safeIds.length });
  } catch (error) {
    console.error('Bulk renter action error:', error);
    res.status(500).json({ error: 'Bulk action failed' });
  }
});

// ============================================================================
// POST /api/admin/payments/confirm-topup — Confirm a pending bank transfer topup
// Credits renter balance once admin verifies SAR receipt in bank account.
// Body: { topup_id: string, note?: string }
// ============================================================================
router.post('/payments/confirm-topup', (req, res) => {
  const crypto = require('crypto');
  try {
    const { topup_id, note } = req.body || {};
    if (!topup_id || typeof topup_id !== 'string') {
      return res.status(400).json({ error: 'topup_id (string) is required' });
    }
    const payment = db.get(
      `SELECT * FROM payments WHERE payment_id = ? AND source_type = 'bank_transfer'`,
      topup_id.trim()
    );
    if (!payment) {
      return res.status(404).json({ error: 'Bank transfer topup not found' });
    }
    if (payment.status === 'paid') {
      return res.status(409).json({ error: 'Topup already confirmed', confirmed_at: payment.confirmed_at });
    }
    if (payment.status === 'refunded') {
      return res.status(409).json({ error: 'Topup has been refunded and cannot be re-confirmed' });
    }
    const renter = db.get('SELECT id, name, email, balance_halala FROM renters WHERE id = ?', payment.renter_id);
    if (!renter) {
      return res.status(404).json({ error: 'Renter not found for this topup' });
    }
    const now = new Date().toISOString();
    const normalizedNote = normalizeString(note, { maxLen: 500 }) || 'Bank transfer confirmed by admin';
    const tx = db._db.transaction(() => {
      db.prepare(
        `UPDATE payments SET status = 'paid', confirmed_at = ?, gateway_response = ? WHERE payment_id = ?`
      ).run(now, JSON.stringify({ confirmed_by: 'admin', note: normalizedNote, confirmed_at: now }), payment.payment_id);
      db.prepare(
        `UPDATE renters SET balance_halala = balance_halala + ?, updated_at = ? WHERE id = ?`
      ).run(payment.amount_halala, now, renter.id);
      try {
        db.prepare(
          `INSERT INTO renter_credit_ledger (id, renter_id, amount_halala, direction, source, payment_ref, note, created_at)
           VALUES (?, ?, ?, 'credit', 'bank_transfer_topup', ?, ?, ?)`
        ).run(
          `rcl_${crypto.randomBytes(10).toString('hex')}`,
          renter.id, payment.amount_halala, payment.payment_id, normalizedNote, now
        );
      } catch (_) {}
      try {
        db.prepare(
          `INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)`
        ).run(
          'topup_confirmed', 'renter', renter.id,
          `Bank transfer topup ${payment.payment_id} confirmed: ${payment.amount_halala} halala credited to "${renter.name}". Note: ${normalizedNote}`,
          now
        );
      } catch (_) {}
    });
    tx();
    const updated = db.get('SELECT balance_halala FROM renters WHERE id = ?', renter.id);
    console.log(`[admin/confirm-topup] ${payment.payment_id} confirmed — ${payment.amount_halala} halala to renter ${renter.id}`);
    return res.json({
      success: true,
      topup_id: payment.payment_id,
      renter_id: renter.id,
      renter_name: renter.name,
      renter_email: renter.email,
      amount_sar: payment.amount_sar,
      amount_halala: payment.amount_halala,
      previous_balance_halala: renter.balance_halala,
      new_balance_halala: updated.balance_halala,
      new_balance_sar: Number((updated.balance_halala / 100).toFixed(2)),
      confirmed_at: now,
      note: normalizedNote,
    });
  } catch (err) {
    console.error('[admin/confirm-topup] Error:', err.message);
    return res.status(500).json({ error: 'Failed to confirm topup' });
  }
});

// ============================================================================
// GET /api/admin/jobs - List all jobs with filters
// ============================================================================
router.get('/jobs', (req, res) => {
  try {
    const { status, type, provider_id, renter_id, date_from, date_to } = req.query;
    const page = Math.max(parseInt(req.query.page) || 0, 0);
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const search = (req.query.search || '').trim().toLowerCase();

    let where = '1=1';
    const params = [];
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where += ' AND j.status = ?'; params.push(statuses[0]);
      } else if (statuses.length > 1) {
        where += ` AND j.status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }
    }
    if (type) { where += ' AND j.job_type = ?'; params.push(type); }
    if (provider_id) { where += ' AND j.provider_id = ?'; params.push(provider_id); }
    if (renter_id) { where += ' AND j.renter_id = ?'; params.push(renter_id); }
    if (date_from && !isNaN(Date.parse(date_from))) { where += ' AND j.created_at >= ?'; params.push(new Date(date_from).toISOString()); }
    if (date_to && !isNaN(Date.parse(date_to))) { where += ' AND j.created_at <= ?'; params.push(new Date(date_to).toISOString()); }
    if (search) {
      where += ` AND (LOWER(j.job_id) LIKE ? OR LOWER(p.name) LIKE ? OR LOWER(r.name) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countRow = db.get(`SELECT COUNT(*) as total FROM jobs j LEFT JOIN providers p ON j.provider_id = p.id LEFT JOIN renters r ON j.renter_id = r.id WHERE ${where}`, ...params);
    const total = countRow?.total || 0;

    let paginationSql = '';
    if (page > 0) { paginationSql = `LIMIT ${limit} OFFSET ${(page - 1) * limit}`; }
    else { paginationSql = `LIMIT ${limit}`; }

    const jobs = db.all(`SELECT j.id, j.job_id, j.provider_id, j.renter_id, j.status, j.job_type, j.model,
        j.cost_halala, j.actual_cost_halala, j.duration_minutes, j.duration_seconds,
        j.prompt_tokens, j.completion_tokens,
        j.submitted_at, j.started_at, j.completed_at, j.created_at,
        p.name as provider_name, p.gpu_model,
        r.name as renter_name
        FROM jobs j
        LEFT JOIN providers p ON j.provider_id = p.id
        LEFT JOIN renters r ON j.renter_id = r.id
        WHERE ${where}
        ORDER BY j.created_at DESC ${paginationSql}`, ...params);

    const statsRow = db.get(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
              SUM(CASE WHEN status IN ('pending','assigned','running','queued') THEN 1 ELSE 0 END) as active,
              SUM(cost_halala) as total_revenue_halala
       FROM jobs`
    ) || {};

    const response = { stats: statsRow, jobs };
    if (page > 0) { response.pagination = { page, limit, total, total_pages: Math.ceil(total / limit) }; }
    res.json(response);
  } catch (error) {
    console.error('Admin jobs list error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// ============================================================================
// POST /api/admin/jobs/:id/cancel - Force cancel a job with refund
// ============================================================================
router.post('/jobs/:id/cancel', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.id, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status === 'completed' || job.status === 'cancelled') {
      return res.status(400).json({ error: `Job already ${job.status}` });
    }

    db.prepare('UPDATE jobs SET status = ?, completed_at = ? WHERE id = ?').run(
      'cancelled', new Date().toISOString(), job.id);

    // Refund renter if job had a cost
    let refunded = 0;
    if (job.cost_halala && job.cost_halala > 0 && job.renter_id) {
      db.prepare('UPDATE renters SET balance_halala = balance_halala + ? WHERE id = ?').run(
        job.cost_halala, job.renter_id);
      refunded = job.cost_halala;
    }

    res.json({
      success: true,
      job_id: job.job_id || job.id,
      previous_status: job.status,
      new_status: 'cancelled',
      refunded_halala: refunded
    });
  } catch (error) {
    console.error('Admin cancel job error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// ============================================================================
// POST /api/admin/jobs/:id/requeue - Re-queue a failed job
// ============================================================================
router.post('/jobs/:id/requeue', (req, res) => {
  try {
    const job = db.get('SELECT * FROM jobs WHERE id = ? OR job_id = ?', req.params.id, req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed jobs can be re-queued' });
    }

    const timeoutSeconds = Number.isFinite(Number(job.max_duration_seconds))
      ? Math.max(60, Number(job.max_duration_seconds))
      : 600;
    const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '');
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE jobs
       SET status = 'pending',
           error = NULL,
           result = NULL,
           completed_at = NULL,
           started_at = NULL,
           picked_up_at = NULL,
           assigned_at = NULL,
           progress_phase = NULL,
           progress_updated_at = NULL,
           timeout_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(timeoutAt, now, job.id);

    res.json({
      success: true,
      job_id: job.job_id || job.id,
      previous_status: job.status,
      new_status: 'pending',
      timeout_at: timeoutAt
    });
  } catch (error) {
    console.error('Admin re-queue job error:', error);
    res.status(500).json({ error: 'Failed to re-queue job' });
  }
});

// ============================================================================
// GET /api/admin/security/events - Security & audit events
// ============================================================================
router.get('/security/events', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const events = [];

    // 1. Failed/timed-out jobs (high severity)
    const failedJobs = db.all(
      `SELECT j.id, j.job_id, j.status, j.error, j.completed_at as timestamp,
              j.provider_id, p.name as provider_name, j.renter_id, r.name as renter_name
       FROM jobs j
       LEFT JOIN providers p ON j.provider_id = p.id
       LEFT JOIN renters r ON j.renter_id = r.id
       WHERE j.status = 'failed'
       ORDER BY j.completed_at DESC LIMIT ?`, limit
    );
    failedJobs.forEach(j => {
      events.push({
        id: j.id,
        timestamp: j.timestamp,
        event_type: 'job_failure',
        severity: j.error?.includes('timed out') ? 'medium' : 'high',
        provider_id: j.provider_id,
        provider_name: j.provider_name,
        details: `Job ${j.job_id} failed: ${j.error || 'Unknown error'} (Renter: ${j.renter_name || 'Unknown'})`
      });
    });

    // 2. Provider disconnections (medium severity)
    const disconnected = db.all(
      `SELECT id, name, last_heartbeat, provider_ip
       FROM providers
       WHERE last_heartbeat IS NOT NULL
         AND datetime(last_heartbeat) < datetime('now', '-5 minutes')
       ORDER BY last_heartbeat DESC LIMIT ?`, limit
    );
    disconnected.forEach(p => {
      events.push({
        id: 10000 + p.id,
        timestamp: p.last_heartbeat,
        event_type: 'provider_disconnect',
        severity: 'medium',
        provider_id: p.id,
        provider_name: p.name,
        details: `Provider went offline. Last heartbeat: ${p.last_heartbeat}. IP: ${p.provider_ip || 'Unknown'}`
      });
    });

    // 3. Daemon crash events (high severity)
    try {
      const crashes = db.all(
        `SELECT de.id, de.event_timestamp as timestamp, de.provider_id, de.details, de.severity,
                p.name as provider_name
         FROM daemon_events de
         LEFT JOIN providers p ON de.provider_id = p.id
         WHERE de.event_type IN ('daemon_crash', 'watchdog_restart', 'watchdog_givingup')
         ORDER BY de.event_timestamp DESC LIMIT ?`, limit
      );
      crashes.forEach(c => {
        events.push({
          id: 20000 + c.id,
          timestamp: c.timestamp,
          event_type: c.details?.includes('watchdog') ? 'watchdog_restart' : 'daemon_crash',
          severity: c.severity || 'high',
          provider_id: c.provider_id,
          provider_name: c.provider_name,
          details: c.details || 'Daemon crash detected'
        });
      });
    } catch(e) { /* daemon_events table may not exist yet */ }

    // 4. Suspended accounts (low severity, informational)
    const suspended = db.all(
      `SELECT id, name, 'provider' as account_type, updated_at as timestamp FROM providers WHERE status = 'suspended'
       UNION ALL
       SELECT id, name, 'renter' as account_type, created_at as timestamp FROM renters WHERE status = 'suspended'`
    );
    suspended.forEach(s => {
      events.push({
        id: 30000 + s.id,
        timestamp: s.timestamp,
        event_type: 'account_suspended',
        severity: 'low',
        provider_id: s.account_type === 'provider' ? s.id : null,
        provider_name: s.name,
        details: `${s.account_type.charAt(0).toUpperCase() + s.account_type.slice(1)} "${s.name}" is suspended`
      });
    });

    // 5. Refunded jobs (medium severity)
    const refunded = db.all(
      `SELECT j.id, j.job_id, j.refunded_at as timestamp, j.cost_halala,
              j.provider_id, p.name as provider_name, r.name as renter_name
       FROM jobs j
       LEFT JOIN providers p ON j.provider_id = p.id
       LEFT JOIN renters r ON j.renter_id = r.id
       WHERE j.refunded_at IS NOT NULL
       ORDER BY j.refunded_at DESC LIMIT ?`, limit
    );
    refunded.forEach(j => {
      events.push({
        id: 40000 + j.id,
        timestamp: j.timestamp,
        event_type: 'job_refunded',
        severity: 'medium',
        provider_id: j.provider_id,
        provider_name: j.provider_name,
        details: `Refunded ${j.cost_halala} halala (${(j.cost_halala/100).toFixed(2)} SAR) for job ${j.job_id} to ${j.renter_name}`
      });
    });

    // Sort all events by timestamp descending, limit
    events.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    res.json({ events: events.slice(0, limit) });
  } catch (error) {
    console.error('Security events error:', error);
    res.status(500).json({ error: 'Failed to fetch security events' });
  }
});

// ============================================================================
// GET /api/admin/security/summary - Security summary stats
// ============================================================================
router.get('/security/summary', (req, res) => {
  try {
    const failedJobs = db.get('SELECT COUNT(*) as cnt FROM jobs WHERE status = ?', 'failed') || { cnt: 0 };

    let crashCount = 0;
    try {
      const cc = db.get(
        `SELECT COUNT(*) as cnt FROM daemon_events WHERE event_type IN ('daemon_crash', 'watchdog_restart', 'watchdog_givingup')`
      );
      crashCount = cc?.cnt || 0;
    } catch(e) {}

    const disconnectedProviders = db.get(
      `SELECT COUNT(*) as cnt FROM providers
       WHERE last_heartbeat IS NOT NULL AND datetime(last_heartbeat) < datetime('now', '-5 minutes')`
    ) || { cnt: 0 };

    const suspendedAccounts = db.get(
      `SELECT
        (SELECT COUNT(*) FROM providers WHERE status = 'suspended') +
        (SELECT COUNT(*) FROM renters WHERE status = 'suspended') as cnt`
    ) || { cnt: 0 };

    const totalEvents = failedJobs.cnt + crashCount + disconnectedProviders.cnt + suspendedAccounts.cnt;

    res.json({
      total_events: totalEvents,
      high_severity: failedJobs.cnt + crashCount,
      medium_severity: disconnectedProviders.cnt,
      flagged_providers: disconnectedProviders.cnt + (db.get("SELECT COUNT(*) as cnt FROM providers WHERE status = 'suspended'") || { cnt: 0 }).cnt
    });
  } catch (error) {
    console.error('Security summary error:', error);
    res.status(500).json({ error: 'Failed to fetch security summary' });
  }
});

// ============================================================================
// POST /api/admin/providers/:id/rotate-key - Force-rotate provider API key
// ============================================================================
router.post('/providers/:id/rotate-key', (req, res) => {
  try {
    const provider = db.get('SELECT id, name FROM providers WHERE id = ?', req.params.id);
    if (!provider) return res.status(404).json({ error: 'Provider not found' });

    const newKey = 'dcp-provider-' + crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    db.prepare('UPDATE providers SET api_key = ?, updated_at = ? WHERE id = ?').run(newKey, now, provider.id);
    try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('key_rotated', 'provider', provider.id, `Force-rotated API key for "${provider.name}"`, now); } catch(e) {}

    res.json({ success: true, provider_id: provider.id, name: provider.name, new_api_key: newKey });
  } catch (error) {
    console.error('Admin rotate provider key error:', error);
    res.status(500).json({ error: 'Key rotation failed' });
  }
});

// ============================================================================
// POST /api/admin/renters/:id/rotate-key - Force-rotate renter API key
// ============================================================================
router.post('/renters/:id/rotate-key', (req, res) => {
  try {
    const renter = db.get('SELECT id, name FROM renters WHERE id = ?', req.params.id);
    if (!renter) return res.status(404).json({ error: 'Renter not found' });

    const newKey = 'dcp-renter-' + crypto.randomBytes(16).toString('hex');
    const now = new Date().toISOString();
    db.prepare('UPDATE renters SET api_key = ?, updated_at = ? WHERE id = ?').run(newKey, now, renter.id);
    try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('key_rotated', 'renter', renter.id, `Force-rotated API key for "${renter.name}"`, now); } catch(e) {}

    res.json({ success: true, renter_id: renter.id, name: renter.name, new_api_key: newKey });
  } catch (error) {
    console.error('Admin rotate renter key error:', error);
    res.status(500).json({ error: 'Key rotation failed' });
  }
});

// ============================================================================
// GET /api/admin/withdrawals - List withdrawal_requests with provider info
// ============================================================================
router.get('/withdrawals', (req, res) => {
  try {
    const statusFilter = req.query.status || '';
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    let where = '1=1';
    const params = [];
    if (statusFilter) { where += ' AND wr.status = ?'; params.push(statusFilter); }

    const countRow = db.get(`SELECT COUNT(*) as total FROM withdrawal_requests wr WHERE ${where}`, ...params);
    const total = countRow?.total || 0;

    const withdrawals = db.all(`
      SELECT wr.id, wr.provider_id, wr.amount_halala, wr.status, wr.iban,
             wr.admin_note, wr.created_at, wr.processed_at,
             p.name as provider_name, p.email as provider_email,
             p.gpu_model as provider_gpu_model
      FROM withdrawal_requests wr
      LEFT JOIN providers p ON wr.provider_id = p.id
      WHERE ${where}
      ORDER BY CASE WHEN wr.status = 'pending' THEN 0 ELSE 1 END, wr.created_at DESC
      LIMIT ? OFFSET ?
    `, ...params, limit, offset);

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const monthStart = thisMonthStart.toISOString();

    const summary = db.get(`
      SELECT COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
             COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_halala ELSE 0 END), 0) as pending_total_halala,
             COALESCE(SUM(CASE WHEN status = 'paid' AND processed_at >= ? THEN amount_halala ELSE 0 END), 0) as paid_this_month_halala,
             COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM withdrawal_requests
    `, monthStart) || {};

    res.json({
      withdrawals,
      summary,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Admin withdrawals error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// ============================================================================
// PATCH /api/admin/withdrawals/:id - Update withdrawal request status
// Supports new withdrawal_requests state machine: pending -> processing -> paid/failed
// ============================================================================
router.patch('/withdrawals/:id', (req, res) => {
  try {
    const withdrawalId = normalizeString(req.params.id, { maxLen: 120, trim: true });
    if (!withdrawalId) return res.status(400).json({ error: 'Withdrawal id is required' });

    const requestedStatus = normalizeString(req.body?.status, { maxLen: 20 })?.toLowerCase();
    const normalizedStatus = {
      completed: 'paid',
      rejected: 'failed',
    }[requestedStatus] || requestedStatus;
    if (!normalizedStatus || !['processing', 'paid', 'failed'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'status must be one of: processing, paid, failed, completed, rejected' });
    }

    const adminNote = normalizeString(req.body?.admin_note ?? req.body?.note, { maxLen: 500 });
    const existing = db.get(
      `SELECT id, provider_id, amount_halala, status, is_amount_reserved
       FROM withdrawal_requests
       WHERE id = ?`,
      withdrawalId
    );
    if (!existing) return res.status(404).json({ error: 'Withdrawal request not found' });

    const allowedTransitions = {
      pending: ['processing', 'paid', 'failed'],
      processing: ['paid', 'failed'],
      paid: [],
      failed: [],
    };
    const allowed = allowedTransitions[existing.status] || [];
    if (!allowed.includes(normalizedStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from ${existing.status} to ${normalizedStatus}`
      });
    }

    const now = new Date().toISOString();
    const txSource = typeof db.transaction === 'function' ? db : db._db;
    const transitionTx = txSource.transaction(() => {
      if (normalizedStatus === 'paid' && !Number(existing.is_amount_reserved)) {
        const provider = db.get(
          'SELECT claimable_earnings_halala FROM providers WHERE id = ?',
          existing.provider_id
        );
        const claimable = Number(provider?.claimable_earnings_halala || 0);
        if (claimable < existing.amount_halala) {
          throw new Error('Insufficient claimable earnings to complete withdrawal');
        }
        db.prepare(
          `UPDATE providers
           SET claimable_earnings_halala = claimable_earnings_halala - ?,
               updated_at = ?
           WHERE id = ?`
        ).run(existing.amount_halala, now, existing.provider_id);
      } else if (normalizedStatus === 'failed' && Number(existing.is_amount_reserved)) {
        db.prepare(
          `UPDATE providers
           SET claimable_earnings_halala = claimable_earnings_halala + ?,
               updated_at = ?
           WHERE id = ?`
        ).run(existing.amount_halala, now, existing.provider_id);
      }

      db.prepare(
        `UPDATE withdrawal_requests
         SET status = ?,
             admin_note = COALESCE(?, admin_note),
             processed_at = CASE WHEN ? IN ('paid', 'failed') THEN ? ELSE processed_at END,
             is_amount_reserved = CASE
               WHEN ? = 'paid' THEN 1
               WHEN ? = 'failed' THEN 0
               ELSE is_amount_reserved
             END,
             updated_at = ?
         WHERE id = ?`
      ).run(normalizedStatus, adminNote, normalizedStatus, now, normalizedStatus, normalizedStatus, now, withdrawalId);
    });
    transitionTx();

    const withdrawal_request = db.get(
      `SELECT wr.id, wr.provider_id, wr.amount_halala, wr.status, wr.iban,
              wr.admin_note, wr.created_at, wr.processed_at, wr.updated_at,
              p.email as provider_email
       FROM withdrawal_requests wr
       LEFT JOIN providers p ON wr.provider_id = p.id
       WHERE wr.id = ?`,
      withdrawalId
    );

    if (withdrawal_request?.provider_email && normalizedStatus === 'processing') {
      const maybePromise = sendWithdrawalApprovedEmail(
        withdrawal_request.provider_email,
        withdrawal_request.amount_halala / 100
      );
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch((e) => console.error('[admin.withdrawals.patch] email failed:', e.message));
      }
    }

    return res.json({ withdrawal_request });
  } catch (error) {
    console.error('Admin update withdrawal status error:', error);
    return res.status(500).json({ error: 'Failed to update withdrawal status' });
  }
});

// ============================================================================
// POST /api/admin/withdrawals/:id/approve - Approve withdrawal
// ============================================================================
router.post('/withdrawals/:id/approve', (req, res) => {
  try {
    const w = db.get('SELECT * FROM withdrawals WHERE id = ? OR withdrawal_id = ?', req.params.id, req.params.id);
    if (!w) return res.status(404).json({ error: 'Withdrawal not found' });
    if (w.status !== 'pending') return res.status(400).json({ error: `Cannot approve — status is ${w.status}` });
    const provider = db.get('SELECT id, email FROM providers WHERE id = ?', w.provider_id);

    const now = new Date().toISOString();
    const notes = normalizeString(req.body.notes, { maxLen: 500 }) || 'Approved by admin';
    db.prepare('UPDATE withdrawals SET status = ?, processed_at = ?, notes = ? WHERE id = ?').run(
      'approved', now, notes, w.id);

    // Log to audit
    try {
      db.prepare(`INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp)
              VALUES (?, ?, ?, ?, ?)`).run(
        'withdrawal_approved', 'withdrawal', w.id,
        `Approved ${w.amount_sar} SAR for provider ${w.provider_id}`, now);
    } catch(e) { /* audit table may not exist yet */ }

    res.json({ success: true, withdrawal_id: w.withdrawal_id, new_status: 'approved', amount_sar: w.amount_sar });

    if (provider?.email) {
      const maybePromise = sendWithdrawalApprovedEmail(provider.email, Number(w.amount_sar || 0));
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.catch((e) => console.error('[admin.withdrawals.approve] email failed:', e.message));
      }
    }
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({ error: 'Failed to approve withdrawal' });
  }
});

// ============================================================================
// POST /api/admin/withdrawals/:id/reject - Reject withdrawal
// ============================================================================
router.post('/withdrawals/:id/reject', (req, res) => {
  try {
    const w = db.get('SELECT * FROM withdrawals WHERE id = ? OR withdrawal_id = ?', req.params.id, req.params.id);
    if (!w) return res.status(404).json({ error: 'Withdrawal not found' });
    if (w.status !== 'pending') return res.status(400).json({ error: `Cannot reject — status is ${w.status}` });

    const now = new Date().toISOString();
    const reason = normalizeString(req.body.reason, { maxLen: 500 }) || 'Rejected by admin';
    db.prepare('UPDATE withdrawals SET status = ?, processed_at = ?, notes = ? WHERE id = ?').run(
      'rejected', now, reason, w.id);

    try {
      db.prepare(`INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp)
              VALUES (?, ?, ?, ?, ?)`).run(
        'withdrawal_rejected', 'withdrawal', w.id,
        `Rejected ${w.amount_sar} SAR for provider ${w.provider_id}: ${reason || 'No reason'}`, now);
    } catch(e) {}

    res.json({ success: true, withdrawal_id: w.withdrawal_id, new_status: 'rejected', reason: reason || '' });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({ error: 'Failed to reject withdrawal' });
  }
});

// ============================================================================
// POST /api/admin/withdrawals/:id/complete - Mark withdrawal as paid
// ============================================================================
router.post('/withdrawals/:id/complete', (req, res) => {
  try {
    const w = db.get('SELECT * FROM withdrawals WHERE id = ? OR withdrawal_id = ?', req.params.id, req.params.id);
    if (!w) return res.status(404).json({ error: 'Withdrawal not found' });
    if (w.status !== 'approved') return res.status(400).json({ error: `Can only complete approved withdrawals — status is ${w.status}` });

    const now = new Date().toISOString();
    const notes = normalizeString(req.body.notes, { maxLen: 500 }) || 'Payment sent';
    db.prepare('UPDATE withdrawals SET status = ?, processed_at = ?, notes = ? WHERE id = ?').run(
      'completed', now, notes, w.id);

    try {
      db.prepare(`INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp)
              VALUES (?, ?, ?, ?, ?)`).run(
        'withdrawal_completed', 'withdrawal', w.id,
        `Paid ${w.amount_sar} SAR to provider ${w.provider_id}`, now);
    } catch(e) {}

    res.json({ success: true, withdrawal_id: w.withdrawal_id, new_status: 'completed', amount_sar: w.amount_sar });
  } catch (error) {
    console.error('Complete withdrawal error:', error);
    res.status(500).json({ error: 'Failed to complete withdrawal' });
  }
});

// ============================================================================
// GET /api/admin/audit - Audit log
// ============================================================================
router.get('/audit', (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    let entries = [];
    let total = 0;
    try {
      const countRow = db.get('SELECT COUNT(*) as total FROM admin_audit_log');
      total = countRow?.total || 0;
      entries = db.all('SELECT * FROM admin_audit_log ORDER BY timestamp DESC LIMIT ? OFFSET ?', limit, offset);
    } catch(e) { /* table may not exist yet */ }

    res.json({ entries, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ============================================================================
// GET /api/admin/finance/summary - Financial overview
// ============================================================================
router.get('/finance/summary', (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setUTCHours(0,0,0,0);
    const weekStart = new Date(todayStart.getTime() - 7*24*60*60*1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // All-time totals
    const allTime = db.get(`
      SELECT COALESCE(SUM(actual_cost_halala), 0) as total_revenue,
             COALESCE(SUM(provider_earned_halala), 0) as total_provider_payouts,
             COALESCE(SUM(dc1_fee_halala), 0) as total_dc1_fees,
             COUNT(*) as total_jobs,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs
      FROM jobs WHERE status = 'completed'
    `) || {};

    // Today
    const today = db.get(`
      SELECT COALESCE(SUM(actual_cost_halala), 0) as revenue,
             COALESCE(SUM(dc1_fee_halala), 0) as dc1_fees,
             COUNT(*) as jobs
      FROM jobs WHERE status = 'completed' AND completed_at >= ?
    `, todayStart.toISOString()) || {};

    // This week
    const week = db.get(`
      SELECT COALESCE(SUM(actual_cost_halala), 0) as revenue,
             COALESCE(SUM(dc1_fee_halala), 0) as dc1_fees,
             COUNT(*) as jobs
      FROM jobs WHERE status = 'completed' AND completed_at >= ?
    `, weekStart.toISOString()) || {};

    // This month
    const month = db.get(`
      SELECT COALESCE(SUM(actual_cost_halala), 0) as revenue,
             COALESCE(SUM(dc1_fee_halala), 0) as dc1_fees,
             COUNT(*) as jobs
      FROM jobs WHERE status = 'completed' AND completed_at >= ?
    `, monthStart.toISOString()) || {};

    // Renter balances (money held)
    const renterBalances = db.get(`
      SELECT COALESCE(SUM(balance_halala), 0) as total_held,
             COUNT(*) as total_renters,
             SUM(CASE WHEN balance_halala > 0 THEN 1 ELSE 0 END) as funded_renters
      FROM renters WHERE status = 'active'
    `) || {};

    // Pending withdrawals
    const withdrawals = db.get(`
      SELECT COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_sar ELSE 0 END), 0) as pending_sar,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN amount_sar ELSE 0 END), 0) as approved_sar,
             COALESCE(SUM(CASE WHEN status = 'completed' THEN amount_sar ELSE 0 END), 0) as paid_sar,
             COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
      FROM withdrawals
    `) || {};

    // Top 5 providers by earnings
    const topProviders = db.all(`
      SELECT p.id, p.name, p.gpu_model,
             COALESCE(SUM(j.provider_earned_halala), 0) as total_earned,
             COUNT(j.id) as job_count
      FROM providers p
      LEFT JOIN jobs j ON j.provider_id = p.id AND j.status = 'completed'
      GROUP BY p.id
      HAVING total_earned > 0
      ORDER BY total_earned DESC LIMIT 5
    `);

    // Top 5 renters by spend
    const topRenters = db.all(`
      SELECT r.id, r.name, r.email, r.balance_halala,
             COALESCE(SUM(j.actual_cost_halala), 0) as total_spent,
             COUNT(j.id) as job_count
      FROM renters r
      LEFT JOIN jobs j ON j.renter_id = r.id AND j.status = 'completed'
      GROUP BY r.id
      HAVING total_spent > 0
      ORDER BY total_spent DESC LIMIT 5
    `);

    // Daily revenue for last 14 days
    const dailyRevenue = db.all(`
      SELECT DATE(completed_at) as day,
             COALESCE(SUM(actual_cost_halala), 0) as revenue,
             COALESCE(SUM(dc1_fee_halala), 0) as dc1_fees,
             COALESCE(SUM(provider_earned_halala), 0) as provider_payouts,
             COUNT(*) as jobs
      FROM jobs
      WHERE status = 'completed' AND completed_at >= DATE('now', '-14 days')
      GROUP BY DATE(completed_at)
      ORDER BY day ASC
    `);

    // Reconciliation check — jobs where split doesn't add up
    const discrepancies = db.all(`
      SELECT id, job_id, actual_cost_halala, provider_earned_halala, dc1_fee_halala
      FROM jobs
      WHERE status = 'completed'
        AND actual_cost_halala IS NOT NULL
        AND (provider_earned_halala + dc1_fee_halala) != actual_cost_halala
      LIMIT 10
    `);

    res.json({
      all_time: allTime,
      today,
      this_week: week,
      this_month: month,
      renter_balances: renterBalances,
      withdrawals,
      top_providers: topProviders,
      top_renters: topRenters,
      daily_revenue: dailyRevenue,
      discrepancies,
      generated_at: now.toISOString()
    });
  } catch (error) {
    console.error('Finance summary error:', error);
    res.status(500).json({ error: 'Failed to fetch finance summary' });
  }
});

// ============================================================================
// GET /api/admin/finance/transactions - Paginated billing transactions
// ============================================================================
router.get('/finance/transactions', (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const { type, renter_id, provider_id } = req.query;

    let where = "WHERE j.status = 'completed' AND j.actual_cost_halala > 0";
    const params = [];
    if (type) { where += ' AND j.job_type = ?'; params.push(type); }
    if (renter_id) { where += ' AND j.renter_id = ?'; params.push(renter_id); }
    if (provider_id) { where += ' AND j.provider_id = ?'; params.push(provider_id); }

    const countRow = db.get(`SELECT COUNT(*) as total FROM jobs j ${where}`, ...params);
    const total = countRow?.total || 0;

    const transactions = db.all(`
      SELECT j.id, j.job_id, j.job_type, j.completed_at, j.actual_cost_halala,
             j.provider_earned_halala, j.dc1_fee_halala, j.actual_duration_minutes,
             p.name as provider_name, r.name as renter_name
      FROM jobs j
      LEFT JOIN providers p ON j.provider_id = p.id
      LEFT JOIN renters r ON j.renter_id = r.id
      ${where}
      ORDER BY j.completed_at DESC
      LIMIT ? OFFSET ?
    `, ...params, limit, offset);

    res.json({
      transactions,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('Finance transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ── Provider Fleet Monitoring ────────────────────────────────────────────────
router.get('/fleet/probe-evidence', (req, res) => {
  try {
    const nowMs = Date.now();
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    try { ensureProviderVerificationSchema(db); } catch (_) { /* best-effort for older DBs */ }

    const rows = db.all(
      `SELECT id, name, email, gpu_model, status, last_heartbeat, cached_models,
              vllm_endpoint_url, wg_mesh_ip, wg_handshake_age_s, wg_tunnel_healthy,
              endpoint_reachable, endpoint_probed_at, endpoint_probe_error,
              endpoint_probe_failures, deleted_at, COALESCE(is_paused, 0) AS is_paused
       FROM providers
       WHERE deleted_at IS NULL
       ORDER BY
         CASE WHEN status = 'online' THEN 0 ELSE 1 END,
         last_heartbeat DESC,
         id DESC
       LIMIT ?`,
      limit
    );

    let verifyMap = new Map();
    try { verifyMap = getVerificationMap(db); } catch (_) { verifyMap = new Map(); }

    const providers = rows.map((row) => {
      const heartbeatAge = heartbeatAgeSeconds(row.last_heartbeat, nowMs);
      const verification = verifyMap.get(Number(row.id)) || null;
      const cachedModels = parseCachedModelsSafe(row.cached_models);
      const classification = classifyProbeEvidence(row, verification, cachedModels, heartbeatAge);
      const endpointReachable = row.endpoint_reachable == null ? null : Number(row.endpoint_reachable) === 1;
      const wgTunnelHealthy = row.wg_tunnel_healthy == null ? null : Number(row.wg_tunnel_healthy) === 1;

      return {
        provider_id: row.id,
        name: row.name || null,
        email: row.email || null,
        gpu_model: row.gpu_model || null,
        status: row.status || null,
        is_paused: Number(row.is_paused || 0) === 1,
        last_heartbeat: toIsoOrNull(row.last_heartbeat),
        heartbeat_age_seconds: heartbeatAge,
        endpoint_reachable: endpointReachable,
        endpoint_probed_at: toIsoOrNull(row.endpoint_probed_at),
        endpoint_probe_error: row.endpoint_probe_error || null,
        endpoint_probe_failures: Number(row.endpoint_probe_failures || 0),
        wg_handshake_age_s: row.wg_handshake_age_s == null ? null : Number(row.wg_handshake_age_s),
        wg_tunnel_healthy: wgTunnelHealthy,
        cached_models: cachedModels,
        cached_models_count: cachedModels.length,
        verified_online: verification ? verification.verified_online === true : false,
        verified_at: verification ? verification.verified_at : null,
        verified_models: verification ? verification.verified_models : [],
        verified_models_count: verification ? (verification.verified_models || []).length : 0,
        verify_chat_ok: verification ? verification.chat_ok : null,
        verify_latency_ms: verification ? verification.probe_latency_ms : null,
        verify_error: verification ? verification.probe_error : null,
        verify_endpoint: verification ? verification.probed_endpoint : null,
        focus_code: classification.focus_code,
        recovery_focus: classification.recovery_focus,
        recommended_next_action: classification.recommended_next_action,
        target_model_hint: firstProbeModelHint(cachedModels, verification),
        operator_probe_command: buildOperatorProbeCommand(),
        operator_probe_expected: 'Expected proof: /v1/models shows provider_count > 0 for the target model, a one-token completion succeeds with usage, and billing/metering records the request before public capacity language changes.',
        severity: classification.severity,
        agent_mode: classification.agent_mode,
        gates: classification.gates,
      };
    });

    const countWhere = (predicate) => providers.filter(predicate).length;
    const focusCounts = providers.reduce((acc, provider) => {
      const key = provider.focus_code || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      generated_at: new Date(nowMs).toISOString(),
      summary: {
        total: providers.length,
        online: countWhere((p) => p.status === 'online'),
        endpoint_reachable: countWhere((p) => p.endpoint_reachable === true),
        verified_online: countWhere((p) => p.verified_online === true),
        route_blocked: countWhere((p) => p.focus_code === 'endpoint_route'),
        inference_blocked: countWhere((p) => p.focus_code === 'earned_probe' || p.focus_code === 'inference_timeout'),
        timeout: countWhere((p) => p.focus_code === 'inference_timeout'),
        model_gap: countWhere((p) => p.focus_code === 'model_coverage'),
        ready: countWhere((p) => p.focus_code === 'ready'),
        focus_counts: focusCounts,
      },
      providers,
    });
  } catch (error) {
    console.error('Fleet probe evidence error:', error);
    res.status(500).json({ error: 'Failed to fetch fleet probe evidence' });
  }
});

router.get('/fleet/health', (req, res) => {
  try {
    const nowMs = Date.now();
    const since24h = new Date(nowMs - (24 * 60 * 60 * 1000)).toISOString();

    const rows = db.all(
      `SELECT p.id, p.name, p.email, p.gpu_model, p.vram_mb, p.gpu_vram_mb, p.gpu_vram_mib,
              p.gpu_count, p.gpu_count_reported, p.last_heartbeat, p.status,
              p.wg_handshake_age_s, p.wg_tunnel_healthy, p.cached_models,
              p.endpoint_reachable, p.endpoint_probed_at,
              p.model_cache_disk_mb, p.model_cache_disk_total_mb, p.model_cache_disk_used_pct,
              COALESCE(jr.jobs_running, 0) AS jobs_running,
              COALESCE(jf.jobs_failed_24h, 0) AS jobs_failed_24h,
              COALESCE(hr.container_restart_count_24h, 0) AS container_restart_count_24h,
              hb.gpu_util_pct AS gpu_util_pct,
              hb.gpu_temp_c AS gpu_temp_c,
              hb.gpu_vram_free_mib AS gpu_vram_free_mib,
              hb.gpu_vram_total_mib AS gpu_vram_total_mib
       FROM providers p
       LEFT JOIN (
         SELECT provider_id, COUNT(*) AS jobs_running
         FROM jobs
         WHERE status = 'running'
         GROUP BY provider_id
       ) jr ON jr.provider_id = p.id
       LEFT JOIN (
         SELECT provider_id, COUNT(*) AS jobs_failed_24h
         FROM jobs
         WHERE status = 'failed' AND completed_at >= ?
         GROUP BY provider_id
       ) jf ON jf.provider_id = p.id
       LEFT JOIN (
         SELECT provider_id, MAX(COALESCE(container_restart_count, 0)) AS container_restart_count_24h
         FROM heartbeat_log
         WHERE received_at >= ?
         GROUP BY provider_id
       ) hr ON hr.provider_id = p.id
       LEFT JOIN (
         SELECT h.provider_id, h.gpu_util_pct, h.gpu_temp_c,
                h.gpu_vram_free_mib, h.gpu_vram_total_mib
         FROM heartbeat_log h
         INNER JOIN (
           SELECT provider_id, MAX(received_at) AS max_at
           FROM heartbeat_log
           GROUP BY provider_id
         ) latest ON latest.provider_id = h.provider_id AND latest.max_at = h.received_at
       ) hb ON hb.provider_id = p.id
       ORDER BY p.last_heartbeat DESC, p.id DESC`,
      since24h,
      since24h
    );

    // EARNED-ONLINE layer. Merge in backend-verified state from the
    // providerVerification service. Best-effort: if the table/service isn't
    // ready yet, fall back to an empty map so the existing fields still serve.
    let verifyMap = new Map();
    try { verifyMap = getVerificationMap(db); } catch (_) { verifyMap = new Map(); }

    // Engine / cached-model counts per provider (multi-engine table is
    // optional; tolerate its absence on older installs).
    const engineCounts = new Map();
    try {
      const erows = db.all(
        `SELECT provider_id, COUNT(*) AS engines
           FROM provider_engines
          GROUP BY provider_id`
      );
      for (const er of (erows || [])) engineCounts.set(Number(er.provider_id), Number(er.engines || 0));
    } catch (_) { /* provider_engines may not exist */ }

    const providers = rows.map((row) => {
      const fleet = resolveFleetStatus(row.last_heartbeat, row.container_restart_count_24h, nowMs);
      const v = verifyMap.get(Number(row.id)) || null;
      const cachedModels = parseCachedModelsSafe(row.cached_models);
      const vramTotalMib = Number(row.gpu_vram_total_mib || 0);
      const vramFreeMib = Number(row.gpu_vram_free_mib || 0);
      const vramUsedMib = vramTotalMib > 0 ? Math.max(0, vramTotalMib - vramFreeMib) : null;

      return {
        id: row.id,
        name: row.name || null,
        email: row.email || null,
        gpu_model: row.gpu_model || null,
        vram_mb: Number(row.vram_mb || row.gpu_vram_mb || row.gpu_vram_mib || 0),
        gpu_count: Number(row.gpu_count_reported || row.gpu_count || 1),
        last_heartbeat: toIsoOrNull(row.last_heartbeat),
        heartbeat_age_seconds: fleet.ageSeconds,
        status: fleet.status,
        jobs_running: Number(row.jobs_running || 0),
        jobs_failed_24h: Number(row.jobs_failed_24h || 0),
        container_restart_count_24h: Number(row.container_restart_count_24h || 0),
        model_cache_disk_mb: Number(row.model_cache_disk_mb || 0),

        // ── EARNED-ONLINE additive fields ──────────────────────────────
        // `status` above is the CLAIMED status (heartbeat-derived). These
        // describe whether a backend-initiated probe actually got a real
        // OpenAI-shaped response.
        status_claimed: fleet.status,
        verified_online: v ? v.verified_online : false,
        verified_at: v ? v.verified_at : null,
        verified_models: v ? v.verified_models : [],
        verify_chat_ok: v ? v.chat_ok : null,
        verify_latency_ms: v ? v.probe_latency_ms : null,
        verify_error: v ? v.probe_error : null,
        verify_endpoint: v ? v.probed_endpoint : null,

        // ── WG tunnel + reachability ───────────────────────────────────
        wg_handshake_age_s: row.wg_handshake_age_s != null ? Number(row.wg_handshake_age_s) : null,
        wg_tunnel_healthy: row.wg_tunnel_healthy == null ? null : Number(row.wg_tunnel_healthy) === 1,
        endpoint_reachable: row.endpoint_reachable == null ? null : Number(row.endpoint_reachable) === 1,
        endpoint_probed_at: toIsoOrNull(row.endpoint_probed_at),

        // ── Engines / cached models ────────────────────────────────────
        engines: engineCounts.get(Number(row.id)) || 0,
        cached_models: cachedModels,
        cached_models_count: cachedModels.length,

        // ── GPU telemetry (latest heartbeat) ───────────────────────────
        gpu_temp_c: row.gpu_temp_c != null ? Number(row.gpu_temp_c) : null,
        gpu_util_pct: row.gpu_util_pct != null ? Number(row.gpu_util_pct) : null,
        gpu_vram_used_mib: vramUsedMib,
        gpu_vram_total_mib: vramTotalMib || null,
      };
    });

    const online = providers.filter((p) => p.status === 'online').length;
    const degraded = providers.filter((p) => p.status === 'degraded').length;
    const offline = providers.filter((p) => p.status === 'offline').length;

    // ── Top-level EARNED-ONLINE rollups ──────────────────────────────────
    // usable_online: metering-grade count (verified_online AND fresh hb).
    let usableOnline = 0;
    try { usableOnline = countUsableProviders(db); } catch (_) { usableOnline = 0; }
    const verifiedOnlineCount = providers.filter((p) => p.verified_online).length;

    // metering_last_token_at: most recent billable inference event. This is
    // the strongest "we are actually serving paid traffic" signal we have.
    let meteringLastTokenAt = null;
    try {
      const m = db.get(`SELECT MAX(occurred_at) AS last_at FROM usage_events`);
      meteringLastTokenAt = toIsoOrNull(m && m.last_at);
    } catch (_) { meteringLastTokenAt = null; }

    res.json({
      // Existing fields — unchanged.
      total_providers: providers.length,
      online,
      offline,
      degraded,
      providers,
      generated_at: new Date(nowMs).toISOString(),

      // Additive earned-online rollups.
      usable_online: usableOnline,
      verified_online: verifiedOnlineCount,
      serving_now: usableOnline > 0,
      metering_last_token_at: meteringLastTokenAt,
    });
  } catch (error) {
    console.error('Fleet health error:', error);
    res.status(500).json({ error: 'Failed to fetch fleet health' });
  }
});

router.get('/fleet/alerts', (req, res) => {
  try {
    const nowMs = Date.now();
    const since1h = new Date(nowMs - (60 * 60 * 1000)).toISOString();

    const rows = db.all(
      `SELECT p.id, p.email, p.gpu_model, p.last_heartbeat, p.container_restart_count,
              p.model_cache_disk_mb, p.model_cache_disk_total_mb, p.model_cache_disk_used_pct,
              COALESCE(ja.jobs_in_progress, 0) AS jobs_in_progress,
              COALESCE(hr.restarts_last_hour, 0) AS restarts_last_hour,
              COALESCE(de.restart_events_last_hour, 0) AS restart_events_last_hour
       FROM providers p
       LEFT JOIN (
         SELECT provider_id, COUNT(*) AS jobs_in_progress
         FROM jobs
         WHERE status IN ('running', 'pending', 'queued', 'assigned', 'pulling')
         GROUP BY provider_id
       ) ja ON ja.provider_id = p.id
       LEFT JOIN (
         SELECT provider_id, MAX(COALESCE(container_restart_count, 0)) AS restarts_last_hour
         FROM heartbeat_log
         WHERE received_at >= ?
         GROUP BY provider_id
       ) hr ON hr.provider_id = p.id
       LEFT JOIN (
         SELECT provider_id, COUNT(*) AS restart_events_last_hour
         FROM daemon_events
         WHERE event_timestamp >= ?
           AND event_type IN ('watchdog_restart', 'container_restart')
         GROUP BY provider_id
       ) de ON de.provider_id = p.id`,
      since1h,
      since1h
    );

    const alerts = [];
    for (const row of rows) {
      const fleet = resolveFleetStatus(row.last_heartbeat, row.container_restart_count, nowMs);
      const age = fleet.ageSeconds;
      const jobsInProgress = Number(row.jobs_in_progress || 0);
      const restartSignal = Math.max(
        Number(row.restarts_last_hour || 0),
        Number(row.restart_events_last_hour || 0),
        Number(row.container_restart_count || 0)
      );
      const totalDiskMb = Number(row.model_cache_disk_total_mb || 0);
      const usedDiskMb = Number(row.model_cache_disk_mb || 0);
      const usedPct = Number(row.model_cache_disk_used_pct || (totalDiskMb > 0 ? ((usedDiskMb / totalDiskMb) * 100) : 0));

      const reasons = [];
      if ((age == null || age > 60 * 60) && jobsInProgress > 0) {
        reasons.push('offline_over_1h_with_jobs_in_progress');
      }
      if (restartSignal > 5) {
        reasons.push('high_container_restart_count_last_hour');
      }
      if (totalDiskMb > 0 && usedPct > 90) {
        reasons.push('model_cache_disk_usage_above_90_percent');
      }
      if (reasons.length === 0) continue;

      alerts.push({
        provider_id: row.id,
        email: row.email || null,
        gpu_model: row.gpu_model || null,
        last_heartbeat: toIsoOrNull(row.last_heartbeat),
        heartbeat_age_seconds: age,
        status: fleet.status,
        jobs_in_progress: jobsInProgress,
        restart_count_last_hour: restartSignal,
        model_cache_disk_mb: usedDiskMb,
        model_cache_disk_total_mb: totalDiskMb,
        model_cache_disk_used_pct: Number(usedPct.toFixed(2)),
        reasons,
      });
    }

    res.json({
      total_alerts: alerts.length,
      alerts,
      generated_at: new Date(nowMs).toISOString(),
    });
  } catch (error) {
    console.error('Fleet alerts error:', error);
    res.status(500).json({ error: 'Failed to fetch fleet alerts' });
  }
});

// ── Health Monitoring ─────────────────────────────────────────────────
router.get('/health', (req, res) => {
  try {
    // DB check
    const dbCheck = db.get("SELECT COUNT(*) as count FROM providers");
    const dbOk = dbCheck !== undefined;

    // Provider stats
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const onlineProviders = db.get(
      "SELECT COUNT(*) as count FROM providers WHERE last_heartbeat > ? AND status = 'online'",
      fiveMinAgo
    )?.count || 0;
    const totalProviders = db.get("SELECT COUNT(*) as count FROM providers")?.count || 0;

    // Active jobs
    const activeJobs = db.get(
      "SELECT COUNT(*) as count FROM jobs WHERE status IN ('queued', 'pending', 'running')"
    )?.count || 0;
    const stuckJobs = db.get(
      "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND started_at < ?",
      new Date(Date.now() - 30 * 60 * 1000).toISOString()
    )?.count || 0;

    // Recent errors (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentErrors = db.get(
      "SELECT COUNT(*) as count FROM jobs WHERE status = 'failed' AND completed_at > ?",
      oneHourAgo
    )?.count || 0;

    // Daemon events (critical/error in last hour)
    let criticalEvents = 0;
    try {
      criticalEvents = db.get(
        "SELECT COUNT(*) as count FROM daemon_events WHERE severity IN ('critical', 'error') AND event_timestamp > ?",
        oneHourAgo
      )?.count || 0;
    } catch (e) { /* daemon_events may not exist */ }

    // Withdrawal backlog
    const pendingWithdrawals = db.get(
      "SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'"
    )?.count || 0;

    const providerCapacity = getAdminCapacitySnapshot();
    const healthy = dbOk && stuckJobs === 0 && criticalEvents === 0;

    res.json({
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'ok' : 'error',
        providers: { online: onlineProviders, total: totalProviders },
        jobs: { active: activeJobs, stuck: stuckJobs },
        errors: { failed_last_hour: recentErrors, critical_events: criticalEvents },
        withdrawals: { pending: pendingWithdrawals }
      },
      providers: {
        total: providerCapacity.total,
        online: providerCapacity.heartbeating,
        heartbeating: providerCapacity.heartbeating,
        endpoint_reachable: providerCapacity.endpoint_reachable,
        serving: providerCapacity.serving,
      },
      capacity: {
        serving_providers: providerCapacity.serving,
        reason: providerCapacity.capacity_reason,
        gates: ['fresh_heartbeat', 'endpoint_reachable', 'verified_online', 'model_coverage'],
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ status: 'error', ...safeErrorPayload(error, 'Health check failed') });
  }
});

// ── Financial Reconciliation ─────────────────────────────────────────
router.get('/finance/reconciliation', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // 1. Jobs where provider_earned + dc1_fee != actual_cost
    const splitMismatches = db.all(`
      SELECT j.id, j.job_id, j.job_type, j.actual_cost_halala,
             j.provider_earned_halala, j.dc1_fee_halala, j.completed_at,
             p.name as provider_name, r.name as renter_name,
             (j.provider_earned_halala + j.dc1_fee_halala) as computed_total,
             (j.actual_cost_halala - j.provider_earned_halala - j.dc1_fee_halala) as discrepancy
      FROM jobs j
      LEFT JOIN providers p ON j.provider_id = p.id
      LEFT JOIN renters r ON j.renter_id = r.id
      WHERE j.status = 'completed'
        AND j.actual_cost_halala > 0
        AND j.completed_at > ?
        AND (j.provider_earned_halala + j.dc1_fee_halala) != j.actual_cost_halala
      ORDER BY j.completed_at DESC
      LIMIT 100
    `, since);

    // 2. Jobs with missing billing data
    const missingBilling = db.all(`
      SELECT j.id, j.job_id, j.job_type, j.completed_at,
             j.actual_cost_halala, j.provider_earned_halala, j.dc1_fee_halala,
             p.name as provider_name
      FROM jobs j
      LEFT JOIN providers p ON j.provider_id = p.id
      WHERE j.status = 'completed'
        AND j.completed_at > ?
        AND (j.actual_cost_halala IS NULL OR j.actual_cost_halala = 0
             OR j.provider_earned_halala IS NULL OR j.dc1_fee_halala IS NULL)
      ORDER BY j.completed_at DESC
      LIMIT 100
    `, since);

    // 3. Provider earnings vs job totals
    const providerMismatches = db.all(`
      SELECT p.id, p.name, p.email,
             ROUND(p.total_earnings * 100) as recorded_earnings_halala,
             COALESCE(SUM(j.provider_earned_halala), 0) as computed_earnings_halala,
             ROUND(p.total_earnings * 100) - COALESCE(SUM(j.provider_earned_halala), 0) as drift
      FROM providers p
      LEFT JOIN jobs j ON j.provider_id = p.id AND j.status = 'completed' AND j.provider_earned_halala > 0
      GROUP BY p.id
      HAVING ABS(drift) > 1
      ORDER BY ABS(drift) DESC
      LIMIT 50
    `);

    // 4. Renter spend vs job totals
    const renterMismatches = db.all(`
      SELECT r.id, r.name, r.email,
             r.total_spent_halala as recorded_spent,
             COALESCE(SUM(j.actual_cost_halala), 0) as computed_spent,
             r.total_spent_halala - COALESCE(SUM(j.actual_cost_halala), 0) as drift
      FROM renters r
      LEFT JOIN jobs j ON j.renter_id = r.id AND j.status = 'completed' AND j.actual_cost_halala > 0
      GROUP BY r.id
      HAVING ABS(drift) > 1
      ORDER BY ABS(drift) DESC
      LIMIT 50
    `);

    // 5. Summary stats
    const totalCompleted = db.get(
      "SELECT COUNT(*) as count, SUM(actual_cost_halala) as total_billed FROM jobs WHERE status = 'completed' AND completed_at > ?",
      since
    );

    res.json({
      period_days: days,
      since,
      summary: {
        total_completed_jobs: totalCompleted?.count || 0,
        total_billed_halala: totalCompleted?.total_billed || 0,
        split_mismatches: splitMismatches.length,
        missing_billing: missingBilling.length,
        provider_drift_count: providerMismatches.length,
        renter_drift_count: renterMismatches.length
      },
      issues: {
        split_mismatches: splitMismatches,
        missing_billing: missingBilling,
        provider_earnings_drift: providerMismatches,
        renter_spend_drift: renterMismatches
      }
    });
  } catch (error) {
    console.error('Reconciliation error:', error);
    res.status(500).json({ error: 'Failed to run reconciliation' });
  }
});

// ── Notification Config ──────────────────────────────────────────────────
router.get('/notifications/posture', (req, res) => {
  try {
    res.json(buildNotificationPostureSnapshot());
  } catch (error) {
    console.error('Notification posture error:', error);
    res.status(500).json({ error: 'Failed to get notification posture' });
  }
});

router.get('/notifications/config', (req, res) => {
  try {
    const config = getNotifConfig();
    if (!config) return res.json({ enabled: false });
    // Don't expose full tokens
    res.json({
      enabled: !!config.enabled,
      webhook_url: config.webhook_url || '',
      telegram_configured: !!(config.telegram_bot_token && config.telegram_chat_id),
      telegram_chat_id: config.telegram_chat_id || '',
      updated_at: config.updated_at,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get notification config' });
  }
});

router.post('/notifications/config', (req, res) => {
  try {
    const { webhook_url, telegram_bot_token, telegram_chat_id, enabled } = req.body;
    const now = new Date().toISOString();
    getNotifConfig(); // ensure table + row exists
    const updates = [];
    const params = [];
    if (webhook_url !== undefined) { updates.push('webhook_url = ?'); params.push(normalizeString(webhook_url, { maxLen: 500 }) || null); }
    if (telegram_bot_token !== undefined) { updates.push('telegram_bot_token = ?'); params.push(normalizeString(telegram_bot_token, { maxLen: 500 }) || null); }
    if (telegram_chat_id !== undefined) { updates.push('telegram_chat_id = ?'); params.push(normalizeString(telegram_chat_id, { maxLen: 200 }) || null); }
    if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    updates.push('updated_at = ?'); params.push(now);
    if (updates.length > 1) {
      db.prepare(`UPDATE notification_config SET ${updates.join(', ')} WHERE id = 1`).run(...params);
    }
    try { db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)').run('notification_config_updated', 'system', 0, `Updated notification config: enabled=${enabled}`, now); } catch(e) {}
    res.json({ success: true, message: 'Notification config updated' });
  } catch (error) {
    console.error('Notification config error:', error);
    res.status(500).json({ error: 'Failed to update config' });
  }
});

router.post('/notifications/test', (req, res) => {
  (async () => {
    try {
      const result = await sendAlert('test_alert', 'This is a test alert from DCP Admin Panel. If you see this, notifications are working!');
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Test notification error:', error);
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  })();
});

// ─── Admin: Payments (DCP-31) ─────────────────────────────────────────────────

// GET /api/admin/payments — All payments with filters
router.get('/payments', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const statusFilter = req.query.status || '';
    const search = (req.query.search || '').trim().toLowerCase();

    let where = '1=1';
    const wParams = [];
    if (statusFilter) {
      where += ' AND p.status = ?';
      wParams.push(statusFilter);
    }
    if (search) {
      where += ' AND (LOWER(r.email) LIKE ? OR LOWER(r.name) LIKE ? OR p.payment_id LIKE ?)';
      wParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const payments = db.all(
      `SELECT p.id, p.payment_id, p.amount_sar, p.amount_halala, p.status,
              p.source_type, p.description, p.created_at, p.confirmed_at,
              p.refunded_at, p.refund_amount_halala,
              r.id as renter_id, r.name as renter_name, r.email as renter_email
       FROM payments p
       JOIN renters r ON r.id = p.renter_id
       WHERE ${where}
       ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      ...wParams, limit, offset
    );

    const total = db.get(
      `SELECT COUNT(*) as count FROM payments p JOIN renters r ON r.id = p.renter_id WHERE ${where}`,
      ...wParams
    );

    // Summary stats
    const summary = db.get(
      `SELECT
         COUNT(*) as total_payments,
         COALESCE(SUM(CASE WHEN status='paid' THEN amount_halala ELSE 0 END), 0) as total_revenue_halala,
         COALESCE(SUM(CASE WHEN status='refunded' THEN refund_amount_halala ELSE 0 END), 0) as total_refunded_halala,
         COUNT(CASE WHEN status='initiated' THEN 1 END) as pending_count,
         COUNT(CASE WHEN status='paid' THEN 1 END) as paid_count,
         COUNT(CASE WHEN status='failed' THEN 1 END) as failed_count,
         COUNT(CASE WHEN status='refunded' THEN 1 END) as refunded_count
       FROM payments`
    );

    res.json({
      payments,
      pagination: { limit, offset, total: total.count },
      summary: {
        ...summary,
        total_revenue_sar: summary.total_revenue_halala / 100,
        total_refunded_sar: summary.total_refunded_halala / 100,
      },
    });
  } catch (error) {
    console.error('Admin payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// GET /api/admin/payments/revenue — Revenue breakdown by day/month
router.get('/payments/revenue', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const daily = db.all(
      `SELECT DATE(confirmed_at) as date,
              COUNT(*) as transactions,
              COALESCE(SUM(amount_halala), 0) as revenue_halala
       FROM payments
       WHERE status = 'paid' AND confirmed_at >= ?
       GROUP BY DATE(confirmed_at)
       ORDER BY date DESC`,
      since
    );

    const totals = db.get(
      `SELECT COALESCE(SUM(amount_halala), 0) as total_halala, COUNT(*) as total_transactions
       FROM payments WHERE status = 'paid' AND confirmed_at >= ?`,
      since
    );

    res.json({
      period_days: days,
      total_revenue_halala: totals.total_halala,
      total_revenue_sar: totals.total_halala / 100,
      total_transactions: totals.total_transactions,
      daily: daily.map(d => ({ ...d, revenue_sar: d.revenue_halala / 100 })),
    });
  } catch (error) {
    console.error('Admin revenue error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

// POST /api/admin/payments/:paymentId/refund — Initiate Moyasar refund
router.post('/payments/:paymentId/refund', (req, res) => {
  const { paymentId } = req.params;
  const { amount_halala, reason } = req.body;
  const refundReason = normalizeString(reason, { maxLen: 500 }) || 'Admin-initiated refund';

  const payment = db.get('SELECT * FROM payments WHERE payment_id = ?', paymentId);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  if (payment.status !== 'paid') {
    return res.status(400).json({ error: `Cannot refund payment with status: ${payment.status}` });
  }
  if (payment.refunded_at) {
    return res.status(400).json({ error: 'Payment already refunded' });
  }

  const refundAmount = amount_halala == null
    ? payment.amount_halala
    : toFiniteInt(amount_halala, { min: 1, max: payment.amount_halala });
  if (refundAmount == null) {
    return res.status(400).json({ error: 'amount_halala must be a positive integer' });
  }
  if (refundAmount > payment.amount_halala) {
    return res.status(400).json({ error: 'Refund amount exceeds original payment' });
  }

  // If no Moyasar key, do a manual/internal refund
  const MOYASAR_SECRET = process.env.MOYASAR_SECRET_KEY || '';
  if (!MOYASAR_SECRET || payment.payment_id.startsWith('sandbox-')) {
    const now = new Date().toISOString();
    db.prepare(`UPDATE payments SET status = 'refunded', refunded_at = ?, refund_amount_halala = ? WHERE payment_id = ?`).run(now, refundAmount, paymentId);
    db.prepare(`UPDATE renters SET balance_halala = MAX(0, balance_halala - ?), updated_at = ? WHERE id = ?`).run(refundAmount, now, payment.renter_id);
    return res.json({
      success: true,
      type: 'manual',
      payment_id: paymentId,
      refunded_halala: refundAmount,
      refunded_sar: refundAmount / 100,
      note: refundReason,
    });
  }

  // Call Moyasar refund API
  const https = require('https');
  const auth = Buffer.from(`${MOYASAR_SECRET}:`).toString('base64');
  const bodyStr = JSON.stringify({ amount: refundAmount });
  const options = {
    hostname: 'api.moyasar.com',
    path: `/v1/payments/${paymentId}/refund`,
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    },
  };

  const apiReq = https.request(options, apiRes => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      try {
        const result = JSON.parse(data);
        if (apiRes.statusCode >= 400) {
          return res.status(502).json({ error: 'Moyasar refund failed', details: result });
        }
        const now = new Date().toISOString();
        db.prepare(
          `UPDATE payments SET status = 'refunded', refunded_at = ?, refund_amount_halala = ?, gateway_response = ? WHERE payment_id = ?`,
        ).run(
          now, refundAmount, JSON.stringify(result), paymentId
        );
        db.prepare(
          `UPDATE renters SET balance_halala = MAX(0, balance_halala - ?), updated_at = ? WHERE id = ?`,
        ).run(
          refundAmount, now, payment.renter_id
        );
        res.json({ success: true, type: 'moyasar', payment_id: paymentId, refunded_halala: refundAmount, refunded_sar: refundAmount / 100 });
      } catch {
        res.status(502).json({ error: 'Invalid Moyasar refund response' });
      }
    });
  });
  apiReq.on('error', err => {
    console.error('[admin] Moyasar API unreachable:', err);
    res.status(502).json(safeErrorPayload(err, 'Moyasar API unreachable'));
  });
  apiReq.write(bodyStr);
  apiReq.end();
});

// ============================================================================
// GET /api/admin/escrow — Escrow holds overview (DCP-32)
// ============================================================================
router.get('/escrow', (req, res) => {
  try {
    const { status, provider_id } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND e.status = ?'; params.push(status); }
    if (provider_id) { where += ' AND e.provider_id = ?'; params.push(parseInt(provider_id)); }

    const holds = db.all(
      `SELECT e.id, e.job_id, e.renter_api_key, e.provider_id, e.amount_halala, e.status,
              e.created_at, e.expires_at, e.resolved_at,
              p.name as provider_name,
              r.name as renter_name
       FROM escrow_holds e
       LEFT JOIN providers p ON e.provider_id = p.id
       LEFT JOIN renters r ON r.api_key = e.renter_api_key
       ${where}
       ORDER BY e.created_at DESC LIMIT ?`,
      ...params, limit
    );

    const summary = db.get(
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(CASE WHEN status = 'held' THEN amount_halala END), 0) as held_halala,
         COALESCE(SUM(CASE WHEN status = 'locked' THEN amount_halala END), 0) as locked_halala,
         COALESCE(SUM(CASE WHEN status = 'released_provider' THEN amount_halala END), 0) as released_provider_halala,
         COALESCE(SUM(CASE WHEN status = 'released_renter' THEN amount_halala END), 0) as released_renter_halala,
         COALESCE(SUM(CASE WHEN status = 'expired' THEN amount_halala END), 0) as expired_halala,
         COUNT(CASE WHEN status = 'held' THEN 1 END) as held_count,
         COUNT(CASE WHEN status = 'locked' THEN 1 END) as locked_count
       FROM escrow_holds`
    );

    res.json({
      summary: {
        ...summary,
        held_sar: ((summary.held_halala || 0) / 100).toFixed(2),
        locked_sar: ((summary.locked_halala || 0) / 100).toFixed(2),
        released_provider_sar: ((summary.released_provider_halala || 0) / 100).toFixed(2),
        released_renter_sar: ((summary.released_renter_halala || 0) / 100).toFixed(2),
      },
      holds: holds.map(h => ({
        ...h,
        amount_sar: (h.amount_halala / 100).toFixed(2),
        renter_api_key: h.renter_api_key ? h.renter_api_key.slice(0, 16) + '...' : null,
      }))
    });
  } catch (error) {
    console.error('Admin escrow error:', error);
    res.status(500).json({ error: 'Failed to fetch escrow data' });
  }
});

// ─── GET /api/admin/cleanup/stats ─────────────────────────────────────────────
router.get('/cleanup/stats', (req, res) => {
  try {
    const { getStats } = require('../services/cleanup');
    res.json(getStats());
  } catch (error) {
    console.error('Admin cleanup stats error:', error);
    res.status(500).json({ error: 'Failed to fetch cleanup stats' });
  }
});

// ─── GET /api/admin/escrow-chain/status (DCP-75) ──────────────────────────────
// Returns on-chain escrow service status: contract address, network, oracle address, isEnabled
router.get('/escrow-chain/status', async (req, res) => {
  try {
    const { getChainEscrow } = require('../services/escrow-chain');
    const status = await getChainEscrow().getStatus();
    res.json(status);
  } catch (error) {
    console.error('Admin escrow-chain status error:', error);
    res.status(500).json({ error: 'Failed to fetch escrow-chain status' });
  }
});

// ─── GET /api/admin/export/jobs — CSV/JSON export for Budget Analyst (DCP-898) ──
// Query params:
//   from     ISO date — filter jobs created_at >= this value
//   to       ISO date — filter jobs created_at <= this value
//   format   "csv" (default) or "json"
//
// Token columns (input_tokens, output_tokens) are sourced from serve_sessions
// where available. The platform does not yet split tokens into input/output;
// input_tokens carries the aggregate total from serve_sessions, output_tokens is 0.
router.get('/export/jobs', requireAdminAuth, (req, res) => {
  try {
    const { from, to, format = 'csv' } = req.query;

    const params = [];
    let where = '1=1';
    if (from && !isNaN(Date.parse(from))) {
      where += ' AND j.created_at >= ?';
      params.push(new Date(from).toISOString());
    }
    if (to && !isNaN(Date.parse(to))) {
      where += ' AND j.created_at <= ?';
      params.push(new Date(to).toISOString());
    }

    const rows = db.all(
      `SELECT
         j.job_id,
         j.renter_id,
         j.provider_id,
         j.template_id,
         j.status,
         j.started_at,
         j.completed_at,
         COALESCE(ss.total_tokens, 0) AS input_tokens,
         0                            AS output_tokens,
         j.cost_halala
       FROM jobs j
       LEFT JOIN serve_sessions ss ON ss.job_id = j.job_id
       WHERE ${where}
       ORDER BY j.created_at ASC`,
      ...params
    );

    if (format === 'json') {
      return res.json({ count: rows.length, jobs: rows });
    }

    const CSV_COLS = ['job_id','renter_id','provider_id','template_id','status',
                      'started_at','completed_at','input_tokens','output_tokens','cost_halala'];
    const escape = (v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [CSV_COLS.join(',')];
    for (const row of rows) {
      lines.push(CSV_COLS.map(c => escape(row[c])).join(','));
    }
    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="dcp-jobs-export.csv"');
    return res.send(csv);
  } catch (error) {
    console.error('[admin/export/jobs] Error:', error);
    res.status(500).json({ error: 'Failed to export jobs' });
  }
});

// ─── GET /api/admin/serve-sessions/:job_id (DCP-619) ────────────────────────────
// Returns serve_sessions record for a given job_id (used by metering smoke test)
router.get('/serve-sessions/:job_id', (req, res) => {
  try {
    const { job_id } = req.params;
    const session = db.get(
      'SELECT id, job_id, model, total_inferences, total_tokens, total_billed_halala, last_inference_at FROM serve_sessions WHERE job_id = ?',
      job_id
    );
    if (!session) {
      return res.status(404).json({ error: 'Serve session not found' });
    }
    res.json({ serve_session: session });
  } catch (error) {
    console.error('Admin serve-sessions query error:', error);
    res.status(500).json({ error: 'Failed to fetch serve-sessions' });
  }
});

// ─── GET /api/admin/billing/summary — DCP-911 ─────────────────────────────────
// Aggregated billing summary from billing_records. Returns totals + 30-day daily.
router.get('/billing/summary', (req, res) => {
  try {
    const allTime = db.get(`
      SELECT COUNT(*) as total_jobs,
             COALESCE(SUM(gross_cost_halala), 0) as total_gross_halala,
             COALESCE(SUM(platform_fee_halala), 0) as total_platform_fees_halala,
             COALESCE(SUM(provider_earning_halala), 0) as total_provider_earnings_halala
      FROM billing_records
    `) || {};

    const byStatus = db.all(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(gross_cost_halala), 0) as gross_halala
      FROM billing_records GROUP BY status
    `) || [];

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const daily = db.all(`
      SELECT DATE(created_at) as day,
             COUNT(*) as total_jobs,
             COALESCE(SUM(gross_cost_halala), 0) as gross_halala,
             COALESCE(SUM(platform_fee_halala), 0) as platform_fees_halala,
             COALESCE(SUM(provider_earning_halala), 0) as provider_earnings_halala
      FROM billing_records
      WHERE created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY day DESC
    `, thirtyDaysAgo) || [];

    return res.json({
      all_time: {
        total_jobs: allTime.total_jobs || 0,
        total_gross_halala: allTime.total_gross_halala || 0,
        total_gross_sar: (allTime.total_gross_halala || 0) / 100,
        total_platform_fees_halala: allTime.total_platform_fees_halala || 0,
        total_platform_fees_sar: (allTime.total_platform_fees_halala || 0) / 100,
        total_provider_earnings_halala: allTime.total_provider_earnings_halala || 0,
        total_provider_earnings_sar: (allTime.total_provider_earnings_halala || 0) / 100,
        platform_fee_rate: 0.15,
      },
      by_status: byStatus,
      last_30_days: daily,
    });
  } catch (error) {
    console.error('[admin/billing/summary]', error);
    return res.status(500).json({ error: 'Failed to fetch billing summary' });
  }
});

// ─── GET /api/admin/revenue/summary — DCP-917 ──────────────────────────────
// All-time platform revenue totals + 30-day daily + top providers + top models
// Uses jobs table instead of billing_records (billing_records table not present in SQLite)

router.get('/revenue/summary', (req, res) => {
  try {
    const allTime = db.get(`
      SELECT
        COUNT(*)                                            AS total_jobs,
        COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala, 0)), 0) AS total_gross_halala,
        COALESCE(SUM(COALESCE(dc1_fee_halala, 0)), 0)      AS total_platform_fees_halala,
        COALESCE(SUM(COALESCE(provider_earned_halala, 0)), 0) AS total_provider_earnings_halala
      FROM jobs
      WHERE status = 'completed'
    `);

    const daily = db.all(`
      SELECT
        DATE(completed_at) AS date,
        COUNT(*)                                                          AS jobs,
        COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala, 0)), 0)  AS gross_halala,
        COALESCE(SUM(COALESCE(dc1_fee_halala, 0)), 0)                  AS platform_fee_halala,
        COALESCE(SUM(COALESCE(provider_earned_halala, 0)), 0)          AS provider_earning_halala
      FROM jobs
      WHERE status = 'completed' AND completed_at >= DATE('now', '-30 days')
      GROUP BY DATE(completed_at)
      ORDER BY date DESC
    `);

    const topProviders = db.all(`
      SELECT
        j.provider_id,
        p.name AS provider_name,
        COUNT(*) AS jobs,
        COALESCE(SUM(COALESCE(j.provider_earned_halala, 0)), 0) AS total_earning_halala
      FROM jobs j
      LEFT JOIN providers p ON p.id = j.provider_id
      WHERE j.status = 'completed'
      GROUP BY j.provider_id
      ORDER BY total_earning_halala DESC
      LIMIT 5
    `);

    const topModels = db.all(`
      SELECT
        model,
        COUNT(*) AS jobs,
        COALESCE(SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)), 0) AS total_tokens,
        COALESCE(SUM(COALESCE(actual_cost_halala, cost_halala, 0)), 0) AS gross_halala
      FROM jobs
      WHERE status = 'completed' AND model IS NOT NULL
      GROUP BY model
      ORDER BY total_tokens DESC
      LIMIT 5
    `);

    return res.json({
      all_time: {
        total_jobs:                      allTime.total_jobs || 0,
        total_gross_halala:              allTime.total_gross_halala || 0,
        total_gross_sar:                 (allTime.total_gross_halala || 0) / 100,
        total_platform_fees_halala:      allTime.total_platform_fees_halala || 0,
        total_platform_fees_sar:         (allTime.total_platform_fees_halala || 0) / 100,
        total_provider_earnings_halala: allTime.total_provider_earnings_halala || 0,
        total_provider_earnings_sar:     (allTime.total_provider_earnings_halala || 0) / 100,
        platform_fee_rate:               0.15,
      },
      top_providers: topProviders,
      top_models:    topModels,
      last_30_days:  daily,
    });
  } catch (error) {
    console.error('[admin/revenue/summary]', error);
    return res.status(500).json({ error: 'Failed to fetch revenue summary' });
  }
});

// ─── GET /api/admin/errors — DCP-1015 ─────────────────────────────────────────
// Returns recent error events from daemon_events + job errors for admin dashboard
router.get('/errors', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);

    const daemonErrors = db.all(`
      SELECT
        e.id,
        e.event_type  AS message,
        e.severity,
        e.daemon_version,
        e.hostname,
        e.os_info,
        e.details,
        e.event_timestamp AS created_at,
        'daemon_event'    AS source
      FROM daemon_events e
      WHERE e.severity IN ('error', 'critical')
         OR e.event_type LIKE '%error%'
         OR e.event_type LIKE '%fail%'
      ORDER BY e.event_timestamp DESC
      LIMIT ?
    `, limit);

    const jobErrors = db.all(`
      SELECT
        j.id,
        COALESCE(j.error, j.last_error, 'Unknown error') AS message,
        'error'                                          AS severity,
        NULL                                            AS daemon_version,
        p.provider_hostname                              AS hostname,
        NULL                                            AS os_info,
        NULL                                            AS details,
        COALESCE(j.completed_at, j.updated_at, j.created_at) AS created_at,
        'job'                                           AS source
      FROM jobs j
      LEFT JOIN providers p ON p.id = j.provider_id
      WHERE j.status = 'failed'
         OR j.error IS NOT NULL
         OR j.last_error IS NOT NULL
      ORDER BY COALESCE(j.completed_at, j.updated_at, j.created_at) DESC
      LIMIT ?
    `, limit);

    const combined = [...daemonErrors, ...jobErrors]
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      })
      .slice(0, limit);

    return res.json({ errors: combined });
  } catch (error) {
    console.error('[admin/errors]', error);
    return res.status(500).json({ error: 'Failed to fetch errors' });
  }
});

// ── GET /api/admin/demand — per-model demand dashboard (Mesh-LLM) ───────────
// Reads the in-memory 5-min sliding window demand counters from the v1 router.
// Lazy-loaded to avoid circular-require at module init time.
let _v1DemandFn = null;
router.get('/demand', (req, res) => {
  try {
    if (!_v1DemandFn) {
      const v1Router = require('./v1');
      _v1DemandFn = typeof v1Router.getAllDemand === 'function' ? v1Router.getAllDemand : null;
    }
    if (!_v1DemandFn) {
      return res.json({ error: 'Demand tracking not available', demand: {} });
    }
    return res.json({ demand: _v1DemandFn() });
  } catch (error) {
    console.error('[admin/demand]', error);
    return res.status(500).json({ error: 'Failed to fetch demand data' });
  }
});

// ── GET /api/admin/provider-logs — list all providers with uploaded logs ──────
router.get('/provider-logs', (req, res) => {
  const baseDir = path.join(__dirname, '..', 'data', 'provider-logs');
  if (!fs.existsSync(baseDir)) return res.json({ providers: [], count: 0 });
  try {
    const providers = fs.readdirSync(baseDir).filter(d =>
      fs.statSync(path.join(baseDir, d)).isDirectory()
    );
    res.json({ providers, count: providers.length });
  } catch (error) {
    console.error('[admin/provider-logs]', error);
    res.status(500).json({ error: 'Failed to list provider logs' });
  }
});

// ── GET /api/admin/provider-logs/:id — read a provider's install logs ────────
router.get('/provider-logs/:id', (req, res) => {
  const logDir = path.join(__dirname, '..', 'data', 'provider-logs', req.params.id);
  if (!fs.existsSync(logDir)) {
    return res.status(404).json({ error: 'No logs for this provider' });
  }
  try {
    const files = fs.readdirSync(logDir).sort().reverse();
    const logs = {};
    for (const file of files.slice(0, 20)) {
      try {
        logs[file] = fs.readFileSync(path.join(logDir, file), 'utf8');
      } catch { /* skip unreadable files */ }
    }
    res.json({ provider_id: req.params.id, files: files.length, logs });
  } catch (error) {
    console.error('[admin/provider-logs/:id]', error);
    res.status(500).json({ error: 'Failed to read provider logs' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// COMPUTE / POD / BURST / VOLUME admin surface (DCP — internal command center).
//
// These endpoints exist ONLY on the gated admin console (requireAdminRbac, see
// router.use above). They reuse the renter-facing pod/volume logic so the money
// math + teardown stay in lock-step with the live renter paths.
//
// INVISIBILITY: this console is internal, so it MAY surface "burst"/"on-demand"
// pods and the external pod id for management — but it NEVER prints the literal
// GPU-vendor brand name. Burst rows are labelled generically ("burst").
// ════════════════════════════════════════════════════════════════════════════

// Lazy-require so the pod/volume modules (which require each other) finish
// loading before admin.js touches their exports. Cached after first call.
let _podsModule = null;
function podsModule() {
  if (!_podsModule) _podsModule = require('./pods');
  return _podsModule;
}
let _volumesModule = null;
function volumesModule() {
  if (!_volumesModule) _volumesModule = require('./volumes');
  return _volumesModule;
}
let _volumeStore = null;
function volumeStore() {
  if (!_volumeStore) _volumeStore = require('../lib/volume-store');
  return _volumeStore;
}

// Pod statuses considered "live" (a pod is occupying a GPU / costing money).
const LIVE_POD_STATUSES = ['pending', 'queued', 'assigned', 'pulling', 'running'];

// Convert a per-GPU-second halala rate to a derived SAR/hour figure.
function ratePerSecToSarPerHour(costPerGpuSecondHalala) {
  const rate = Number(costPerGpuSecondHalala);
  if (!Number.isFinite(rate) || rate < 0) return null;
  return Number(((rate * 3600) / 100).toFixed(2));
}

// Shape one interactive-pod job row (joined to its provider) into the admin
// pod view. Internal/gated, so it carries the full management surface the
// renter view deliberately hides: renter id+name, provider rate, relay ports,
// burst flag + external id — but still no vendor brand name.
function toAdminPodView(row) {
  const startedMs = row.started_at ? Date.parse(row.started_at) : null;
  const maxSeconds = Number(row.max_duration_seconds) || 0;
  const endsAt = (startedMs && maxSeconds)
    ? new Date(startedMs + maxSeconds * 1000).toISOString()
    : null;
  const secondsRemaining = (startedMs && maxSeconds)
    ? Math.max(0, Math.round((startedMs + maxSeconds * 1000 - Date.now()) / 1000))
    : null;
  const isBurst = Number(row.provider_is_burst || 0) === 1 || !!row.burst_external_id;
  return {
    id: row.job_id,
    status: row.status,
    gpu_type: row.provider_gpu_type || null,        // GPU TYPE only (e.g. "NVIDIA H100 80GB")
    gpu_model: row.provider_gpu_type || null,        // alias, same value
    provider_id: row.provider_id,                    // internal/gated — fine to surface
    renter_id: row.renter_id,
    renter_name: row.renter_name || null,
    access_url: row.access_url || null,              // Jupyter
    ssh_command: row.ssh_command || null,
    pod_jpub: row.pod_jpub != null ? Number(row.pod_jpub) : null,   // public Jupyter relay port
    pod_spub: row.pod_spub != null ? Number(row.pod_spub) : null,   // public SSH relay port
    started_at: row.started_at || null,
    ends_at: endsAt,
    seconds_remaining: secondsRemaining,
    is_burst: isBurst,
    burst_external_id: row.burst_external_id || null,  // external pod id for management
    source: isBurst ? 'burst' : 'on-demand',           // generic label — NEVER a vendor brand
    rate_halala_per_gpu_second: row.provider_rate != null ? Number(row.provider_rate) : null,
    rate_sar_per_hour: ratePerSecToSarPerHour(row.provider_rate),
    cost_halala: row.cost_halala != null ? Number(row.cost_halala) : null,      // prepaid quote
    charged_halala: row.actual_cost_halala != null ? Number(row.actual_cost_halala) : null,
    duration_minutes: row.duration_minutes != null ? Number(row.duration_minutes) : null,
    created_at: row.created_at || null,
  };
}

// Fetch one interactive-pod job (by job_id or numeric id) joined to provider +
// renter, with the admin-relevant columns aliased. Returns null if not found.
function fetchAdminPodRow(id) {
  return db.get(
    `SELECT j.*,
            p.gpu_model AS provider_gpu_type,
            p.cost_per_gpu_second_halala AS provider_rate,
            COALESCE(p.is_burst, 0) AS provider_is_burst,
            r.name AS renter_name
       FROM jobs j
  LEFT JOIN providers p ON p.id = j.provider_id
  LEFT JOIN renters r ON r.id = j.renter_id
      WHERE (j.job_id = ? OR j.id = ?) AND j.job_type = 'interactive_pod'`,
    id, id
  );
}

// ── GET /api/admin/pods — interactive pods (live by default, ?all=1 for recent)
// Query: ?all=1 include recently-terminated, ?limit=N (default live=200, all=100)
router.get('/pods', (req, res) => {
  try {
    const includeAll = parseBooleanLike(req.query.all, false);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || (includeAll ? 100 : 200), 1), 500);

    let where = `j.job_type = 'interactive_pod'`;
    if (!includeAll) {
      where += ` AND j.status IN (${LIVE_POD_STATUSES.map(() => '?').join(',')})`;
    }
    const params = includeAll ? [] : [...LIVE_POD_STATUSES];

    const rows = db.all(
      `SELECT j.*,
              p.gpu_model AS provider_gpu_type,
              p.cost_per_gpu_second_halala AS provider_rate,
              COALESCE(p.is_burst, 0) AS provider_is_burst,
              r.name AS renter_name
         FROM jobs j
    LEFT JOIN providers p ON p.id = j.provider_id
    LEFT JOIN renters r ON r.id = j.renter_id
        WHERE ${where}
        ORDER BY j.created_at DESC
        LIMIT ?`,
      ...params, limit
    );

    const pods = rows.map(toAdminPodView);
    const live = pods.filter((p) => LIVE_POD_STATUSES.includes(p.status)).length;
    return res.json({
      total: pods.length,
      live,
      burst: pods.filter((p) => p.is_burst).length,
      include_terminated: includeAll,
      pods,
    });
  } catch (error) {
    console.error('[admin/pods] list error:', error.message);
    return res.status(500).json({ error: 'Failed to list pods' });
  }
});

// ── POST /api/admin/pods/:id/stop — admin force-stop + settle a pod ──────────
router.post('/pods/:id/stop', (req, res) => {
  try {
    const job = fetchAdminPodRow(req.params.id);
    if (!job) return res.status(404).json({ error: 'Pod not found' });

    const result = podsModule().stopPodCore(job, { actorLabel: `Admin ${req.adminUser?.id || 'unknown'}` });
    try {
      db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)')
        .run('pod_stopped', 'pod', String(job.job_id),
          `Admin stopped pod ${job.job_id} (renter ${job.renter_id})`, new Date().toISOString());
    } catch (_) { /* audit best-effort */ }

    if (result.idempotent) {
      return res.json({ id: result.id, status: result.status, already_terminal: true });
    }
    const { idempotent: _ignored, ...payload } = result;
    return res.json(payload);
  } catch (error) {
    console.error('[admin/pods] stop error:', error.message);
    return res.status(500).json({ error: 'Failed to stop pod' });
  }
});

// ── POST /api/admin/pods/:id/extend — admin extend a running pod ─────────────
// Body: { extend_minutes }. Charges the SAME renter who owns the pod.
router.post('/pods/:id/extend', (req, res) => {
  try {
    const pods = podsModule();
    const MIN = pods.MIN_DURATION_MINUTES;
    const MAX = pods.MAX_DURATION_MINUTES;
    const raw = Number(req.body && req.body.extend_minutes);
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < MIN || raw > MAX) {
      return res.status(400).json({ error: `extend_minutes must be an integer between ${MIN} and ${MAX}`, code: 'INVALID_EXTEND' });
    }

    const job = fetchAdminPodRow(req.params.id);
    if (!job) return res.status(404).json({ error: 'Pod not found' });

    const result = pods.extendPodCore(job, raw, { actorLabel: `Admin ${req.adminUser?.id || 'unknown'}` });
    if (result.error) {
      const body = result.payload || { error: result.error, code: result.code };
      return res.status(result.httpStatus || 400).json(body);
    }
    try {
      db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)')
        .run('pod_extended', 'pod', String(job.job_id),
          `Admin extended pod ${job.job_id} by ${raw}m (charged renter ${job.renter_id} ${result.charged_halala} halala)`, new Date().toISOString());
    } catch (_) { /* audit best-effort */ }
    return res.json(result);
  } catch (error) {
    console.error('[admin/pods] extend error:', error.message);
    return res.status(500).json({ error: 'Failed to extend pod' });
  }
});

// ── GET /api/admin/burst-catalog — the burst (on-demand) GPU type rows ───────
// is_burst=1 providers are synthetic GPU-TYPE rows brokered on an external
// cloud. INVISIBILITY: surfaced as generic "burst" types — no vendor brand.
router.get('/burst-catalog', (req, res) => {
  try {
    const rows = db.all(
      `SELECT id, name, gpu_model, vram_gb, gpu_count,
              burst_gpu_type_id, stock_available,
              COALESCE(is_paused, 0) AS is_paused, status,
              cost_per_gpu_second_halala
         FROM providers
        WHERE COALESCE(is_burst, 0) = 1
        ORDER BY cost_per_gpu_second_halala ASC`
    );
    const catalog = rows.map((r) => ({
      id: r.id,
      burst_gpu_type_id: r.burst_gpu_type_id || null,
      gpu_model: r.gpu_model || r.name || null,
      vram_gb: r.vram_gb != null ? Number(r.vram_gb) : null,
      gpu_count: r.gpu_count != null ? Number(r.gpu_count) : 1,
      stock_available: r.stock_available != null ? Number(r.stock_available) : 0,
      is_paused: Number(r.is_paused) === 1,
      status: r.status || null,
      cost_per_gpu_second_halala: r.cost_per_gpu_second_halala != null ? Number(r.cost_per_gpu_second_halala) : null,
      sar_per_hour: ratePerSecToSarPerHour(r.cost_per_gpu_second_halala),
      source: 'burst',
    }));
    return res.json({
      total: catalog.length,
      available: catalog.filter((c) => !c.is_paused && c.stock_available > 0).length,
      paused: catalog.filter((c) => c.is_paused).length,
      catalog,
    });
  } catch (error) {
    console.error('[admin/burst-catalog] error:', error.message);
    return res.status(500).json({ error: 'Failed to load burst catalog' });
  }
});

// ── PATCH /api/admin/burst-catalog/:id — pause/unpause or set stock ──────────
// Body: { is_paused?: boolean, stock_available?: integer >= 0 }
router.patch('/burst-catalog/:id', (req, res) => {
  try {
    const row = db.get(
      `SELECT id, gpu_model, name, COALESCE(is_paused, 0) AS is_paused, stock_available
         FROM providers WHERE id = ? AND COALESCE(is_burst, 0) = 1`,
      req.params.id
    );
    if (!row) return res.status(404).json({ error: 'Burst GPU type not found' });

    const body = req.body || {};
    const sets = [];
    const params = [];
    let changedPaused = null;
    let changedStock = null;

    if (Object.prototype.hasOwnProperty.call(body, 'is_paused')) {
      const paused = parseBooleanLike(body.is_paused, null);
      if (paused === null) return res.status(400).json({ error: 'is_paused must be a boolean' });
      sets.push('is_paused = ?');
      params.push(paused ? 1 : 0);
      changedPaused = paused;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'stock_available')) {
      const stock = Number(body.stock_available);
      if (!Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ error: 'stock_available must be an integer >= 0' });
      }
      sets.push('stock_available = ?');
      params.push(stock);
      changedStock = stock;
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: 'Provide is_paused and/or stock_available' });
    }

    const now = new Date().toISOString();
    sets.push('updated_at = ?');
    params.push(now, row.id);
    db.prepare(`UPDATE providers SET ${sets.join(', ')} WHERE id = ?`).run(...params);

    try {
      db.prepare('INSERT INTO admin_audit_log (action, target_type, target_id, details, timestamp) VALUES (?,?,?,?,?)')
        .run('burst_catalog_updated', 'provider', String(row.id),
          `Admin updated burst type ${row.id}` +
          (changedPaused !== null ? ` is_paused=${changedPaused}` : '') +
          (changedStock !== null ? ` stock=${changedStock}` : ''), now);
    } catch (_) { /* audit best-effort */ }

    const updated = db.get(
      `SELECT id, gpu_model, name, vram_gb, burst_gpu_type_id, stock_available,
              COALESCE(is_paused, 0) AS is_paused, status, cost_per_gpu_second_halala
         FROM providers WHERE id = ?`,
      row.id
    );
    return res.json({
      success: true,
      gpu_type: {
        id: updated.id,
        burst_gpu_type_id: updated.burst_gpu_type_id || null,
        gpu_model: updated.gpu_model || updated.name || null,
        vram_gb: updated.vram_gb != null ? Number(updated.vram_gb) : null,
        stock_available: Number(updated.stock_available) || 0,
        is_paused: Number(updated.is_paused) === 1,
        status: updated.status || null,
        cost_per_gpu_second_halala: updated.cost_per_gpu_second_halala != null ? Number(updated.cost_per_gpu_second_halala) : null,
        sar_per_hour: ratePerSecToSarPerHour(updated.cost_per_gpu_second_halala),
        source: 'burst',
      },
      updated_at: now,
    });
  } catch (error) {
    console.error('[admin/burst-catalog PATCH] error:', error.message);
    return res.status(500).json({ error: 'Failed to update burst GPU type' });
  }
});

// ── GET /api/admin/volumes — all renter volumes + pool utilization ───────────
router.get('/volumes', (req, res) => {
  try {
    const statusFilter = (req.query.status || '').trim();
    let where = '1=1';
    const params = [];
    if (statusFilter) { where += ' AND v.status = ?'; params.push(statusFilter); }

    const rows = db.all(
      `SELECT v.*, r.name AS renter_name, r.email AS renter_email
         FROM renter_volumes v
    LEFT JOIN renters r ON r.id = v.renter_id
        WHERE ${where}
        ORDER BY v.id DESC`,
      ...params
    );

    const store = volumeStore();
    const volumes = rows.map((v) => {
      // Live usage is only meaningful for active volumes (the bucket still exists).
      let usedGb = null;
      if (v.status === 'active') {
        try {
          const usedBytes = store.volumeUsedBytes(v.renter_id);
          usedGb = Number((usedBytes / 1073741824).toFixed(3));
        } catch (_) { usedGb = null; }
      }
      return {
        id: v.id,
        renter_id: v.renter_id,
        renter_name: v.renter_name || null,
        renter_email: v.renter_email || null,
        size_gb: Number(v.size_gb) || 0,
        used_gb: usedGb,
        used_pct: (usedGb != null && v.size_gb > 0) ? Math.min(100, Math.round((usedGb / v.size_gb) * 100)) : null,
        status: v.status,
        bucket: v.bucket || null,
        price_halala_per_month: Number(v.price_halala_per_month) || 0,
        price_sar_per_month: Number(((Number(v.price_halala_per_month) || 0) / 100).toFixed(2)),
        rented_at: v.rented_at || null,
        current_period_end: v.current_period_end || null,
        released_at: v.released_at || null,
      };
    });

    // Pool utilization — same ceiling the rent path enforces.
    const vols = volumesModule();
    const POOL_CEILING_GB = 100;
    const activeGbRow = db.get(`SELECT COALESCE(SUM(size_gb), 0) AS gb FROM renter_volumes WHERE status = 'active'`);
    const activePoolGb = Number(activeGbRow && activeGbRow.gb) || 0;

    return res.json({
      total: volumes.length,
      active: volumes.filter((v) => v.status === 'active').length,
      pool: {
        ceiling_gb: POOL_CEILING_GB,
        active_gb: activePoolGb,
        available_gb: Math.max(0, POOL_CEILING_GB - activePoolGb),
        utilization_pct: Math.min(100, Math.round((activePoolGb / POOL_CEILING_GB) * 100)),
      },
      halala_per_gb_month: vols && vols.HALALA_PER_GB_MONTH != null ? vols.HALALA_PER_GB_MONTH : null,
      volumes,
    });
  } catch (error) {
    console.error('[admin/volumes] error:', error.message);
    return res.status(500).json({ error: 'Failed to list volumes' });
  }
});

module.exports = router;
