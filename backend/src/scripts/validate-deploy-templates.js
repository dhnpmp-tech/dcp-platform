#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'docker-templates');

const REQUIRED_DEPLOY_TEMPLATE_IDS = [
  'pytorch-single-gpu',
  'pytorch-multi-gpu',
  'vllm-serve',
  'stable-diffusion',
  'lora-finetune',
  'qlora-finetune',
  'python-scientific-compute'
];

const LORA_DRY_RUN_TEMPLATE_IDS = new Set(['lora-finetune', 'qlora-finetune']);

const CACHE_POLICIES = new Set(['hot', 'warm', 'cold']);
const TEMPLATE_WORKFLOW_VERSION = 'dcp.template_workflow.v1';
const REQUIRED_FIELDS = [
  'id',
  'name',
  'description',
  'image',
  'job_type',
  'params',
  'min_vram_gb',
  'estimated_price_sar_per_hour',
  'tags'
];

function fail(message, errors) {
  errors.push(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateTemplate(template, filename, errors) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in template)) {
      fail(`${filename}: missing required field '${field}'`, errors);
    }
  }

  if (typeof template.id !== 'string' || template.id.trim().length === 0) {
    fail(`${filename}: 'id' must be a non-empty string`, errors);
  }
  if (typeof template.name !== 'string' || template.name.trim().length === 0) {
    fail(`${filename}: 'name' must be a non-empty string`, errors);
  }
  if (typeof template.description !== 'string' || template.description.trim().length === 0) {
    fail(`${filename}: 'description' must be a non-empty string`, errors);
  }
  if (typeof template.image !== 'string' || template.image.trim().length === 0) {
    fail(`${filename}: 'image' must be a non-empty string`, errors);
  }
  if (typeof template.job_type !== 'string' || template.job_type.trim().length === 0) {
    fail(`${filename}: 'job_type' must be a non-empty string`, errors);
  }
  if (!isObject(template.params)) {
    fail(`${filename}: 'params' must be an object`, errors);
  }
  if (!Number.isFinite(template.min_vram_gb) || template.min_vram_gb < 0) {
    fail(`${filename}: 'min_vram_gb' must be a non-negative number`, errors);
  }
  if (!Number.isFinite(template.estimated_price_sar_per_hour) || template.estimated_price_sar_per_hour < 0) {
    fail(`${filename}: 'estimated_price_sar_per_hour' must be a non-negative number`, errors);
  }
  if (!Array.isArray(template.tags)) {
    fail(`${filename}: 'tags' must be an array`, errors);
  }

  if (Array.isArray(template.env_vars)) {
    const envKeys = new Set();
    for (const [index, entry] of template.env_vars.entries()) {
      if (!isObject(entry)) {
        fail(`${filename}: env_vars[${index}] must be an object`, errors);
        continue;
      }
      if (typeof entry.key !== 'string' || entry.key.trim().length === 0) {
        fail(`${filename}: env_vars[${index}].key must be a non-empty string`, errors);
      } else if (envKeys.has(entry.key)) {
        fail(`${filename}: duplicate env var key '${entry.key}'`, errors);
      } else {
        envKeys.add(entry.key);
      }
      if (typeof entry.label !== 'string' || entry.label.trim().length === 0) {
        fail(`${filename}: env_vars[${index}].label must be a non-empty string`, errors);
      }
      if (!Object.prototype.hasOwnProperty.call(entry, 'default')) {
        fail(`${filename}: env_vars[${index}] missing 'default'`, errors);
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'required') && typeof entry.required !== 'boolean') {
        fail(`${filename}: env_vars[${index}].required must be boolean`, errors);
      }
    }
  }

  if (Array.isArray(template.approved_images)) {
    const imageSet = new Set();
    for (const image of template.approved_images) {
      if (typeof image !== 'string' || image.trim().length === 0) {
        fail(`${filename}: approved_images must contain only non-empty strings`, errors);
        continue;
      }
      if (imageSet.has(image)) {
        fail(`${filename}: duplicate approved image '${image}'`, errors);
        continue;
      }
      imageSet.add(image);
    }
  }
}

