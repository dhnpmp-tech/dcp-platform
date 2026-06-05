// Engine-keyed reasoning control (v1 renter proxy).
// Covers: per-engine resolution, /no_think injection for Qwen-family,
// reasoning-field canonicalization/stripping, and the stateful streaming
// <think> stripper (tags split across SSE chunks).
process.env.DC1_DB_PATH = process.env.DC1_DB_PATH || ':memory:';

const {
  resolveEngineType,
  isThinkingCapableModel,
  modelHonorsNoThink,
  injectNoThinkDirective,
  canonicalizeReasoningField,
  stripReasoningFromObject,
  createStreamingThinkStripper,
} = require('../routes/v1').__test;

describe('resolveEngineType', () => {
  test('explicit engine hint wins over URL', () => {
    expect(resolveEngineType('http://10.8.0.6:8000/v1', 'ollama')).toBe('ollama');
    expect(resolveEngineType('http://x:11434/v1', 'vllm')).toBe('vllm');
  });
  test('infers from URL port when no hint', () => {
    expect(resolveEngineType('http://10.8.0.4:11434/v1', null)).toBe('ollama');
    expect(resolveEngineType('http://10.8.0.6:8000/v1', null)).toBe('vllm');
    expect(resolveEngineType('http://10.8.0.6:8080/v1', null)).toBe('llamacpp');
  });
  test('unknown when neither hint nor recognizable port', () => {
    expect(resolveEngineType('http://host:9999/v1', null)).toBe('unknown');
    expect(resolveEngineType('', undefined)).toBe('unknown');
  });
  test('ignores an invalid hint and falls back to URL', () => {
    expect(resolveEngineType('http://x:11434/v1', 'sglang')).toBe('ollama');
  });
});

describe('isThinkingCapableModel / modelHonorsNoThink', () => {
  test.each([
    ['qwen3-4b', true, true],
    ['qwen3:8b', true, true],
    ['Qwen/Qwen3-30B-A3B', true, true],
    ['qwq-32b', true, true],
    ['deepseek-r1:7b', true, false],          // capable, but ignores /no_think
    ['deepseek-ai/DeepSeek-R1-Distill', true, false],
    ['qwen2.5-7b', false, false],
    ['llama3.1:8b', false, false],
    ['mistral:7b', false, false],
  ])('%s → capable=%s, honorsNoThink=%s', (id, capable, honors) => {
    expect(isThinkingCapableModel(id)).toBe(capable);
    expect(modelHonorsNoThink(id)).toBe(honors);
  });
});

describe('injectNoThinkDirective', () => {
  test('appends /no_think to the last user message, immutably', () => {
    const msgs = [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'what is 2+2?' },
    ];
    const out = injectNoThinkDirective(msgs);
    expect(out[3].content).toBe('what is 2+2? /no_think');
    expect(out).not.toBe(msgs);            // new array
    expect(msgs[3].content).toBe('what is 2+2?'); // original untouched
    expect(out[1].content).toBe('hi');     // earlier user message untouched
  });
  test('no-op when /no_think already present', () => {
    const msgs = [{ role: 'user', content: 'x /no_think' }];
    expect(injectNoThinkDirective(msgs)).toBe(msgs);
  });
  test('no-op when last user content is not a string (multimodal)', () => {
    const msgs = [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }];
    expect(injectNoThinkDirective(msgs)).toBe(msgs);
  });
  test('no-op when there is no user message', () => {
    const msgs = [{ role: 'system', content: 'x' }];
    expect(injectNoThinkDirective(msgs)).toBe(msgs);
  });
});

describe('canonicalizeReasoningField', () => {
  test('renames Ollama `reasoning` to reasoning_content', () => {
    const d = { content: 'A', reasoning: 'thinking…' };
    canonicalizeReasoningField(d);
    expect(d.reasoning_content).toBe('thinking…');
    expect(d.reasoning).toBeUndefined();
  });
  test('renames native `thinking` to reasoning_content', () => {
    const d = { content: 'A', thinking: 'hmm' };
    canonicalizeReasoningField(d);
    expect(d.reasoning_content).toBe('hmm');
    expect(d.thinking).toBeUndefined();
  });
  test('keeps existing reasoning_content and drops the rest', () => {
    const d = { reasoning_content: 'keep', reasoning: 'drop' };
    canonicalizeReasoningField(d);
    expect(d.reasoning_content).toBe('keep');
    expect(d.reasoning).toBeUndefined();
  });
});

describe('stripReasoningFromObject', () => {
  test('strips <think> from content and drops reasoning fields', () => {
    const m = { content: '<think>secret</think>The answer is 4.', reasoning: 'x', reasoning_content: 'y', thinking: 'z' };
    stripReasoningFromObject(m);
    expect(m.content).toBe('The answer is 4.');
    expect(m.reasoning).toBeUndefined();
    expect(m.reasoning_content).toBeUndefined();
    expect(m.thinking).toBeUndefined();
  });
});

describe('createStreamingThinkStripper', () => {
  test('passes content unchanged when no tags', () => {
    const s = createStreamingThinkStripper();
    expect(s('hello ') + s('world')).toBe('hello world');
  });
  test('strips a think block fully within one chunk', () => {
    const s = createStreamingThinkStripper();
    expect(s('<think>reason</think>answer')).toBe('answer');
  });
  test('strips a think block that spans multiple chunks', () => {
    const s = createStreamingThinkStripper();
    let out = '';
    out += s('pre <think>rea');
    out += s('son more</thi');
    out += s('nk>post');
    expect(out).toBe('pre post');
  });
  test('holds back a partial opening tag across the boundary', () => {
    const s = createStreamingThinkStripper();
    let out = '';
    out += s('answer<thi');     // partial tag held
    out += s('nk>hidden</think>!');
    expect(out).toBe('answer!');
  });
});
