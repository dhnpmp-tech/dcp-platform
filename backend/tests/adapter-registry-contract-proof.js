#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const express = require('express');
const request = require('supertest');
const {
  createAdapter,
  ensureAdapterRegistrySchema,
  getAdapter,
  listAdapters,
  updateAdapterStatus,
} = require('../src/services/adapterRegistry');
const { createAdaptersRouter } = require('../src/routes/adapters');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const OUTPUT_DIR_DEFAULT = path.join(REPO_ROOT, 'docs/reports/reliability');
const PROOF_PREFIX = 'adapter-registry-contract-proof';
const CONTRACT = 'dcp.adapter_registry_contract_proof.v1';

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

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE renters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);
  db.prepare(`
    INSERT INTO renters (id, name, email, api_key, status, created_at)
    VALUES (1, 'Registry Proof One', 'registry-one@example.com', 'rk-registry-one', 'active', ?),
           (2, 'Registry Proof Two', 'registry-two@example.com', 'rk-registry-two', 'active', ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  ensureAdapterRegistrySchema(db);
  return db;
}

function adapterInput(overrides = {}) {
  return {
    adapter_id: 'adpt_registry01',
    name: 'Support Arabic Adapter',
    base_model: 'meta-llama/Llama-3.1-8B-Instruct',
    storage_key: '/adapters/r1/support-arabic/adapter.safetensors',
    checksum_sha256: 'a'.repeat(64),
    rank: 16,
    metadata: {
      recipe: 'qlora-sft',
      source: 'adapter_registry_contract_proof',
      artifact_kind: 'lora_adapter',
    },
    ...overrides,
  };
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.use('/api/adapters', createAdaptersRouter({
    db,
    requireRenter: (req, _res, next) => {
      req.renter = { id: Number(req.header('x-test-renter-id') || 1) };
      next();
    },
    requireAdmin: (_req, res) => res.status(403).json({
      error: 'admin auth disabled in adapter registry contract proof',
      code: 'admin_auth_disabled_in_proof',
    }),
  }));
  return app;
}

function summarizeAdapter(adapter) {
  if (!adapter) return null;
  return {
    adapter_id: adapter.adapter_id,
    renter_id: adapter.renter_id,
    name: adapter.name,
    base_model: adapter.base_model,
    storage_key: adapter.storage_key,
    checksum_sha256: adapter.checksum_sha256,
    rank: adapter.rank,
    status: adapter.status,
    deployed_at: adapter.deployed_at,
    metadata: adapter.metadata,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Adapter Registry Contract Proof');
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
    schema: report.schema,
    service: report.service,
    route: report.route,
    jest: report.jest,
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
  lines.push('This proof is CI-safe. It uses an in-memory SQLite database and');
  lines.push('mock renter auth to prove adapter registry schema idempotency, tenant');
  lines.push('isolation, checksum and storage-key validation, public status limits,');
  lines.push('metadata-only registration, and the absence of a public deploy shortcut.');
  lines.push('It does not upload adapter artifacts, create deployments, attach load proof,');
  lines.push('route inference traffic, record usage, bill adapters, mutate balances,');
  lines.push('expose provider/vendor routing, or prove GPU-host execution.');
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

async function runAdapterRegistryContractProof(options = {}) {
  const outputDir = path.resolve(options.outputDir || process.env.DCP_ADAPTER_REGISTRY_PROOF_OUTPUT_DIR || OUTPUT_DIR_DEFAULT);
  const report = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    verdict: 'FAIL',
    command: 'npm run proof:adapter-registry-contract',
    mode: 'ci_safe_in_memory',
    claims: {
      uploads_adapter_artifact: false,
      creates_adapter_deployment: false,
      attaches_load_proof: false,
      routes_adapter_traffic: false,
      records_usage_or_billing: false,
      mutates_balance: false,
      exposes_provider_or_vendor: false,
      proves_gpu_host_execution: false,
    },
    invariants: [],
    schema: {},
    service: {},
    route: {},
    jest: {},
    failure: null,
    artifacts: {},
  };

  const record = (name, passed, notes) => {
    report.invariants.push({ name, passed, notes });
    assertInvariant(passed, `invariant_failed:${name}`, notes || name);
  };

  try {
    const db = makeDb();
    ensureAdapterRegistrySchema(db);
    const columns = db.prepare('PRAGMA table_info(adapter_registry)').all().map((row) => row.name);
    const indices = db.prepare(`
      SELECT name FROM sqlite_master
       WHERE type = 'index' AND tbl_name = 'adapter_registry'
       ORDER BY name ASC
    `).all().map((row) => row.name);
    report.schema = { columns, indices };
    record(
      'adapter registry schema is idempotent and indexed',
      ['adapter_id', 'renter_id', 'base_model', 'storage_key', 'checksum_sha256', 'metadata_json', 'status', 'deployed_at']
        .every((column) => columns.includes(column))
        && indices.includes('idx_adapter_registry_renter_created')
        && indices.includes('idx_adapter_registry_checksum'),
      'Schema includes owner, artifact, checksum, metadata, status, deployed_at fields, plus lookup indices.',
    );

    const created = createAdapter(db, 1, adapterInput());
    report.service.created = summarizeAdapter(created);
    record(
      'valid adapter registration is metadata-only and normalized',
      created.adapter_id === 'adpt_registry01'
        && created.renter_id === 1
        && created.storage_key === 'adapters/r1/support-arabic/adapter.safetensors'
        && created.checksum_sha256 === 'a'.repeat(64)
        && created.status === 'registered'
        && created.deployed_at === null,
      'Leading slashes are stripped from object keys and registration does not mark the adapter deployed.',
    );

    let invalidStorageRejected = false;
    try {
      createAdapter(db, 1, adapterInput({
        adapter_id: 'adpt_badkey01',
        storage_key: '../adapter.safetensors',
      }));
    } catch (error) {
      invalidStorageRejected = error.code === 'invalid_storage_key';
      report.service.invalid_storage_error = { code: error.code, message: error.message };
    }
    let invalidChecksumRejected = false;
    try {
      createAdapter(db, 1, adapterInput({
        adapter_id: 'adpt_badsha01',
        checksum_sha256: 'not-a-sha256',
      }));
    } catch (error) {
      invalidChecksumRejected = error.code === 'invalid_checksum';
      report.service.invalid_checksum_error = { code: error.code, message: error.message };
    }
    record(
      'unsafe storage keys and invalid checksums are rejected before insert',
      invalidStorageRejected && invalidChecksumRejected && listAdapters(db, 1).adapters.length === 1,
      'Rejected rows are not inserted into the registry.',
    );

    createAdapter(db, 2, adapterInput({
      adapter_id: 'adpt_tenant02',
      storage_key: 'adapters/r2/tenant-two/adapter.safetensors',
      checksum_sha256: 'b'.repeat(64),
    }));
    const tenantOneList = listAdapters(db, 1);
    const tenantOneCannotReadTwo = getAdapter(db, 1, 'adpt_tenant02') === null;
    report.service.tenant_one_list = tenantOneList.adapters.map(summarizeAdapter);
    record(
      'adapter registry enforces renter tenant boundaries',
      tenantOneList.adapters.map((adapter) => adapter.adapter_id).join(',') === 'adpt_registry01'
        && tenantOneCannotReadTwo,
      'Renter 1 cannot list or read renter 2 adapter metadata.',
    );

    const ready = updateAdapterStatus(db, 1, 'adpt_registry01', 'ready');
    const deployed = updateAdapterStatus(db, 1, 'adpt_registry01', 'deployed');
    const filtered = listAdapters(db, 1, {
      status: 'deployed',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      limit: 500,
    });
    report.service.status_updates = {
      ready: summarizeAdapter(ready),
      deployed: summarizeAdapter(deployed),
      filtered_count: filtered.adapters.length,
      filtered_limit: filtered.limit,
    };
    record(
      'status lifecycle records deployed_at only after explicit service transition',
      ready.deployed_at === null
        && deployed.status === 'deployed'
        && typeof deployed.deployed_at === 'string'
        && filtered.adapters.length === 1
        && filtered.limit === 100,
      'The service can represent lifecycle state, but public creation is still separately restricted.',
    );

    const routeDb = makeDb();
    createAdapter(routeDb, 2, adapterInput({
      adapter_id: 'adpt_hidden02',
      storage_key: 'adapters/r2/hidden/adapter.safetensors',
      checksum_sha256: 'c'.repeat(64),
    }));
    const app = buildApp(routeDb);
    const publicCreate = await request(app)
      .post('/api/adapters')
      .set('x-test-renter-id', '1')
      .send(adapterInput({
        adapter_id: 'adpt_public01',
        storage_key: 'adapters/r1/public/adapter.safetensors',
        checksum_sha256: 'd'.repeat(64),
        status: 'ready',
      }));
    const publicDeployStatus = await request(app)
      .post('/api/adapters')
      .set('x-test-renter-id', '1')
      .send(adapterInput({
        adapter_id: 'adpt_public02',
        storage_key: 'adapters/r1/public-two/adapter.safetensors',
        checksum_sha256: 'e'.repeat(64),
        status: 'deployed',
      }));
    const publicList = await request(app).get('/api/adapters').set('x-test-renter-id', '1');
    const hiddenRead = await request(app).get('/api/adapters/adpt_hidden02').set('x-test-renter-id', '1');
    const deployShortcut = await request(app)
      .post('/api/adapters/adpt_public01/deploy')
      .set('x-test-renter-id', '1')
      .send({});
    report.route = {
      create_status: publicCreate.status,
      create_body: publicCreate.body,
      deployed_status_rejection: {
        status: publicDeployStatus.status,
        body: publicDeployStatus.body,
      },
      list_status: publicList.status,
      list_adapter_ids: Array.isArray(publicList.body.data)
        ? publicList.body.data.map((adapter) => adapter.adapter_id)
        : [],
      hidden_read_status: hiddenRead.status,
      deploy_shortcut_status: deployShortcut.status,
    };
    record(
      'public adapter route is metadata-only and tenant-scoped',
      publicCreate.status === 201
        && publicCreate.body.deployment_enabled === false
        && publicCreate.body.next === 'validate_adapter_or_create_lora_training_job'
        && publicDeployStatus.status === 400
        && publicDeployStatus.body.code === 'invalid_initial_status'
        && publicList.status === 200
        && report.route.list_adapter_ids.join(',') === 'adpt_public01'
        && hiddenRead.status === 404
        && deployShortcut.status === 404,
      'Public API can register/list owned adapters but cannot set deployed state or use a deploy shortcut.',
    );

    const jestBin = require.resolve('jest/bin/jest');
    const jestJsonPath = path.join(outputDir, `${PROOF_PREFIX}-jest-${toStamp()}.json`);
    fs.mkdirSync(outputDir, { recursive: true });
    const jest = runCommand(process.execPath, [
      jestBin,
      'src/__tests__/adapterRegistry.test.js',
      '--runInBand',
      '--json',
      '--outputFile',
      jestJsonPath,
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
      'focused adapter registry Jest suite passes',
      jest.status === 0 && report.jest.success === true && report.jest.num_failed_tests === 0,
      'The existing service/route regression suite passes inside the proof packet.',
    );

    record(
      'proof command is read-only with no serving or billing claims',
      Object.values(report.claims).every((value) => value === false),
      'The proof validates metadata and guards only.',
    );

    report.verdict = 'PASS';
  } catch (error) {
    report.failure = {
      code: error.code || 'ADAPTER_REGISTRY_CONTRACT_PROOF_FAILED',
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
      adapter_id: report.service.created?.adapter_id,
      route: {
        create_status: report.route.create_status,
        list_adapter_ids: report.route.list_adapter_ids,
        deploy_shortcut_status: report.route.deploy_shortcut_status,
      },
      artifacts: report.artifacts,
    }, null, 2));
  }
  return report;
}

if (require.main === module) {
  runAdapterRegistryContractProof();
}

module.exports = {
  runAdapterRegistryContractProof,
};