function validateDeployTemplate(template, filename, errors) {
  if (!isObject(template.model_cache)) {
    fail(`${filename}: deploy template must include 'model_cache' object`, errors);
  } else {
    if (typeof template.model_cache.mount_path !== 'string' || template.model_cache.mount_path.trim().length === 0) {
      fail(`${filename}: model_cache.mount_path must be a non-empty string`, errors);
    }
    if (typeof template.model_cache.default_policy !== 'string' || !CACHE_POLICIES.has(template.model_cache.default_policy)) {
      fail(`${filename}: model_cache.default_policy must be one of hot|warm|cold`, errors);
    }
    if (typeof template.model_cache.behavior !== 'string' || template.model_cache.behavior.trim().length === 0) {
      fail(`${filename}: model_cache.behavior must be a non-empty string`, errors);
    }
  }

  if (!isObject(template.example_io)) {
    fail(`${filename}: deploy template must include 'example_io' object`, errors);
  } else {
    if (!isObject(template.example_io.input)) {
      fail(`${filename}: example_io.input must be an object`, errors);
    }
    if (!isObject(template.example_io.output)) {
      fail(`${filename}: example_io.output must be an object`, errors);
    }
  }
}

function validateLoraDryRunTemplate(template, filename, errors) {
  const script = template.params && template.params.script;
  if (typeof script !== 'string' || !script.includes('DC1_RESULT_JSON')) {
    fail(`${filename}: LoRA template params.script must emit DC1_RESULT_JSON for dry-run proof`, errors);
  }
  if (typeof script === 'string' && !script.includes('ready_for_')) {
    fail(`${filename}: LoRA template params.script must report an explicit ready_for_* status`, errors);
  }

  const input = template.example_io && template.example_io.input;
  const inputScript = input && input.params && input.params.script;
  const output = template.example_io && template.example_io.output;
  if (!isObject(input) || input.job_type !== 'custom_container') {
    fail(`${filename}: LoRA dry-run example_io.input.job_type must be custom_container`, errors);
  }
  if (typeof inputScript !== 'string' || !inputScript.includes('DC1_RESULT_JSON')) {
    fail(`${filename}: LoRA dry-run example_io.input.params.script must emit DC1_RESULT_JSON`, errors);
  }
  if (!isObject(output) || output.template !== template.id) {
    fail(`${filename}: LoRA dry-run example_io.output.template must match template id`, errors);
  }
  if (!isObject(output) || typeof output.status !== 'string' || !output.status.startsWith('ready_for_')) {
    fail(`${filename}: LoRA dry-run example_io.output.status must be a ready_for_* string`, errors);
  }
  if (!isObject(output) || typeof output.base_model !== 'string' || output.base_model.trim().length === 0) {
    fail(`${filename}: LoRA dry-run example_io.output.base_model must be a non-empty string`, errors);
  }
}

function validateVllmDryRunTemplate(template, filename, errors) {
  const input = template.example_io && template.example_io.input;
  const output = template.example_io && template.example_io.output;
  if (!isObject(input) || input.job_type !== 'vllm_serve') {
    fail(`${filename}: vLLM example_io.input.job_type must be vllm_serve`, errors);
  }
  if (!isObject(input?.params) || typeof input.params.model !== 'string' || input.params.model.trim().length === 0) {
    fail(`${filename}: vLLM example_io.input.params.model must be a non-empty string`, errors);
  }
  if (!isObject(output) || output.type !== 'endpoint') {
    fail(`${filename}: vLLM example_io.output.type must be endpoint`, errors);
  }
  if (!isObject(output) || output.status !== 'running') {
    fail(`${filename}: vLLM example_io.output.status must be running`, errors);
  }
  if (!isObject(output) || typeof output.openai_base_url !== 'string' || !output.openai_base_url.endsWith('/v1')) {
    fail(`${filename}: vLLM example_io.output.openai_base_url must end with /v1`, errors);
  }
}

function validateFalseGuard(contract, filename, key, errors) {
  if (!isObject(contract.claim_guards) || contract.claim_guards[key] !== false) {
    fail(`${filename}: workflow_contract.claim_guards.${key} must be false`, errors);
  }
}

