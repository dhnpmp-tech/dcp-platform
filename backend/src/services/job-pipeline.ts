/**
 * DC1 Gate 0 — Job Submission Pipeline
 * validate → match GPU → launch → monitor → complete
 *
 * VOLT-DOCKER Sub-agent
 */

import type {
  JobRequest,
  Job,
  JobStatus,
  JobResult,
  JobStatusEnum,
  ProviderGpu,
  ContainerMetrics,
  JobContainerConfig,
} from '../types/jobs.js';
import {
  launchJobContainer,
  monitorContainer,
  stopContainer,
  wipeGPUMemory,
} from './docker-manager.js';

// MC_API_URL must be supplied via env. We intentionally do not hardcode a
// production IP here so the repo can be published/reviewed without leaking
// backend infra. Empty default causes explicit startup failure at first call
// rather than silently routing traffic to a stale host.
const MC_BASE = process.env['MC_API_URL'] ?? '';
const MC_TOKEN = process.env['MC_TOKEN'] ?? 'dc1-mc-gate0-2026';
const AGENT_NAME = 'VOLT-DOCKER';
const DEFAULT_MEMORY_LIMIT = 20 * 1024 * 1024 * 1024; // 20 GB
const DEFAULT_CPU_LIMIT = 8;

// H2 fix: No in-memory registry — all job state persisted to Mission Control API.
// Eliminates data loss on process restart.

// ── Helpers ──

