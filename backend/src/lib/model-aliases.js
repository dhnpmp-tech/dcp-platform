'use strict';

/**
 * Canonical alias map for DCP model IDs.
 *
 * Ollama serves models by colon-format tag (e.g. `qwen3:30b-a3b`).
 * DC1's dashboard / OpenAI-compat surface historically used a
 * dash-format ID (e.g. `qwen3-30b-a3b`) because OpenAI model IDs
 * conventionally avoid colons. For any model that has both forms
 * in the registry, the colon form is canonical (it matches what
 * providers actually have cached).
 *
 * This map is the single source of truth and is shared by:
 *   - src/routes/v1.js   — `/v1/models` dedupe + proxy routing
 *   - src/routes/v1.js   — `OLLAMA_MODEL_ALIASES` (proxy rewrite)
 *   - tests              — regression guards
 *
 * Adding a new alias: append to DASH_TO_CANONICAL. Do NOT add the
 * reverse direction; it is derived automatically.
 *
 * Tito audit reference: duplicate catalog entries for qwen3.5-35b-a3b,
 * qwen3-30b-a3b, qwen3-8b showing inflated model counts and zero
 * providers on the dash-form entry.
 */

// Dash-form → colon-form (canonical Ollama tag).
// Keep alphabetised for easier review.
const DASH_TO_CANONICAL = Object.freeze({
  'allam-ai/allam-7b-instruct-preview':                 'allam-q4',
  'allam-7b-instruct':                                  'allam-q4',
  'baai/bge-m3':                                        'bge-m3',
  'deepseek-r1-7b':                                     'deepseek-r1:7b',
  'falcon3-7b':                                         'falcon3:7b',
  'gemma3-27b':                                         'gemma3:27b',
  'glm4-9b':                                            'glm4:9b',
  'llama3.1-8b':                                        'llama3.1:8b',
  'meta-llama/meta-llama-3-8b-instruct':                'llama3.1:8b',
  'mistral-7b':                                         'mistral:7b',
  'mistralai/mistral-7b-instruct-v0.2':                 'mistral:7b',
  'nemotron-30b-a3b':                                   'nemotron:30b-a3b',
  'qwen/qwen2.5-14b-instruct-awq':                      'qwen2.5:14b',
  'qwen/qwen2.5-3b-instruct':                           'qwen2.5:3b',
  'qwen/qwen2.5-7b-instruct-awq':                       'qwen2.5:7b',
  'qwen/qwen2.5-vl-3b-instruct':                        'qwen2.5vl:3b',
  'qwen/qwen3-30b-a3b-gptq-int4':                       'qwen3:30b-a3b',
  'qwen/qwen3.5-35b-a3b-gptq-int4':                     'qwen3.5:35b-a3b',
  'qwen2.5-14b':                                        'qwen2.5:14b',
  'qwen2.5-7b':                                         'qwen2.5:7b',
  'qwen2.5-vl-3b':                                      'qwen2.5vl:3b',
  'qwen2.5vl-3b':                                       'qwen2.5vl:3b',
  'qwen3-14b':                                          'qwen3:14b',
  'qwen3-30b-a3b':                                      'qwen3:30b-a3b',
  'qwen3-4b':                                           'qwen3:4b',
  'qwen3-8b':                                           'qwen3:8b',
  'qwen3.5-35b-a3b':                                    'qwen3.5:35b-a3b',
  'thebloke/mistral-7b-instruct-v0.2-awq':              'mistral:7b',
});

// Derived: canonical → [aliases...] (for dedupe reverse lookup).
const CANONICAL_TO_ALIASES = (() => {
  const out = new Map();
  for (const [alias, canonical] of Object.entries(DASH_TO_CANONICAL)) {
    const list = out.get(canonical) || [];
    list.push(alias);
    out.set(canonical, list);
  }
  return out;
})();

/**
 * Returns the canonical (colon-form) model ID for a given input, or the
 * input unchanged if no alias is known.
 */
function getCanonicalModelId(modelId) {
  if (typeof modelId !== 'string') return modelId;
  const lowered = modelId.toLowerCase().trim();
  return DASH_TO_CANONICAL[lowered] || modelId;
}