function validateTrueGuard(contract, filename, key, errors) {
  if (!isObject(contract.claim_guards) || contract.claim_guards[key] !== true) {
    fail(`${filename}: workflow_contract.claim_guards.${key} must be true`, errors);
  }
}

function validateWorkflowContractBase(template, filename, errors) {
  const contract = template.workflow_contract;
  if (!isObject(contract)) {
    fail(`${filename}: deploy template must include workflow_contract object`, errors);
    return null;
  }
  if (contract.version !== TEMPLATE_WORKFLOW_VERSION) {
    fail(`${filename}: workflow_contract.version must be ${TEMPLATE_WORKFLOW_VERSION}`, errors);
  }
  if (typeof contract.mode !== 'string' || contract.mode.trim().length === 0) {
    fail(`${filename}: workflow_contract.mode must be a non-empty string`, errors);
  }
  if (contract.workspace_mount !== '/workspace') {
    fail(`${filename}: workflow_contract.workspace_mount must be /workspace`, errors);
  }
  if (!isObject(contract.claim_guards)) {
    fail(`${filename}: workflow_contract.claim_guards must be an object`, errors);
  }
  for (const key of [
    'catalog_launches_pod',
    'catalog_mutates_balance',
    'managed_training_enabled',
    'public_endpoint_route_enabled',
    'adapter_billing_enabled',
    'exposes_provider_or_vendor',
  ]) {
    validateFalseGuard(contract, filename, key, errors);
  }
  validateTrueGuard(contract, filename, 'requires_gpu_host_proof', errors);
  if (typeof contract.next_proof !== 'string' || contract.next_proof.trim().length === 0) {
    fail(`${filename}: workflow_contract.next_proof must be a non-empty string`, errors);
  }
  return contract;
}

function validateLoraWorkflowContract(template, filename, errors) {
  const contract = validateWorkflowContractBase(template, filename, errors);
  if (!contract) return;

  const expectedMode = template.id === 'qlora-finetune' ? 'qlora_dry_run' : 'lora_dry_run';
  if (contract.mode !== expectedMode) {
    fail(`${filename}: workflow_contract.mode must be ${expectedMode}`, errors);
  }

  if (!isObject(contract.dataset)) {
    fail(`${filename}: workflow_contract.dataset must be an object`, errors);
  } else {
    if (contract.dataset.required !== true) {
      fail(`${filename}: workflow_contract.dataset.required must be true`, errors);
    }
    if (contract.dataset.env_var !== 'DATASET_PATH') {
      fail(`${filename}: workflow_contract.dataset.env_var must be DATASET_PATH`, errors);
    }
    if (contract.dataset.default_path !== '/workspace/datasets/train.jsonl') {
      fail(`${filename}: workflow_contract.dataset.default_path must be /workspace/datasets/train.jsonl`, errors);
    }
    if (contract.dataset.validation_endpoint !== 'POST /api/lora/datasets/validate') {
      fail(`${filename}: workflow_contract.dataset.validation_endpoint must be POST /api/lora/datasets/validate`, errors);
    }
    if (contract.dataset.raw_rows_stored !== false) {
      fail(`${filename}: workflow_contract.dataset.raw_rows_stored must be false`, errors);
    }
  }

  if (!isObject(contract.adapter_artifact)) {
    fail(`${filename}: workflow_contract.adapter_artifact must be an object`, errors);
  } else {
    const requiredFiles = Array.isArray(contract.adapter_artifact.required_files)
      ? contract.adapter_artifact.required_files
      : [];
    if (typeof contract.adapter_artifact.output_dir !== 'string' || !contract.adapter_artifact.output_dir.startsWith('/workspace/adapters/')) {
      fail(`${filename}: workflow_contract.adapter_artifact.output_dir must be under /workspace/adapters/`, errors);
    }
    for (const requiredFile of ['adapter.safetensors', 'model-card.json']) {
      if (!requiredFiles.includes(requiredFile)) {
        fail(`${filename}: workflow_contract.adapter_artifact.required_files must include ${requiredFile}`, errors);
      }
    }
    if (contract.adapter_artifact.checksum_required !== true) {
      fail(`${filename}: workflow_contract.adapter_artifact.checksum_required must be true`, errors);
    }
  }

  if (!Array.isArray(template.env_vars) || !template.env_vars.some((entry) => entry.key === 'DATASET_PATH' && entry.required === true)) {
    fail(`${filename}: LoRA workflow env_vars must require DATASET_PATH`, errors);
  }
  if (!Array.isArray(template.env_vars) || !template.env_vars.some((entry) => entry.key === 'OUTPUT_ADAPTER_DIR')) {
    fail(`${filename}: LoRA workflow env_vars must include OUTPUT_ADAPTER_DIR`, errors);
  }
}

