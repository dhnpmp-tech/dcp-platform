# Backend

Maintained: 2026-06-01

This folder contains the Express API, SQLite schema bootstrap, provider installers, billing and settlement logic, OpenAI-compatible routing, provider heartbeat handling, admin APIs, and backend test suites.

Runtime impact: production critical. Changes here require targeted backend tests and, for money/routing paths, a review against `backend/openapi/dcp.yaml` and the DCP contracts repo.
