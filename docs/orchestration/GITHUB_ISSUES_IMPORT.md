# GitHub Issues to Mission Control Import

Maintained: 2026-07-27

This runbook owns the safe import path from open GitHub issues into DCP Mission
Control. It is intended for task discovery and agent orchestration, not for
provider operations, payments, or live billing actions.

## Safety Model

- The importer is dry-run by default.
- Scheduled GitHub Actions runs are disabled unless
  `MISSION_GITHUB_ISSUES_IMPORT_ENABLED=1` is set as a repository variable.
- Writes require `GITHUB_ISSUES_IMPORT_DRY_RUN=0` and the
  `MISSION_DISPATCHER_KEY` repository secret.
- Agent-scoped keys may be used only for dry-run duplicate checks.
- Import idempotency is based on
  `external_id=github:<owner>/<repo>#<issue-number>`.
- Pull requests are filtered out. Only open issues become import candidates.

## Configuration

| Name | Type | Default | Purpose |
| --- | --- | --- | --- |
| `MISSION_BASE_URL` | repository variable | `https://api.dcp.sa` | Mission Control API base URL. |
| `MISSION_DISPATCHER_KEY` | repository secret | none | Required for write-mode imports. |
| `MISSION_GITHUB_ISSUES_IMPORT_ENABLED` | repository variable | unset | Enables scheduled hourly runs when set to `1`. |
| `GITHUB_ISSUES_IMPORT_REPO` | repository variable | `dhnpmp-tech/dcp-platform` | GitHub repository to scan. |
| `GITHUB_ISSUES_IMPORT_DRY_RUN` | repository variable | `1` | Set to `0` only after a dry-run summary is reviewed. |
| `GITHUB_ISSUES_IMPORT_LIMIT` | repository variable | `100` | Maximum open issues fetched per run. |
| `GITHUB_ISSUES_IMPORT_PRIORITY` | repository variable | `p3` | Priority assigned to imported tasks. |

## Local Dry Run

Use a one-shot shell variable and do not write keys to files:

```bash
MISSION_BASE_URL=https://api.dcp.sa \
MISSION_AGENT_KEY=... \
GITHUB_TOKEN=... \
GITHUB_ISSUES_IMPORT_DRY_RUN=1 \
npm --prefix backend run mission:import-github-issues
```

The command prints a JSON summary to stdout and logs per-issue actions to
stderr. Dry-run mode still checks Mission Control for matching `external_id`
values so existing tasks are skipped in the summary.

## Enabling Writes

1. Review a dry-run summary.
2. Confirm the target repo variable is `dhnpmp-tech/dcp-platform`.
3. Add or verify the `MISSION_DISPATCHER_KEY` secret in GitHub Actions.
4. Set `GITHUB_ISSUES_IMPORT_DRY_RUN=0`.
5. Set `MISSION_GITHUB_ISSUES_IMPORT_ENABLED=1`.
6. Watch the next scheduled run or launch `workflow_dispatch`.
7. Confirm created tasks have `source=github`, `source_url` pointing to the
   GitHub issue, and the expected `external_id`.

## Notes

Older task text may still mention `dhnpmp-tech/dc1-platform`. The canonical
platform repository for this importer is `dhnpmp-tech/dcp-platform`; use the
repo variable only when intentionally importing from another repository.
