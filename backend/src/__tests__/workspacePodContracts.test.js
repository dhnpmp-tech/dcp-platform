const { verifyContracts } = require('../scripts/verify-workspace-pod-contracts');

describe('workspace pod contracts', () => {
  test('workspace upload, pod task_spec, and daemon restore/snapshot path stay wired', () => {
    const result = verifyContracts();
    expect(result.errors).toEqual([]);
    expect(result.contract.version).toBe('dcp.workspace_pod_contracts.v1');
    expect(result.contract.checks).toEqual([
      'pod_task_spec_stable_provider_volume',
      'pod_task_spec_portable_s3_volume',
      'pod_view_tier_truthfulness',
      'workspace_api_requires_active_volume',
      'daemon_restore_before_container_start',
      'daemon_snapshot_after_container_stop',
    ]);
  });
});
