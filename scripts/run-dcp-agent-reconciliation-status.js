#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'dcp-agent-reconciliation';
const CONTRACT = 'dcp.dcp_agent_reconciliation_status.v1';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function defaultCommandRunner(command, args = [], options = {}) {
  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
      ...options,
    });
    return { ok: true, stdout, stderr: '', status: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : '',
      status: error.status ?? 1,
      error: error.message,
    };
  }
}

function trim(value) {
  return String(value || '').trim();
}

function sha256File(filePath, fsImpl = fs) {
  return crypto.createHash('sha256').update(fsImpl.readFileSync(filePath)).digest('hex');
}

function safeGit(repoPath, args, runCommand) {
  const result = runCommand('git', ['-C', repoPath, ...args]);
  return {
    ok: result.ok,
    value: result.ok ? trim(result.stdout) : null,
    error: result.ok ? null : trim(result.stderr || result.error),
  };
}

function parseLsRemote(value) {
  const line = trim(value).split(/\r?\n/).find(Boolean);
  if (!line) return null;
  return line.split(/\s+/)[0] || null;
}

function collectPlatformSnapshot(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const runCommand = options.runCommand || defaultCommandRunner;
  const branch = safeGit(repoRoot, ['branch', '--show-current'], runCommand);
  const head = safeGit(repoRoot, ['rev-parse', 'HEAD'], runCommand);
  const status = safeGit(repoRoot, ['status', '--short'], runCommand);
  return {
    repo_root: repoRoot,
    branch: branch.value || null,
    head: head.value || null,
    status_short: status.value || '',
    errors: [branch, head, status].filter((entry) => !entry.ok).map((entry) => entry.error),
  };
}

function collectAgentRepoSnapshot(options = {}) {
  const agentRepoPath = options.agentRepoPath || process.env.DCP_AGENT_REPO_PATH || '/Users/pp/DC1-Platform/dcp-agent';
  const fsImpl = options.fsImpl || fs;
  const runCommand = options.runCommand || defaultCommandRunner;
  if (!fsImpl.existsSync(agentRepoPath)) {
    return {
      path: agentRepoPath,
      exists: false,
      is_git_repo: false,
      branch: null,
      head: null,
      status_short: '',
      remotes: {},
      remote_heads: {},
      errors: [],
    };
  }

  const inside = safeGit(agentRepoPath, ['rev-parse', '--is-inside-work-tree'], runCommand);
  const branch = safeGit(agentRepoPath, ['branch', '--show-current'], runCommand);
  const head = safeGit(agentRepoPath, ['rev-parse', 'HEAD'], runCommand);
  const status = safeGit(agentRepoPath, ['status', '--short'], runCommand);
  const remoteNames = safeGit(agentRepoPath, ['remote'], runCommand);
  const remotes = {};
  const remoteHeads = {};
  if (remoteNames.ok) {
    for (const remote of remoteNames.value.split(/\s+/).filter(Boolean)) {
      const url = safeGit(agentRepoPath, ['remote', 'get-url', remote], runCommand);
      remotes[remote] = url.value || null;
      const ls = runCommand('git', ['-C', agentRepoPath, 'ls-remote', remote, 'refs/heads/main']);
      remoteHeads[`${remote}_main`] = ls.ok ? parseLsRemote(ls.stdout) : null;
    }
  }

  return {
    path: agentRepoPath,
    exists: true,
    is_git_repo: inside.value === 'true',
    branch: branch.value || null,
    head: head.value || null,
    status_short: status.value || '',
    remotes,
    remote_heads: remoteHeads,
    errors: [inside, branch, head, status, remoteNames].filter((entry) => !entry.ok).map((entry) => entry.error),
  };
}

