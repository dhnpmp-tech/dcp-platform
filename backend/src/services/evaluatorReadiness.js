'use strict';

const EVALUATOR_READINESS_VERSION = 'dcp.evaluator_readiness.v1';

function buildEvaluatorReadiness(now = new Date()) {
  return {
    object: 'evaluator_readiness',
    version: EVALUATOR_READINESS_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'readiness_contract_only',
    endpoints: {
      readiness: 'GET /api/evals/readiness',
      benchmark_readiness: 'GET /api/models/benchmarks/readiness',
      benchmark_feed: 'GET /api/models/benchmarks',
      product_page: 'GET /benchmarks',
    },
    features: {
      eval_job_api: {
        status: 'coming_next',
        available: false,
        create_endpoint: null,
        list_endpoint: null,
        result_endpoint: null,
        required_before_enablement: [
          'renter-scoped eval job schema',
          'idempotent create/list/read endpoints',
          'dataset checksum and redacted sample metadata',
          'worker disabled-by-default guard',
          'result artifact checksum proof',
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
      arabic_quality_claim_allowed: false,
      customer_case_study_allowed: false,
      model_ranking_allowed: false,
      frontier_model_comparison_allowed: false,
      raw_customer_dataset_published: false,
      bills_eval_jobs: false,
    },
    next_actions: [
      'Add renter-scoped evaluator job schema with idempotent metadata-only create/list/read APIs.',
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
