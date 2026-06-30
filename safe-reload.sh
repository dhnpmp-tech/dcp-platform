#!/usr/bin/env bash
# Pod-aware backend reload. Layers 2+3 (daemon-fix + reconciler) make a reload
# blip safe, but blind reloads during live pods are how we hurt Tareq — so this
# REFUSES unless --force, and logs every live pod. Use this, not raw pm2 reload.
set +e
DB=/root/dc1-platform/backend/data/providers.db
N=$(sqlite3 "$DB" "SELECT count(*) FROM jobs WHERE job_type=\"interactive_pod\" AND status IN (\"running\",\"pulling\",\"assigned\",\"provisioning\");" 2>/dev/null)
TS=$(date -u +%FT%TZ)
echo "[$TS] safe-reload: ${N:-0} active interactive pod(s)"
if [ "${N:-0}" -gt 0 ]; then
  sqlite3 "$DB" "SELECT job_id||\" r\"||renter_id||\" \"||status FROM jobs WHERE job_type=\"interactive_pod\" AND status IN (\"running\",\"pulling\",\"assigned\",\"provisioning\");" 2>/dev/null | sed "s/^/  live: /"
  if [ "$1" != "--force" ]; then
    echo "[$TS] REFUSING blind reload — ${N} pod(s) live. Re-run with --force (daemon-fix + reconciler protect them, but be deliberate)."
    exit 1
  fi
  echo "[$TS] --force: reloading with ${N} pod(s) live (protected)."
fi
pm2 reload dc1-provider-onboarding
echo "[$TS] reload done. health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8083/api/health)"