function validateVllmWorkflowContract(template, filename, errors) {
  const contract = validateWorkflowContractBase(template, filename, errors);
  if (!contract) return;
  if (contract.mode !== 'pod_local_openai_compatible') {
    fail(`${filename}: workflow_contract.mode must be pod_local_openai_compatible`, errors);
  }
  if (!isObject(contract.endpoint)) {
    fail(`${filename}: workflow_contract.endpoint must be an object`, errors);
  } else {
    if (contract.endpoint.scope !== 'pod_local') {
      fail(`${filename}: workflow_contract.endpoint.scope must be pod_local`, errors);
    }
    if (typeof contract.endpoint.openai_base_url !== 'string' || !contract.endpoint.openai_base_url.endsWith('/v1')) {
      fail(`${filename}: workflow_contract.endpoint.openai_base_url must end with /v1`, errors);
    }
    if (contract.endpoint.public_route_enabled !== false) {
      fail(`${filename}: workflow_contract.endpoint.public_route_enabled must be false`, errors);
    }
    if (contract.endpoint.adapter_load_proof_required !== true) {
      fail(`${filename}: workflow_contract.endpoint.adapter_load_proof_required must be true`, errors);
    }
  }
}

function validateDryRunContracts(template, filename, errors) {
  if (LORA_DRY_RUN_TEMPLATE_IDS.has(template.id)) {
    validateLoraDryRunTemplate(template, filename, errors);
    validateLoraWorkflowContract(template, filename, errors);
  }
  if (template.id === 'vllm-serve') {
    validateVllmDryRunTemplate(template, filename, errors);
    validateVllmWorkflowContract(template, filename, errors);
  }
}

function main() {
  const errors = [];

  if (!fs.existsSync(TEMPLATES_DIR)) {
    console.error(`Missing templates directory: ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(TEMPLATES_DIR).filter((file) => file.endsWith('.json')).sort();
  if (files.length === 0) {
    console.error(`No template JSON files found in ${TEMPLATES_DIR}`);
    process.exit(1);
  }

  const idToFile = new Map();
  const templates = [];

  for (const file of files) {
    const fullPath = path.join(TEMPLATES_DIR, file);
    let template;
    try {
      template = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (error) {
      fail(`${file}: invalid JSON (${error.message})`, errors);
      continue;
    }

    if (!isObject(template)) {
      fail(`${file}: top-level JSON must be an object`, errors);
      continue;
    }

    validateTemplate(template, file, errors);

    if (typeof template.id === 'string' && template.id.trim().length > 0) {
      if (idToFile.has(template.id)) {
        fail(`${file}: duplicate template id '${template.id}' (already defined in ${idToFile.get(template.id)})`, errors);
      } else {
        idToFile.set(template.id, file);
      }

      const expectedFilename = `${template.id}.json`;
      if (file !== expectedFilename) {
        fail(`${file}: filename must match template id (${expectedFilename})`, errors);
      }
    }

    templates.push(template);
  }

  for (const requiredId of REQUIRED_DEPLOY_TEMPLATE_IDS) {
    if (!idToFile.has(requiredId)) {
      fail(`missing required deploy template id '${requiredId}'`, errors);
      continue;
    }
    const templateFile = idToFile.get(requiredId);
    const template = templates.find((entry) => entry.id === requiredId);
    validateDeployTemplate(template, templateFile, errors);
    validateDryRunContracts(template, templateFile, errors);
  }

  if (errors.length > 0) {
    console.error('Deploy template validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Deploy template validation passed (${files.length} files checked)`);
}

main();
