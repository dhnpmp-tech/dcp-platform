// ============================================================================
// pod-relay — Node wrapper around backend/scripts/pod-relay.sh.
//
// The relay script runs on the SAME VPS as the backend. For an interactive_pod
// it spawns detached `socat` forwarders that bridge a public api.dcp.sa:<port>
// to the pod's WireGuard-mesh host port on the provider machine:
//
//     pod-relay.sh start <job_id> <wg_mesh_ip> <jport> <sport>  → {"jpub":N,"spub":N}
//     pod-relay.sh stop  <job_id>                               → {"stopped":true}
//
// jobs.js endpoint-ready calls invokePodRelay(['start', job_id, wgMeshIp, jport,
// sport]) and reads .jpub/.spub; pods.js DELETE calls invokePodRelay(['stop',
// job_id]). We shell out with execFileSync (no shell, fixed argv) so a crafted
// job_id / IP can never inject a command — same posture as runDockerCommand in
// jobs.js.
// ============================================================================

const path = require('path');
const { execFileSync } = require('child_process');

const RELAY_SCRIPT = path.join(__dirname, '../../scripts/pod-relay.sh');
const RELAY_TIMEOUT_MS = 15000;

/**
 * Invoke pod-relay.sh with a fixed argv array and parse its single-line JSON.
 *
 * @param {string[]} args  e.g. ['start', jobId, wgMeshIp, String(jport), String(sport)]
 *                          or  ['stop', jobId]
 * @returns {object} parsed JSON ({ jpub, spub } for start; { stopped:true } for stop)
 * @throws  if the script exits non-zero or prints unparseable output
 */
function invokePodRelay(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('invokePodRelay requires a non-empty args array');
  }
  // Coerce every arg to a string — execFileSync rejects numbers in argv.
  const argv = args.map((a) => String(a));

  const stdout = execFileSync('bash', [RELAY_SCRIPT, ...argv], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: RELAY_TIMEOUT_MS,
  }).trim();

  // The script prints exactly one JSON line on stdout (logs go to stderr).
  const lastLine = stdout.split('\n').filter(Boolean).pop() || '';
  let parsed;
  try {
    parsed = JSON.parse(lastLine);
  } catch (err) {
    throw new Error(`pod-relay.sh returned unparseable output: ${lastLine || '<empty>'}`);
  }
  return parsed;
}

module.exports = { invokePodRelay };
