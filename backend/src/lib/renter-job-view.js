'use strict';

// Strict renter-facing job/pod view.
//
// INVISIBILITY (non-negotiable): the DCP "burst" path may launch a GPU on an
// external cloud that the renter must NEVER see. No renter-facing response may
// reveal the vendor or internal infra. This module is the single FIELD
// ALLOWLIST that both /api/jobs/:id and /api/jobs/active flow through so the
// shape cannot drift back to `SELECT * -> res.json`.
//
// NEVER expose (these can embed an external pod id / vendor host / secret):
//   burst_external_id, pod_jpub, pod_spub, pod_wg_mesh_ip, endpoint_url,
//   task_spec, task_spec_hmac, container_spec, container_id, jupyter_host_port,
//   ssh_host_port, workspace_volume_name, raw error / last_error.
// Only api.dcp.sa-pointing fields (access_url, ssh_command) are allowed.

// A job is "burst-backed" when it carries an external pod id. For these we must
// be extra careful and never surface a raw error string (it can embed the
// external id / vendor host); we collapse it to a generic message.
function isBurstBacked(job) {
  return Boolean(job && job.burst_external_id);
}

// Collapse any raw error to a generic, vendor-free message. For burst jobs we
// ALWAYS scrub (the raw text can embed an external pod id or proxy host). For
// native jobs we still strip anything that looks like a URL/host/IP so an
// internal endpoint can never ride out in an error string.
// Known on-demand-partner / external-cloud identity tokens that must NEVER ride
// out in any error string, even on the internal admin console. Closes the
// failed-launch gap: a burst launch that errors BEFORE provisioning has no
// burst_external_id (so isBurstBacked() is false), yet the raw provisioning-API
// error can still embed the vendor name or a datacenter code.
const VENDOR_LEAK_RE = /\b(runpod|vast\.?ai|lambda\s*labs|coreweave|paperspace|tensordock|latitude\.sh|fluidstack)\b|\b(?:EU|US|AS|EUR|USA|AP|CA)-[A-Z]{2,3}-\d\b|gpuTypeId|dataCenters?|secure\s*cloud|graphql\s*error/i;

function hasVendorLeak(text) {
  return VENDOR_LEAK_RE.test(String(text == null ? '' : text));
}

// Targeted redaction for INTERNAL/admin surfaces: keep the operator-useful
// message but replace any external-cloud identity with a neutral marker, so the
// admin console shows WHAT failed without ever printing the vendor.
function redactVendorText(text) {
  if (text == null) return text;
  let s = String(text);
  s = s.replace(/\b(runpod|vast\.?ai|lambda\s*labs|coreweave|paperspace|tensordock|latitude\.sh|fluidstack)\b/gi, 'on-demand partner');
  s = s.replace(/\b(?:EU|US|AS|EUR|USA|AP|CA)-[A-Z]{2,3}-\d\b/g, '[dc]');
  s = s.replace(/\bgraphql\b/gi, 'provisioning-API');
  s = s.replace(/https?:\/\/\S+/gi, '[url]');
  s = s.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]');
  return s;
}

function sanitizeError(job) {
  const raw = job && (job.error || job.last_error);
  if (!raw) return null;
  if (isBurstBacked(job)) {
    return 'The on-demand GPU could not be provisioned. No charge was applied for failed launches.';
  }
  const text = String(raw);
  // Failed burst launches have no external id yet but can still embed a vendor
  // name / datacenter code / provisioning-API error - collapse those too.
  if (hasVendorLeak(text)) {
    return 'The on-demand GPU could not be provisioned. No charge was applied for failed launches.';
  }
  // Redact obvious infra leaks (schemes, IPv4, host:port) from native errors.
  const looksLikeInfra = /(https?:\/\/|\b\d{1,3}(?:\.\d{1,3}){3}\b|:\d{2,5}\b|proxy|tunnel|\.runpod\.|\.proxy\.)/i.test(text);
  if (looksLikeInfra) {
    return 'The job failed due to an infrastructure error. Please retry or contact support.';
  }
  return text;
}

// Map raw halala (USD x 100,000 in this codebase's legacy naming) to USD, or
// pass a halalaToUsd fn from the caller if it has one. We keep cost fields
// renter-relevant only.
function pickCostFields(job, opts = {}) {
  const halalaToUsd = typeof opts.halalaToUsd === 'function' ? opts.halalaToUsd : null;
  const out = {
    cost_halala: job.cost_halala ?? null,
    actual_cost_halala: job.actual_cost_halala ?? null,
    quote_halala: job.cost_halala ?? null, // alias for the up-front quote
  };
  if (halalaToUsd) {
    out.cost_usd = halalaToUsd(job.actual_cost_halala ?? job.cost_halala ?? null);
  }
  return out;
}

