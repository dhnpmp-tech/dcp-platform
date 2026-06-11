'use strict';

// Thin wrapper around scripts/volume-provision.sh — provisions/deprovisions a
// per-renter MinIO bucket (hard quota) on the Node-2 workspace store. Mirrors
// the execFileSync pattern used by pod-relay.js. Never interpolates user input
// into a shell string; args are passed as an argv array.

const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'volume-provision.sh');

function run(args) {
  return execFileSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 20000,
    env: process.env,
  }).trim();
}

// bucket name is derived server-side from renter id — never from user input.
function bucketFor(renterId) {
  return `dcp-vol-r${Number(renterId)}`;
}

function provisionVolume(renterId, sizeGb) {
  return run(['create', bucketFor(renterId), String(Number(sizeGb))]);
}

function deprovisionVolume(renterId) {
  return run(['delete', bucketFor(renterId)]);
}

function volumeUsedBytes(renterId) {
  try {
    const out = run(['used', bucketFor(renterId)]);
    const n = parseInt(out, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

module.exports = { bucketFor, provisionVolume, deprovisionVolume, volumeUsedBytes };
