#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'docker-templates');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'template-workflow-contract-proof';
const CONTRACT = 'dcp.template_workflow_contract_proof.v1';
const WORKFLOW_VERSION = 'dcp.template_workflow.v1';

const REQUIRED_TEMPLATE_IDS = ['lora-finetune', 'qlora-finetune', 'vllm-serve'];

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

function readTemplate(id) {
  const templatePath = path.join(TEMPLATES_DIR, `${id}.json`);
  return JSON.parse(fs.readFileSync(templatePath, 'utf8'));
}

function summarizeTemplate(template) {
  const contract = template.workflow_contract || {};
  return {
    id: template.id,
    job_type: template.job_type,
    min_vram_gb: template.min_vram_gb,
    default_duration_minutes: template.default_duration_minutes || null,
    default_pricing_class: template.default_pricing_class || null,
    workflow: {
      version: contract.version || null,
      mode: contract.mode || null,
      workspace_mount: contract.workspace_mount || null,
      dataset: contract.dataset || null,
      adapter_artifact: contract.adapter_artifact || null,
      endpoint: contract.endpoint || null,
      claim_guards: contract.claim_guards || null,
      next_proof: contract.next_proof || null,
    },
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Template Workflow Contract Proof');
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
    validator: report.validator,
    jest: report.jest,
    templates: report.templates,
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
  lines.push('This proof is CI-safe. It validates LoRA, QLoRA, and vLLM template');
  lines.push('workflow contracts and the catalog route exposure. It does not launch');
  lines.push('pods, create training jobs, read or store dataset rows, upload adapter');
  lines.push('artifacts, enable public endpoint routing, mutate balances, record usage,');
  lines.push('bill adapters, expose providers/vendors, or prove GPU-host execution.');
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
  report.artifacts.json = path.relative(REPO_ROOT, jsonPath);
  report.artifacts.markdown = path.relative(REPO_ROOT, markdownPath);
  report.artifacts.latest_json = path.relative(REPO_ROOT, latestJsonPath);
  report.artifacts.latest_markdown = path.relative(REPO_ROOT, latestMarkdownPath);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, buildMarkdown(report));
  fs.copyFileSync(jsonPath, latestJsonPath);
  fs.copyFileSync(markdownPath, latestMarkdownPath);
  return report.artifacts;
}

function guardValue(template, key) {
  return template.workflow_contract?.claim_guards?.[key];
}

function runCommand(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
}

function runTemplateWorkflowContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_TEMPLATE_WORKFLOW_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:template-workflow-contract',
    mode: 'ci_safe_template_contract',
    claims: {
      launches_pod: false,
      creates_training_job: false,
      reads_or_stores_dataset_rows: false,
      uploads_adapter_artifact: false,
      enables_public_endpoint_routing: false,
      mutates_balance: false,
      records_usage_or_billing: false,
      exposes_provider_or_vendor: false,
      proves_gpu_host_execution: false,
    },
    validator: {},
    jest: {},
    templates: [],
    invariants: [],
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const validator = runCommand(process.execPath, ['src/scripts/validate-deploy-templates.js'], BACKEND_ROOT);
    report.validator = {
      exit_code: validator.status ?? 1,
      stdout_tail: String(validator.stdout || '').slice(-4000),
      stderr_tail: String(validator.stderr || '').slice(-4000),
    };
    record(
      'deploy template validator passes',
      validator.status === 0,
      'The shared template validator accepts the strengthened workflow contracts.',
    );

    const jestBin = require.resolve('jest/bin/jest');
    const jestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-jest-${toStamp()}.json`);
    fs.mkdirSync(outputDir, { recursive: true });
    const jest = runCommand(process.execPath, [
      jestBin,
      'src/__tests__/templates.test.js',
      '--runInBand',
      '--json',
      '--outputFile',
      jestJsonPath,
      '--testNamePattern',
      'workflow contracts',
    ], BACKEND_ROOT);
    report.jest = {
      exit_code: jest.status ?? 1,
      json: path.relative(REPO_ROOT, jestJsonPath),
      stdout_tail: String(jest.stdout || '').slice(-4000),
      stderr_tail: String(jest.stderr || '').slice(-4000),
    };
    if (fs.existsSync(jestJsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(jestJsonPath, 'utf8'));
      report.jest.success = parsed.success === true;
      report.jest.num_total_tests = parsed.numTotalTests || 0;
      report.jest.num_passed_tests = parsed.numPassedTests || 0;
      report.jest.num_failed_tests = parsed.numFailedTests || 0;
    }
    record(
      'catalog route exposes workflow contracts',
      jest.status === 0 && report.jest.success === true && report.jest.num_failed_tests === 0,
      'The focused templates route test confirms /api/templates/catalog exposes LoRA, QLoRA, and vLLM workflow contracts.',
    );

    const templates = REQUIRED_TEMPLATE_IDS.map(readTemplate);
    report.templates = templates.map(summarizeTemplate);
    record(
      'required workflow templates are present',
      templates.map((template) => template.id).join(',') === REQUIRED_TEMPLATE_IDS.join(','),
      'LoRA, QLoRA, and vLLM template files are present and readable.',
    );
    record(
      'all workflow contracts use the canonical version and workspace mount',
      templates.every((template) => template.workflow_contract?.version === WORKFLOW_VERSION)
        && templates.every((template) => template.workflow_contract?.workspace_mount === '/workspace'),
      'Template workflow contracts use dcp.template_workflow.v1 and mount renter files at /workspace.',
    );

    const loraTemplates = templates.filter((template) => template.id.includes('lora-finetune'));
    record(
      'LoRA templates require dataset validation and adapter artifact checksums',
      loraTemplates.every((template) => template.workflow_contract?.dataset?.required === true)
        && loraTemplates.every((template) => template.workflow_contract?.dataset?.env_var === 'DATASET_PATH')
        && loraTemplates.every((template) => template.workflow_contract?.dataset?.validation_endpoint === 'POST /api/lora/datasets/validate')
        && loraTemplates.every((template) => template.workflow_contract?.dataset?.raw_rows_stored === false)
        && loraTemplates.every((template) => template.workflow_contract?.adapter_artifact?.checksum_required === true)
        && loraTemplates.every((template) => template.workflow_contract?.adapter_artifact?.required_files?.includes('adapter.safetensors'))
        && loraTemplates.every((template) => template.workflow_contract?.adapter_artifact?.required_files?.includes('model-card.json')),
      'LoRA and QLoRA dry-runs name the dataset validator, avoid raw-row storage claims, and require adapter/model-card checksum evidence.',
    );

    const vllm = templates.find((template) => template.id === 'vllm-serve');
    record(
      'vLLM template remains pod-local until adapter load proof',
      vllm?.workflow_contract?.mode === 'pod_local_openai_compatible'
        && vllm?.workflow_contract?.endpoint?.scope === 'pod_local'
        && vllm?.workflow_contract?.endpoint?.openai_base_url?.endsWith('/v1')
        && vllm?.workflow_contract?.endpoint?.public_route_enabled === false
        && vllm?.workflow_contract?.endpoint?.adapter_load_proof_required === true,
      'The vLLM template describes pod-local OpenAI compatibility without public route traffic.',
    );

    for (const guard of [
      'catalog_launches_pod',
      'catalog_mutates_balance',
      'managed_training_enabled',
      'public_endpoint_route_enabled',
      'adapter_billing_enabled',
      'exposes_provider_or_vendor',
    ]) {
      record(
        `claim guard ${guard} stays false`,
        templates.every((template) => guardValue(template, guard) === false),
        'The template catalog is read-only metadata and does not enable this behavior.',
      );
    }
    record(
      'GPU-host proof remains required',
      templates.every((template) => guardValue(template, 'requires_gpu_host_proof') === true),
      'Template workflows remain blocked on provider GPU-host proof before public training or routing claims.',
    );
    record(
      'proof command is read-only',
      Object.values(report.claims).every((value) => value === false),
      'The proof only validates JSON, route exposure, and claim guards.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'TEMPLATE_WORKFLOW_CONTRACT_PROOF_FAILED',
      message: error.message,
      details: error.details || {},
    };
    report.verdict = 'FAIL';
  }

  writeReport(report, outputDir);
  if (report.verdict !== 'PASS') {
    console.error(`${CONTRACT} failed: ${report.failure?.message || 'unknown failure'}`);
    process.exitCode = 1;
  } else {
    console.log(`${CONTRACT} passed`);
    console.log(JSON.stringify({
      verdict: report.verdict,
      templates: report.templates.map((template) => ({
        id: template.id,
        mode: template.workflow.mode,
        workspace_mount: template.workflow.workspace_mount,
      })),
      artifacts: report.artifacts,
    }, null, 2));
  }
  return report;
}

if (require.main === module) {
  runTemplateWorkflowContractProof();
}

module.exports = {
  runTemplateWorkflowContractProof,
};
