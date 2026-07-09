#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROUTING_POLICY_CLAIM_GUARDS,
  ROUTING_POLICY_PROOF_CONTRACT,
  ROUTING_POLICY_CONTRACT_VERSION,
  buildInferenceRoutingPolicies,
  normalizeEarnedMode,
  normalizeRequestedRoutingPolicy,
  resolveRequestedRoutingPolicy,
} = require('../src/services/inferenceRoutingPolicies');

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'router-policy-contract-proof';
const CONTRACT = 'dcp.router_policy_contract_proof.v1';

function toStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function assertInvariant(condition, code, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    throw error;
  }
}

function summarizePolicy(policy) {
  return {
    id: policy.id,
    label: policy.label,
    status: policy.status,
    available: policy.available,
    default: policy.default === true,
    request_selectable: policy.request_selectable,
    current_behavior: policy.current_behavior,
    signals: policy.signals,
    runtime: policy.runtime || null,
    selection_guard: policy.selection_guard,
    proof_gates: policy.proof_gates || [],
    next: policy.next,
  };
}

function summarizeContract(contract) {
  return {
    object: contract.object,
    version: contract.version,
    default_policy: contract.default_policy,
    request_policy_parameter: contract.request_policy_parameter,
    request_selectable: contract.request_selectable,
    proof_contract: contract.proof_contract,
    claim_guards: contract.claim_guards,
    policy_ids: contract.data.map((policy) => policy.id),
    policies: contract.data.map(summarizePolicy),
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Router Policy Contract Proof');
  lines.push('');
  lines.push(`- contract: \`${report.contract}\``);
  lines.push(`- generated_at: \`${report.generated_at}\``);
  lines.push(`- verdict: **${report.verdict}**`);
  lines.push(`- command: \`${report.command}\``);
  lines.push('');
  lines.push('## Invariants');
  lines.push('');
  lines.push('| invariant | passed | notes |');
  lines.push('|---|---:|---|');
  for (const item of report.invariants) {
    lines.push(`| ${item.name} | ${item.passed ? 'yes' : 'no'} | ${String(item.notes || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  lines.push('## Proof Summary');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    catalog: report.catalog,
    env_variants: report.env_variants,
    request_resolution: report.request_resolution,
    future_policy_rejections: report.future_policy_rejections,
    proof_contract: report.proof_contract,
    claims: report.claims,
  }, null, 2));
  lines.push('```');
  lines.push('');
  if (report.failure) {
    lines.push('## Failure');
    lines.push('');
    lines.push(`- code: \`${report.failure.code}\``);
    lines.push(`- message: ${report.failure.message}`);
    lines.push('');
  }
  lines.push('## Scope');
  lines.push('');
  lines.push('This proof is CI-safe and validates the router-policy discovery and');
  lines.push('request-resolution contract without dispatching inference, changing provider');
  lines.push('selection, applying cost or geography filters, mutating billing, or claiming');
  lines.push('policy-specific routing behavior. Cheapest, lowest-latency, Saudi-only,');
  lines.push('coding, and Arabic policies remain gated until each has route tests and live');
  lines.push('smoke evidence.');
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
  report.artifacts = {
    json: path.relative(REPO_ROOT, jsonPath),
    markdown: path.relative(REPO_ROOT, markdownPath),
    latest_json: path.relative(REPO_ROOT, latestJsonPath),
    latest_markdown: path.relative(REPO_ROOT, latestMarkdownPath),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.copyFileSync(jsonPath, latestJsonPath);
  fs.copyFileSync(markdownPath, latestMarkdownPath);
  return report.artifacts;
}

function runRouterPolicyContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ROUTER_POLICY_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    routing_policy_contract_version: ROUTING_POLICY_CONTRACT_VERSION,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:router-policy-contract',
    mode: 'ci_safe_service_contract',
    proof_contract: ROUTING_POLICY_PROOF_CONTRACT,
    claims: { ...ROUTING_POLICY_CLAIM_GUARDS },
    invariants: [],
    catalog: {},
    env_variants: {},
    request_resolution: {},
    future_policy_rejections: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const strictCatalog = buildInferenceRoutingPolicies({
      DCP_ROUTING_EARNED_MODE: 'strict',
      V1_LATENCY_GATE_ENABLED: '1',
    });
    const policyIds = strictCatalog.data.map((policy) => policy.id);
    const balanced = strictCatalog.data.find((policy) => policy.id === 'balanced');
    const stagedPolicies = strictCatalog.data.filter((policy) => policy.id !== 'balanced');

    report.catalog = summarizeContract(strictCatalog);
    record(
      'catalog is read-only with balanced as the only available default',
      strictCatalog.object === 'list'
        && strictCatalog.version === ROUTING_POLICY_CONTRACT_VERSION
        && strictCatalog.default_policy === 'balanced'
        && strictCatalog.request_policy_parameter === null
        && strictCatalog.request_selectable === false
        && strictCatalog.proof_contract.command === 'npm run proof:router-policy-contract'
        && strictCatalog.proof_contract.live_smoke_required_before_selectable === true
        && Object.values(strictCatalog.claim_guards).every((value) => value === false)
        && policyIds.join(',') === 'balanced,lowest_latency,cheapest,saudi_only,coding,arabic'
        && balanced
        && balanced.available === true
        && balanced.default === true
        && balanced.request_selectable === false
        && balanced.selection_guard === 'accepted_noop_only'
        && balanced.proof_gates.some((gate) => gate.id === 'balanced_noop_contract' && gate.status === 'ci_safe')
        && stagedPolicies.every((policy) => policy.available === false && policy.request_selectable === false),
      'The public catalog advertises readiness states only; future policies are not selectable or available.',
    );

    const latencyOffCatalog = buildInferenceRoutingPolicies({
      DCP_ROUTING_EARNED_MODE: 'nonsense',
      V1_LATENCY_GATE_ENABLED: '0',
    });
    const latencyOffBalanced = latencyOffCatalog.data.find((policy) => policy.id === 'balanced');
    const latencyOff = latencyOffCatalog.data.find((policy) => policy.id === 'lowest_latency');
    report.env_variants = {
      strict_latency_on: {
        earned_mode: balanced.runtime.earned_routing_mode,
        latency_gate_enabled: balanced.runtime.latency_gate_enabled,
        lowest_latency_status: strictCatalog.data.find((policy) => policy.id === 'lowest_latency').status,
      },
      invalid_mode_latency_off: {
        normalized_earned_mode: normalizeEarnedMode('nonsense'),
        earned_mode: latencyOffBalanced.runtime.earned_routing_mode,
        latency_gate_enabled: latencyOffBalanced.runtime.latency_gate_enabled,
        lowest_latency_status: latencyOff.status,
        lowest_latency_available: latencyOff.available,
      },
    };
    record(
      'environment toggles only affect readiness metadata, not selectable policies',
      balanced.runtime.earned_routing_mode === 'strict'
        && balanced.runtime.latency_gate_enabled === true
        && normalizeEarnedMode('nonsense') === 'exclude-dead'
        && latencyOffBalanced.runtime.earned_routing_mode === 'exclude-dead'
        && latencyOffBalanced.runtime.latency_gate_enabled === false
        && latencyOff.status === 'gated'
        && latencyOff.available === false
        && latencyOff.request_selectable === false,
      'Latency and earned-mode env state is exposed as metadata while request selection stays closed.',
    );

    const implicit = resolveRequestedRoutingPolicy({});
    const explicitSnake = resolveRequestedRoutingPolicy({ routing_policy: 'balanced' });
    const explicitAlias = resolveRequestedRoutingPolicy({ route_policy: 'balanced' });
    const explicitNested = resolveRequestedRoutingPolicy({ routing: { policy: 'balanced' } });
    report.request_resolution = {
      normalized_lowest_latency: normalizeRequestedRoutingPolicy('lowest-latency'),
      implicit: {
        ok: implicit.ok,
        explicit: implicit.explicit,
        policy_id: implicit.policy.id,
      },
      explicit_snake: {
        ok: explicitSnake.ok,
        explicit: explicitSnake.explicit,
        policy_id: explicitSnake.policy.id,
      },
      explicit_alias: {
        ok: explicitAlias.ok,
        explicit: explicitAlias.explicit,
        policy_id: explicitAlias.policy.id,
      },
      explicit_nested: {
        ok: explicitNested.ok,
        explicit: explicitNested.explicit,
        policy_id: explicitNested.policy.id,
      },
    };
    record(
      'explicit balanced policy is an accepted no-op across supported request shapes',
      normalizeRequestedRoutingPolicy('lowest-latency') === 'lowest_latency'
        && implicit.ok === true
        && implicit.explicit === false
        && implicit.policy.id === 'balanced'
        && explicitSnake.ok === true
        && explicitSnake.explicit === true
        && explicitSnake.policy.id === 'balanced'
        && explicitAlias.ok === true
        && explicitAlias.explicit === true
        && explicitAlias.policy.id === 'balanced'
        && explicitNested.ok === true
        && explicitNested.explicit === true
        && explicitNested.policy.id === 'balanced',
      'Balanced remains the default route behavior; explicit balanced only makes the no-op visible to clients.',
    );

    const futureRejections = {};
    for (const id of ['lowest_latency', 'cheapest', 'saudi_only', 'coding', 'arabic']) {
      const result = resolveRequestedRoutingPolicy({ routing_policy: id });
      futureRejections[id] = {
        ok: result.ok,
        httpStatus: result.httpStatus,
        code: result.code,
        requested_policy: result.requested_policy,
        policy_status: result.policy && result.policy.status,
        policy_available: result.policy && result.policy.available,
        policy_request_selectable: result.policy && result.policy.request_selectable,
        policy_selection_guard: result.policy && result.policy.selection_guard,
        policy_proof_gates: result.policy && result.policy.proof_gates,
      };
    }
    const unknown = resolveRequestedRoutingPolicy({ route_policy: 'moonshot' });
    const invalid = resolveRequestedRoutingPolicy({ routing_policy: '../../balanced' });
    report.future_policy_rejections = {
      staged: futureRejections,
      unknown: {
        ok: unknown.ok,
        httpStatus: unknown.httpStatus,
        code: unknown.code,
        requested_policy: unknown.requested_policy,
      },
      invalid: {
        ok: invalid.ok,
        httpStatus: invalid.httpStatus,
        code: invalid.code,
        requested_policy: invalid.requested_policy,
      },
    };
    record(
      'future, unknown, and invalid policies fail closed before routing',
      Object.values(futureRejections).every((entry) => entry.ok === false
        && entry.httpStatus === 400
        && entry.code === 'routing_policy_not_selectable'
        && entry.policy_available === false
        && entry.policy_request_selectable === false
        && entry.policy_selection_guard === 'not_request_selectable_until_policy_specific_proof'
        && Array.isArray(entry.policy_proof_gates)
        && entry.policy_proof_gates.length >= 2)
        && unknown.ok === false
        && unknown.code === 'unknown_routing_policy'
        && invalid.ok === false
        && invalid.code === 'invalid_routing_policy',
      'Non-balanced routing policies are explicit 400s, not silently ignored provider-selection hints.',
    );

    const cheapest = strictCatalog.data.find((policy) => policy.id === 'cheapest');
    const saudiOnly = strictCatalog.data.find((policy) => policy.id === 'saudi_only');
    const coding = strictCatalog.data.find((policy) => policy.id === 'coding');
    const arabic = strictCatalog.data.find((policy) => policy.id === 'arabic');
    const lowestLatency = strictCatalog.data.find((policy) => policy.id === 'lowest_latency');
    record(
      'specialized policy claims remain gated until policy-specific tests and smokes exist',
      cheapest.status === 'not_enabled'
        && cheapest.signals.includes('model_token_pricing')
        && cheapest.proof_gates.some((gate) => gate.id === 'settlement_math_reconciliation')
        && saudiOnly.status === 'gated'
        && saudiOnly.signals.includes('provider_country')
        && saudiOnly.proof_gates.some((gate) => gate.id === 'provider_geo_audit')
        && coding.status === 'catalog_only'
        && coding.signals.includes('curated_coding_catalog')
        && coding.proof_gates.some((gate) => gate.id === 'agent_path_smoke')
        && arabic.status === 'catalog_only'
        && arabic.signals.includes('arabic_portfolio_tier')
        && arabic.proof_gates.some((gate) => gate.id === 'arabic_benchmark_freshness')
        && lowestLatency.status === 'telemetry_gate_only'
        && lowestLatency.available === false
        && lowestLatency.proof_gates.some((gate) => gate.id === 'policy_specific_route_tests')
        && strictCatalog.data.every((policy) => Array.isArray(policy.proof_gates) && policy.proof_gates.length > 0)
        && Object.values(report.claims).every((value) => value === false),
      'Cost, residency, coding, Arabic, and strict latency policies name their proof gates while remaining readiness metadata only.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'router_policy_contract_failed',
      message: error.message,
      details: error.details || null,
    };
    report.verdict = 'FAIL';
  } finally {
    writeReport(report, outputDir);
  }

  return report;
}

function main() {
  const report = runRouterPolicyContractProof();
  console.log(`Router policy contract proof: ${report.verdict}`);
  console.log(`JSON report: ${report.artifacts.json}`);
  console.log(`Markdown report: ${report.artifacts.markdown}`);
  if (report.verdict !== 'PASS') {
    console.error(report.failure ? `${report.failure.code}: ${report.failure.message}` : 'proof failed');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CONTRACT,
  PROOF_PREFIX,
  runRouterPolicyContractProof,
  summarizeContract,
  summarizePolicy,
  writeReport,
};
