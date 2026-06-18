// ============================================================================
// burst-broker.js — partner-compute ("burst") pod broker.
//
// A burst pod lets a renter launch a GPU DCP does not physically own. The broker
// provisions it on an external partner cloud, runs OUR services inside it, and
// fronts it through the SAME VPS relay native pods use — so the renter's pod is
// byte-identical to a Node 2 pod and the vendor is never visible anywhere.
//
// INVISIBILITY (hard requirement):
//   • The renter's access_url / ssh_command point ONLY at api.dcp.sa (the relay),
//     never at the partner's host or proxy.
//   • The in-pod entrypoint re-execs with `env -i` so RUNPOD_*/vendor env (incl.
//     a live API key) is gone from the shell and /proc/1/environ; hostname + motd
//     are neutralized.
//   • Internal naming only ("burst"/"partner"); the vendor URL appears solely in
//     this module's HTTP target constants + server-only logs.
//
// The job row, billing, relay teardown, and toPodView are all the existing native
// pod machinery (this module just replaces the absent provider daemon's role).
// ============================================================================

const db = require('../db');
const { invokePodRelay } = require('./pod-relay');

// Vendor endpoints come from env (neutral names) so the source carries NO vendor
// reference at all — total-invisibility extends to the repo, not just the renter.
const PARTNER_REST = () => process.env.BURST_PROVIDER_REST || '';
const PARTNER_GQL = () => process.env.BURST_PROVIDER_GQL || '';
const KEY = () => process.env.BURST_PROVIDER_KEY || '';
const MARKUP = () => Number(process.env.BURST_MARKUP || '0.4');
const USD_TO_SAR = () => Number(process.env.USD_TO_SAR || '3.75');

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 6 * 60 * 1000; // image pull can dominate; fail to generic after ~6 min