function collectGatewayProcesses(options = {}) {
  const runCommand = options.runCommand || defaultCommandRunner;
  const result = runCommand('ps', ['-axo', 'pid=,command=']);
  if (!result.ok) {
    return {
      checked: false,
      processes: [],
      error: trim(result.stderr || result.error),
    };
  }
  const processes = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter(Boolean)
    .filter((processInfo) => (
      processInfo.command.includes('hermes_cli.main gateway run')
      || processInfo.command.includes('/dcp-agent/.venv/')
    ))
    .filter((processInfo) => !processInfo.command.includes('run-dcp-agent-reconciliation-status.js'));
  return {
    checked: true,
    processes,
    error: null,
  };
}

function inspectAgentArtifact(artifactPath, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const runCommand = options.runCommand || defaultCommandRunner;
  if (!fsImpl.existsSync(artifactPath)) {
    return {
      path: artifactPath,
      exists: false,
    };
  }
  const stat = fsImpl.statSync(artifactPath);
  const tarList = runCommand('tar', ['-tzf', artifactPath]);
  const entries = tarList.ok ? tarList.stdout.split(/\r?\n/).filter(Boolean) : [];
  return {
    path: artifactPath,
    exists: true,
    size_bytes: stat.size,
    sha256: sha256File(artifactPath, fsImpl),
    tar_listing_available: tarList.ok,
    tar_listing_error: tarList.ok ? null : trim(tarList.stderr || tarList.error),
    top_level_entries: entries.slice(0, 20),
    has_dcp_agent_wrapper: entries.some((entry) => entry === 'dcp-agent/' || entry.startsWith('dcp-agent/')),
    appledouble_entries: entries.filter((entry) => entry.includes('/._') || entry.startsWith('._')).slice(0, 20),
  };
}

function decodeBase64(value) {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch (_) {
    return '';
  }
}

function parseKeyValueLines(stdout) {
  const parsed = {};
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index <= 0) continue;
    parsed[line.slice(0, index)] = line.slice(index + 1);
  }
  return parsed;
}

function collectVpsSnapshot(options = {}) {
  const readRemote = options.readRemote ?? process.env.DCP_AGENT_RECONCILE_READ_REMOTE === '1';
  const runCommand = options.runCommand || defaultCommandRunner;
  const fsImpl = options.fsImpl || fs;
  const vpsHost = options.vpsHost || process.env.DCP_VPS_HOST || 'root@76.13.179.86';
  const vpsPath = options.vpsPath || process.env.DCP_VPS_PLATFORM_PATH || '/root/dc1-platform';
  if (!readRemote) {
    return {
      checked: false,
      host: vpsHost,
      path: vpsPath,
      reason: 'set DCP_AGENT_RECONCILE_READ_REMOTE=1 to include read-only VPS inventory',
    };
  }
  if (fsImpl.existsSync(vpsPath)) {
    return collectVpsSnapshotFromLocalPath({
      vpsHost,
      vpsPath,
      fsImpl,
      runCommand,
    });
  }

  const remoteScript = `
set -eu
cd ${JSON.stringify(vpsPath)}
printf 'branch=%s\\n' "$(git branch --show-current)"
printf 'head=%s\\n' "$(git rev-parse HEAD)"
printf 'status_short_b64=%s\\n' "$(git status --short | base64 -w 0 2>/dev/null || git status --short | base64 | tr -d '\\n')"
if [ -f backend/installers/dcp-agent.tar.gz ]; then
  printf 'artifact_exists=true\\n'
  printf 'artifact_size=%s\\n' "$(wc -c < backend/installers/dcp-agent.tar.gz | tr -d ' ')"
  if command -v sha256sum >/dev/null 2>&1; then
    printf 'artifact_sha256=%s\\n' "$(sha256sum backend/installers/dcp-agent.tar.gz | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    printf 'artifact_sha256=%s\\n' "$(shasum -a 256 backend/installers/dcp-agent.tar.gz | awk '{print $1}')"
  fi
  printf 'artifact_listing_b64=%s\\n' "$(tar -tzf backend/installers/dcp-agent.tar.gz 2>/dev/null | head -n 40 | base64 -w 0 2>/dev/null || tar -tzf backend/installers/dcp-agent.tar.gz 2>/dev/null | head -n 40 | base64 | tr -d '\\n')"
else
  printf 'artifact_exists=false\\n'
fi
`;
  const result = runCommand('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', vpsHost, remoteScript]);
  if (!result.ok) {
    return {
      checked: true,
      host: vpsHost,
      path: vpsPath,
      ok: false,
      error: trim(result.stderr || result.error),
    };
  }
  const parsed = parseKeyValueLines(result.stdout);
  const listing = decodeBase64(parsed.artifact_listing_b64).split(/\r?\n/).filter(Boolean);
  return {
    checked: true,
    host: vpsHost,
    path: vpsPath,
    ok: true,
    git: {
      branch: parsed.branch || null,
      head: parsed.head || null,
      status_short: decodeBase64(parsed.status_short_b64),
    },
    artifact: {
      path: `${vpsPath}/backend/installers/dcp-agent.tar.gz`,
      exists: parsed.artifact_exists === 'true',
      size_bytes: parsed.artifact_size ? Number(parsed.artifact_size) : null,
      sha256: parsed.artifact_sha256 || null,
      top_level_entries: listing.slice(0, 20),
      has_dcp_agent_wrapper: listing.some((entry) => entry === 'dcp-agent/' || entry.startsWith('dcp-agent/')),
      appledouble_entries: listing.filter((entry) => entry.includes('/._') || entry.startsWith('._')).slice(0, 20),
    },
  };
}

