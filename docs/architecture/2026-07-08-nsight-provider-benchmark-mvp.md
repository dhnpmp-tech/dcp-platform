# Nsight Provider Benchmark MVP

Date: 2026-07-08
PR: #740; contract guard updated in PR #774
Scope: Pods/POTS infrastructure, provider quality score evidence

## Purpose

This slice adds a provider-side benchmark evidence tool for the Fireworks/Tinker
roadmap. It does not expose provider internals to renters and it does not change
routing, billing, or provider scores by itself.

The new script is:

```bash
python3 scripts/provider-nsight-benchmark.py
```

It produces:

- JSON report for provider/admin scorecards.
- Optional CSV telemetry for per-sample review.
- `provider_quality_score_input` fields that future backend ingestion can use.
- Explicit missing-metric markers when Nsight workload metrics were not captured.

## Baseline Telemetry

Run this on a provider GPU host:

```bash
python3 scripts/provider-nsight-benchmark.py \
  --provider-id provider_123 \
  --duration-seconds 30 \
  --interval-seconds 1 \
  --output-json /tmp/dcp-provider-benchmark.json \
  --output-csv /tmp/dcp-provider-benchmark.csv
```

The baseline mode samples `nvidia-smi` and records:

- GPU name, UUID, driver version.
- GPU utilization percentage.
- Memory utilization percentage.
- Total and used VRAM.
- Temperature.
- Power draw.
- SM and memory clocks.

This is enough for an initial provider quality score input, thermal-risk flag,
and sustained-load hint. It is not enough to claim kernel occupancy or cache hit
rates.

## Nsight Compute Workload Mode

Use Nsight Compute when a representative workload is available:

```bash
python3 scripts/provider-nsight-benchmark.py \
  --provider-id provider_123 \
  --duration-seconds 60 \
  --interval-seconds 1 \
  --profile ncu \
  --output-json /tmp/dcp-provider-ncu.json \
  --output-csv /tmp/dcp-provider-ncu.csv \
  --workload python3 /workspace/examples/lora_stack_smoke.py
```

`--profile ncu` wraps the workload with `ncu` and asks for:

- `sm__warps_active.avg.pct_of_peak_sustained_active`
- `lts__t_sector_hit_rate.pct`
- `dram__throughput.avg.pct_of_peak_sustained_elapsed`

The report maps those to:

- `occupancy_pct`
- `cache_hit_pct`
- `memory_bandwidth_utilization_pct`

If `ncu` is missing, the script fails rather than guessing.

## Nsight Systems Workload Mode

Use Nsight Systems when the operator needs a timeline report:

```bash
python3 scripts/provider-nsight-benchmark.py \
  --provider-id provider_123 \
  --duration-seconds 60 \
  --profile nsys \
  --output-json /tmp/dcp-provider-nsys.json \
  --output-csv /tmp/dcp-provider-nsys.csv \
  --workload python3 /workspace/examples/lora_stack_smoke.py
```

This writes an `.nsys-rep` path into `nsight_profile.report_path`. The JSON
score input still comes from `nvidia-smi` samples unless a future parser adds
more timeline-derived fields.

## Mock Mode For CI

CI and local development can validate the output shape without GPU access:

```bash
python3 scripts/provider-nsight-benchmark.py \
  --mock \
  --output-json /tmp/dcp-provider-mock.json \
  --output-csv /tmp/dcp-provider-mock.csv
```

Mock output must never be used for provider activation, payouts, routing, or
quality-score updates.

PR #774 added `evidence_mode: "mock"` and
`provider_quality_score_input.mock_data: true` to mock reports so future
ingestion can reject CI evidence deterministically. The CI-safe contract command
is:

```bash
npm run provider:nsight:verify
```

## Output Contract

The JSON report has schema version
`2026-07-08.provider-nsight-benchmark.v1` and includes:

- `tool_availability`: detected `nvidia-smi`, `ncu`, and `nsys`.
- `evidence_mode`: `provider_host` for real provider-host runs, `mock` for CI
  shape validation.
- `samples`: raw per-GPU, per-sample telemetry.
- `summary`: per-GPU averages/max values and missing metric names.
- `nsight_profile`: workload profiler status and raw report paths.
- `provider_quality_score_input`: normalized fields for future backend scoring.

Quality-score ingestion should ignore rows unless:

- `status` is `completed`.
- `evidence_mode` is `provider_host`.
- `provider_quality_score_input.benchmark_ready` is true.
- `provider_quality_score_input.mock_data` is false.
- The run was captured on an approved provider host.
- The output artifact is attached to an admin-reviewed provider activation or
  recurring provider-health workflow.

## Backend Integration Order

This PR intentionally stops at script/runbook evidence. The next backend PR can
add ingestion safely in this order:

1. Add a `provider_gpu_benchmark_reports` table keyed by provider id and report
   checksum.
2. Accept JSON reports through an admin/provider-auth route.
3. Validate `schema_version`, sample count, GPU identity, and missing metrics.
4. Store the full report as evidence and project only normalized summary fields
   into provider scorecards.
5. Update provider quality scoring behind an admin-only feature flag.
6. Surface score inputs to admins only; keep renter UI on high-level availability
   and SLA signals.

## Acceptance Evidence

- Script compiles with Python.
- Mock mode writes valid JSON and CSV.
- Mock mode is explicitly marked as non-production evidence.
- JSON includes explicit quality-score input fields.
- CSV includes one row per telemetry sample.
- Changelogs record the PR number, date, timestamp, and shipped details.
