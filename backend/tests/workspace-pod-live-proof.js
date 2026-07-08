#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'workspace-pod-live-proof';

function nowIso() {
  return new Date().toISOString();
}

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactSecret(secret) {
  if (!secret || typeof secret !== 'string') return null;
  return secret.length <= 12 ? `${secret.slice(0, 4)}...` : `${secret.slice(0, 8)}...${secret.slice(-4)}`;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || process.env.DCP_API_BASE_URL || process.env.DCP_BASE_URL || process.env.DCP_API_BASE || 'https://dcp.sa')
    .replace(/\/+$/, '');
}

function buildUrl(baseUrl, route) {
  const normalized = normalizeBaseUrl(baseUrl);
  const cleanRoute = route.startsWith('/') ? route : `/${route}`;
  if (normalized.endsWith('/api') && cleanRoute.startsWith('/api/')) {
    return `${normalized}${cleanRoute.slice(4)}`;
  }
  return `${normalized}${cleanRoute}`;
}

function encodeJupyterPath(key) {
  return String(key || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildJupyterContentsUrl(accessUrl, key, tokenOverride) {
  const parsed = new URL(accessUrl);
  const token = tokenOverride || parsed.searchParams.get('token') || '';
  const encodedPath = encodeJupyterPath(key);
  const url = new URL(`/api/contents/${encodedPath}`, `${parsed.protocol}//${parsed.host}`);
  url.searchParams.set('content', '1');
  if (token) url.searchParams.set('token', token);
  return {
    url: url.toString(),
    redacted_url: url.toString().replace(token, redactSecret(token) || 'redacted'),
  };
}

function safeProbeJson(json) {
  if (!json || typeof json !== 'object') return null;
  const out = {};
  for (const key of [
    'id',
    'status',
    'gpu_type',
    'workspace_tier',
    'workspace_persisted',
    'quoted_cost_halala',
    'quoted_cost_sar',
    'bucket',
    'prefix',
    'truncated',
    'code',
    'error',
  ]) {
    if (Object.prototype.hasOwnProperty.call(json, key)) out[key] = json[key];
  }
  if (json.volume && typeof json.volume === 'object') {
    out.volume = {
      id: json.volume.id || null,
      size_gb: json.volume.size_gb || null,
      status: json.volume.status || null,
      used_gb: json.volume.used_gb || null,
    };
  }
  if (Array.isArray(json.files)) {
    out.file_count = json.files.length;
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(baseUrl, route, options = {}) {
  const startedAt = Date.now();
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body !== undefined && typeof body !== 'string' && !(body instanceof Buffer)) {
    headers['content-type'] = headers['content-type'] || 'application/json';
    body = JSON.stringify(body);
  }
  const response = await fetchWithTimeout(buildUrl(baseUrl, route), {
    method: options.method || 'GET',
    headers,
    body,
  }, options.timeoutMs || 30000);
  const text = await response.text();
  const json = parseJson(text);
  return {
    ok: response.ok,
    status: response.status,
    elapsed_ms: Date.now() - startedAt,
    json,
    text,
    headers: {
      'content-type': response.headers.get('content-type'),
      'x-request-id': response.headers.get('x-request-id'),
      location: response.headers.get('location'),
    },
  };
}

async function putObject(url, content, contentType) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: content,
  }, 30000);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    elapsed_ms: Date.now() - startedAt,
    text: text.slice(0, 500),
    etag: response.headers.get('etag'),
  };
}

function renterHeaders(renterKey) {
  return { 'x-renter-key': renterKey };
}

