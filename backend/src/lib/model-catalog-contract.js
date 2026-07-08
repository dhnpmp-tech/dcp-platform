'use strict';

function parseUseCases(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').toLowerCase().trim()).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(value || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => String(entry || '').toLowerCase().trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function toUsdStringFromHalalaPerMinute(halalaPerMinute) {
  return toUsdStringFromHalala(halalaPerMinute);
}

function toUsdStringFromHalala(halalaValue) {
  const halala = Number(halalaValue || 0);
  if (!Number.isFinite(halala) || halala <= 0) return '0.000000';
  const usd = halala / 375;
  return usd.toFixed(6);
}

function toSarStringFromHalala(halalaValue) {
  const halala = Number(halalaValue || 0);
  if (!Number.isFinite(halala) || halala <= 0) return '0.0000';
  return (halala / 100).toFixed(4);
}

function toTokenPricingContract({
  inputHalalaPer1m,
  outputHalalaPer1m,
  source = 'unconfigured',
  modelClass = null,
} = {}) {
  const inputRate = Math.max(0, Math.round(Number(inputHalalaPer1m) || 0));
  const outputRate = Math.max(0, Math.round(Number(outputHalalaPer1m) || 0));
  return {
    prompt_tokens: toUsdStringFromHalala(inputRate / 1_000_000),
    completion_tokens: toUsdStringFromHalala(outputRate / 1_000_000),
    usd_per_1m_input_tokens: toUsdStringFromHalala(inputRate),
    usd_per_1m_output_tokens: toUsdStringFromHalala(outputRate),
    sar_per_1m_input_tokens: toSarStringFromHalala(inputRate),
    sar_per_1m_output_tokens: toSarStringFromHalala(outputRate),
    halala_per_1m_input_tokens: inputRate,
    halala_per_1m_output_tokens: outputRate,
    billing_unit: 'per_1m_tokens',
    source,
    model_class: modelClass,
  };
}

function inferModalitiesFromUseCases(useCases) {
  const set = new Set(['text']);
  useCases.forEach((entry) => {
    if (entry.includes('image') || entry.includes('vision') || entry.includes('multimodal')) set.add('image');
    if (entry.includes('audio') || entry.includes('speech') || entry.includes('voice')) set.add('audio');
  });
  return Array.from(set).sort();
}

function hasUseCase(useCases, needles) {
  return useCases.some((entry) => needles.some((needle) => entry.includes(needle)));
}

function inferSupportedFeaturesFromUseCases(useCases) {
  const featureSet = new Set();
  const hasExplicitUseCases = useCases.length > 0;
  const chatCapable = !hasExplicitUseCases || hasUseCase(useCases, [
    'chat',
    'instruct',
    'completion',
    'assistant',
    'reason',
    'code',
    'coding',
    'tool',
    'translation',
    'classification',
    'enterprise',
    'llm',
    'language',
  ]);
  const imageGeneration = hasUseCase(useCases, [
    'image-generation',
    'image_generation',
    'text-to-image',
    'diffusion',
  ]);

  if (chatCapable) featureSet.add('chat.completions');
  if (hasUseCase(useCases, ['reason'])) featureSet.add('reasoning');
  if (hasUseCase(useCases, ['code', 'coding'])) featureSet.add('code_generation');
  if (hasUseCase(useCases, ['tool'])) featureSet.add('tool_calling');
  if (hasUseCase(useCases, ['embed', 'rag', 'retriev'])) featureSet.add('embeddings');
  if (hasUseCase(useCases, ['rerank', 'ranking', 'search'])) featureSet.add('reranking');
  if (imageGeneration) featureSet.add('image_generation');
  if (hasUseCase(useCases, ['vision', 'multimodal'])) featureSet.add('vision');
  if (hasUseCase(useCases, ['arabic', 'translation', 'multilingual'])) featureSet.add('multilingual');
  return Array.from(featureSet).sort();
}

