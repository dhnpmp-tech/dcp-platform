# Scripts

Maintained: 2026-07-26

This folder contains repository-level maintenance, smoke, proof, and release scripts.

Prefer scripts here when they coordinate multiple top-level systems. Backend-only scripts belong under `backend/scripts`.

`ecc-pr-review-agent.mjs` and `ecc-pr-review-comment.mjs` power the ECC PR
review trio. The analyzer reads PR diffs and emits per-agent Markdown reports;
the commenter maintains one sticky GitHub comment per agent.
