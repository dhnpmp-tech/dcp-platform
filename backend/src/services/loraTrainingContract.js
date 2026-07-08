'use strict';

const crypto = require('crypto');

const DATASET_FORMATS = Object.freeze({
  CHAT_MESSAGES: 'chat_messages',
  PROMPT_COMPLETION: 'prompt_completion',
});

const TRAINING_RECIPES = Object.freeze(['lora_sft', 'qlora_sft']);
const DEPLOY_MODES = Object.freeze(['single_adapter_live_merge', 'multi_lora']);
const DEFAULT_MAX_DATASET_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_DATASET_ROWS = 100000;
const DEFAULT_CHARS_PER_TOKEN = 4;

class LoraContractError extends Error {
  constructor(message, { code = 'invalid_lora_contract', line = null, details = undefined } = {}) {
    super(message);
    this.name = 'LoraContractError';
    this.code = code;
    this.line = line;
    this.details = details;
  }
}

function validateLoraDatasetJsonl(input, options = {}) {
  if (typeof input !== 'string') {
    throw new LoraContractError('Dataset must be a JSONL string', { code: 'invalid_dataset' });
  }
  const maxBytes = options.maxBytes || DEFAULT_MAX_DATASET_BYTES;
  const maxRows = options.maxRows || DEFAULT_MAX_DATASET_ROWS;
  const validationSplitPct = clampNumber(options.validationSplitPct ?? 10, 0, 50);
  const byteLength = Buffer.byteLength(input, 'utf8');
  if (byteLength > maxBytes) {
    throw new LoraContractError('Dataset exceeds max byte size', {
      code: 'dataset_too_large',
      details: { max_bytes: maxBytes, byte_length: byteLength },
    });
  }

  const rows = [];
  let detectedFormat = null;
  let totalChars = 0;
  const normalizedLines = [];

  input.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) return;
    if (rows.length >= maxRows) {
      throw new LoraContractError('Dataset row count exceeds limit', {
        code: 'too_many_rows',
        line: lineNumber,
        details: { max_rows: maxRows },
      });
    }
    if (line.includes('\0')) {
      throw new LoraContractError('Dataset row contains a NUL byte', {
        code: 'unsafe_row',
        line: lineNumber,
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (_) {
      throw new LoraContractError('Dataset row is not valid JSON', {
        code: 'invalid_json',
        line: lineNumber,
      });
    }

    const normalized = normalizeDatasetRow(parsed, lineNumber);
    if (detectedFormat && normalized.format !== detectedFormat) {
      throw new LoraContractError('Dataset mixes chat and prompt/completion formats', {
        code: 'mixed_dataset_formats',
        line: lineNumber,
        details: { expected_format: detectedFormat, row_format: normalized.format },
      });
    }
    detectedFormat = normalized.format;
    totalChars += normalized.char_count;
    rows.push(normalized);
    normalizedLines.push(stableStringify(normalized.normalized));
  });

  if (rows.length === 0) {
    throw new LoraContractError('Dataset must contain at least one non-empty row', { code: 'empty_dataset' });
  }

  const validationRows = rows.length >= 10
    ? Math.max(1, Math.floor(rows.length * validationSplitPct / 100))
    : 0;
  const trainRows = rows.length - validationRows;
  const normalizedJsonl = normalizedLines.join('\n') + '\n';

  return {
    format: detectedFormat,
    row_count: rows.length,
    train_rows: trainRows,
    validation_rows: validationRows,
    validation_split_pct: validationSplitPct,
    estimated_tokens: estimateTokens(totalChars),
    max_row_chars: Math.max(...rows.map((row) => row.char_count)),
    checksum_sha256: crypto.createHash('sha256').update(normalizedJsonl).digest('hex'),
    normalized_bytes: Buffer.byteLength(normalizedJsonl, 'utf8'),
  };
}

function normalizeDatasetRow(row, lineNumber) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new LoraContractError('Dataset row must be an object', { code: 'invalid_row', line: lineNumber });
  }
  if (Array.isArray(row.messages)) {
    return normalizeChatMessagesRow(row.messages, lineNumber);
  }
  if (Object.prototype.hasOwnProperty.call(row, 'prompt') || Object.prototype.hasOwnProperty.call(row, 'completion')) {
    return normalizePromptCompletionRow(row, lineNumber);
  }
  throw new LoraContractError('Dataset row must include messages or prompt/completion', {
    code: 'unsupported_dataset_row',
    line: lineNumber,
  });
}

