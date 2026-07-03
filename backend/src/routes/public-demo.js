'use strict';

// Public hero demo — one tiny prompt, one real completion from a verified Saudi GPU.
// No auth. Strictly rate-limited. Internally calls our own /v1 stack with a
// server-held funded renter key (DCP_DEMO_RENTER_KEY) that never leaves the box.
// If the key is unset or no verified capacity is serving, it says so honestly.

const express = require('express');
const { createRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const PROMPT_MAX_CHARS = 280;
const DEMO_MAX_TOKENS = 220;
const NON_CHAT_MODEL_RE = /(vl|embed|rerank|bge|whisper|tts)/i;

const demoMinuteLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 6 });
const demoDailyLimiter = createRateLimiter({ windowMs: 24 * 60 * 60 * 1000, max: 40 });

router.post('/chat', demoMinuteLimiter, demoDailyLimiter, async (req, res) => {
  const demoKey = process.env.DCP_DEMO_RENTER_KEY || '';
  if (!demoKey) {
    return res.status(503).json({ error: 'demo_disabled' });
  }

  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) {
    return res.status(400).json({ error: 'prompt_required' });
  }
  if (prompt.length > PROMPT_MAX_CHARS) {
    return res.status(400).json({ error: 'prompt_too_long', max_chars: PROMPT_MAX_CHARS });
  }

  const base = `http://127.0.0.1:${process.env.PORT || 8083}`;
  try {
    const modelsRes = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(10_000) });
    if (!modelsRes.ok) return res.status(503).json({ error: 'no_live_capacity' });
    const catalog = await modelsRes.json();
    const model = (catalog?.data || []).find(
      (m) => m?.available && !NON_CHAT_MODEL_RE.test(String(m.id || ''))
    );
    if (!model) return res.status(503).json({ error: 'no_live_capacity' });

    const chatRes = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${demoKey}` },
      body: JSON.stringify({
        model: model.id,
        messages: [
          {
            role: 'system',
            content:
              "You are DCP's live public demo on dcp.sa, answering from a GPU physically inside Saudi Arabia. Answer briefly (2-3 sentences), in the language of the question. You have no internet access and no live data: if asked about current weather, news, prices, sports scores or anything time-sensitive, say that plainly in one short sentence and, when possible, answer with general knowledge instead. Never output placeholders like [insert value] — if you do not know a number, say you do not know.",
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: DEMO_MAX_TOKENS,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!chatRes.ok) return res.status(503).json({ error: 'inference_unavailable' });

    const completion = await chatRes.json();
    const content = completion?.choices?.[0]?.message?.content || '';
    if (!content.trim()) return res.status(503).json({ error: 'empty_completion' });

    return res.json({
      model: model.id,
      provider_count: Number(model.provider_count) || 1,
      content: content.trim(),
    });
  } catch (_) {
    return res.status(503).json({ error: 'demo_unavailable' });
  }
});

module.exports = router;