function collectVpsSnapshotFromLocalPath(options = {}) {
  const vpsHost = options.vpsHost || process.env.DCP_VPS_HOST || 'root@76.13.179.86';
  const vpsPath = options.vpsPath || process.env.DCP_VPS_PLATFORM_PATH || '/root/dc1-platform';
  const fsImpl = options.fsImpl || fs;
  const runCommand = options.runCommand || defaultCommandRunner;
  const branch = safeGit(vpsPath, ['branch', '--show-current'], runCommand);
  const head = safeGit(vpsPath, ['rev-parse', 'HEAD'], runCommand);
  const status = safeGit(vpsPath, ['status', '--short'], runCommand);
  const artifact = inspectAgentArtifact(path.join(vpsPath, 'backend/installers/dcp-agent.tar.gz'), {
    fsImpl,
    runCommand,
  });
  return {
    checked: true,
    host: vpsHost,
    path: vpsPath,
    ok: branch.ok && head.ok && status.ok,
    transport: 'local_path',
    error: [branch, head, status].filter((entry) => !entry.ok).map((entry) => entry.error).filter(Boolean).join('; ') || null,
    git: {
      branch: branch.value || null,
      head: head.value || null,
      status_short: status.value || '',
    },
    artifact,
  };
}

function trackedDirtyLines(statusShort) {
  return String(statusShort || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('??'));
}

function firstRemoteMain(remoteHeads) {
  return remoteHeads.origin_main || remoteHeads.dcp_main || Object.values(remoteHeads).find(Boolean) || null;
}

