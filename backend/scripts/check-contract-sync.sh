#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Contract drift guard (release-train, backlog #15).
#
# The backend validates responses against a VENDORED copy of the dcp-contracts
# OpenAPI spec (backend/openapi/dcp.yaml). That copy can silently drift from the
# DCP-SA/dcp-contracts source — exactly the failure mode that left the spec and
# the dcp-agent artifact stale before. This check fails (exit 1) when the
# vendored spec body no longer matches the pinned upstream ref, so CI / a
# pre-release step catches drift instead of a renter hitting a wrong contract.
#
# Release-train discipline this enforces:
#   1. Change the contract ONLY in DCP-SA/dcp-contracts (semver: breaking → major,
#      additive → minor, in info.version).
#   2. Re-vendor: copy the new spec body below the platform header in dcp.yaml.
#   3. Bump the `Pinned:` line in that header to the new version @ commit.
#   4. This check confirms (2) and (3) actually happened together.
#
# Usage:  bash backend/scripts/check-contract-sync.sh
# Requires: gh (authenticated) or curl. Reads the pinned ref from the header.
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDORED="${SCRIPT_DIR}/../openapi/dcp.yaml"
REPO="DCP-SA/dcp-contracts"
SPEC_PATH="openapi/dcp.yaml"

test -f "${VENDORED}" || { echo "FATAL: ${VENDORED} not found" >&2; exit 1; }

# Pinned ref from the header: `# Pinned: dcp-contracts vX.Y.Z @ <ref>`
PIN_REF="$(grep -m1 -oE '# Pinned:.*@ [0-9a-zA-Z._-]+' "${VENDORED}" | awk '{print $NF}')"
PIN_REF="${PIN_REF:-main}"
echo "→ Pinned upstream ref: ${PIN_REF}"

UP="$(mktemp)"; LOCAL_BODY="$(mktemp)"
trap 'rm -f "${UP}" "${LOCAL_BODY}"' EXIT

echo "→ Fetching ${REPO}/${SPEC_PATH} @ ${PIN_REF}…"
if command -v gh >/dev/null 2>&1; then
  gh api "repos/${REPO}/contents/${SPEC_PATH}?ref=${PIN_REF}" -q '.content' | base64 -d > "${UP}"
else
  curl -fsSL "https://raw.githubusercontent.com/${REPO}/${PIN_REF}/${SPEC_PATH}" -o "${UP}"
fi
test -s "${UP}" || { echo "FATAL: could not fetch upstream spec" >&2; exit 1; }

# Strip the platform vendor header (everything before the first `openapi:` line)
# so we compare only the spec body against upstream.
HDR_END="$(grep -n '^openapi:' "${VENDORED}" | head -1 | cut -d: -f1)"
tail -n +"${HDR_END}" "${VENDORED}" > "${LOCAL_BODY}"

if diff -u "${LOCAL_BODY}" "${UP}" > /tmp/contract-sync.diff 2>&1; then
  echo "✓ IN SYNC — vendored spec body matches ${REPO}@${PIN_REF}"
  exit 0
fi

echo "✗ DRIFT — vendored backend/openapi/dcp.yaml differs from ${REPO}@${PIN_REF}:" >&2
head -40 /tmp/contract-sync.diff >&2
echo "" >&2
echo "Fix: re-vendor the spec body + bump the Pinned: ref in the header." >&2
exit 1