function createCapabilityFlags(supportedFeatures) {
  const set = new Set(supportedFeatures || []);
  return {
    chat_completions: set.has('chat.completions'),
    reasoning: set.has('reasoning'),
    code_generation: set.has('code_generation'),
    tool_calling: set.has('tool_calling'),
    embeddings: set.has('embeddings'),
    reranking: set.has('reranking'),
    image_generation: set.has('image_generation'),
    vision: set.has('vision'),
    multilingual: set.has('multilingual'),
  };
}

function toFeatureReadinessContract(capabilityFlags = {}) {
  const chatCapable = Boolean(capabilityFlags.chat_completions);
  return {
    version: 'dcp.model_feature_readiness.v1',
    dedicated_deployment: {
      status: chatCapable ? 'gated' : 'not_applicable',
      available: false,
      api_available: chatCapable,
      serving_enabled: false,
      route_traffic: false,
      load_proof_required: chatCapable,
      next: chatCapable ? 'create_deployment_then_attach_vllm_load_proof' : 'chat_capable_model_required',
    },
    lora: {
      status: chatCapable ? 'metadata_only' : 'not_applicable',
      available: false,
      adapter_registry_api: chatCapable,
      training_job_api: chatCapable,
      serving_enabled: false,
      route_traffic: false,
      load_proof_required: chatCapable,
      next: chatCapable ? 'run_gpu_training_proof_then_enable_adapter_serving' : 'chat_capable_base_model_required',
    },
    prompt_caching: {
      status: chatCapable ? 'measurement_only' : 'not_applicable',
      available: false,
      usage_metadata: chatCapable,
      billing_discount: false,
      settlement_enabled: false,
      next: chatCapable ? 'validate_hit_measurement_before_discount' : 'chat_completions_required',
    },
    batch: {
      status: chatCapable ? 'api_metadata_only' : 'not_applicable',
      available: false,
      api_available: chatCapable,
      execution_enabled: false,
      result_downloads: false,
      discount_enabled: false,
      next: chatCapable ? 'enable_worker_result_artifact_and_settlement' : 'chat_completions_required',
    },
  };
}

function toCatalogContractCore({ model, providerCount = 0, maxVramGb = 0, created = null, nameFallback = null }) {
  const modelId = String(model?.model_id || '').trim();
  const useCases = parseUseCases(model?.use_cases);
  const supportedFeatures = inferSupportedFeaturesFromUseCases(useCases);
  const contextWindow = Number(model?.context_window) > 0 ? Number(model.context_window) : 4096;
  const maxOutputTokens = Math.max(512, Math.min(16384, Math.floor(contextWindow / 2)));
  const usdPerMinute = toUsdStringFromHalalaPerMinute(model?.default_price_halala_per_min);

  // Keep field insertion deterministic so JSON serialization is stable in tests and clients.
  return {
    id: modelId,
    name: model?.display_name || nameFallback || modelId,
    created: created != null ? created : Math.floor(Date.now() / 1000),
    modalities: inferModalitiesFromUseCases(useCases),
    context_length: contextWindow,
    max_output_tokens: maxOutputTokens,
    quantization: model?.quantization || 'unknown',
    pricing: {
      usd_per_minute: usdPerMinute,
      usd_per_1m_input_tokens: usdPerMinute,
      usd_per_1m_output_tokens: usdPerMinute,
    },
    capability_flags: createCapabilityFlags(supportedFeatures),
    supported_features: supportedFeatures,
    provider_count: Number(providerCount || 0),
    max_vram_gb: Number((Number(maxVramGb || model?.vram_gb || 0)).toFixed(1)),
  };
}

module.exports = {
  parseUseCases,
  toUsdStringFromHalala,
  toUsdStringFromHalalaPerMinute,
  toSarStringFromHalala,
  toTokenPricingContract,
  toFeatureReadinessContract,
  inferModalitiesFromUseCases,
  inferSupportedFeaturesFromUseCases,
  toCatalogContractCore,
};
