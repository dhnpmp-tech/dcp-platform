'use strict';

const { EVALUATOR_JOB_SCHEMA_VERSION } = require('./evaluatorJobSchema');
const { EVALUATOR_WORKER_GATE_VERSION } = require('./evaluatorWorkerGate');
const { EVALUATOR_RESULT_MANIFEST_VERSION } = require('./evaluatorResultManifest');

const EVALUATOR_READINESS_VERSION = 'dcp.evaluator_readiness.v1';

function buildEvaluatorReadiness(now = new Date()) {
  return {
    object: 'evaluator_readiness',
    version: EVALUATOR_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'readiness_contract_only',
    endpoints: {
      readiness: 'GET /api/evals/readiness',
      job_schema: 'GET /api/evals/jobs/schema',
      worker_readiness: 'GET /api/evals/worker/readiness',
      result_manifest_schema: 'GET /api/evals/results/schema',
      benchmark_readiness: 'GET /api/models/benchmarks/readiness',
      benchmark_feed: 'GET /api/models/benchmarks',
      product_page: 'GET /benchmarks',
    },
    features: {
      eval_job_schema: {
        status: 'schema_contract_only',
        available: true,
        version: EVALUATOR_JOB_SCHEMA_VERSION,
        schema_endpoint: 'GET /api/evals/jobs/schema',
        creates_jobs: true,
        creates_metadata_only: true,
        runs_worker: false,
      },
      eval_job_api: {
        status: 'metadata_records_live_worker_blocked',
        available: true,
        create_endpoint: 'POST /api/evals/jobs',
        list_endpoint: 'GET /api/evals/jobs',
        read_endpoint: 'GET /api/evals/jobs/:id',
        result_endpoint: null,
        required_before_enablement: [
          'dataset checksum and redacted sample metadata',
          'worker disabled-by-default guard',
          'result artifact checksum proof',
        ],
      },
      eval_worker: {
        status: 'disabled_by_default_contract',
        available: false,
        version: EVALUATOR_WORKER_GATE_VERSION,
        readiness_endpoint: 'GET /api/evals/worker/readiness',
        worker_enabled: false,
        queue_dispatch_enabled: false,
        result_writer_enabled: false,
        billing_hook_enabled: false,
        required_before_enablement: [
          'worker dry-run proof',
          'result manifest checksum proof',
          'tenant artifact storage policy',
          'minimum-balance and refund policy proof',
        ],
      },
      eval_result_manifest: {
        status: 'schema_and_checksum_contract_only',
        available: true,
        version: EVALUATOR_RESULT_MANIFEST_VERSION,
        schema_endpoint: 'GET /api/evals/results/schema',
        result_endpoint_live: false,
        writes_result_manifest: false,
        signed_downloads_enabled: false,
        required_before_enablement: [
          'worker dry-run manifest artifact',
          'summary checksum proof',
          'tenant artifact storage approval',
          'human review policy for public reports',
        ],
      },
      dataset_artifacts: {
        status: 'gated_storage_policy',
        available: false,
        raw_dataset_publication: false,
        required_before_enablement: [
          'approved Saudi Arabic task dataset',
          'tenant-scoped artifact storage key',
          'normalized dataset checksum',
          'PII/redaction review state',
        ],
      },
      baseline_comparison: {
        status: 'gated_baseline_policy',
        available: false,
        frontier_model_comparison_allowed: false,
        required_before_enablement: [
          'baseline provider/source approval',
          'same prompt and scoring harness',
          'cost and latency accounting window',
          'residency boundary statement',
        ],
      },
      public_reports: {
        status: 'blocked_until_artifacts',
        available: false,
        case_study_allowed: false,
        ranking_allowed: false,
        required_before_enablement: [
          'eval run artifact checksum',
          'model/provider/runtime metadata',
          'scoring harness version',
          'human-readable report review',
        ],
      },
      billing_policy: {
        status: 'not_enabled',
        available: false,
        bills_eval_jobs: false,
        required_before_enablement: [
          'no-billing MVP decision or prepaid estimate',
          'minimum-balance preflight',
          'refund/error policy for failed eval runs',
        ],
      },
    },
    claim_guards: {
      eval_jobs_live: false,
      eval_job_metadata_api_live: true,
      eval_worker_live: false,
      eval_result_manifest_schema_live: true,
      arabic_quality_claim_allowed: false,
      customer_case_study_allowed: false,
      model_ranking_allowed: false,
      frontier_model_comparison_allowed: false,
      raw_customer_dataset_published: false,
      bills_eval_jobs: false,
    },
    next_actions: [
      'Add a disabled-by-default evaluator worker proof before running customer workloads.',
      'Attach result artifact checksums, harness version, and baseline metadata before public reports.',
      'Keep /benchmarks copy tied to readiness until eval artifacts are reproducible.',
    ],
  };
}

module.exports = {
  EVALUATOR_READINESS_VERSION,
  buildEvaluatorReadiness,
};