function normalizeChatMessagesRow(messages, lineNumber) {
  if (messages.length === 0) {
    throw new LoraContractError('messages must not be empty', { code: 'empty_messages', line: lineNumber });
  }
  let hasUser = false;
  let hasAssistant = false;
  let charCount = 0;
  const normalizedMessages = messages.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new LoraContractError('message must be an object', {
        code: 'invalid_message',
        line: lineNumber,
        details: { index },
      });
    }
    const role = String(message.role || '').trim().toLowerCase();
    if (!['system', 'developer', 'user', 'assistant'].includes(role)) {
      throw new LoraContractError('message role is not supported for LoRA SFT', {
        code: 'unsupported_role',
        line: lineNumber,
        details: { index, role },
      });
    }
    const content = normalizeText(message.content, 'message.content', lineNumber);
    if (role === 'user') hasUser = true;
    if (role === 'assistant') hasAssistant = true;
    charCount += content.length;
    return { role, content };
  });
  if (!hasUser || !hasAssistant) {
    throw new LoraContractError('chat dataset rows require at least one user and one assistant message', {
      code: 'missing_user_or_assistant',
      line: lineNumber,
    });
  }
  return {
    format: DATASET_FORMATS.CHAT_MESSAGES,
    char_count: charCount,
    normalized: { messages: normalizedMessages },
  };
}

function normalizePromptCompletionRow(row, lineNumber) {
  const prompt = normalizeText(row.prompt, 'prompt', lineNumber);
  const completion = normalizeText(row.completion, 'completion', lineNumber);
  return {
    format: DATASET_FORMATS.PROMPT_COMPLETION,
    char_count: prompt.length + completion.length,
    normalized: { prompt, completion },
  };
}

function normalizeLoraTrainingSpec(input = {}) {
  const recipe = normalizeRecipe(input.recipe || 'qlora_sft');
  const spec = {
    job_type: 'lora_training',
    status: 'draft_contract',
    recipe,
    base_model: normalizeBoundedString(input.base_model, 'base_model', 160),
    dataset_storage_key: normalizeStorageKey(input.dataset_storage_key),
    output_adapter_name: normalizeBoundedString(input.output_adapter_name || input.adapter_name, 'output_adapter_name', 80),
    hyperparameters: normalizeHyperparameters(input.hyperparameters || {}, recipe),
    output: {
      artifact_kind: 'lora_adapter',
      registry_initial_status: 'registered',
      model_card_required: true,
    },
    safety: {
      requires_dataset_validation: true,
      requires_gpu_host_proof: true,
      public_claim: 'LoRA SFT MVP only after artifact proof',
    },
  };
  return spec;
}

function normalizeAdapterDeploySpec(input = {}) {
  const mode = normalizeEnum(input.mode || 'single_adapter_live_merge', DEPLOY_MODES, 'mode');
  const adapterId = normalizeAdapterId(input.adapter_id);
  const baseModel = normalizeBoundedString(input.base_model, 'base_model', 160);
  const loadProof = normalizeLoadProof(input.serving_load_proof);
  const routeTraffic = !!(
    loadProof &&
    loadProof.loaded === true &&
    loadProof.adapter_id === adapterId &&
    loadProof.base_model === baseModel
  );

  return {
    status: routeTraffic ? 'loaded_verified' : 'pending_load_proof',
    mode,
    adapter_id: adapterId,
    base_model: baseModel,
    endpoint_id: input.endpoint_id ? normalizeBoundedString(input.endpoint_id, 'endpoint_id', 120) : null,
    route_traffic: routeTraffic,
    serving_load_proof: loadProof,
  };
}

function normalizeHyperparameters(input, recipe) {
  const rankDefault = recipe === 'qlora_sft' ? 16 : 8;
  const rank = normalizeInt(input.rank ?? rankDefault, 'rank', 1, 1024);
  return {
    rank,
    alpha: normalizeInt(input.alpha ?? rank * 2, 'alpha', 1, 4096),
    dropout: normalizeFloat(input.dropout ?? 0.05, 'dropout', 0, 0.5),
    learning_rate: normalizeFloat(input.learning_rate ?? 2e-4, 'learning_rate', 1e-7, 1),
    epochs: normalizeFloat(input.epochs ?? 1, 'epochs', 0.01, 20),
    max_seq_length: normalizeInt(input.max_seq_length ?? 2048, 'max_seq_length', 128, 131072),
  };
}

