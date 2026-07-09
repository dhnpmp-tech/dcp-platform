'use strict';

const {
  DATASET_FORMATS,
  LoraContractError,
  TINKER_LOOP_PRIMITIVES,
  buildTinkerLoopReadiness,
  normalizeAdapterDeploySpec,
  normalizeLoraTrainingSpec,
  validateLoraDatasetJsonl,
} = require('../services/loraTrainingContract');

function jsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

describe('LoRA dataset validation contract', () => {
  test('validates chat-message JSONL with train/validation split metadata', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      messages: [
        { role: 'system', content: 'Answer in Arabic.' },
        { role: 'user', content: `Question ${index}` },
        { role: 'assistant', content: `Answer ${index}` },
      ],
    }));

    const result = validateLoraDatasetJsonl(jsonl(rows), { validationSplitPct: 20 });

    expect(result).toMatchObject({
      format: DATASET_FORMATS.CHAT_MESSAGES,
      row_count: 12,
      train_rows: 10,
      validation_rows: 2,
      validation_split_pct: 20,
    });
    expect(result.estimated_tokens).toBeGreaterThan(0);
    expect(result.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('validates prompt/completion JSONL and keeps tiny datasets all-train', () => {
    const result = validateLoraDatasetJsonl(jsonl([
      { prompt: 'Translate hello', completion: 'marhaba' },
      { prompt: 'Translate thanks', completion: 'shukran' },
    ]));

    expect(result).toMatchObject({
      format: DATASET_FORMATS.PROMPT_COMPLETION,
      row_count: 2,
      train_rows: 2,
      validation_rows: 0,
    });
  });

  test('rejects empty, unsafe, and incomplete rows before GPU work', () => {
    expect(() => validateLoraDatasetJsonl('\n')).toThrow(/at least one/);
    expect(() => validateLoraDatasetJsonl(jsonl([{ prompt: 'hi', completion: 'bad\0text' }]))).toThrow(/unsafe/);
    expect(() => validateLoraDatasetJsonl(jsonl([{ messages: [{ role: 'user', content: 'hi' }] }]))).toThrow(/assistant/);
    expect(() => validateLoraDatasetJsonl(jsonl([
      { prompt: 'hi', completion: 'there' },
      { messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'there' }] },
    ]))).toThrow(/mixes/);
  });

  test('enforces byte and row limits', () => {
    const row = { prompt: 'hello', completion: 'world' };

    expect(() => validateLoraDatasetJsonl(jsonl([row]), { maxBytes: 10 })).toThrow(/byte size/);
    expect(() => validateLoraDatasetJsonl(jsonl([row, row]), { maxRows: 1 })).toThrow(/row count/);
  });
});

describe('LoRA training and deployment contracts', () => {
  test('keeps Tinker-style loop primitives contract-only until GPU proof exists', () => {
    const readiness = buildTinkerLoopReadiness();

    expect(readiness).toMatchObject({
      status: 'contract_only',
      available: false,
      api_available: false,
      compatibility_claim_allowed: false,
      tinker_api_compatible: false,
      safety: {
        runs_remote_gpu_loop: false,
        creates_training_job: false,
        writes_adapter_weights: false,
        persists_raw_dataset: false,
        exposes_low_level_gradients: false,
        bills_training_steps: false,
        claims_tinker_compatibility: false,
      },
    });
    expect(Object.keys(readiness.primitives)).toEqual(TINKER_LOOP_PRIMITIVES);
    for (const primitive of TINKER_LOOP_PRIMITIVES) {
      expect(readiness.primitives[primitive]).toMatchObject({
        status: 'not_enabled',
        available: false,
        endpoint: null,
        mutates_training_state: false,
      });
      expect(readiness.primitives[primitive].requires_before_enablement).toEqual(
        expect.arrayContaining(['renter auth', 'dataset/artifact checksum policy', 'GPU-host proof'])
      );
    }
    expect(readiness.required_before_enablement).toEqual(expect.arrayContaining([
      'GPU-host executor proof for forward/backward/optimizer/save',
      'adapter registry link and vLLM load-proof handoff',
    ]));
  });

  test('normalizes a fixed QLoRA SFT training draft', () => {
    const spec = normalizeLoraTrainingSpec({
      recipe: 'qlora-sft',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      dataset_storage_key: '/datasets/r1/support.jsonl',
      output_adapter_name: 'support-arabic',
      hyperparameters: {
        rank: 32,
        learning_rate: 0.0001,
      },
    });

    expect(spec).toMatchObject({
      job_type: 'lora_training',
      status: 'draft_contract',
      recipe: 'qlora_sft',
      base_model: 'meta-llama/Llama-3.1-8B-Instruct',
      dataset_storage_key: 'datasets/r1/support.jsonl',
      output_adapter_name: 'support-arabic',
      hyperparameters: {
        rank: 32,
        alpha: 64,
        dropout: 0.05,
        learning_rate: 0.0001,
      },
      output: {
        artifact_kind: 'lora_adapter',
        registry_initial_status: 'registered',
        model_card_required: true,
      },
      safety: {
        requires_dataset_validation: true,
        requires_gpu_host_proof: true,
      },
    });
  });

  test('rejects unsafe training specs', () => {
    expect(() => normalizeLoraTrainingSpec({
      recipe: 'full_finetune',
      base_model: 'm',
      dataset_storage_key: 'datasets/r1/a.jsonl',
      output_adapter_name: 'a',
    })).toThrow(LoraContractError);

    expect(() => normalizeLoraTrainingSpec({
      base_model: 'm',
      dataset_storage_key: '../secret.jsonl',
      output_adapter_name: 'a',
    })).toThrow(/dataset_storage_key/);
  });

  test('keeps adapter deployment non-routing until serving load proof matches', () => {
    const pending = normalizeAdapterDeploySpec({
      adapter_id: 'adpt_support01',
      base_model: 'qwen/qwen3-coder',
      mode: 'single_adapter_live_merge',
    });
    expect(pending).toMatchObject({
      status: 'pending_load_proof',
      route_traffic: false,
      serving_load_proof: null,
    });

    const mismatch = normalizeAdapterDeploySpec({
      adapter_id: 'adpt_support01',
      base_model: 'qwen/qwen3-coder',
      serving_load_proof: {
        loaded: true,
        adapter_id: 'adpt_other001',
        base_model: 'qwen/qwen3-coder',
      },
    });
    expect(mismatch.route_traffic).toBe(false);

    const loaded = normalizeAdapterDeploySpec({
      adapter_id: 'adpt_support01',
      base_model: 'qwen/qwen3-coder',
      serving_load_proof: {
        loaded: true,
        adapter_id: 'adpt_support01',
        base_model: 'qwen/qwen3-coder',
        loaded_at: '2026-07-08T05:50:00.000Z',
      },
    });
    expect(loaded).toMatchObject({
      status: 'loaded_verified',
      route_traffic: true,
    });
  });
});