function findReconciliationBlockers(report) {
  const blockers = [];
  const agent = report.agent_repo || {};
  const gateway = report.gateway || {};
  const localArtifact = report.artifacts?.local || {};
  const vps = report.vps || {};
  const remoteMain = firstRemoteMain(agent.remote_heads || {});

  if (!agent.exists) blockers.push('local_agent_repo_missing');
  if (agent.exists && agent.is_git_repo !== true) blockers.push('local_agent_not_git_repo');
  if (agent.exists && !agent.branch) blockers.push('local_agent_detached_head');
  if (agent.exists && remoteMain && agent.head && agent.head !== remoteMain) blockers.push('local_agent_not_on_remote_main');
  if (trackedDirtyLines(agent.status_short).length > 0) blockers.push('local_agent_has_tracked_changes');
  if (Array.isArray(gateway.processes) && gateway.processes.length > 0) blockers.push('active_local_gateway_process');
  if (localArtifact.exists) blockers.push('local_platform_agent_tarball_requires_owner_decision');
  if (vps.checked && vps.ok === false) blockers.push('vps_inventory_unavailable');
  if (vps.checked && vps.git?.head && report.platform?.head && vps.git.head !== report.platform.head) blockers.push('vps_platform_not_at_local_head');
  if (vps.checked && trackedDirtyLines(vps.git?.status_short).length > 0) blockers.push('vps_platform_has_tracked_changes');
  if (vps.checked && vps.artifact?.exists) blockers.push('production_agent_tarball_requires_owner_decision');
  if (vps.checked && vps.artifact?.appledouble_entries?.length > 0) blockers.push('production_agent_tarball_contains_appledouble_entries');
  return blockers;
}