function normalizeLoadProof(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LoraContractError('serving_load_proof must be an object', { code: 'invalid_load_proof' });
  }
  return {
    loaded: value.loaded === true,
    adapter_id: normalizeAdapterId(value.adapter_id),
    base_model: normalizeBoundedString(value.base_model, 'serving_load_proof.base_model', 160),
    loaded_at: value.loaded_at ? normalizeBoundedString(value.loaded_at, 'serving_load_proof.loaded_at', 80) : null,
    provider_id: value.provider_id == null ? null : String(value.provider_id),
  };
}

function normalizeRecipe(value) {
  return normalizeEnum(value, TRAINING_RECIPES, 'recipe');
}

function normalizeEnum(value, allowed, fieldName) {
  const normalized = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  if (!allowed.includes(normalized)) {
    throw new LoraContractError(`${fieldName} is not supported`, {
      code: 'unsupported_value',
      details: { field: fieldName, allowed },
    });
  }
  return normalized;
}

function normalizeAdapterId(value) {
  const id = normalizeBoundedString(value, 'adapter_id', 80);
  if (!/^adpt_[a-z0-9][a-z0-9_-]{5,63}$/.test(id)) {
    throw new LoraContractError('adapter_id must be a valid adapter registry id', {
      code: 'invalid_adapter_id',
      details: { field: 'adapter_id' },
    });
  }
  return id;
}

function normalizeStorageKey(value) {
  const key = normalizeBoundedString(value, 'dataset_storage_key', 512).replace(/^\/+/, '');
  const segments = key.split('/');
  if (!key || key.includes('\0') || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new LoraContractError('dataset_storage_key must be a relative object key without dot segments', {
      code: 'invalid_storage_key',
      details: { field: 'dataset_storage_key' },
    });
  }
  return key;
}

function normalizeText(value, fieldName, lineNumber) {
  if (typeof value !== 'string') {
    throw new LoraContractError(`${fieldName} must be a string`, {
      code: 'invalid_text',
      line: lineNumber,
      details: { field: fieldName },
    });
  }
  const text = value.trim();
  if (!text) {
    throw new LoraContractError(`${fieldName} must not be empty`, {
      code: 'empty_text',
      line: lineNumber,
      details: { field: fieldName },
    });
  }
  if (text.includes('\0')) {
    throw new LoraContractError(`${fieldName} contains unsafe characters`, {
      code: 'unsafe_text',
      line: lineNumber,
      details: { field: fieldName },
    });
  }
  return text;
}

function normalizeBoundedString(value, fieldName, maxLength) {
  if (typeof value !== 'string') {
    throw new LoraContractError(`${fieldName} is required`, {
      code: 'missing_required_field',
      details: { field: fieldName },
    });
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new LoraContractError(`${fieldName} must not be empty`, {
      code: 'empty_string',
      details: { field: fieldName },
    });
  }
  if (normalized.length > maxLength) {
    throw new LoraContractError(`${fieldName} exceeds max length`, {
      code: 'string_too_long',
      details: { field: fieldName, max_length: maxLength },
    });
  }
  return normalized;
}

function normalizeInt(value, fieldName, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new LoraContractError(`${fieldName} must be an integer between ${min} and ${max}`, {
      code: 'invalid_number',
      details: { field: fieldName, min, max },
    });
  }
  return n;
}

function normalizeFloat(value, fieldName, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new LoraContractError(`${fieldName} must be a number between ${min} and ${max}`, {
      code: 'invalid_number',
      details: { field: fieldName, min, max },
    });
  }
  return n;
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function estimateTokens(chars) {
  return Math.max(1, Math.ceil(chars / DEFAULT_CHARS_PER_TOKEN));
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

module.exports = {
  DATASET_FORMATS,
  TRAINING_RECIPES,
  DEPLOY_MODES,
  LoraContractError,
  validateLoraDatasetJsonl,
  normalizeLoraTrainingSpec,
  normalizeAdapterDeploySpec,
  __test: {
    normalizeDatasetRow,
    normalizeStorageKey,
    normalizeHyperparameters,
    stableStringify,
  },
};
