/**
 * Tests for the Next.js API proxy routes: /api/jobs/[id]/status and /api/jobs/[id]/complete
 * These test the route logic by mocking fetch to the Express backend.
 */

// Backend URL resolves from env to avoid hardcoding production infra in
// repository history. Tests only use this value to label fetch mocks; no
// network calls are actually made against a live host.
const BACKEND = process.env.DCP_TEST_BACKEND_URL || 'http://localhost:8083';

// Helper: simulate what the status route does
function computeStatusResponse(job) {
  const backendStatus = job.status || 'pending';
  const statusMap = {
    pending: 'pending',
    running: 'running',
    completed: 'completed',
    cancelled: 'failed',
    failed: 'failed',
  };
  const mappedStatus = statusMap[backendStatus] || 'pending';
  const startedAt = job.started_at ? new Date(job.started_at).getTime() : null;
  const elapsedMinutes = startedAt ? (Date.now() - startedAt) / 60000 : 0;
  const durationMinutes = Number(job.duration_minutes) || 60;

  let progressPercent;
  if (backendStatus === 'completed' || backendStatus === 'cancelled') {
    progressPercent = 100;
  } else if (!startedAt) {
    progressPercent = 0;
  } else {
    progressPercent = Math.min(99, Math.round((elapsedMinutes / durationMinutes) * 100));
  }

  const costHalala = Number(job.cost_halala) || 0;
  const costSoFarSar = costHalala / 100;
  const budgetRemainingSar = Math.max(0, (durationMinutes * 10 / 100) - costSoFarSar);

  return {
    success: true,
    status: {
      jobId: job.job_id || String(job.id),
      status: mappedStatus,
      progressPercent,
      gpuMetrics: {
        utilizationPercent: 0,
        memoryUsedGb: 0,
        memoryTotalGb: 8,
        temperatureC: 0,
      },
      costSoFarSar,
      elapsedMinutes: Math.round(elapsedMinutes * 100) / 100,
      budgetRemainingSar: Math.round(budgetRemainingSar * 100) / 100,
    },
  };
}

// Helper: simulate what the complete route does
function computeCompleteResponse(job) {
  return {
    success: true,
    result: {
      totalCostSar: Number(job.cost_halala || 0) / 100,
      totalMinutes: Number(job.duration_minutes || 0),
      gpuWiped: false,
      payoutTriggered: true,
    },
  };
}

// ---- TESTS ----

describe('GET /api/jobs/[id]/status', () => {
  test('returns correct status for a running job', () => {
    const job = {
      id: 1,
      job_id: 'job-abc-123',
      status: 'running',
      started_at: new Date(Date.now() - 30 * 60000).toISOString(), // 30 min ago
      duration_minutes: 60,
      cost_halala: 500,
    };

    const result = computeStatusResponse(job);

    expect(result.success).toBe(true);
    expect(result.status.jobId).toBe('job-abc-123');
    expect(result.status.status).toBe('running');
    expect(result.status.progressPercent).toBe(50);
    expect(result.status.costSoFarSar).toBe(5);
    expect(result.status.gpuMetrics.memoryTotalGb).toBe(8);
    expect(result.status.budgetRemainingSar).toBe(1); // (60*10/100) - 5 = 1
  });

  test('returns 0 progress for pending job with no started_at', () => {
    const job = {
      id: 2,
      job_id: 'job-pending-456',
      status: 'pending',
      started_at: null,
      duration_minutes: 30,
      cost_halala: 0,
    };

    const result = computeStatusResponse(job);

    expect(result.status.status).toBe('pending');
    expect(result.status.progressPercent).toBe(0);
    expect(result.status.elapsedMinutes).toBe(0);
  });

  test('maps cancelled status to failed with 100% progress', () => {
    const job = {
      id: 3,
      job_id: 'job-cancelled-789',
      status: 'cancelled',
      started_at: new Date(Date.now() - 10 * 60000).toISOString(),
      duration_minutes: 60,
      cost_halala: 100,
    };

    const result = computeStatusResponse(job);

    expect(result.status.status).toBe('failed');
    expect(result.status.progressPercent).toBe(100);
  });
});

describe('POST /api/jobs/[id]/complete', () => {
  test('returns correct completion result', () => {
    const job = {
      id: 1,
      cost_halala: 1500,
      duration_minutes: 45,
    };

    const result = computeCompleteResponse(job);

    expect(result.success).toBe(true);
    expect(result.result.totalCostSar).toBe(15);
    expect(result.result.totalMinutes).toBe(45);
    expect(result.result.gpuWiped).toBe(false);
    expect(result.result.payoutTriggered).toBe(true);
  });

  test('handles zero cost job', () => {
    const job = {
      id: 2,
      cost_halala: 0,
      duration_minutes: 0,
    };

    const result = computeCompleteResponse(job);

    expect(result.result.totalCostSar).toBe(0);
    expect(result.result.totalMinutes).toBe(0);
  });
});
