#!/usr/bin/env bash
# Provision/deprovision a per-renter MinIO bucket with a hard quota, on the
# Node-2 workspace store, over the WireGuard mesh. Called via execFileSync from
# backend/src/lib/volume-store.js. Exclusive, quota-enforced storage = the
# "paid persistent volume" a renter rents.
#
# Usage:
#   volume-provision.sh create <bucket> <size_gb>
#   volume-provision.sh delete <bucket>
#   volume-provision.sh used   <bucket>          # prints used bytes
#
# Env (from backend .env): WORKSPACE_S3_ENDPOINT, WORKSPACE_S3_ROOT_USER,
#                          WORKSPACE_S3_ROOT_PASSWORD
set -euo pipefail

ACTION="${1:?action required: create|delete|used}"
BUCKET="${2:?bucket required}"
SIZE_GB="${3:-}"

ENDPOINT="${WORKSPACE_S3_ENDPOINT:?WORKSPACE_S3_ENDPOINT not set}"
RUSER="${WORKSPACE_S3_ROOT_USER:?WORKSPACE_S3_ROOT_USER not set}"
RPASS="${WORKSPACE_S3_ROOT_PASSWORD:?WORKSPACE_S3_ROOT_PASSWORD not set}"

# bucket name guard: lowercase alnum + dashes only (defense vs injection)
case "$BUCKET" in
  dcp-vol-r[0-9]*) : ;;
  *) echo "refusing non-dcp-vol bucket name: $BUCKET" >&2; exit 2 ;;
esac

ALIAS="dcpvol_$$"
mc alias set "$ALIAS" "$ENDPOINT" "$RUSER" "$RPASS" >/dev/null 2>&1
trap 'mc alias rm "$ALIAS" >/dev/null 2>&1 || true' EXIT

case "$ACTION" in
  create)
    [ -n "$SIZE_GB" ] || { echo "size_gb required for create" >&2; exit 2; }
    mc mb -p "$ALIAS/$BUCKET" >/dev/null 2>&1 || true
    mc quota set "$ALIAS/$BUCKET" --size "${SIZE_GB}gi" >/dev/null
    echo "provisioned $BUCKET ${SIZE_GB}gi"
    ;;
  delete)
    mc rb --force "$ALIAS/$BUCKET" >/dev/null 2>&1 || true
    echo "deleted $BUCKET"
    ;;
  used)
    # total bytes in the bucket (for usage display); 0 if empty/missing
    mc du --json "$ALIAS/$BUCKET" 2>/dev/null | tail -1 | sed -n 's/.*"size":\([0-9]*\).*/\1/p' || echo 0
    ;;
  *)
    echo "unknown action: $ACTION" >&2; exit 2 ;;
esac