async function audit(
  action: string,
  resource: string,
  resourceId: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${MC_BASE}/security/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MC_TOKEN}`,
      },
      body: JSON.stringify({
        agent: AGENT_NAME,
        action,
        resource,
        resourceId,
        details,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // best-effort
  }
}

async function mcGet<T>(path: string): Promise<T> {
  const res = await fetch(`${MC_BASE}${path}`, {
    headers: { Authorization: `Bearer ${MC_TOKEN}` },
  });
  if (!res.ok) throw new Error(`MC GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function mcPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${MC_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MC_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MC POST ${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function mcPatch(path: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${MC_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MC_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MC PATCH ${path} → ${res.status}`);
}

function generateId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── GPU Matching ──

/**
 * Find the best available GPU:
 *  1. Filter by status === 'available' AND vramGb >= required
 *  2. Sort by reliability (desc), then ratePerHour (asc) — best value first
 */
async function matchGpu(
  requiredVramGb: number,
  _gpuCount: number,
): Promise<ProviderGpu> {
  const providers = await mcGet<{ gpus: ProviderGpu[] }>('/providers');
  const gpus = (providers.gpus ?? [])
    .filter((g) => g.status === 'available' && g.vramGb >= requiredVramGb)
    .sort((a, b) => {
      if (b.reliability !== a.reliability) return b.reliability - a.reliability;
      return a.ratePerHour - b.ratePerHour;
    });

  if (gpus.length === 0) {
    throw new Error(`No available GPU with ≥ ${requiredVramGb} GB VRAM`);
  }

  return gpus[0]!;
}

// ── Public API ──

/**
 * Submit a new job: validate balance → match GPU → reserve → launch → record.
 */
export async function submitJob(request: JobRequest): Promise<Job> {
  const jobId = generateId();
  await audit('job.submit.start', 'job', jobId, { renterId: request.renterId });

  try {
    // H1 fix: Match GPU first — needed to compute accurate estimated cost from real rate.
    // 1. Match best GPU
    const gpu = await matchGpu(request.requiredVramGb, request.gpuCount);

    // 2. Validate renter balance against actual GPU rate (not cancelled-out formula)
    const { balanceUsd } = await mcGet<{ balanceUsd: number }>(
      `/renters/${request.renterId}/balance`,
    );
    const estimatedCost = request.estimatedHours * gpu.ratePerHour;
    if (balanceUsd < estimatedCost) {
      throw new Error(
        `Insufficient balance: $${balanceUsd.toFixed(2)} < estimated $${estimatedCost.toFixed(2)} (${request.estimatedHours}h × $${gpu.ratePerHour}/hr)`,
      );
    }

    // 3. Reserve GPU
    await mcPatch(`/gpu/${gpu.id}`, { status: 'in-use' });

    // 4. Launch container
    const containerConfig: JobContainerConfig = {
      jobId,
      renterId: request.renterId,
      dockerImage: request.dockerImage,
      jobCodePath: request.jobCodePath,
      gpuDeviceIds: [gpu.id],
      maxHours: request.estimatedHours,
      memoryLimit: DEFAULT_MEMORY_LIMIT,
      cpuLimit: DEFAULT_CPU_LIMIT,
      envVars: request.metadata,
    };
    const containerResult = await launchJobContainer(containerConfig);

    // 5. Record in Mission Control
    const job: Job = {
      id: jobId,
      renterId: request.renterId,
      containerId: containerResult.containerId,
      matchedGpu: gpu,
      dockerImage: request.dockerImage,
      estimatedCostUsd: request.estimatedHours * gpu.ratePerHour,
      maxBudgetUsd: request.maxBudgetUsd,
      ratePerHour: gpu.ratePerHour,
      startTime: containerResult.startTime,
      status: 'running',
    };

    await mcPost('/jobs/submit', {
      jobId: job.id,
      renterId: job.renterId,
      containerId: job.containerId,
      gpuId: gpu.id,
      providerId: gpu.providerId,
      dockerImage: job.dockerImage,
      estimatedCostUsd: job.estimatedCostUsd,
      ratePerHour: job.ratePerHour,
      startTime: job.startTime,
      status: job.status,
    });

    // H2 fix: job state is fully persisted to Mission Control — no local registry needed.
    await audit('job.submit.success', 'job', jobId, {
      gpuId: gpu.id,
      containerId: containerResult.containerId,
    });

    return job;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await audit('job.submit.failed', 'job', jobId, { error: msg });
    throw new Error(`Job submission failed: ${msg}`);
  }
}

/**
 * Get current job status: metrics, cost, budget check.
 * Auto-kills job if over budget.
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  await audit('job.status.start', 'job', jobId, {});

  // H2 fix: Fetch job state from Mission Control (persistent, crash-safe).
  const job = await mcGet<Job>(`/jobs/${jobId}`);
  if (!job) {
    throw new Error(`Job ${jobId} not found in Mission Control`);
  }

  let metrics: ContainerMetrics | null = null;
  if (job.status === 'running') {
    metrics = await monitorContainer(job.containerId);
  }

  const startMs = new Date(job.startTime).getTime();
  const elapsedMinutes = (Date.now() - startMs) / 60_000;
  const elapsedHours = elapsedMinutes / 60;
  const costSoFar = elapsedHours * job.ratePerHour;
  const budgetRemaining = job.maxBudgetUsd - costSoFar;

  // Over-budget kill — persist status to MC; use local var since Job is read-only from MC
  let currentStatus = job.status;
  if (budgetRemaining <= 0 && job.status === 'running') {
    await stopContainer(job.containerId, 'over-budget');
    currentStatus = 'over-budget' as JobStatusEnum;
    await mcPatch(`/jobs/${jobId}`, { status: currentStatus });
    await audit('job.overbudget.killed', 'job', jobId, { costSoFar, budget: job.maxBudgetUsd });
  }

  // Estimate progress as time-based (capped at 100)
  const progressPercent = Math.min(
    100,
    Math.round((elapsedHours / (job.estimatedCostUsd / job.ratePerHour)) * 100),
  );

  const status: JobStatus = {
    jobId,
    status: currentStatus,
    progressPercent,
    gpuMetrics: metrics,
    costSoFarUsd: Math.round(costSoFar * 100) / 100,
    elapsedMinutes: Math.round(elapsedMinutes),
    budgetRemainingUsd: Math.round(budgetRemaining * 100) / 100,
  };

  await audit('job.status.done', 'job', jobId, {
    status: job.status,
    costSoFar: status.costSoFarUsd,
  });

  return status;
}

/**
 * Complete a job: stop container → wipe GPU → bill → payout.
 */
export async function completeJob(jobId: string): Promise<JobResult> {
  await audit('job.complete.start', 'job', jobId, {});

  // H2 fix: Fetch job state from Mission Control (persistent, crash-safe).
  const job = await mcGet<Job>(`/jobs/${jobId}`);
  if (!job) {
    throw new Error(`Job ${jobId} not found in Mission Control`);
  }

  try {
    // Capture final metrics before stopping
    let finalMetrics: ContainerMetrics | null = null;
    try {
      finalMetrics = await monitorContainer(job.containerId);
    } catch {
      // Best-effort — container may already be exiting
    }

    // 1. Stop container
    await stopContainer(job.containerId, 'job-completed');

    // 2. Wipe GPU memory
    let gpuWiped = false;
    try {
      await wipeGPUMemory(job.matchedGpu.id);
      gpuWiped = true;
    } catch {
      // Non-fatal — log and continue
      await audit('job.complete.gpu_wipe_failed', 'gpu', job.matchedGpu.id, {});
    }

    // 3. Calculate final billing (exact to the minute)
    const startMs = new Date(job.startTime).getTime();
    const totalMinutes = Math.ceil((Date.now() - startMs) / 60_000);
    const totalCost = (totalMinutes / 60) * job.ratePerHour;

    // 4. Release GPU
    await mcPatch(`/gpu/${job.matchedGpu.id}`, { status: 'available' });

    // 5. Update job status in Mission Control
    await mcPatch(`/jobs/${jobId}`, {
      status: 'completed',
      totalCostUsd: Math.round(totalCost * 100) / 100,
      totalMinutes,
      completedAt: new Date().toISOString(),
    });

    // 6. Trigger payout to provider
    let payoutTriggered = false;
    try {
      await mcPost('/payouts', {
        jobId,
        providerId: job.matchedGpu.providerId,
        amountUsd: Math.round(totalCost * 100) / 100,
      });
      payoutTriggered = true;
    } catch {
      await audit('job.complete.payout_failed', 'job', jobId, {});
    }

    const result: JobResult = {
      jobId,
      status: 'completed',
      totalCostUsd: Math.round(totalCost * 100) / 100,
      totalMinutes,
      finalMetrics,
      gpuWiped,
      payoutTriggered,
    };

    await audit('job.complete.success', 'job', jobId, {
      totalCost: result.totalCostUsd,
      totalMinutes,
    });

    return result;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await mcPatch(`/jobs/${jobId}`, { status: 'failed' }).catch(() => {/* best-effort */});
    await audit('job.complete.failed', 'job', jobId, { error: msg });
    throw new Error(`Job completion failed: ${msg}`);
  }
}
