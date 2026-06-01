# DCP Job Execution Runtime (Docker Isolation)

This document defines the runtime contract for isolated job containers launched by:

- `infra/docker/run-job.sh`
- template Dockerfiles in `backend/docker-templates/`

## Template Container Types

The orchestrator supports these template types:

- `pytorch-cuda` → `dcp/pytorch-cuda:latest`
- `vllm-serve` → `dcp/vllm-serve:latest`
- `training` → `dcp/training:latest`
- `rendering` → `dcp/rendering:latest`

Docker build contexts are in `backend/docker-templates/`:

- `pytorch-cuda.Dockerfile`
- `vllm-serve.Dockerfile`
- `training.Dockerfile`
- `rendering.Dockerfile`

## Isolation Baseline

The runner enforces these controls by default:

- `--network none` (or optional dedicated internal bridge via `--network bridge:<name>`)
- `--mount type=tmpfs,destination=/dc1/job` for ephemeral in-container job workspace
- `--cpus 2`
- `--memory 4g`
- `--rm` container auto-cleanup
- `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges:true`
- bounded process count (`--pids-limit 256`)

## Job Record Logging

When `--db-path` is provided, the script logs launched `container_id` to the SQLite `jobs` row:

- If `jobs.container_id` exists, it writes that column.
- Otherwise it appends `container_id=<id>` to `jobs.notes`.
- It also sets `started_at` and `updated_at` timestamps.

## Usage

Template mode (preferred):

```bash
infra/docker/run-job.sh \
  vllm-serve \
  /opt/dcp/models/mistral-7b \
  /tmp/dcp/jobs/JOB-123/payload.json \
  /tmp/dcp/jobs/JOB-123/output \
  --timeout-seconds 1800
```

Template mode mounts:

- `/opt/dcp/model-cache` (host cache, writable)
- `/opt/dcp/model` (model_path, read-only)
- `/opt/dcp/input/job_payload.json` (payload JSON, read-only)
- `/opt/dcp/output` (output_dir, writable)

Legacy mode (backward compatible):

```bash
infra/docker/run-job.sh \
  --job-id JOB-123 \
  --image dc1/sd-worker:latest \
  --job-cmd "python /dc1/job/task.py"
```

With host task payload + DB logging:

```bash
infra/docker/run-job.sh \
  --job-id JOB-123 \
  --image dc1/sd-worker:latest \
  --host-job-dir /tmp/dcp/jobs/JOB-123 \
  --db-path backend/data/providers.db \
  --job-cmd "python /dc1/job/task.py"
```

Dedicated bridge network (internal-only):

```bash
infra/docker/run-job.sh \
  --job-id JOB-123 \
  --image dc1/llm-worker:latest \
  --network bridge:dcp-job-net \
  --job-cmd "python /dc1/job/task.py"
```

## CLI Options

```text
Template mode positional:
container_type           Required in template mode
model_path               Required in template mode
job_payload              Required in template mode
output_dir               Required in template mode

Template mode flags:
--timeout-seconds N      Timeout in seconds before forced cleanup (default: 3600)
--model-cache-dir PATH   Host dir mounted to /opt/dcp/model-cache (default: /opt/dcp/model-cache)
--image IMAGE            Optional image override for container_type

Legacy mode flags:
--job-id JOB_ID           Required logical job id (jobs.job_id)
--image IMAGE             Required docker image
--job-cmd CMD             Command run inside container (default: python /dc1/job/task.py)
--host-job-dir PATH       Host dir copied into /dc1/job tmpfs before command starts
--db-path PATH            SQLite DB path for jobs table update
--network MODE            none | bridge:NETWORK_NAME (default: none)
--cpus N                  CPU limit (default: 2)
--memory SIZE             Memory limit (default: 4g)
--tmpfs-size SIZE         /dc1/job tmpfs size (default: 1g)
--gpus REQUEST            Docker GPU selector (default: all; use none to disable)
--pids-limit N            Max process count (default: 256)
--no-stream-logs          Disable `docker logs -f` streaming
```

## Deployment Note

Run job-execution validation from a clean checkout with Docker and the NVIDIA runtime available. Production deployment procedures should stay in the deployment environment or private operations runbooks.
