const {
  _pickProbeModel,
} = require('../services/providerVerification');

describe('provider verification probe model selection', () => {
  test('uses a live reported model when cached_models starts with a stale model', () => {
    const provider = {
      cached_models: JSON.stringify([
        'allam-7b:latest',
        'mistral:7b',
        'qwen3:4b',
      ]),
    };

    expect(_pickProbeModel(provider, ['qwen3:4b'])).toBe('qwen3:4b');
  });

  test('keeps a cached model when the endpoint confirms it is live', () => {
    const provider = {
      cached_models: JSON.stringify(['qwen3:4b', 'mistral:7b']),
    };

    expect(_pickProbeModel(provider, ['qwen3:4b'])).toBe('qwen3:4b');
  });

  test('falls back to cached_models only when /v1/models reports no ids', () => {
    const provider = {
      cached_models: JSON.stringify(['mistral:7b']),
    };

    expect(_pickProbeModel(provider, [])).toBe('mistral:7b');
  });
});
