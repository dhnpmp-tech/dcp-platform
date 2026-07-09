'use strict';

const EVALUATOR_JOB_SCHEMA_VERSION = 'dcp.evaluator_job_schema.v1';

function buildEvaluatorJobSchema(now = new Date()) {
  return {
    object: 'evaluator_job_schema_contract',
    version: EVALUATOR_JOB_SCHEMA_VERSION,
    generated_at: now.toISOString(),
    current_mode: 'schema_contract_only',
    endpoints: {
      schema: 'GET /api/evals/jobs/schema',
      readiness: 'GET /api/evals/readiness',
      benchmark_readiness: 'GET /api/models/benchmarks/readiness',
      create_metadata: 'POST /api/evals/jobs',
      list_metadata: 'GET /api/evals/jobs',
      read_metadata: 'GET /api/evals/jobs/:id',
      future_result_manifest: 'GET /api/evals/jobs/:id/results',
    },
    job_record: {
      id_format: 'evaljob_<base32>',
      tenant_scope: 'renter',
      status_enum: [
        'draft',
        'blocked',
        'queued',
        'running',
        'succeeded',
        'failed',
        'cancelled',
      ],
      initial_status_when_create_is_enabled: 'draft',
      immutable_fields_after_queue: [
        'task',
        'dataset.ref',
        'dataset.sha256',
        'candidate_model',
        'baseline_models',
        'metrics',
        'scoring_harness.version',
      ],
    },
    request_schema: {
      required: [
        'name',
        'task',
        'dataset.ref',
        'dataset.sha256',
        'candidate_model',
        'metrics',
      ],
      optional: [
        'baseline_models',
        'max_examples',
        'redaction_review_id',
        'cost_budget_halala',
        'metadata',
      ],
      fields: {
        name: {
          type: 'string',
          max_length: 120,
          notes: 'Human-readable renter label; not used in public reports until reviewed.',
        },
        task: {
          type: 'enum',
          allowed_values: [
            'arabic_qa',
            'arabic_summarization',
            'arabic_safety',
            'retrieval_groundedness',
            'tool_calling',
            'latency_cost',
          ],
        },
        dataset: {
          type: 'object',
          required: ['ref', 'sha256', 'format', 'example_count'],
          allowed_formats: ['jsonl'],
          ref_policy: 'private_artifact_reference_only',
          raw_publication_allowed: false,
          redaction_review_required: true,
        },
        candidate_model: {
          type: 'string',
          source: 'DCP model catalog id or dedicated deployment id',
        },
        baseline_models: {
          type: 'array<string>',
          default: [],
          notes: 'Frontier or third-party baselines require explicit approval before public comparison.',
        },
        metrics: {
          type: 'array<enum>',
          allowed_values: [
            'exact_match',
            'f1',
            'semantic_similarity',
            'arabic_safety',
            'groundedness',
            'p50_latency_ms',
            'p95_latency_ms',
            'token_cost_halala',
          ],
        },
      },
    },
    artifact_policy: {
      result_manifest_required: true,
      result_manifest_fields: [
        'eval_job_id',
        'dataset_sha256',
        'scoring_harness_version',
        'candidate_model',
        'baseline_models',
        'metrics',
        'summary_sha256',
        'created_at',
      ],
      raw_prompt_or_completion_publication_allowed: false,
      public_report_requires_human_review: true,
    },
    scoring_harness: {
      version_required: true,
      deterministic_seed_required: true,
      max_examples_default: 100,
      max_examples_hard_limit: 10000,
      worker_enabled: false,
      worker_enablement_gate: 'disabled_by_default_live_proof',
    },
    billing_policy: {
      bills_eval_jobs: false,
      minimum_balance_endpoint: 'GET /api/renters/me/minimum-balances',
      preflight_required_before_enablement: true,
      failed_run_refund_policy_required: true,
    },
    claim_guards: {
      create_endpoint_live: true,
      list_endpoint_live: true,
      read_endpoint_live: true,
      metadata_only: true,
      result_endpoint_live: false,
      worker_enabled: false,
      stores_raw_customer_dataset: false,
      publishes_raw_customer_dataset: false,
      runs_model_comparisons: false,
      bills_eval_jobs: false,
      public_report_allowed: false,
      arabic_quality_claim_allowed: false,
      model_ranking_allowed: false,
      frontier_model_comparison_allowed: false,
    },
    next_actions: [
      'Add result-manifest checksum proof before any worker execution.',
      'Keep public benchmark reports gated until approved artifacts exist.',
    ],
  };
}

module.exports = {
  EVALUATOR_JOB_SCHEMA_VERSION,
  buildEvaluatorJobSchema,
};
