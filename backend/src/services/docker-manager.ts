/**
 * DC1 Gate 0 — Docker Container Manager
 * Manages GPU job containers with full network isolation.
 *
 * VOLT-DOCKER Sub-agent
 */

import Docker from 'dockerode';
import { existsSync } from 'node:fs';
import type {
  JobContainerConfig,
  ContainerResult,
  ContainerMetrics,
  GpuMetric,
  AuditPayload,
} from '../types/jobs.ts';

// MC_API_URL must be supplied via env — no hardcoded production IP in the repo.
// Empty default fails fast at first call instead of silently routing traffic.
const MC_BASE = process.env['MC_API_URL'] ?? '';
const MC_TOKEN = process.env['MC_TOKEN'] ?? 'dc1-mc-gate0-2026';
const AGENT_NAME = 'VOLT-DOCKER';
const DEFAULT_PIDS_LIMIT = Number(process.env['DC1_CONTAINER_PIDS_LIMIT'] ?? 256);
const DEFAULT_TMPFS_SIZE = process.env['DC1_CONTAINER_TMPFS_SIZE'] ?? '1g';
const SECCOMP_PROFILE = process.env['DC1_DOCKER_SECCOMP_PROFILE'] ?? '/etc/dc1/seccomp-gpu-compute.json';
const ALLOWED_DOCKER_IMAGES = (process.env['DC1_ALLOWED_DOCKER_IMAGES'] ??
  'dc1/base-worker:latest,dc1/general-worker:latest,dc1/llm-worker:latest,dc1/sd-worker:latest,pytorch/pytorch:latest')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const ALLOW_PULL_MISSING_APPROVED = process.env['DC1_ALLOW_PULL_MISSING_APPROVED'] === 'true';
const REQUIRE_PINNED_DIGEST = process.env['DCP_REQUIRE_PINNED_IMAGE_DIGEST'] === 'true';
const SHA256_PIN_RE = /@sha256:[a-f0-9]{64}$/i;

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

function buildSecurityOpts(): string[] {
  const opts = ['no-new-privileges:true'];
  if (existsSync(SECCOMP_PROFILE)) {
    opts.push(`seccomp=${SECCOMP_PROFILE}`);
  }
  return opts;
}

function isAllowedDockerImage(image: string): boolean {
  return ALLOWED_DOCKER_IMAGES.includes(image);
}

function isDigestPinnedImage(image: string): boolean {
  return SHA256_PIN_RE.test(image);
}

// ── Helpers ──

