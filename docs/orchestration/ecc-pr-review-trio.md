# ECC PR Review Trio

Maintained: 2026-07-26

The `ECC PR Review Trio` GitHub Actions workflow is the standard automated
review lane for pull requests in `dhnpmp-tech/dcp-platform`.

It adapts the ECC review briefs for three focused agents:

- `silent-failure-hunter` looks for new empty catch blocks, swallowed promise
  rejections, and fallback values that hide real dependency failures.
- `pr-test-analyzer` checks whether changed product code has matching test
  coverage in the PR, with stricter handling for auth, billing, routing,
  provider, security, and contract files.
- `type-design-analyzer` checks changed TypeScript lines for new `any`,
  `@ts-ignore`, `@ts-nocheck`, and direct `unknown as ...` escape hatches.

## Runtime Model

The workflow runs on `pull_request_target` so the comment permission comes from
the trusted base repository workflow. To avoid executing untrusted PR code with
that token, it checks out the base repository into `base/`, checks out the pull
request into `pr/`, and runs only the trusted scripts from `base/scripts/`
against the `pr/` checkout.

The analyzer is intentionally dependency-free Node.js. It uses the PR diff, not
the whole repository, so old issues in touched files do not become unrelated
review noise.

## Output

Each agent writes a Markdown report, uploads it as a short-lived artifact, and
maintains one sticky pull request comment:

- `<!-- dcp-ecc-pr-review:silent-failure-hunter -->`
- `<!-- dcp-ecc-pr-review:pr-test-analyzer -->`
- `<!-- dcp-ecc-pr-review:type-design-analyzer -->`

The workflow fails only on `critical` findings. Warnings are posted for reviewer
attention but do not block the PR by themselves.

## CI Guardrails

The trio is designed to fail helpfully rather than break the pull request
comment lane:

- Markdown reports are capped at 60,000 characters, leaving room below
  GitHub's 65,536-character issue comment limit and adding a truncation note
  when findings are too large to fit.
- Sticky comment lookup follows GitHub issue-comment pagination, so the marker
  is still found on noisy pull requests with more than 100 comments.
- Full-file fallback scans skip changed files larger than 2 MB. Added-line diff
  scanning still runs, but the analyzer avoids loading large generated files
  into runner memory.

## Local Checks

Run one analyzer against the current branch compared with `origin/main`:

```bash
node scripts/ecc-pr-review-agent.mjs \
  --agent silent-failure-hunter \
  --base origin/main \
  --head HEAD \
  --output /tmp/ecc-silent-failure-hunter.md
```

Run the static regression test:

```bash
node tests/ecc-pr-review-trio-static.test.js
```