// ── partner HTTP (server-only; errors never leak to the renter) ──────────────
async function partnerRest(method, path, body) {
  const res = await fetch(`${PARTNER_REST()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!res.ok) {
    // Log the real reason server-side ONLY; callers surface a generic DCP error.
    console.error(`[burst] partner ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    const err = new Error(`burst_partner_error_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function partnerGql(query, variables) {
  const res = await fetch(PARTNER_GQL(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.errors) {
    console.error(`[burst] partner gql error: ${JSON.stringify(json?.errors || res.status).slice(0, 300)}`);
    throw new Error('burst_partner_gql_error');
  }
  return json?.data;
}

// ── in-pod entrypoint: scrub the vendor, neutralize identity, run sshd + Jupyter ─
// Runs as the container's start command. The leading `exec env -i` makes PID 1's
// environment pristine (so even /proc/1/environ shows no vendor vars), then we set
// only what we need, install sshd/Jupyter if absent, and bring them up with the
// DCP-issued token + root password. Mirrors a native DCP pod.
function buildInitCmd(jupyterToken, rootPassword) {
  const jt = String(jupyterToken).replace(/'/g, '');
  const rp = String(rootPassword).replace(/'/g, '');
  const script = [
    'set -e',
    // wipe every partner var from PID1 onward + drop their on-login re-exporters
    'for v in $(env | grep -oE "^(RUNPOD|RP)[A-Z0-9_]*" || true); do unset "$v"; done',
    'rm -f /etc/rp_environment 2>/dev/null || true',
    'sed -i "/rp_environment/d;/RUNPOD/d" /root/.bashrc /etc/bash.bashrc /etc/profile 2>/dev/null || true',
    'hostname dcp-pod 2>/dev/null || true',
    ': > /etc/motd 2>/dev/null || true; rm -f /etc/update-motd.d/* 2>/dev/null || true',
    'command -v runpodctl >/dev/null 2>&1 && rm -f "$(command -v runpodctl)" || true',
    // sshd
    'command -v sshd >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq openssh-server >/dev/null 2>&1) || true',
    'mkdir -p /run/sshd',
    `echo "root:${rp}" | chpasswd`,
    'sed -i "s/^#\\?PermitRootLogin.*/PermitRootLogin yes/; s/^#\\?PrintMotd.*/PrintMotd no/" /etc/ssh/sshd_config 2>/dev/null || true',
    '/usr/sbin/sshd 2>/dev/null || true',
    // Jupyter on 8888 with the DCP-issued token
    'command -v jupyter >/dev/null 2>&1 || pip install --no-cache-dir jupyterlab >/dev/null 2>&1 || true',
    `nohup jupyter lab --ip=0.0.0.0 --port=8888 --allow-root --no-browser --ServerApp.token='${jt}' --ServerApp.disable_check_xsrf=True >/var/log/jupyter.log 2>&1 &`,
    'sleep infinity',
  ].join('\n');
  return ['bash', '-lc', `exec env -i HOME=/root PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin TERM=xterm LANG=C.UTF-8 bash -lc ${JSON.stringify(script)}`];
}

// ── launch ───────────────────────────────────────────────────────────────────
// Provisions the partner pod, waits for reachability, fronts it via the relay, and
// writes access_url/ssh_command/status onto the job — the same end state jobs.js
// endpoint-ready produces for a native pod. Throws a generic error on any failure
// (caller refunds via the existing cancel path).
async function launchBurstPod({ jobId, provider, taskSpec }) {
  const image = process.env.BURST_IMAGE || 'pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime';
  const created = await partnerRest('POST', '/pods', {
    name: `dcp-burst-${jobId}`,
    imageName: image,
    cloudType: provider.burst_cloud_type || 'SECURE',
    computeType: 'GPU',
    gpuTypeIds: [provider.burst_gpu_type_id],
    gpuCount: 1,
    containerDiskInGb: 30,
    volumeInGb: 20,
    volumeMountPath: '/workspace',
    ports: ['22/tcp', '8888/tcp'], // tcp only — never /http (that forces the vendor proxy URL)
    interruptible: false,          // premium pods must not be preemptible (eviction = a tell)
    dockerStartCmd: buildInitCmd(taskSpec.jupyter_token, taskSpec.root_password),
  });
  const externalId = created?.id;
  if (!externalId) throw new Error('burst_launch_no_id');
  db.prepare(`UPDATE jobs SET burst_external_id = ?, burst_status = 'launching' WHERE job_id = ?`).run(externalId, jobId);

  const ready = await pollUntilReachable(externalId);
  if (!ready) {
    await terminateBurstPod(externalId).catch(() => {});
    throw new Error('burst_launch_timeout');
  }
  const { publicIp, jupyterPort, sshPort } = ready;

  // Front it through the SAME relay native pods use. The 'start-burst' verb forwards
  // a public VPS port -> the partner pod's public ip:port (vs a WG mesh ip for native).
  const relay = invokePodRelay(['start-burst', jobId, publicIp, String(jupyterPort), String(sshPort)]);
  const jpub = relay?.jpub, spub = relay?.spub;
  if (!jpub || !spub) throw new Error('burst_relay_failed');

  const accessUrl = `https://api.dcp.sa:${jpub}/?token=${encodeURIComponent(taskSpec.jupyter_token)}`;
  const sshCommand = `ssh -p ${spub} root@api.dcp.sa`;
  db.prepare(
    `UPDATE jobs SET access_url = ?, ssh_command = ?, status = 'running',
            started_at = COALESCE(started_at, datetime('now')), burst_status = 'running'
       WHERE job_id = ? AND status IN ('queued','assigned','pulling')`
  ).run(accessUrl, sshCommand, jobId);
  return { externalId, accessUrl, sshCommand };
}

async function pollUntilReachable(externalId) {
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let pod;
    try { pod = await partnerRest('GET', `/pods/${externalId}`); }
    catch (e) { if (e.status === 429) continue; continue; } // back off on 429, keep trying
    if (pod?.desiredStatus && ['EXITED', 'TERMINATED'].includes(pod.desiredStatus)) return null;
    const pm = pod?.portMappings || {};
    if (pod?.publicIp && pm['8888'] && pm['22']) {
      return { publicIp: pod.publicIp, jupyterPort: pm['8888'], sshPort: pm['22'] };
    }
  }
  return null;
}

async function terminateBurstPod(externalId) {
  if (!externalId) return;
  await partnerRest('DELETE', `/pods/${externalId}`); // DELETE (not stop) — stop still bills the volume
}

// ── catalog refresh: live price (cost-plus) + keep synthetic rows fresh ───────
// halala/gpu-sec = usd_per_hr / 3600 * SAR * 100 * (1 + markup). Stored FRACTIONAL
// (pods.js ceils the final quote). Also bumps last_heartbeat so the rows stay listed,
// and flips status offline when the partner is out of stock (renter gets a generic
// "no provider available", never a vendor error).
async function refreshBurstCatalog() {
  if (!KEY()) return;
  const data = await partnerGql('query{gpuTypes{id securePrice}}');
  const priceById = new Map((data?.gpuTypes || []).map((g) => [g.id, g.securePrice]));
  const rows = db.prepare(`SELECT id, burst_gpu_type_id FROM providers WHERE is_burst = 1`).all();
  for (const row of rows) {
    const usdHr = priceById.get(row.burst_gpu_type_id);
    if (usdHr == null || Number(usdHr) <= 0) {
      db.prepare(`UPDATE providers SET status='offline', updated_at=datetime('now') WHERE id=?`).run(row.id);
      continue;
    }
    const halalaPerSec = (Number(usdHr) / 3600) * USD_TO_SAR() * 100 * (1 + MARKUP());
    db.prepare(
      `UPDATE providers SET cost_per_gpu_second_halala = ?, status='online',
              last_heartbeat = datetime('now'), updated_at = datetime('now') WHERE id = ?`
    ).run(halalaPerSec, row.id);
  }
}

module.exports = { launchBurstPod, pollUntilReachable, terminateBurstPod, refreshBurstCatalog };