function looseModelKey(modelId) {
  const stripped = String(modelId || '')
    .toLowerCase()
    .replace(/[\/:_\-\s.]/g, '')
    .replace(/(gptq|awq|gguf|int4|int8|fp16|fp8|bf16|q4km|q4ks|q5km|q5ks|q6k|q8|km|ks)/g, '');
  return stripped.length >= 4 ? stripped : '';
}

function normalizeModelKey(modelId) {
  if (typeof modelId !== 'string') return null;
  const cleaned = modelId.toLowerCase().trim();
  return cleaned || null;
}

function modelMatchKeys(modelId) {
  const raw = normalizeModelKey(modelId);
  if (!raw) return [];
  const canonical = normalizeModelKey(getCanonicalModelId(raw));
  return [...new Set([raw, canonical].filter(Boolean))];
}

function modelIdsMatch(candidateModelId, requestedModelId) {
  const candidateKeys = modelMatchKeys(candidateModelId);
  const requestedKeys = modelMatchKeys(requestedModelId);
  if (candidateKeys.length === 0 || requestedKeys.length === 0) return false;

  for (const candidate of candidateKeys) {
    for (const requested of requestedKeys) {
      if (
        candidate === requested ||
        candidate.includes(requested) ||
        requested.includes(candidate)
      ) {
        return true;
      }
    }
  }

  for (const candidate of candidateKeys) {
    const candidateLoose = looseModelKey(candidate);
    if (!candidateLoose) continue;
    for (const requested of requestedKeys) {
      const requestedLoose = looseModelKey(requested);
      if (
        requestedLoose &&
        (
          candidateLoose === requestedLoose ||
          candidateLoose.includes(requestedLoose) ||
          requestedLoose.includes(candidateLoose)
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Given an array of OpenAI-compat model objects (with `id` and
 * `provider_count`), collapse dash-form aliases into their canonical
 * colon-form entry. Provider counts are summed. When the dash-form entry
 * has a field the canonical lacks, we prefer the canonical's own field.
 *
 * If a dash-form entry exists but the canonical does NOT, the dash-form
 * entry is kept unchanged (the alias is the only representation we have).
 *
 * Pure function: does not mutate input.
 */
function deduplicateModelAliases(models) {
  if (!Array.isArray(models) || models.length === 0) return models || [];

  // First pass: index by lowercase id for O(1) canonical lookup.
  const byId = new Map();
  for (const model of models) {
    if (!model || typeof model.id !== 'string') continue;
    byId.set(model.id.toLowerCase().trim(), model);
  }

  const suppressedIds = new Set();
  const result = [];

  for (const model of models) {
    if (!model || typeof model.id !== 'string') {
      result.push(model);
      continue;
    }
    const idLower = model.id.toLowerCase().trim();
    const canonicalId = DASH_TO_CANONICAL[idLower];

    if (canonicalId) {
      // This row is a dash-form alias. Is the canonical row present?
      const canonicalRow = byId.get(canonicalId.toLowerCase());
      if (canonicalRow) {
        // Suppress this row; its provider_count will be folded into the canonical.
        suppressedIds.add(idLower);
        continue;
      }
      // No canonical row exists in this catalog — keep the alias as-is.
      result.push(model);
      continue;
    }

    // This row is a (potential) canonical. Fold in any dash-form aliases
    // that also appear in the input.
    const aliases = CANONICAL_TO_ALIASES.get(idLower) || [];
    if (aliases.length === 0) {
      result.push(model);
      continue;
    }
    // Fold = MAX, not sum. Alias rows' counts are computed from the same
    // canonical provider-id set (or a subset key of it), so the same physical
    // provider appears in both the canonical and dash-form rows — summing
    // double-counted it (a lone Node 2 showed provider_count=2 for qwen3:8b).
    let maxAliasProviderCount = 0;
    for (const alias of aliases) {
      const aliasRow = byId.get(alias);
      if (aliasRow && typeof aliasRow.provider_count === 'number') {
        maxAliasProviderCount = Math.max(maxAliasProviderCount, aliasRow.provider_count);
      }
    }
    if (maxAliasProviderCount === 0) {
      result.push(model);
    } else {
      result.push({
        ...model,
        provider_count: Math.max(Number(model.provider_count) || 0, maxAliasProviderCount),
      });
    }
  }

  return result;
}

module.exports = {
  DASH_TO_CANONICAL,
  CANONICAL_TO_ALIASES,
  getCanonicalModelId,
  modelIdsMatch,
  looseModelKey,
  deduplicateModelAliases,
};
