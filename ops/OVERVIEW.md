# Ops

Maintained: 2026-06-01

This folder contains operator-facing fleet and health tooling, including scripts that check real serving state rather than heartbeat-only claims. VPS cron jobs should point at the tracked copy under `/root/dc1-platform/ops/` whenever possible so production behavior can be reproduced from Git.

Runtime impact: operations only. Keep scripts deterministic, documented, and safe to run from a VPS or CI shell.
