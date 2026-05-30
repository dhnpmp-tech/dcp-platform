#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# Rebuild backend/installers/dcp-agent.tar.gz from DCP-SA/dcp-agent main.
#
# The platform serves this artifact via the /installers static mount; the agent
# bootstrap (backend/public/agent-install.sh) downloads it, extracts with
# `tar xzf ... --strip-components=1`, then `pip install`s the extracted dir.
# So the tarball MUST contain a single top-level `dcp-agent/` wrapper with the
# repo (incl. pyproject.toml) inside it.
#
# WHY THIS SCRIPT EXISTS: the artifact was previously hand-built on a Mac, which
# (a) let it drift stale relative to dcp-agent main and (b) embedded macOS `._*`
# AppleDouble cruft. Run this on Linux (e.g. the VPS) for a clean, current build.
#
# Usage (from the VPS, or any Linux box with git):
#   bash backend/installers/build-dcp-agent-tarball.sh [git-ref]
# Defaults to the `main` branch. Backs up the existing artifact before swapping.
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

REF="${1:-main}"
REPO_URL="${DCP_AGENT_REPO_URL:-https://github.com/DCP-SA/dcp-agent}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${SCRIPT_DIR}/dcp-agent.tar.gz"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

echo "→ Cloning ${REPO_URL} @ ${REF} (shallow)…"
git clone --depth 1 --branch "${REF}" "${REPO_URL}" "${WORK}/dcp-agent" 2>/dev/null \
  || git clone --depth 1 "${REPO_URL}" "${WORK}/dcp-agent"   # fall back if REF is a default-branch alias
HEAD="$(git -C "${WORK}/dcp-agent" rev-parse --short HEAD)"

# Don't ship VCS / CI metadata in the runtime artifact.
rm -rf "${WORK}/dcp-agent/.git" "${WORK}/dcp-agent/.github"

# Sanity: the extracted-after-strip root must be pip-installable.
test -f "${WORK}/dcp-agent/pyproject.toml" \
  || { echo "FATAL: dcp-agent/pyproject.toml missing — refusing to build a broken artifact" >&2; exit 1; }

echo "→ Packing (Linux tar; COPYFILE_DISABLE guards against AppleDouble if run on macOS)…"
( cd "${WORK}" && COPYFILE_DISABLE=1 tar czf "${WORK}/dcp-agent.tar.gz" dcp-agent/ )

# Guard: no macOS resource-fork cruft.
if tar tzf "${WORK}/dcp-agent.tar.gz" | grep -q '/\._'; then
  echo "FATAL: AppleDouble (._*) entries present — build on Linux or set COPYFILE_DISABLE=1" >&2
  exit 1
fi

if [ -f "${OUT}" ]; then
  BACKUP="${OUT}.bak-$(date -u +%Y%m%dT%H%M%SZ)"
  cp -a "${OUT}" "${BACKUP}"
  echo "→ Backed up existing artifact → ${BACKUP}"
fi
mv "${WORK}/dcp-agent.tar.gz" "${OUT}"

echo "✓ Rebuilt ${OUT}"
echo "  source ref:  ${HEAD}"
echo "  size:        $(stat -c%s "${OUT}" 2>/dev/null || stat -f%z "${OUT}") bytes"
echo "  served at:   /installers/dcp-agent.tar.gz (static mount — no restart needed)"