// Derive a safe gpu_model / vram for the renter. The jobs table has no
// gpu_model column, so the caller may pass a resolved { gpu_model, vram_gb }
// from the provider row (gpu_model is a GPU TYPE string like
// "NVIDIA GeForce RTX 3090" — safe; machine NAME is never used).
function pickGpu(job, resolvedGpu = {}) {
  const gpuModel = resolvedGpu.gpu_model || job.gpu_model || null;
  const vram = resolvedGpu.vram_gb != null
    ? resolvedGpu.vram_gb
    : (job.vram_gb != null ? job.vram_gb : null);
  return { gpu_model: gpuModel, vram: vram };
}

// The one true renter-facing job shape. Anything not listed here is dropped.
// `opts`:
//   - halalaToUsd: (halala|null) => number|null  (optional cost converter)
//   - gpu: { gpu_model, vram_gb }                (optional resolved gpu info)
//   - extra: object                              (optional already-safe fields
//        the caller computed, e.g. queue_position, elapsed_sec — caller is
//        responsible for these being renter-safe)
function toRenterJobView(job, opts = {}) {
  if (!job) return null;
  const gpu = pickGpu(job, opts.gpu || {});
  const view = {
    job_id: job.job_id,
    status: job.status,
    job_type: job.job_type || null,
    gpu_model: gpu.gpu_model,
    vram: gpu.vram,
    // api.dcp.sa-only handles (never an external host)
    access_url: job.access_url || null,
    ssh_command: job.ssh_command || null,
    // lifecycle timestamps
    created_at: job.created_at || job.submitted_at || null,
    started_at: job.started_at || null,
    completed_at: job.completed_at || null,
    duration_minutes: job.duration_minutes ?? null,
    progress_phase: job.progress_phase || null,
    // billing (renter-relevant only)
    ...pickCostFields(job, opts),
    refunded_at: job.refunded_at || null,
    // generic, vendor-free error
    error: sanitizeError(job),
  };
  if (opts.extra && typeof opts.extra === 'object') {
    for (const [k, v] of Object.entries(opts.extra)) {
      // never let extra reintroduce a banned key
      if (BANNED_KEYS.has(k)) continue;
      view[k] = v;
    }
  }
  return view;
}

// Defensive denylist used to assert in tests / guard `extra`.
const BANNED_KEYS = new Set([
  'burst_external_id',
  'pod_jpub',
  'pod_spub',
  'pod_wg_mesh_ip',
  'endpoint_url',
  'task_spec',
  'task_spec_hmac',
  'container_spec',
  'container_id',
  'jupyter_host_port',
  'ssh_host_port',
  'workspace_volume_name',
  'last_error',
  'gpu_rate_snapshot',
  // provider-row infra identifiers a renter must NEVER see
  'name',                 // providers.name = MACHINE/HOST name ("peter-macbook", "Tareq Node 2")
  'provider_name',        // SELECT alias of providers.name
  'peer_id',
  'p2p_peer_id',
  'provider_id',
  'wg_mesh_ip',
  'vllm_endpoint_url',
  'addrs',                // libp2p multiaddrs embed raw IPs
  'multiaddrs',
]);

// ── Renter-facing PROVIDER view ────────────────────────────────────────────
//
// THE RULE: a renter may see ONLY the GPU TYPE, VRAM, availability, and
// renter-relevant compute metadata. They must NEVER see which physical machine
// (providers.name), peer id, provider id, mesh IP, vendor endpoint, or raw
// network address backs that GPU. This is the SINGLE allowlist that every
// renter-facing provider serializer flows through so the shape cannot drift
// back to leaking a host name / peer id.
//
// `id`/`provider_id`/`peer_id`/`name`/`addrs` are intentionally NOT in the
// output. `id` is dropped because the numeric provider id is itself an internal
// identifier the renter has no use for (they rent a GPU TYPE, not a node).
const PROVIDER_ALLOWLIST = [
  'gpu_model',
  'vram_gb',
  'vram_mib',
  'gpu_count',
  'compute_capability',
  'cuda_version',
  'status',
  'is_live',
  'available',
  'on_demand',
  'location',
  'reliability_score',
  'cached_models',
  'discovery_source',
  'discovered_at',
  'stale',
];

// Map an internal provider "shape" (or raw row) to the strict renter view.
// Anything not on PROVIDER_ALLOWLIST is dropped — so `name`, `peer_id`,
// `p2p_peer_id`, `id`/`provider_id`, `wg_mesh_ip`, `vllm_endpoint_url`,
// `addrs`, `driver_version`, etc. can never ride out, even if a caller adds a
// new field upstream.
function toRenterProviderView(shape) {
  if (!shape) return null;
  const out = {};
  for (const key of PROVIDER_ALLOWLIST) {
    if (shape[key] !== undefined) out[key] = shape[key];
  }
  return out;
}

module.exports = {
  toRenterJobView,
  toRenterProviderView,
  sanitizeError,
  isBurstBacked,
  redactVendorText,
  hasVendorLeak,
  BANNED_KEYS,
  PROVIDER_ALLOWLIST,
};
