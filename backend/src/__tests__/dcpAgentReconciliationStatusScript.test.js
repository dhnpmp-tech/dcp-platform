'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CONTRACT,
  findReconciliationBlockers,
  parseKeyValueLines,
  runDcpAgentReconciliationStatus,
} = require('../../../scripts/run-dcp-agent-reconciliation-status');

function platformSnapshot(overrides = {}) {
  return {
    repo_root: '/repo/dcp-platform',
    branch: 'main',
    head: 'platform-head',
    status_short: '',
    errors: [],
    ...overrides,
  };
}

function agentSnapshot(overrides = {}) {
  return {
    path: '/Users/pp/DC1-Platform/dcp-agent',
    exists: true,
    is_git_repo: true,
    branch: null,
    head: 'faf4cf9fff924a17290c2248c71362b6e21385bf',
    status_short: '',
    remotes: {
      origin: 'https://github.com/DCP-SA/dcp-agent.git',
      dcp: 'https://github.com/dhnpmp-tech/dcp-agent.git',
    },
    remote_heads: {
      origin_main: 'cfb8f29143fcaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      dcp_main: 'cfb8f29143fcaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    errors: [],
    ...overrides,
  };
}

function gatewaySnapshot(overrides = {}) {
  return {
    checked: true,
    processes: [{
      pid: 1731,
      command: '/Users/pp/DC1-Platform/dcp-agent/.venv/bin/python -m hermes_cli.main gateway run --replace',
    }],
    error: null,
    ...overrides,
  };
}

function vpsSnapshot(overrides = {}) {
  return {
    checked: true,
    host: 'root@76.13.179.86',
    path: '/root/dc1-platform',
    ok: true,
    git: {
      branch: 'security/staged-rollouts',
      head: 'platform-head',
      status_short: '?? backend/installers/dcp-agent.tar.gz\n',
    },
    artifact: {
      path: '/root/dc1-platform/backend/installers/dcp-agent.tar.gz',
      exists: true,
      size_bytes: 12345,
      sha256: 'abc123',
      top_level_entries: ['dcp-agent/', 'dcp-agent/pyproject.toml'],
      has_dcp_agent_wrapper: true,
      appledouble_entries: [],
    },
    ...overrides,
  };
}

describe('dcp-agent reconciliation status script', () => {
  test('writes a blocked read-only packet when local agent and production artifact still need maintenance', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-agent-reconcile-'));

    const { report, exitCode } = runDcpAgentReconciliationStatus({
      outputDir,
      platformSnapshot: platformSnapshot(),
      agentSnapshot: agentSnapshot(),
      gatewaySnapshot: gatewaySnapshot(),
      localArtifactSnapshot: { path: '/repo/dcp-platform/backend/installers/dcp-agent.tar.gz', exists: false },
      vpsSnapshot: vpsSnapshot(),
    });

    expect(exitCode).toBe(2);
    expect(report.contract).toBe(CONTRACT);
    expect(report.verdict).toBe('BLOCKED');
    expect(report.maintenance_required).toBe(true);
    expect(report.failure).toMatchObject({
      code: 'DCP_AGENT_RECONCILIATION_MAINTENANCE_REQUIRED',
      details: {
        blockers: expect.arrayContaining([
          'local_agent_detached_head',
          'local_agent_not_on_remote_main',
          'active_local_gateway_process',
          'production_agent_tarball_requires_owner_decision',
        ]),
      },
    });
    expect(report.claims).toMatchObject({
      stops_gateway: false,
      mutates_agent_repo: false,
      rebuilds_agent_tarball: false,
      deletes_production_artifacts: false,
      restarts_services: false,
      changes_manifest: false,
    });
    expect(report.safe_maintenance_order).toEqual(expect.arrayContaining([
      'stop_local_gateway_process',
      'fast_forward_dcp_agent_to_remote_main',
      'rebuild_or_retire_served_agent_tarball_with_owner_approval',
    ]));
    expect(fs.existsSync(path.join(outputDir, 'dcp-agent-reconciliation-latest.json'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'dcp-agent-reconciliation-latest.md'))).toBe(true);
  });

  test('passes when source, gateway, and artifact inventory are already reconciled', () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcp-agent-reconcile-pass-'));
    const remoteHead = 'cfb8f29143fcaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const { report, exitCode } = runDcpAgentReconciliationStatus({
      outputDir,
      platformSnapshot: platformSnapshot(),
      agentSnapshot: agentSnapshot({
        branch: 'main',
        head: remoteHead,
        remote_heads: { origin_main: remoteHead },
      }),
      gatewaySnapshot: gatewaySnapshot({ processes: [] }),
      localArtifactSnapshot: { path: '/repo/dcp-platform/backend/installers/dcp-agent.tar.gz', exists: false },
      vpsSnapshot: vpsSnapshot({
        artifact: {
          path: '/root/dc1-platform/backend/installers/dcp-agent.tar.gz',
          exists: false,
        },
        git: {
          branch: 'security/staged-rollouts',
          head: 'platform-head',
          status_short: '?? docs/reports/\n',
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(report.verdict).toBe('PASS');
    expect(report.maintenance_required).toBe(false);
    expect(report.failure).toBeNull();
  });

  test('detects tracked dirt while ignoring untracked production artifacts', () => {
    const report = {
      platform: platformSnapshot(),
      agent_repo: agentSnapshot({
        branch: 'main',
        head: 'same',
        remote_heads: { origin_main: 'same' },
        status_short: ' M gateway/main.py\n?? scratch.log\n',
      }),
      gateway: gatewaySnapshot({ processes: [] }),
      artifacts: {
        local: { exists: false },
      },
      vps: vpsSnapshot({
        artifact: { exists: false },
        git: {
          head: 'platform-head',
          status_short: '?? backend/installers/dcp-agent.tar.gz\n',
        },
      }),
    };

    expect(findReconciliationBlockers(report)).toEqual([
      'local_agent_has_tracked_changes',
    ]);
    expect(parseKeyValueLines('head=abc\nartifact_exists=true\n')).toMatchObject({
      head: 'abc',
      artifact_exists: 'true',
    });
  });
});