function classifyFailure(code, message, details = {}) {
  const actions = {
    DCP_AGENT_RECONCILIATION_MAINTENANCE_REQUIRED: 'Schedule the controlled gateway maintenance window; stop the local gateway, fast-forward dcp-agent, rebuild or retire the served tarball, then restart and smoke.',
    DCP_AGENT_RECONCILIATION_STATUS_FAILED: 'Inspect command errors in the status packet and rerun with read-only access to the local agent repo and VPS inventory.',
  };
  return {
    code,
    severity: 'blocking',
    message,
    action: actions[code] || 'Inspect the dcp-agent reconciliation packet.',
    details,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# dcp-agent Reconciliation Status');
  lines.push('');
  lines.push(`- contract: \`${report.contract}\``);
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- command: \`${report.command}\``);
  lines.push(`- maintenance_required: ${report.maintenance_required}`);
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  lines.push('| item | value |');
  lines.push('|---|---|');
  lines.push(`| platform_head | \`${report.platform.head || ''}\` |`);
  lines.push(`| agent_head | \`${report.agent_repo.head || ''}\` |`);
  lines.push(`| agent_branch | \`${report.agent_repo.branch || '(detached)'}\` |`);
  lines.push(`| agent_remote_main | \`${firstRemoteMain(report.agent_repo.remote_heads || {}) || ''}\` |`);
  lines.push(`| active_gateway_processes | ${report.gateway.processes.length} |`);
  lines.push(`| local_agent_tarball | ${report.artifacts.local.exists ? 'present' : 'absent'} |`);
  lines.push(`| vps_checked | ${report.vps.checked} |`);
  lines.push(`| vps_head | \`${report.vps.git?.head || ''}\` |`);
  lines.push(`| vps_agent_tarball | ${report.vps.artifact?.exists ? 'present' : 'absent'} |`);
  lines.push('');
  if (report.failure) {
    lines.push('## Failure Classification');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- action: ${report.failure.action}`);
    if (Array.isArray(report.failure.details?.blockers)) {
      lines.push(`- blockers: ${report.failure.details.blockers.join(', ')}`);
    }
    lines.push('');
  }
  lines.push('## Scope');
  lines.push('');
  lines.push('This command is read-only. It does not stop the local gateway, switch the');
  lines.push('separate dcp-agent checkout, rebuild or delete installer artifacts, restart');
  lines.push('services, change the self-update manifest, or clean production files. It is');
  lines.push('the evidence packet to run before a controlled maintenance window.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeReport(report, outputDir = OUTPUT_DIR_DEFAULT) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = toStamp();
  const jsonPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.json`);
  const markdownPath = path.join(outputDir, `${PROOF_PREFIX}-${stamp}.md`);
  const latestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-latest.json`);
  const latestMarkdownPath = path.join(outputDir, `${PROOF_PREFIX}-latest.md`);
  report.report_artifacts = {
    json: path.relative(REPO_ROOT, jsonPath),
    markdown: path.relative(REPO_ROOT, markdownPath),
    latest_json: path.relative(REPO_ROOT, latestJsonPath),
    latest_markdown: path.relative(REPO_ROOT, latestMarkdownPath),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.copyFileSync(jsonPath, latestJsonPath);
  fs.copyFileSync(markdownPath, latestMarkdownPath);
  return report.report_artifacts;
}

function runDcpAgentReconciliationStatus(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_AGENT_RECONCILIATION_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const runCommand = options.runCommand || defaultCommandRunner;
  const platform = options.platformSnapshot || collectPlatformSnapshot({ repoRoot: options.repoRoot || REPO_ROOT, runCommand });
  const agentRepo = options.agentSnapshot || collectAgentRepoSnapshot({ agentRepoPath: options.agentRepoPath, fsImpl: options.fsImpl, runCommand });
  const gateway = options.gatewaySnapshot || collectGatewayProcesses({ runCommand });
  const localArtifactPath = options.localArtifactPath || path.join(options.repoRoot || REPO_ROOT, 'backend/installers/dcp-agent.tar.gz');
  const localArtifact = options.localArtifactSnapshot || inspectAgentArtifact(localArtifactPath, { fsImpl: options.fsImpl, runCommand });
  const vps = options.vpsSnapshot || collectVpsSnapshot({ readRemote: options.readRemote, runCommand, vpsHost: options.vpsHost, vpsPath: options.vpsPath });

  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'PASS',
    command: 'DCP_AGENT_RECONCILE_READ_REMOTE=1 npm run proof:dcp-agent-reconciliation',
    mode: 'read_only_status_packet',
    platform,
    agent_repo: agentRepo,
    gateway,
    artifacts: {
      local: localArtifact,
    },
    vps,
    maintenance_required: false,
    claims: {
      stops_gateway: false,
      mutates_agent_repo: false,
      rebuilds_agent_tarball: false,
      deletes_production_artifacts: false,
      restarts_services: false,
      changes_manifest: false,
    },
    safe_maintenance_order: [
      'announce_short_gateway_window',
      'stop_local_gateway_process',
      'fast_forward_dcp_agent_to_remote_main',
      'rebuild_or_retire_served_agent_tarball_with_owner_approval',
      'restart_gateway',
      'smoke_agent_manifest_and_provider_install_path',
    ],
    failure: null,
    report_artifacts: {},
  };

  const blockers = findReconciliationBlockers(report);
  if (blockers.length > 0) {
    report.verdict = 'BLOCKED';
    report.maintenance_required = true;
    report.failure = classifyFailure(
      'DCP_AGENT_RECONCILIATION_MAINTENANCE_REQUIRED',
      'dcp-agent reconciliation still requires a controlled maintenance window',
      { blockers }
    );
  }

  writeReport(report, outputDir);
  return {
    report,
    exitCode: blockers.length > 0 ? 2 : 0,
  };
}

function printSummary(report) {
  console.log(`dcp-agent reconciliation status: ${report.verdict}`);
  console.log(`Maintenance required: ${report.maintenance_required}`);
  if (report.failure?.details?.blockers) {
    console.log(`Blockers: ${report.failure.details.blockers.join(', ')}`);
  }
  console.log(`JSON report: ${report.report_artifacts.json}`);
  console.log(`Markdown report: ${report.report_artifacts.markdown}`);
}

if (require.main === module) {
  const { report, exitCode } = runDcpAgentReconciliationStatus();
  printSummary(report);
  process.exitCode = exitCode;
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  classifyFailure,
  collectAgentRepoSnapshot,
  collectGatewayProcesses,
  collectPlatformSnapshot,
  collectVpsSnapshot,
  collectVpsSnapshotFromLocalPath,
  findReconciliationBlockers,
  inspectAgentArtifact,
  parseKeyValueLines,
  runDcpAgentReconciliationStatus,
  writeReport,
};
