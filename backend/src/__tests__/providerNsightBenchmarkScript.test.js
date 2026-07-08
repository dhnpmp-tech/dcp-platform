const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('provider Nsight benchmark script contract', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-nsight-contract-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('mock mode emits explicit non-production JSON and CSV evidence', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const scriptPath = path.join(repoRoot, 'scripts', 'provider-nsight-benchmark.py');
    const jsonPath = path.join(tmpDir, 'report.json');
    const csvPath = path.join(tmpDir, 'samples.csv');

    const result = spawnSync('python3', [
      scriptPath,
      '--mock',
      '--provider-id',
      'provider_contract_test',
      '--label',
      'ci-contract',
      '--output-json',
      jsonPath,
      '--output-csv',
      csvPath,
    ], { encoding: 'utf8' });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(report).toMatchObject({
      schema_version: '2026-07-08.provider-nsight-benchmark.v1',
      label: 'ci-contract',
      provider_id: 'provider_contract_test',
      evidence_mode: 'mock',
      status: 'completed',
      nsight_profile: {
        mode: 'none',
        status: 'mocked',
      },
      provider_quality_score_input: {
        benchmark_ready: true,
        evidence_mode: 'mock',
        mock_data: true,
        sample_count: 2,
        gpu_count: 1,
        occupancy_pct: 61.5,
        cache_hit_pct: 72.2,
        memory_bandwidth_utilization_pct: 48.4,
        thermal_throttle_risk: false,
        sustained_load_observed: true,
      },
    });
    expect(report.samples).toHaveLength(2);
    expect(report.summary.per_gpu).toHaveLength(1);
    expect(report.summary.missing_metrics).toEqual([]);
    expect(report.csv_path).toBe(csvPath);

    const csvRows = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/);
    expect(csvRows).toHaveLength(3);
    expect(csvRows[0]).toBe([
      'sample_index',
      'timestamp',
      'gpu_index',
      'gpu_uuid',
      'gpu_name',
      'driver_version',
      'utilization_gpu_pct',
      'utilization_memory_pct',
      'memory_total_mib',
      'memory_used_mib',
      'temperature_c',
      'power_w',
      'sm_clock_mhz',
      'mem_clock_mhz',
    ].join(','));
  });
});
