#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PODS_ROUTE_PATH = path.join(REPO_ROOT, 'backend/src/routes/pods.js');
const VOLUMES_ROUTE_PATH = path.join(REPO_ROOT, 'backend/src/routes/volumes.js');
const WORKSPACE_ROUTE_PATH = path.join(REPO_ROOT, 'backend/src/routes/workspace.js');
const DAEMON_PATH = path.join(REPO_ROOT, 'backend/installers/dcp_daemon.py');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function pushError(errors, message) {
  errors.push(message);
}

function assertIncludes(haystack, needle, errors, context) {
  if (!haystack.includes(needle)) {
    pushError(errors, `${context}: missing '${needle}'`);
  }
}

function assertOrder(haystack, first, second, errors, context) {
  const firstIndex = haystack.indexOf(first);
  const secondIndex = haystack.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex >= secondIndex) {
    pushError(errors, `${context}: expected '${first}' before '${second}'`);
  }
}

function verifyContracts(options = {}) {
  const paths = {
    podsRoute: options.podsRoutePath || PODS_ROUTE_PATH,
    volumesRoute: options.volumesRoutePath || VOLUMES_ROUTE_PATH,
    workspaceRoute: options.workspaceRoutePath || WORKSPACE_ROUTE_PATH,
    daemon: options.daemonPath || DAEMON_PATH,
  };
  const errors = [];

  for (const [name, filePath] of Object.entries(paths)) {
    if (!fs.existsSync(filePath)) {
      pushError(errors, `${name} not found: ${filePath}`);
    }
  }
  if (errors.length > 0) return { errors, contract: null };

  const podsRoute = readText(paths.podsRoute);
  const volumesRoute = readText(paths.volumesRoute);
  const workspaceRoute = readText(paths.workspaceRoute);
  const daemon = readText(paths.daemon);
  const runInteractiveStart = daemon.indexOf('def run_interactive_pod(task_spec, job_id=None):');
  const stopPodStart = daemon.indexOf('def stop_pod(job_id):');
  const interactivePodDaemon = runInteractiveStart >= 0 && stopPodStart > runInteractiveStart
    ? daemon.slice(runInteractiveStart, stopPodStart)
    : daemon;

  const contract = {
    object: 'dcp.workspace_pod_contracts',
    version: 'dcp.workspace_pod_contracts.v1',
    checks: [
      'pod_task_spec_stable_provider_volume',
      'pod_task_spec_portable_s3_volume',
      'pod_view_tier_truthfulness',
      'workspace_api_requires_active_volume',
      'daemon_restore_before_container_start',
      'daemon_snapshot_after_container_stop',
    ],
  };

  assertIncludes(podsRoute, 'taskSpecObj.workspace_volume = `dcp-ws-r${req.renter.id}`', errors, 'pods route free workspace tier');
  assertIncludes(podsRoute, "const { activeVolumeForRenter } = require('./volumes')", errors, 'pods route portable volume lookup');
  assertIncludes(podsRoute, 'activeVolumeForRenter(req.renter.id)', errors, 'pods route portable volume lookup');
  assertIncludes(podsRoute, 'process.env.WORKSPACE_S3_ENDPOINT', errors, 'pods route portable env gate');
  assertIncludes(podsRoute, 'process.env.WORKSPACE_S3_KEY', errors, 'pods route portable env gate');
  assertIncludes(podsRoute, 'taskSpecObj.workspace_s3 = {', errors, 'pods route portable task_spec');
  assertIncludes(podsRoute, 'endpoint: process.env.WORKSPACE_S3_ENDPOINT', errors, 'pods route portable task_spec');
  assertIncludes(podsRoute, 'bucket: vol.bucket', errors, 'pods route portable task_spec');
  assertIncludes(podsRoute, 'access_key: process.env.WORKSPACE_S3_KEY', errors, 'pods route portable task_spec');
  assertIncludes(podsRoute, 'secret_key: process.env.WORKSPACE_S3_SECRET', errors, 'pods route portable task_spec');
  assertIncludes(podsRoute, "workspaceTier = 'portable'", errors, 'pods route portable tier');
  assertIncludes(podsRoute, "if (spec && spec.workspace_s3) return 'portable'", errors, 'pod view portable truthfulness');
  assertIncludes(podsRoute, "if (spec && spec.workspace_volume && !isBurstJob(job)) return 'provider'", errors, 'pod view provider truthfulness');
  assertIncludes(podsRoute, "return 'ephemeral'", errors, 'pod view ephemeral fallback');
  assertIncludes(podsRoute, 'workspace_tier: workspaceTier', errors, 'launch response workspace tier');
  assertIncludes(podsRoute, 'workspace_persisted: workspaceTier !==', errors, 'launch response workspace persisted');

  assertIncludes(volumesRoute, 'function activeVolumeForRenter(renterId)', errors, 'volumes active lookup');
  assertIncludes(volumesRoute, 'module.exports.activeVolumeForRenter = activeVolumeForRenter', errors, 'volumes export active lookup');
  assertIncludes(volumesRoute, 'bucketFor(req.renter.id)', errors, 'volumes renter-derived bucket');

  assertIncludes(workspaceRoute, "const { activeVolumeForRenter } = require('./volumes')", errors, 'workspace route active lookup');
  assertIncludes(workspaceRoute, 'function requireActiveVolume(req, res)', errors, 'workspace route active-volume guard');
  assertIncludes(workspaceRoute, 'activeVolumeForRenter(req.renter.id)', errors, 'workspace route renter-derived volume');
  assertIncludes(workspaceRoute, "code: 'NO_ACTIVE_VOLUME'", errors, 'workspace route no-volume response');
  assertIncludes(workspaceRoute, 'bucketFor(req.renter.id)', errors, 'workspace route renter-derived bucket');

  assertIncludes(daemon, 'def _pod_ws_sync(direction, volume_name, ws_s3):', errors, 'daemon workspace sync helper');
  assertIncludes(daemon, 'mc mirror --overwrite s3/{b} /workspace', errors, 'daemon restore mirror');
  assertIncludes(daemon, 'mc mirror --overwrite --remove /workspace s3/{b}', errors, 'daemon snapshot mirror');
  assertIncludes(daemon, '"-v", "{}:/workspace".format(volume_name)', errors, 'daemon sync helper volume mount');
  assertIncludes(daemon, 'ws_s3 = task_spec.get("workspace_s3")', errors, 'daemon reads portable task_spec');
  assertIncludes(daemon, '"-v", f"{volume_name}:/workspace"', errors, 'daemon pod workspace mount');
  assertIncludes(daemon, '_pod_ws_sync("restore", volume_name, ws_s3)', errors, 'daemon restore call');
  assertIncludes(daemon, '_pod_ws_sync("snapshot", volume_name, ws_s3)', errors, 'daemon snapshot call');
  assertOrder(interactivePodDaemon, '_pod_ws_sync("restore", volume_name, ws_s3)', 'docker_cmd = [', errors, 'daemon restore order');
  assertOrder(interactivePodDaemon, 'subprocess.run(["docker", "stop", "--time", "10", container_name]', '_pod_ws_sync("snapshot", volume_name, ws_s3)', errors, 'daemon snapshot order');

  return { errors, contract };
}

function main() {
  const { errors, contract } = verifyContracts();
  if (errors.length > 0) {
    console.error('Workspace pod contract verification failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Workspace pod contract verification passed (${contract.checks.length} checks)`);
}

if (require.main === module) {
  main();
}

module.exports = {
  verifyContracts,
};