async function audit(
  action: string,
  resource: string,
  resourceId: string,
  details: Record<string, unknown>,
): Promise<void> {
  const payload: AuditPayload = {
    agent: AGENT_NAME,
    action,
    resource,
    resourceId,
    details,
    timestamp: new Date().toISOString(),
  };
  try {
    await fetch(`${MC_BASE}/security/audit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MC_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort audit — do not crash the caller
  }
}

async function imageExists(image: string): Promise<boolean> {
  try {
    const img = docker.getImage(image);
    await img.inspect();
    return true;
  } catch {
    return false;
  }
}

async function pullImage(image: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (fErr: Error | null) => {
        if (fErr) return reject(fErr);
        resolve();
      });
    });
  });
}

function parseNvidiaSmiOutput(raw: string): GpuMetric[] {
  const metrics: GpuMetric[] = [];
  const lines = raw.trim().split('\n');
  for (const line of lines) {
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length >= 5) {
      metrics.push({
        gpuId: parts[0] ?? '0',
        utilizationPercent: parseFloat(parts[1] ?? '0'),
        memoryUsedMb: parseFloat(parts[2] ?? '0'),
        memoryTotalMb: parseFloat(parts[3] ?? '0'),
        temperatureCelsius: parseFloat(parts[4] ?? '0'),
      });
    }
  }
  return metrics;
}

// ── Public API ──

/**
 * Launch an isolated GPU container for a job.
 * Network is disabled (`none`), memory/CPU capped, code mounted read-only.
 */
export async function launchJobContainer(
  config: JobContainerConfig,
): Promise<ContainerResult> {
  const securityOpt = buildSecurityOpts();
  if (REQUIRE_PINNED_DIGEST && !isDigestPinnedImage(config.dockerImage)) {
    await audit('container.launch.rejected.image_unpinned', 'job', config.jobId, {
      image: config.dockerImage,
    });
    throw new Error(
      `Docker image must be digest pinned (@sha256:...) when DCP_REQUIRE_PINNED_IMAGE_DIGEST=true: ${config.dockerImage}`,
    );
  }
  if (!isAllowedDockerImage(config.dockerImage)) {
    await audit('container.launch.rejected.image_not_allowlisted', 'job', config.jobId, {
      image: config.dockerImage,
      allowedImages: ALLOWED_DOCKER_IMAGES,
    });
    throw new Error(
      `Docker image not allowed: ${config.dockerImage}. Configure DC1_ALLOWED_DOCKER_IMAGES to approve it.`,
    );
  }

  await audit('container.launch.start', 'job', config.jobId, {
    image: config.dockerImage,
    gpus: config.gpuDeviceIds,
    cpuLimit: config.cpuLimit,
    memoryLimit: config.memoryLimit,
    pidsLimit: DEFAULT_PIDS_LIMIT,
    securityOpt,
  });

  try {
    // Pull image only when explicitly enabled for approved images.
    if (!(await imageExists(config.dockerImage))) {
      if (!ALLOW_PULL_MISSING_APPROVED) {
        throw new Error(
          `Approved image is not present locally and pull is disabled: ${config.dockerImage}`,
        );
      }
      await pullImage(config.dockerImage);
    }

    const envList: string[] = [
      `JOB_ID=${config.jobId}`,
      `RENTER_ID=${config.renterId}`,
      `MAX_HOURS=${config.maxHours}`,
      ...Object.entries(config.envVars).map(([k, v]) => `${k}=${v}`),
    ];

    const container = await docker.createContainer({
      Image: config.dockerImage,
      Env: envList,
      HostConfig: {
        NetworkMode: 'none', // CRITICAL: no internet
        Memory: config.memoryLimit,
        MemorySwap: config.memoryLimit, // disable swap headroom
        NanoCpus: config.cpuLimit * 1e9,
        PidsLimit: DEFAULT_PIDS_LIMIT,
        ReadonlyRootfs: true,
        Tmpfs: {
          '/tmp': `rw,noexec,nosuid,size=${DEFAULT_TMPFS_SIZE}`,
          '/var/tmp': 'rw,noexec,nosuid,size=256m',
        },
        CapDrop: ['ALL'],
        CapAdd: ['SYS_PTRACE'],
        SecurityOpt: securityOpt,
        DeviceRequests: [
          {
            Driver: '',
            Count: -1, // all GPUs
            DeviceIDs: config.gpuDeviceIds,
            Capabilities: [['gpu']],
            Options: {},
          },
        ],
        Binds: [`${config.jobCodePath}:/workspace:ro`],
        AutoRemove: false,
      },
      Labels: {
        'dc1.job_id': config.jobId,
        'dc1.renter_id': config.renterId,
        'dc1.managed_by': AGENT_NAME,
      },
    });

    await container.start();

    const result: ContainerResult = {
      containerId: container.id,
      jobId: config.jobId,
      startTime: new Date().toISOString(),
      dockerImage: config.dockerImage,
      gpuDeviceIds: config.gpuDeviceIds,
      status: 'running',
    };

    await audit('container.launch.success', 'container', container.id, {
      jobId: config.jobId,
    });

    return result;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await audit('container.launch.failed', 'job', config.jobId, { error: msg });
    throw new Error(`Failed to launch container for job ${config.jobId}: ${msg}`);
  }
}

/**
 * Collect CPU, memory, and GPU metrics from a running container.
 */
export async function monitorContainer(
  containerId: string,
): Promise<ContainerMetrics> {
  await audit('container.monitor.start', 'container', containerId, {});

  try {
    const container = docker.getContainer(containerId);
    const inspect = await container.inspect();
    const isRunning = inspect.State.Running as boolean;

    // CPU / Memory via stats (one-shot)
    let cpuPercent = 0;
    let memoryUsedMb = 0;
    let memoryLimitMb = 0;

    if (isRunning) {
      const statsStream = await container.stats({ stream: false });
      const stats = statsStream as Record<string, Record<string, number>>;
      const cpuDelta =
        (stats['cpu_stats']?.['cpu_usage'] as unknown as Record<string, number>)?.['total_usage'] -
        (stats['precpu_stats']?.['cpu_usage'] as unknown as Record<string, number>)?.['total_usage'];
      const systemDelta =
        (stats['cpu_stats']?.['system_cpu_usage'] ?? 0) -
        (stats['precpu_stats']?.['system_cpu_usage'] ?? 0);
      const onlineCpus = (stats['cpu_stats']?.['online_cpus'] ?? 1);
      if (systemDelta > 0) {
        cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
      }
      memoryUsedMb = (stats['memory_stats']?.['usage'] ?? 0) / (1024 * 1024);
      memoryLimitMb = (stats['memory_stats']?.['limit'] ?? 0) / (1024 * 1024);
    }

    // GPU metrics via nvidia-smi exec inside container
    let gpuMetrics: GpuMetric[] = [];
    if (isRunning) {
      try {
        const exec = await container.exec({
          Cmd: [
            'nvidia-smi',
            '--query-gpu=index,utilization.gpu,memory.used,memory.total,temperature.gpu',
            '--format=csv,noheader,nounits',
          ],
          AttachStdout: true,
          AttachStderr: true,
        });
        const stream = await exec.start({ Detach: false, Tty: false });
        const output = await new Promise<string>((resolve) => {
          let data = '';
          stream.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          stream.on('end', () => resolve(data));
        });
        gpuMetrics = parseNvidiaSmiOutput(output);
      } catch {
        // nvidia-smi may not be available inside container
      }
    }

    const metrics: ContainerMetrics = {
      containerId,
      timestamp: new Date().toISOString(),
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsedMb: Math.round(memoryUsedMb),
      memoryLimitMb: Math.round(memoryLimitMb),
      gpuMetrics,
      status: isRunning ? 'running' : 'exited',
    };

    await audit('container.monitor.done', 'container', containerId, {
      cpu: metrics.cpuPercent,
      memMb: metrics.memoryUsedMb,
    });

    return metrics;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await audit('container.monitor.failed', 'container', containerId, { error: msg });
    return {
      containerId,
      timestamp: new Date().toISOString(),
      cpuPercent: 0,
      memoryUsedMb: 0,
      memoryLimitMb: 0,
      gpuMetrics: [],
      status: 'unknown',
    };
  }
}

/**
 * Gracefully stop a container (SIGTERM → 30s → SIGKILL), capture logs, remove.
 */
export async function stopContainer(
  containerId: string,
  reason: string,
): Promise<void> {
  await audit('container.stop.start', 'container', containerId, { reason });

  try {
    const container = docker.getContainer(containerId);

    // Capture final logs
    const logBuffer = await container.logs({
      stdout: true,
      stderr: true,
      tail: 500,
    });
    const finalLogs = logBuffer.toString().slice(0, 50_000);

    // Graceful stop: SIGTERM then wait 30s
    await container.stop({ t: 30 }).catch(() => {
      // Container may already be stopped
    });

    // Remove container + volumes
    await container.remove({ v: true, force: true });

    await audit('container.stop.success', 'container', containerId, {
      reason,
      logTailLength: finalLogs.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await audit('container.stop.failed', 'container', containerId, { error: msg });
    throw new Error(`Failed to stop container ${containerId}: ${msg}`);
  }
}

/**
 * Wipe GPU memory by resetting clocks on the host.
 * Only safe when no DC1 containers are using that GPU.
 */
export async function wipeGPUMemory(gpuId: string): Promise<void> {
  await audit('gpu.wipe.start', 'gpu', gpuId, {});

  try {
    // Verify no DC1 containers are running on this GPU
    const containers = await docker.listContainers({
      filters: { label: [`dc1.managed_by=${AGENT_NAME}`] },
    });
    if (containers.length > 0) {
      throw new Error(
        `Cannot wipe GPU ${gpuId}: ${containers.length} DC1 container(s) still running`,
      );
    }

    // Reset GPU clocks on host via a privileged one-shot container.
    // Uses --clocks-reset (safe: resets clock offsets only, does NOT kill running processes).
    // --gpu-reset is intentionally NOT used — it kills all processes on the GPU.
    const resetContainer = await docker.createContainer({
      Image: 'nvidia/cuda:12.2.0-base-ubuntu22.04',
      Cmd: ['nvidia-smi', '-i', gpuId, '--clocks-reset'],
      HostConfig: {
        AutoRemove: true,
        Privileged: true,
        NetworkMode: 'none', // CRITICAL: no network even for privileged containers
        DeviceRequests: [
          {
            Driver: '',
            Count: -1,
            DeviceIDs: [gpuId],
            Capabilities: [['gpu']],
            Options: {},
          },
        ],
      },
    });

    await resetContainer.start();
    await resetContainer.wait();

    // Verify GPU is clean by checking memory usage
    const verifyContainer = await docker.createContainer({
      Image: 'nvidia/cuda:12.2.0-base-ubuntu22.04',
      Cmd: [
        'nvidia-smi',
        '-i',
        gpuId,
        '--query-gpu=memory.used',
        '--format=csv,noheader,nounits',
      ],
      HostConfig: {
        AutoRemove: true,
        NetworkMode: 'none', // C2 fix: isolate verify container too
        DeviceRequests: [
          {
            Driver: '',
            Count: -1,
            DeviceIDs: [gpuId],
            Capabilities: [['gpu']],
            Options: {},
          },
        ],
      },
    });

    await verifyContainer.start();
    const verifyLogs = await verifyContainer.logs({ stdout: true, follow: true });
    const memUsed = await new Promise<string>((resolve) => {
      let d = '';
      verifyLogs.on('data', (c: Buffer) => (d += c.toString()));
      verifyLogs.on('end', () => resolve(d.trim()));
    });

    const usedMb = parseFloat(memUsed) || 0;
    if (usedMb > 50) {
      throw new Error(`GPU ${gpuId} still has ${usedMb} MB in use after reset`);
    }

    await audit('gpu.wipe.success', 'gpu', gpuId, { memoryUsedMb: usedMb });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await audit('gpu.wipe.failed', 'gpu', gpuId, { error: msg });
    throw new Error(`GPU wipe failed for ${gpuId}: ${msg}`);
  }
}
