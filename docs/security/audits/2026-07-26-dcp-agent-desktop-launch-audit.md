# DCP Agent + Desktop Launch Audit - 2026-07-26

Read-only cross-repo audit for the provider-side launch chain:

- `DCP-SA/dcp-agent` at `cfb8f29143fcd59493a23861e2c6bac4a1d0c187`
  (`fix(runtime): Phase 0 - daemon is the sole provider runtime; agent stops registering duplicate heartbeat/WG/pull/update scripts (#24)`)
- `DCP-SA/dcp-desktop` at `9f56ba469598edeffda1e67409990f618836c9cb`
  (`fix: installer stops running daemon; one-click uninstall removes WG tunnel + daemon runtime (#26)`)

No live provider, billing, payment, WireGuard, Node 2, release, or production
environment changes were made by this audit. The goal is to make the next
desktop/agent cleanup PRs concrete and reviewable before public download links
are promoted on `dcp.sa`.

## Verdict

The provider desktop flow is close enough to keep iterating, but not clean enough
to promote as a polished v0.3.0 public download yet. The main launch blockers are
credential handling in the desktop daemon spawn path, broad Linux privilege
elevation around WireGuard setup, unsigned agent daemon delivery in the shell
installer, and release metadata drift.

The current `dcp-agent` local checkout was detached and stale during this audit,
so every source finding below is pinned to `origin/main`, not to the local worktree
state.

## Findings

| ID | Sev | Area | Finding | Evidence | Recommended next PR |
|----|-----|------|---------|----------|---------------------|
| AD-01 | P1 | Desktop security | Provider API key is passed to the daemon as a process argument. Command-line args are commonly visible through process inspection tools and crash telemetry. | `dcp-desktop/src-tauri/src/lib.rs:1412-1488`, especially `--key` at `1481-1484`. | Move daemon credential handoff to a mode that is not visible in process args: inherited environment, stdin, or a local 0600 config file read by the daemon. Add a test/grep guard banning `--key` process spawn in the desktop app. |
| AD-02 | P1 | Desktop privilege boundary | Linux WireGuard setup grants a polkit action whose executable is `/bin/sh`, while the app invokes `pkexec/sudo sh -c ...`. That gives review/security tooling a broad shell boundary instead of a narrow helper command. | `dcp-desktop/policy/sa.dcp.provider.policy:43-52`; `src-tauri/src/lib.rs:3022-3033` and `3297-3310`. | Replace the shell action with a fixed helper binary/script that accepts a constrained interface name/config path and performs path validation before `install`/`wg-quick`. |
| AD-03 | P1 | Desktop onboarding correctness | `validate_api_key` accepts a format-valid provider key when the backend is unreachable. That can make onboarding look successful while the provider will fail later against the real API. | `dcp-desktop/src-tauri/src/lib.rs:652-676`. | Make backend validation fail closed for normal setup, with an explicit offline/deferred mode only if the UI clearly marks it as not yet activated. |
| AD-04 | P2 | Agent supply chain | `scripts/install-cross-platform.sh` downloads `dcp_daemon.py` and installs it without manifest, sha256, or signature verification. The desktop fetch path already has manifest/sha verification, so the shell installer is the weaker path. | `dcp-agent/scripts/install-cross-platform.sh:176-235`. | Reuse the desktop contract: fetch manifest, verify size and sha256 before atomic write, and fail closed if verification fails. |
| AD-05 | P2 | Agent secret hygiene | The shell installer prints the provider key prefix and, on sudo-cache failure, prints a copy-paste reinstall command containing the full key. That risks terminal scrollback/history leakage. | `dcp-agent/install.sh:28-29` and `49-60`. | Stop echoing any part of the key and change re-run help to use an env var or placeholder. |
| AD-06 | P2 | Agent reliability | `install.sh` swallows `git pull --ff-only` failures with `|| true`, so a failed update can continue on a stale checkout while the installer presents progress. | `dcp-agent/install.sh:86-94`. | Make update failure explicit and actionable, or fall back to a fresh clone in a temporary directory. |
| AD-07 | P2 | Desktop performance/reliability | The dashboard still uses multiple raw `setInterval` loops with no backoff, even though `useBackoffPoll` exists specifically to solve this incident-amplification pattern. | `dcp-desktop/src/components/Dashboard.tsx:280-543`; `src/lib/useBackoffPoll.ts:4-11`. | Port dashboard polling to `useBackoffPoll`, preserve immediate first paint, and add tests around cleanup/backoff behavior. |
| AD-08 | P2 | Desktop release hygiene | The desktop app metadata disagrees (`package.json` says `0.2.8`, Tauri config says `0.2.9`), and no `v0.3.0` GitHub release was found in either `DCP-SA/dcp-desktop` or `dhnpmp-tech/dcp-desktop`. | `dcp-desktop/package.json:4`; `src-tauri/tauri.conf.json:4`; `gh release view v0.3.0` returned `release not found` for both repos. | Align versions, tag v0.3.0 only after the security fixes above, then publish `.dmg`, `.AppImage`, and `.deb` artifacts. Only then wire public download buttons on `dcp.sa`. |
| AD-09 | P2 | Agent branding/repo hygiene | `dcp-agent` public metadata still names `hermes-agent`, points repository/bugs/homepage to `NousResearch/Hermes-Agent`, and lists `Nous Research` as author. | `dcp-agent/package.json:2-17`; `pyproject.toml:6-11`. | Rebrand package metadata to DCP before broader provider onboarding links point at the repo. |
| AD-10 | P3 | Agent operations | The local `dcp-agent` checkout used for the initial review was detached at an older commit and 41 files behind `origin/main`. This is not a source bug, but it is an agent-workflow risk. | `git -C dcp-agent status` showed `HEAD (no branch)`; `HEAD..origin/main` showed 41 changed files. | Standardize agent audits on `origin/main` or fresh worktrees and record source SHAs in every report. |
| AD-11 | P3 | Desktop CI permissions | Desktop build workflow grants `contents: write` at workflow scope, including PR-triggered builds. Release upload needs write, but normal PR builds should be read-only. | `dcp-desktop/.github/workflows/build-desktop.yml:7-16`. | Default workflow permissions to `contents: read`; grant `contents: write` only on release/tag upload jobs or steps. |
| AD-12 | P3 | Desktop UX polish | Dashboard still has a no-op `Learn More` action and static suggestion state for a model recommendation. This is low-risk but visible in a provider-facing app. | `dcp-desktop/src/components/Dashboard.tsx:508-515` and `1234-1246`. | Either wire the CTA to real docs/model guidance or remove it until the recommendation is backend-driven. |

