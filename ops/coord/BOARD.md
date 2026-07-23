# DCP Coordination Board

_Auto-generated from `board.json` at 2026-07-22T21:50:00+03:00. Do not hand-edit; use `board.py`._

See [ROLES.md](./ROLES.md) and [HANDOFF.md](./HANDOFF.md).

| ID | Pri | Status | Owner | Title |
|----|-----|--------|-------|-------|
| `DCP-COORD-001` | P0 | **doing** | hermes | Multi-agent coordination board + roles (this system) |
| `DCP-NODE2-480` | P0 | **doing** | claude | Verify Node 2 daemon self-updated to v4.8.0 + mining guard live |
| `DCP-PAPERCLIP-001` | P1 | **blocked** | tareq | Paperclip: bootstrap or freeze (no half-dead orchestrator) |
| `DCP-SEC-953` | P0 | **review** | codex | Merge security residual PR #953 (session mint + ops router gates) |
| `DCP-SEC-DEFER` | P1 | **backlog** | unassigned | Deferred security: C3 per-provider HMAC, H2 renter key hash, H5 deps |

## Done (recent)

- `DCP-CR-PDF` CR certificate live at https://dcp.sa/cr.pdf

## Notes (active)

### DCP-COORD-001
- 2026-07-22: Created ops/coord ROLES, HANDOFF, board, CLI

### DCP-NODE2-480
- Downloaded 4.8.0 earlier; heartbeat still showed 4.7.2 for a while
- Miner killed; vLLM foreign proc is legitimate
- Verify: admin provider 1774351995321 daemon_version + no forge/pearlhash

### DCP-PAPERCLIP-001
- http://76.13.179.86:3100 bootstrap_pending
- Decision needed: onboard UI once OR stop referencing Paperclip in CLAUDE.md

### DCP-SEC-953
- PR: https://github.com/dhnpmp-tech/dcp-platform/pull/953
- Branch: security/dcp-hardening-2026-07-22
- Most of stale 041129ff already on main; residual H1/L1/M1 only

### DCP-SEC-DEFER
- See docs/security/dcp-security-hardening-residual-2026-07-22.md
