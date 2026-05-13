// Regression: Tareq Node 2 incident 2026-05-13 — MiniMax-M2.7-highspeed
// (and the rest of the thinking-mode family: Qwen3, QwQ, DeepSeek-R1)
// emit their full output budget into <think>…</think> by default, so
// `choices[0].message.content` came back as "". Fix injects
// chat_template_kwargs.enable_thinking=false on the way out and strips
// <think>…</think> on the way in. Tests pin both behaviours.

const { __test__ } = require('../routes/agent-gateway');
const {
  isThinkingModel,
  injectDisableThinking,
  injectAnthropicDisableThinking,
  stripThinkBlocks,
  stripThinkFromResponse,
  sanitizeAnthropicContent,
} = __test__;

describe('agent-gateway thinking-mode handling', () => {
  describe('isThinkingModel', () => {
    test.each([
      ['MiniMax-M2.7-highspeed', true],
      ['minimax-m2.7-pro', true],
      ['Qwen3-32B-Instruct', true],
      ['qwen3_72b', true],
      ['QwQ-32B-preview', true],
      ['qwq-7b', true],
      ['DeepSeek-R1-Distill', true],
      ['deepseek-r1-llama-70b', true],
      ['deepseek_r1_qwen', true],
      ['claude-sonnet-4-6', false],
      ['gpt-4o', false],
      ['llama-3.1-70b', false],
      ['qwen2.5-72b', false],          // qwen2.5 is NOT in family
      ['minimax-m1-text', false],       // older minimax, not m2.7
      ['', false],
      [null, false],
      [undefined, false],
    ])('isThinkingModel(%j) → %s', (input, expected) => {
      expect(isThinkingModel(input)).toBe(expected);
    });
  });

  describe('injectDisableThinking', () => {
    test('model in family → flag injected into chat_template_kwargs', () => {
      const body = { model: 'MiniMax-M2.7-highspeed', messages: [] };
      injectDisableThinking(body, 'MiniMax-M2.7-highspeed');
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    });

    test('model NOT in family → body untouched, no flag', () => {
      const body = { model: 'claude-sonnet-4-6', messages: [] };
      injectDisableThinking(body, 'claude-sonnet-4-6');
      expect(body.chat_template_kwargs).toBeUndefined();
      expect(body.enable_thinking).toBeUndefined();
    });

    test('renter opt-in via top-level enable_thinking:true passes through', () => {
      const body = {
        model: 'Qwen3-32B',
        messages: [],
        enable_thinking: true,
      };
      injectDisableThinking(body, 'Qwen3-32B');
      // Original flag preserved; no override injected.
      expect(body.enable_thinking).toBe(true);
      expect(body.chat_template_kwargs).toBeUndefined();
    });

    test('renter opt-in via chat_template_kwargs.enable_thinking:true passes through', () => {
      const body = {
        model: 'deepseek-r1-llama-70b',
        messages: [],
        chat_template_kwargs: { enable_thinking: true, other_flag: 1 },
      };
      injectDisableThinking(body, 'deepseek-r1-llama-70b');
      expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, other_flag: 1 });
    });

    test('preserves unrelated chat_template_kwargs when injecting', () => {
      const body = {
        model: 'qwq-32b',
        messages: [],
        chat_template_kwargs: { add_generation_prompt: true },
      };
      injectDisableThinking(body, 'qwq-32b');
      expect(body.chat_template_kwargs).toEqual({
        add_generation_prompt: true,
        enable_thinking: false,
      });
    });
  });

  describe('stripThinkBlocks', () => {
    test('strips <think>…</think> and leaves visible content', () => {
      const input = '<think>internal monologue here</think>Hello, world!';
      expect(stripThinkBlocks(input)).toBe('Hello, world!');
    });

    test('strips multi-line <think> blocks', () => {
      const input = '<think>\nstep 1\nstep 2\n</think>\nThe answer is 42.';
      expect(stripThinkBlocks(input)).toBe('The answer is 42.');
    });

    test('strips multiple <think> blocks', () => {
      const input = '<think>a</think>First. <think>b</think>Second.';
      expect(stripThinkBlocks(input)).toBe('First. Second.');
    });

    test('content without <think> returned unchanged', () => {
      const input = 'Just a plain response.';
      expect(stripThinkBlocks(input)).toBe('Just a plain response.');
    });

    test('non-string input returned unchanged', () => {
      expect(stripThinkBlocks(null)).toBeNull();
      expect(stripThinkBlocks(undefined)).toBeUndefined();
      expect(stripThinkBlocks(42)).toBe(42);
    });
  });

  describe('stripThinkFromResponse', () => {
    test('response with <think> block in choices → stripped', () => {
      const json = {
        choices: [
          { message: { role: 'assistant', content: '<think>plan</think>PONG' } },
        ],
      };
      stripThinkFromResponse(json);
      expect(json.choices[0].message.content).toBe('PONG');
    });

    test('response without <think> → unchanged', () => {
      const json = {
        choices: [
          { message: { role: 'assistant', content: 'PONG' } },
        ],
      };
      stripThinkFromResponse(json);
      expect(json.choices[0].message.content).toBe('PONG');
    });

    test('response with multiple choices each stripped independently', () => {
      const json = {
        choices: [
          { message: { content: '<think>a</think>one' } },
          { message: { content: 'two' } },
          { message: { content: '<think>b</think>three' } },
        ],
      };
      stripThinkFromResponse(json);
      expect(json.choices.map((c) => c.message.content)).toEqual(['one', 'two', 'three']);
    });

    test('null/undefined/no-choices response → no throw', () => {
      expect(() => stripThinkFromResponse(null)).not.toThrow();
      expect(() => stripThinkFromResponse(undefined)).not.toThrow();
      expect(() => stripThinkFromResponse({})).not.toThrow();
      expect(() => stripThinkFromResponse({ choices: [] })).not.toThrow();
    });

    test('reasoning_content promoted when content is empty', () => {
      const json = {
        choices: [
          { message: { role: 'assistant', content: '', reasoning_content: 'the answer is 42' } },
        ],
      };
      stripThinkFromResponse(json);
      expect(json.choices[0].message.content).toBe('the answer is 42');
    });

    test('reasoning_content promoted when content is null', () => {
      const json = {
        choices: [
          { message: { role: 'assistant', content: null, reasoning_content: 'computed result' } },
        ],
      };
      stripThinkFromResponse(json);
      expect(json.choices[0].message.content).toBe('computed result');
    });

    test('reasoning_content NOT promoted when content already non-empty', () => {
      const json = {
        choices: [
          { message: { role: 'assistant', content: 'real answer', reasoning_content: 'scratch' } },
        ],
      };
      stripThinkFromResponse(json);
      expect(json.choices[0].message.content).toBe('real answer');
    });
  });

  // The actual fix for Tareq Node 2: Hermes uses transport="anthropic_messages"
  // and calls /v1/messages. The Anthropic Messages spec uses thinking:{type:...}
  // and content-block types of `thinking`/`redacted_thinking`. The OpenAI-side
  // fix from PR #399 didn't help that code path.
  describe('injectAnthropicDisableThinking', () => {
    test('thinking model gets thinking={type:"disabled"} injected', () => {
      const body = { model: 'MiniMax-M2.7-highspeed', messages: [] };
      injectAnthropicDisableThinking(body, 'MiniMax-M2.7-highspeed');
      expect(body.thinking).toEqual({ type: 'disabled' });
    });

    test('non-thinking model unchanged', () => {
      const body = { messages: [] };
      injectAnthropicDisableThinking(body, 'claude-sonnet-4-6');
      expect(body.thinking).toBeUndefined();
    });

    test('caller opt-in {type:"enabled"} preserved', () => {
      const body = { thinking: { type: 'enabled', budget_tokens: 8000 }, messages: [] };
      injectAnthropicDisableThinking(body, 'MiniMax-M2.7-highspeed');
      expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 8000 });
    });
  });

  describe('sanitizeAnthropicContent', () => {
    test('text block alongside thinking → thinking dropped, text kept', () => {
      const json = {
        content: [
          { type: 'thinking', thinking: 'I should compute 2+2.' },
          { type: 'text', text: '4' },
        ],
      };
      sanitizeAnthropicContent(json);
      expect(json.content).toEqual([{ type: 'text', text: '4' }]);
    });

    test('only thinking blocks → synthesize text from thinking (the Tareq fix)', () => {
      const json = {
        content: [
          { type: 'thinking', thinking: 'PONG' },
        ],
      };
      sanitizeAnthropicContent(json);
      expect(json.content).toEqual([{ type: 'text', text: 'PONG' }]);
    });

    test('multiple thinking blocks concatenated with double newline', () => {
      const json = {
        content: [
          { type: 'thinking', thinking: 'step one' },
          { type: 'thinking', thinking: 'step two' },
        ],
      };
      sanitizeAnthropicContent(json);
      expect(json.content).toEqual([{ type: 'text', text: 'step one\n\nstep two' }]);
    });

    test('redacted_thinking dropped, kept out of salvage', () => {
      const json = {
        content: [
          { type: 'redacted_thinking', data: 'opaque' },
          { type: 'text', text: 'hi' },
        ],
      };
      sanitizeAnthropicContent(json);
      expect(json.content).toEqual([{ type: 'text', text: 'hi' }]);
    });

    test('tool_use counts as usable — no synthesis needed', () => {
      const json = {
        content: [
          { type: 'thinking', thinking: 'choosing tool' },
          { type: 'tool_use', id: 'tool_1', name: 'search', input: {} },
        ],
      };
      sanitizeAnthropicContent(json);
      expect(json.content).toEqual([{ type: 'tool_use', id: 'tool_1', name: 'search', input: {} }]);
    });

    test('empty text block + thinking → synthesize from thinking', () => {
      const json = {
        content: [
          { type: 'thinking', thinking: 'real answer here' },
          { type: 'text', text: '' },
        ],
      };
      sanitizeAnthropicContent(json);
      // empty text block is filtered out (no usable), thinking salvaged
      expect(json.content).toEqual([
        { type: 'text', text: '' },
        { type: 'text', text: 'real answer here' },
      ]);
    });

    test('<think> markup inside a text block still stripped', () => {
      const json = {
        content: [
          { type: 'text', text: '<think>scratch</think>final' },
        ],
      };
      sanitizeAnthropicContent(json);
      expect(json.content).toEqual([{ type: 'text', text: 'final' }]);
    });

    test('no content array → no throw', () => {
      expect(() => sanitizeAnthropicContent(null)).not.toThrow();
      expect(() => sanitizeAnthropicContent({})).not.toThrow();
      expect(() => sanitizeAnthropicContent({ content: 'not-an-array' })).not.toThrow();
    });
  });
});