## Positive controls

- `dcp-desktop` already downloads the daemon through a manifest/sha256 checked
  path when the daemon is missing in the Tauri app (`fetch_verified_daemon` in
  `src-tauri/src/lib.rs`). The shell installer should converge on that pattern.
- `dcp-agent` self-update has moved toward a manifest-pinned safe commit and
  rollout gate in `scripts/self-update.sh`.
- The current `dcp-agent` `origin/main` diff removes the old red-teaming
  `godmode` skill tree from the shipped agent surface.
- The agent installer hard-fails when the daemon preflight itself fails; the
  issue is verification/secret hygiene before that point, not a total absence of
  installer guardrails.

## Recommended PR order

1. `dcp-desktop`: stop passing provider keys through process arguments and add a
   static guard.
2. `dcp-desktop`: replace `/bin/sh` polkit action with a constrained WireGuard
   helper.
3. `dcp-desktop`: make setup API-key validation fail closed unless the user is
   explicitly in a deferred/offline activation path.
4. `dcp-agent`: add manifest/sha verification to
   `scripts/install-cross-platform.sh`.
5. `dcp-agent`: remove provider-key echoes and fail loudly on `git pull`
   failure.
6. `dcp-desktop`: migrate dashboard polling to the existing backoff hook.
7. `dcp-agent` and `dcp-desktop`: clean metadata/versioning, tag `v0.3.0`, and
   publish native artifacts.
8. `dcp-platform`: wire `.dmg`, `.AppImage`, and `.deb` download buttons only
   after the `v0.3.0` release exists.

## Do not bundle

- Do not combine the public `dcp.sa` download-button task with security fixes in
  `dcp-desktop` or `dcp-agent`.
- Do not use Node 2, live provider tunnels, production payments, or real-money
  smoke tests for these cleanup PRs.
- Do not publish a `v0.3.0` download link until the release exists and the
  package/Tauri versions agree.