function classifyFailure(code, message, details = {}) {
  const actions = {
    LIVE_LAUNCH_NOT_ENABLED: 'Set DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 only when you intend to upload a file, launch a paid pod, and stop it after proof.',
    MISSING_RENTER_KEY: 'Set DCP_RENTER_KEY or RENTER_KEY for a master renter key or a scoped key with compute access.',
    RENTER_AUTH_FAILED: 'Verify the renter key is active and accepted by GET /api/renters/me.',
    NO_ACTIVE_VOLUME: 'Rent a portable workspace volume first, or rerun with DCP_WORKSPACE_POD_RENT_VOLUME=1 and enough paid balance.',
    VOLUME_RENT_FAILED: 'Check renter paid balance, storage pool capacity, and workspace S3/MinIO provisioning.',
    WORKSPACE_UPLOAD_FAILED: 'Check /api/workspace/upload-url, MinIO presigned PUT, and active-volume wiring.',
    WORKSPACE_LIST_FAILED: 'Check /api/workspace/files and MinIO list permissions for the renter bucket.',
    POD_LAUNCH_FAILED: 'Check pod capacity, compute scope, paid-credit gate, and provider availability.',
    POD_START_TIMEOUT: 'Check provider daemon polling, image pull time, relay publication, and Jupyter/SSH readiness.',
    JUPYTER_CONTENT_FAILED: 'Check pod access_url, Jupyter token, relay port, and whether /workspace restored before container start.',
    MARKER_NOT_VISIBLE: 'Inspect the pod /workspace directory and daemon restore logs; the uploaded object did not appear through Jupyter Contents API.',
    POD_STOP_FAILED: 'Stop the pod manually and inspect DELETE /api/pods/:id plus daemon teardown logs.',
  };
  return {
    code,
    severity: code === 'POD_STOP_FAILED' ? 'critical_cleanup' : 'blocking',
    message,
    action: actions[code] || 'Inspect the proof report probes and backend/provider logs.',
    details,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Workspace Pod Live Proof Report');
  lines.push('');
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- base_url: \`${report.base_url}\``);
  lines.push(`- renter_key_hint: \`${report.renter_key_hint || ''}\``);
  lines.push(`- workspace_key: \`${report.workspace_key || ''}\``);
  lines.push(`- pod_id: \`${report.pod_id || ''}\``);
  lines.push(`- command: \`${report.command}\``);
  lines.push('');
  lines.push('## Probe Summary');
  lines.push('');
  lines.push('| step | status | elapsed_ms | ok | notes |');
  lines.push('|---|---:|---:|---|---|');
  for (const [step, probe] of Object.entries(report.probes)) {
    lines.push(`| ${step} | ${probe.status ?? ''} | ${probe.elapsed_ms ?? ''} | ${probe.ok === true ? 'yes' : 'no'} | ${String(probe.notes || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  if (report.failure) {
    lines.push('## Failure Classification');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- severity: \`${report.failure.severity}\``);
    lines.push(`- action: ${report.failure.action}`);
    lines.push('');
  }
  if (report.cleanup_warnings.length > 0) {
    lines.push('## Cleanup Warnings');
    lines.push('');
    for (const warning of report.cleanup_warnings) lines.push(`- ${warning}`);
    lines.push('');
  }
  lines.push('## Artifacts');
  lines.push('');
  lines.push(`- json: \`${report.artifacts.json}\``);
  lines.push(`- markdown: \`${report.artifacts.markdown}\``);
  lines.push(`- latest_json: \`${report.artifacts.latest_json}\``);
  lines.push(`- latest_markdown: \`${report.artifacts.latest_markdown}\``);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = toStamp();
  const jsonPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.json`);
  const markdownPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.md`);
  const latestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-latest.json`);
  const latestMarkdownPath = path.join(outputDir, `${PROOF_PREFIX}-latest.md`);
  report.artifacts = {
    json: path.relative(REPO_ROOT, jsonPath),
    markdown: path.relative(REPO_ROOT, markdownPath),
    latest_json: path.relative(REPO_ROOT, latestJsonPath),
    latest_markdown: path.relative(REPO_ROOT, latestMarkdownPath),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(latestMarkdownPath, buildMarkdown(report));
}

function recordProbe(report, name, result, notes = '') {
  report.probes[name] = {
    ok: !!result.ok,
    status: result.status,
    elapsed_ms: result.elapsed_ms,
    request_id: result.headers && result.headers['x-request-id'] ? result.headers['x-request-id'] : undefined,
    notes,
    response: safeProbeJson(result.json),
  };
}

async function maybeRentVolume(report, baseUrl, renterKey, sizeGb) {
  const rent = await requestJson(baseUrl, '/api/volumes/rent', {
    method: 'POST',
    headers: {
      ...renterHeaders(renterKey),
      'idempotency-key': `workspace-pod-proof-volume-${Date.now()}`,
    },
    body: { size_gb: sizeGb },
  });
  recordProbe(report, 'volume_rent', rent, `size_gb=${sizeGb}`);
  if (!rent.ok) {
    throw Object.assign(new Error(`Volume rent failed with HTTP ${rent.status}`), {
      code: 'VOLUME_RENT_FAILED',
      details: safeProbeJson(rent.json) || rent.text.slice(0, 500),
    });
  }
  return rent.json;
}

async function waitForRunningPod(report, baseUrl, renterKey, podId, timeoutMs, pollMs) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    const res = await requestJson(baseUrl, `/api/pods/${encodeURIComponent(podId)}`, {
      headers: renterHeaders(renterKey),
      timeoutMs: 20000,
    });
    last = res;
    recordProbe(report, 'pod_status_latest', res, res.json ? `status=${res.json.status || ''}` : '');
    if (res.ok && res.json && res.json.status === 'running' && res.json.access_url) {
      return res.json;
    }
    if (res.ok && res.json && ['failed', 'cancelled', 'stopped'].includes(String(res.json.status || '').toLowerCase())) {
      break;
    }
    await sleep(pollMs);
  }
  throw Object.assign(new Error(`Pod ${podId} did not reach running before timeout`), {
    code: 'POD_START_TIMEOUT',
    details: last ? (safeProbeJson(last.json) || last.text.slice(0, 500)) : null,
  });
}

async function readJupyterContent(accessUrl, key, token, timeoutMs, pollMs) {
  const started = Date.now();
  let last = null;
  const { url, redacted_url: redactedUrl } = buildJupyterContentsUrl(accessUrl, key, token);
  while (Date.now() - started < timeoutMs) {
    const probeStarted = Date.now();
    try {
      const response = await fetchWithTimeout(url, { method: 'GET' }, 20000);
      const text = await response.text();
      const json = parseJson(text);
      last = {
        ok: response.ok,
        status: response.status,
        elapsed_ms: Date.now() - probeStarted,
        json,
        text,
        redacted_url: redactedUrl,
      };
      if (response.ok && json && json.type === 'file' && json.content != null) {
        return last;
      }
    } catch (error) {
      last = {
        ok: false,
        status: 'error',
        elapsed_ms: Date.now() - probeStarted,
        json: null,
        text: error.message,
        redacted_url: redactedUrl,
      };
    }
    await sleep(pollMs);
  }
  return last || {
    ok: false,
    status: 'timeout',
    elapsed_ms: timeoutMs,
    json: null,
    text: 'Timed out before Jupyter returned file content',
    redacted_url: redactedUrl,
  };
}

async function stopPod(report, baseUrl, renterKey, podId) {
  const res = await requestJson(baseUrl, `/api/pods/${encodeURIComponent(podId)}`, {
    method: 'DELETE',
    headers: renterHeaders(renterKey),
    timeoutMs: 30000,
  });
  recordProbe(report, 'pod_stop', res, res.json ? `status=${res.json.status || ''}` : '');
  if (!res.ok) {
    throw Object.assign(new Error(`Pod stop failed with HTTP ${res.status}`), {
      code: 'POD_STOP_FAILED',
      details: safeProbeJson(res.json) || res.text.slice(0, 500),
    });
  }
  return res.json;
}

async function run(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const renterKey = options.renterKey || process.env.DCP_RENTER_KEY || process.env.RENTER_KEY || '';
  const outputDir = path.resolve(options.outputDir || process.env.DCP_WORKSPACE_POD_PROOF_DIR || OUTPUT_DIR_DEFAULT);
  const marker = `dcp-workspace-pod-proof:${crypto.randomBytes(12).toString('hex')}`;
  const workspaceKey = options.workspaceKey || process.env.DCP_WORKSPACE_POD_KEY || `smoke/workspace-pod/${toStamp()}-${crypto.randomBytes(4).toString('hex')}.txt`;
  const contentType = 'text/plain';
  const pollMs = Number.parseInt(process.env.DCP_WORKSPACE_POD_POLL_MS || String(options.pollMs || 10000), 10);
  const timeoutMs = Number.parseInt(process.env.DCP_WORKSPACE_POD_TIMEOUT_MS || String(options.timeoutMs || 12 * 60 * 1000), 10);
  const jupyterTimeoutMs = Number.parseInt(process.env.DCP_WORKSPACE_POD_JUPYTER_TIMEOUT_MS || String(options.jupyterTimeoutMs || 4 * 60 * 1000), 10);
  const durationMinutes = Number.parseInt(process.env.DCP_WORKSPACE_POD_DURATION_MINUTES || String(options.durationMinutes || 5), 10);
  const image = String(process.env.DCP_WORKSPACE_POD_IMAGE || options.image || 'pytorch');
  const gpuType = process.env.DCP_WORKSPACE_POD_GPU_TYPE || options.gpuType || '';
  const providerId = process.env.DCP_WORKSPACE_POD_PROVIDER_ID || options.providerId || '';
  const keepRunning = process.env.DCP_WORKSPACE_POD_KEEP_RUNNING === '1' || options.keepRunning === true;
  const deleteFile = process.env.DCP_WORKSPACE_POD_DELETE_FILE === '1' || options.deleteFile === true;
  const allowRentVolume = process.env.DCP_WORKSPACE_POD_RENT_VOLUME === '1' || options.allowRentVolume === true;
  const rentVolumeSizeGb = Number.parseInt(process.env.DCP_WORKSPACE_POD_VOLUME_GB || String(options.rentVolumeSizeGb || 10), 10);

  const report = {
    generated_at: nowIso(),
    verdict: 'fail',
    base_url: baseUrl,
    renter_key_hint: redactSecret(renterKey),
    workspace_key: workspaceKey,
    pod_id: null,
    command: 'DCP_WORKSPACE_POD_ALLOW_LAUNCH=1 DCP_RENTER_KEY=... npm run proof:workspace-pod',
    probes: {},
    cleanup_warnings: [],
    failure: null,
    artifacts: {},
  };

  try {
    if (process.env.DCP_WORKSPACE_POD_ALLOW_LAUNCH !== '1' && options.allowLaunch !== true) {
      throw Object.assign(new Error('Live pod launch is disabled by default'), { code: 'LIVE_LAUNCH_NOT_ENABLED' });
    }
    if (!renterKey) {
      throw Object.assign(new Error('Missing renter key'), { code: 'MISSING_RENTER_KEY' });
    }

    const me = await requestJson(baseUrl, '/api/renters/me', { headers: renterHeaders(renterKey) });
    recordProbe(report, 'renter_me', me, me.json && me.json.renter ? `renter_id=${me.json.renter.id}` : '');
    if (!me.ok || !me.json || !me.json.renter) {
      throw Object.assign(new Error(`Renter auth failed with HTTP ${me.status}`), { code: 'RENTER_AUTH_FAILED' });
    }

    let volume = await requestJson(baseUrl, '/api/volumes/me', { headers: renterHeaders(renterKey) });
    recordProbe(report, 'volume_me', volume, volume.json && volume.json.volume ? `volume=${volume.json.volume.id || 'active'}` : 'no active volume');
    if (!volume.ok) {
      throw Object.assign(new Error(`Volume lookup failed with HTTP ${volume.status}`), {
        code: 'NO_ACTIVE_VOLUME',
        details: safeProbeJson(volume.json) || volume.text.slice(0, 500),
      });
    }
    if (!volume.json || !volume.json.volume) {
      if (!allowRentVolume) {
        throw Object.assign(new Error('No active portable workspace volume'), { code: 'NO_ACTIVE_VOLUME' });
      }
      await maybeRentVolume(report, baseUrl, renterKey, rentVolumeSizeGb);
      volume = await requestJson(baseUrl, '/api/volumes/me', { headers: renterHeaders(renterKey) });
      recordProbe(report, 'volume_me_after_rent', volume, volume.json && volume.json.volume ? `volume=${volume.json.volume.id || 'active'}` : 'no active volume');
      if (!volume.ok || !volume.json || !volume.json.volume) {
        throw Object.assign(new Error('Volume still missing after rent attempt'), { code: 'NO_ACTIVE_VOLUME' });
      }
    }

    const body = `${marker}\ncreated_at=${nowIso()}\nworkspace_key=${workspaceKey}\n`;
    const upload = await requestJson(baseUrl, '/api/workspace/upload-url', {
      method: 'POST',
      headers: renterHeaders(renterKey),
      body: { key: workspaceKey, content_type: contentType },
    });
    recordProbe(report, 'workspace_upload_url', upload, upload.json ? `key=${upload.json.key || ''}` : '');
    if (!upload.ok || !upload.json || !upload.json.url) {
      throw Object.assign(new Error(`Workspace upload-url failed with HTTP ${upload.status}`), {
        code: 'WORKSPACE_UPLOAD_FAILED',
        details: safeProbeJson(upload.json) || upload.text.slice(0, 500),
      });
    }

    const put = await putObject(upload.json.url, body, upload.json.content_type || contentType);
    report.probes.workspace_presigned_put = {
      ok: put.ok,
      status: put.status,
      elapsed_ms: put.elapsed_ms,
      notes: put.etag ? `etag=${put.etag}` : put.text,
    };
    if (!put.ok) {
      throw Object.assign(new Error(`Workspace presigned PUT failed with HTTP ${put.status}`), {
        code: 'WORKSPACE_UPLOAD_FAILED',
        details: put.text,
      });
    }

    const prefix = workspaceKey.split('/').slice(0, -1).join('/');
    const list = await requestJson(baseUrl, `/api/workspace/files?prefix=${encodeURIComponent(prefix)}`, {
      headers: renterHeaders(renterKey),
    });
    const listed = !!(list.json && Array.isArray(list.json.files) && list.json.files.some((file) => file.key === workspaceKey));
    recordProbe(report, 'workspace_list', list, listed ? 'marker file listed' : 'marker file not listed');
    if (!list.ok || !listed) {
      throw Object.assign(new Error('Uploaded marker file was not listed by workspace API'), {
        code: 'WORKSPACE_LIST_FAILED',
        details: safeProbeJson(list.json) || list.text.slice(0, 500),
      });
    }

    const jupyterToken = crypto.randomBytes(24).toString('hex');
    const launchBody = {
      duration_minutes: durationMinutes,
      image,
      params: { NOTEBOOK_TOKEN: jupyterToken },
    };
    if (gpuType) launchBody.gpu_type = gpuType;
    if (providerId) launchBody.provider_id = Number(providerId);
    const launch = await requestJson(baseUrl, '/api/pods', {
      method: 'POST',
      headers: {
        ...renterHeaders(renterKey),
        'idempotency-key': `workspace-pod-proof-launch-${Date.now()}`,
      },
      body: launchBody,
      timeoutMs: 30000,
    });
    recordProbe(report, 'pod_launch', launch, launch.json ? `workspace_tier=${launch.json.workspace_tier || ''}` : '');
    if (launch.status !== 201 || !launch.json || !launch.json.id) {
      throw Object.assign(new Error(`Pod launch failed with HTTP ${launch.status}`), {
        code: 'POD_LAUNCH_FAILED',
        details: safeProbeJson(launch.json) || launch.text.slice(0, 500),
      });
    }
    report.pod_id = launch.json.id;

    const runningPod = await waitForRunningPod(report, baseUrl, renterKey, launch.json.id, timeoutMs, pollMs);
    report.probes.pod_running = {
      ok: true,
      status: 200,
      elapsed_ms: null,
      notes: `status=running workspace_tier=${runningPod.workspace_tier || ''}`,
      response: {
        id: runningPod.id,
        status: runningPod.status,
        workspace_tier: runningPod.workspace_tier,
        workspace_persisted: runningPod.workspace_persisted,
        access_url_host: runningPod.access_url ? new URL(runningPod.access_url).host : null,
      },
    };

    const jupyter = await readJupyterContent(runningPod.access_url, workspaceKey, jupyterToken, jupyterTimeoutMs, pollMs);
    report.probes.jupyter_workspace_file = {
      ok: jupyter.ok,
      status: jupyter.status,
      elapsed_ms: jupyter.elapsed_ms,
      notes: jupyter.redacted_url || '',
      response: jupyter.json ? {
        type: jupyter.json.type,
        name: jupyter.json.name,
        path: jupyter.json.path,
        format: jupyter.json.format,
      } : null,
    };
    if (!jupyter.ok || !jupyter.json || jupyter.json.content == null) {
      throw Object.assign(new Error('Jupyter Contents API did not return marker file content'), {
        code: 'JUPYTER_CONTENT_FAILED',
        details: jupyter.text ? jupyter.text.slice(0, 500) : null,
      });
    }
    let content = String(jupyter.json.content || '');
    if (jupyter.json.format === 'base64') {
      content = Buffer.from(content, 'base64').toString('utf8');
    }
    if (!content.includes(marker)) {
      throw Object.assign(new Error('Jupyter file content does not contain marker'), {
        code: 'MARKER_NOT_VISIBLE',
        details: { path: jupyter.json.path, format: jupyter.json.format },
      });
    }

    if (!keepRunning) {
      await stopPod(report, baseUrl, renterKey, launch.json.id);
    }

    if (deleteFile) {
      const del = await requestJson(baseUrl, '/api/workspace/files', {
        method: 'DELETE',
        headers: renterHeaders(renterKey),
        body: { key: workspaceKey },
      });
      recordProbe(report, 'workspace_delete_marker', del, del.ok ? 'marker deleted' : 'marker delete failed');
      if (!del.ok) {
        report.cleanup_warnings.push(`Marker file cleanup failed with HTTP ${del.status}: ${del.text.slice(0, 200)}`);
      }
    }

    report.verdict = 'pass';
    return { report, exitCode: 0 };
  } catch (error) {
    const code = error.code || 'WORKSPACE_POD_PROOF_FAILED';
    report.failure = classifyFailure(code, error.message, error.details || null);
    if (report.pod_id && !keepRunning && !report.probes.pod_stop) {
      try {
        await stopPod(report, baseUrl, renterKey, report.pod_id);
      } catch (stopError) {
        report.cleanup_warnings.push(`Automatic pod cleanup failed for ${report.pod_id}: ${stopError.message}`);
        if (code !== 'POD_STOP_FAILED') {
          report.failure.cleanup_failure = classifyFailure(stopError.code || 'POD_STOP_FAILED', stopError.message, stopError.details || null);
        }
      }
    }
    return { report, exitCode: code === 'LIVE_LAUNCH_NOT_ENABLED' || code === 'MISSING_RENTER_KEY' ? 2 : 1 };
  } finally {
    writeReport(report, outputDir);
  }
}

async function main() {
  const { report, exitCode } = await run();
  process.stdout.write(`${JSON.stringify({
    verdict: report.verdict,
    pod_id: report.pod_id,
    workspace_key: report.workspace_key,
    failure: report.failure ? report.failure.code : null,
    artifacts: report.artifacts,
  }, null, 2)}\n`);
  process.exitCode = exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      verdict: 'error',
      code: error.code || 'WORKSPACE_POD_PROOF_ERROR',
      message: error.message,
    }, null, 2)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildJupyterContentsUrl,
  buildUrl,
  classifyFailure,
  encodeJupyterPath,
  normalizeBaseUrl,
  redactSecret,
  run,
};
