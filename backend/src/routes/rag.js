/**
 * Arabic RAG-as-a-Service Pipeline API
 *
 * Provides three endpoints:
 *   POST /api/rag/ingest   — embed documents into a named collection
 *   POST /api/rag/query    — embed query → rerank candidates → generate answer
 *   GET  /api/rag/status   — pipeline health and available model inventory
 *
 * Production path: requests are forwarded to the live vLLM / TEI containers on
 * active providers. Until providers are online the route returns mock responses
 * that match the production schema so downstream services can be built and tested.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('../db');
const { publicEndpointLimiter, authenticatedEndpointLimiter } = require('../middleware/rateLimiter');
const { looksLikeProviderKey } = require('../middleware/auth');

const router = express.Router();

// ── Constants ─────────────────────────────────────────────────────────────
const ARABIC_PORTFOLIO_FILE = process.env.DCP_ARABIC_PORTFOLIO_FILE
  || path.join(__dirname, '../../../infra/config/arabic-portfolio.json');

const RAG_GENERATION_MODELS = ['allam-7b-instruct', 'jais-13b-chat'];
const RAG_EMBEDDING_MODEL   = 'bge-m3-embedding';
const RAG_RERANKER_MODEL    = 'reranker-v2-m3';

// Approximate token costs (halala per 1 000 tokens) used for billing estimation
const COST_PER_1K_EMBED_TOKENS_HALALA  = 1;   // very cheap — embedding only
const COST_PER_1K_RERANK_TOKENS_HALALA = 1;
const COST_PER_1K_GEN_TOKENS_HALALA    = 5;   // generation model

// In-memory document store — replaced by SQLite persistence below when
// the rag_collections / rag_documents schema has been migrated.
const _memStore = new Map(); // collectionId → { id, docs: [{id, text, embedding}] }

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizeString(value, { maxLen = 1000 } = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

function toPositiveInt(value, { max = 20, defaultVal = 5 } = {}) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

/** Renter auth — mirrors vllm.js pattern (scoped key or legacy key). */
function getRenterKey(req) {
  const h = req.headers['x-renter-key'];
  const q = req.query.key;
  const raw = typeof h === 'string' ? h.trim() : typeof q === 'string' ? q.trim() : '';
  return raw || null;
}

function requireRenter(req, res, next) {
  const key = getRenterKey(req);
  if (!key) return res.status(401).json({ error: 'Renter API key required (x-renter-key header or ?key=)' });

  // H1 — reject provider-prefixed keys on a renter-only path.
  if (looksLikeProviderKey(key)) {
    return res.status(401).json({ error: 'Wrong key type: provider key cannot be used on renter endpoint', code: 'wrong_key_type' });
  }

  const now = new Date().toISOString();

  // Check scoped sub-keys first
  const scopedKey = db.get(
    `SELECT k.id, k.renter_id, k.scopes, k.expires_at, k.revoked_at,
            r.id AS r_id, r.api_key, r.balance_halala, r.status
       FROM renter_api_keys k
       JOIN renters r ON r.id = k.renter_id
      WHERE k.key = ? AND r.status = 'active' AND k.revoked_at IS NULL`,
    key
  );

  if (scopedKey) {
    if (scopedKey.expires_at && scopedKey.expires_at < now) {
      return res.status(403).json({ error: 'API key has expired' });
    }
    let scopes = [];
    try { scopes = JSON.parse(scopedKey.scopes || '[]'); } catch (_) {}
    if (!scopes.includes('inference') && !scopes.includes('admin')) {
      return res.status(403).json({ error: 'API key does not have inference scope' });
    }
    try {
      db.prepare('UPDATE renter_api_keys SET last_used_at = ? WHERE id = ?').run(now, scopedKey.id);
    } catch (_) {}
    req.renter = { id: scopedKey.r_id, api_key: scopedKey.api_key, balance_halala: scopedKey.balance_halala, status: scopedKey.status };
    req.renterKey = key;
    req.renterKeyScopes = scopes;
    return next();
  }

  // Fall back to legacy master key
  const renter = db.get(
    `SELECT id, api_key, balance_halala, status FROM renters WHERE api_key = ? AND status = 'active'`,
    key
  );
  if (!renter) return res.status(401).json({ error: 'Invalid or inactive renter API key' });

  req.renter = renter;
  req.renterKey = key;
  req.renterKeyScopes = ['inference'];
  return next();
}

/**
 * Load arabic portfolio config (cached in module scope after first read).
 */
let _portfolioCache = null;
function getPortfolio() {
  if (_portfolioCache) return _portfolioCache;
  try {
    const fs = require('fs');
    _portfolioCache = JSON.parse(fs.readFileSync(ARABIC_PORTFOLIO_FILE, 'utf8'));
  } catch (_) {
    _portfolioCache = { version: 'unknown', tiers: {} };
  }
  return _portfolioCache;
}

/**
 * Find the first active provider that has a given model container running.
 * Returns provider row or null when no suitable provider is online.
 */
function findProviderForModel(modelId) {
  try {
    return db.get(
      `SELECT p.id, p.endpoint_url, p.gpu_model
         FROM providers p
        WHERE p.status = 'active'
          AND EXISTS (
            SELECT 1 FROM provider_containers c
             WHERE c.provider_id = p.id
               AND c.model_id    = ?
               AND c.status      = 'running'
          )
        LIMIT 1`,
      modelId
    );
  } catch (_) {
    // provider_containers table may not exist yet — return null gracefully
    return null;
  }
}

/**
 * Cosine similarity between two equal-length float arrays.
 * Used for in-memory MVP retrieval when TEI provider is unavailable.
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Stub embedding — returns a deterministic pseudo-embedding vector from text hash.
 * Used when no live BGE-M3 provider is available.
 */
function stubEmbed(text, dims = 128) {
  const hash = crypto.createHash('sha256').update(text).digest();
  const vec = [];
  for (let i = 0; i < dims; i++) {
    // Map byte to [-1, 1]
    vec.push((hash[i % 32] / 127.5) - 1.0);
  }
  // L2-normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => v / norm);
}

/**
 * Call live TEI embedding endpoint on provider, or fall back to stub.
 * Returns { embedding: float[], source: 'live'|'stub', input_tokens: number }
 */
async function embed(text, providerEndpoint) {
  if (providerEndpoint) {
    try {
      const fetch = require('node-fetch');
      const resp = await fetch(`${providerEndpoint}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: text }),
        timeout: 10_000,
      });
      if (resp.ok) {
        const data = await resp.json();
        const embedding = Array.isArray(data) ? data[0] : data.embedding;
        return { embedding, source: 'live', input_tokens: Math.ceil(text.split(/\s+/).length * 1.3) };
      }
    } catch (_) { /* fall through to stub */ }
  }
  return { embedding: stubEmbed(text), source: 'stub', input_tokens: Math.ceil(text.split(/\s+/).length * 1.3) };
}

/**
 * Call live reranker endpoint on provider, or fall back to score-by-cosine-sim.
 * Returns scored list: [{ text, score }]
 */
async function rerank(query, candidates, providerEndpoint) {
  if (providerEndpoint) {
    try {
      const fetch = require('node-fetch');
      const resp = await fetch(`${providerEndpoint}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, texts: candidates.map(c => c.text) }),
        timeout: 10_000,
      });
      if (resp.ok) {
        const scores = await resp.json(); // [{index, score}]
        return scores
          .map(s => ({ text: candidates[s.index].text, score: s.score }))
          .sort((a, b) => b.score - a.score);
      }
    } catch (_) { /* fall through */ }
  }
  // Fallback: rank by cosine similarity with stub embeddings
  const queryVec = stubEmbed(query);
  return candidates
    .map(c => ({ text: c.text, score: cosineSimilarity(queryVec, stubEmbed(c.text)) }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Call live vLLM generation endpoint, or return a structured stub answer.
 * Returns { answer, output_tokens }
 */
async function generate(systemPrompt, userPrompt, modelId, providerEndpoint) {
  if (providerEndpoint) {
    try {
      const fetch = require('node-fetch');
      const resp = await fetch(`${providerEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens: 512,
          temperature: 0.2,
        }),
        timeout: 30_000,
      });
      if (resp.ok) {
        const data = await resp.json();
        const choice = data.choices?.[0];
        return {
          answer: choice?.message?.content || '',
          output_tokens: data.usage?.completion_tokens || 0,
        };
      }
    } catch (_) { /* fall through */ }
  }
  // Stub: acknowledge the query with a canned bilingual response
  return {
    answer: `[STUB — ${modelId} not yet live] Based on the provided context, here is a placeholder answer for: "${userPrompt.slice(0, 80)}"`,
    output_tokens: 64,
  };
}

// ── POST /api/rag/ingest ──────────────────────────────────────────────────

router.post('/ingest', authenticatedEndpointLimiter, requireRenter, async (req, res) => {
  const { documents, collection_id } = req.body || {};

  if (!Array.isArray(documents) || documents.length === 0) {
    return res.status(400).json({ error: 'documents must be a non-empty array of strings' });
  }
  if (documents.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 documents per ingest request' });
  }
  for (const d of documents) {
    if (typeof d !== 'string' || !d.trim()) {
      return res.status(400).json({ error: 'Each document must be a non-empty string' });
    }
  }

  const collectionId = normalizeString(collection_id) || crypto.randomUUID();

  // Find live BGE-M3 provider for embedding (optional — stub used as fallback)
  const embProvider = findProviderForModel(RAG_EMBEDDING_MODEL);
  const embEndpoint = embProvider?.endpoint_url || null;

  let totalEmbedTokens = 0;
  const embeddedDocs = [];

  for (const text of documents) {
    const { embedding, input_tokens } = await embed(text.trim(), embEndpoint);
    totalEmbedTokens += input_tokens;
    embeddedDocs.push({ id: crypto.randomUUID(), text: text.trim(), embedding });
  }

  // Persist to in-memory store (SQLite persistence can be added via migration)
  const existing = _memStore.get(collectionId) || { id: collectionId, docs: [] };
  existing.docs.push(...embeddedDocs);
  _memStore.set(collectionId, existing);

  // Billing: deduct embedding cost
  const costHalala = Math.ceil((totalEmbedTokens / 1000) * COST_PER_1K_EMBED_TOKENS_HALALA);
  if (costHalala > 0) {
    try {
      db.prepare('UPDATE renters SET balance_halala = balance_halala - ? WHERE id = ?')
        .run(costHalala, req.renter.id);
    } catch (_) { /* billing failure non-fatal for MVP */ }
  }

  return res.json({
    collection_id: collectionId,
    documents_indexed: embeddedDocs.length,
    total_documents_in_collection: existing.docs.length,
    token_usage: {
      embedding_tokens: totalEmbedTokens,
      cost_halala: costHalala,
    },
    pipeline: {
      embedding_model: RAG_EMBEDDING_MODEL,
      embedding_source: embEndpoint ? 'live' : 'stub',
    },
  });
});

// ── POST /api/rag/query ───────────────────────────────────────────────────

router.post('/query', authenticatedEndpointLimiter, requireRenter, async (req, res) => {
  const {
    query,
    documents,   // inline docs (alternative to collection_id)
    collection_id,
    model,
    top_k,
  } = req.body || {};

  const queryText = normalizeString(query, { maxLen: 4000 });
  if (!queryText) {
    return res.status(400).json({ error: 'query is required and must be a non-empty string' });
  }

  // Resolve generation model
  const modelId = RAG_GENERATION_MODELS.includes(model) ? model : RAG_GENERATION_MODELS[0];
  const topK = toPositiveInt(top_k, { max: 20, defaultVal: 5 });

  // Resolve document corpus
  let corpus = [];
  if (Array.isArray(documents) && documents.length > 0) {
    corpus = documents
      .filter(d => typeof d === 'string' && d.trim())
      .slice(0, 200)
      .map(d => ({ text: d.trim() }));
  } else if (collection_id) {
    const col = _memStore.get(collection_id);
    if (!col || col.docs.length === 0) {
      return res.status(404).json({ error: `Collection '${collection_id}' not found or empty` });
    }
    corpus = col.docs.map(d => ({ text: d.text }));
  } else {
    return res.status(400).json({ error: 'Provide either documents array or a collection_id' });
  }

  // Step 1 — Embed query
  const embProvider = findProviderForModel(RAG_EMBEDDING_MODEL);
  const embEndpoint = embProvider?.endpoint_url || null;
  const { embedding: queryEmbedding, source: embedSource, input_tokens: embedTokens } =
    await embed(queryText, embEndpoint);

  // Step 2 — Retrieve top candidates by cosine similarity
  const scored = corpus.map(doc => {
    const docVec = doc.embedding || stubEmbed(doc.text);
    return { text: doc.text, score: cosineSimilarity(queryEmbedding, docVec) };
  });
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, Math.min(topK * 3, 30)); // wider net for reranker

  // Step 3 — Rerank
  const rerankProvider = findProviderForModel(RAG_RERANKER_MODEL);
  const rerankEndpoint = rerankProvider?.endpoint_url || null;
  const reranked = await rerank(queryText, candidates, rerankEndpoint);
  const topChunks = reranked.slice(0, topK);

  const rerankTokens = candidates.reduce((s, c) => s + Math.ceil(c.text.split(/\s+/).length * 1.3), 0);

  // Step 4 — Generate answer
  const genProvider = findProviderForModel(modelId);
  const genEndpoint = genProvider?.endpoint_url || null;
  const context = topChunks.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n');
  const systemPrompt =
    'You are a helpful Arabic and English AI assistant. Answer the question strictly based on the provided context. ' +
    'If the answer is not in the context, say so. Be concise and accurate.';
  const userPrompt = `Context:\n${context}\n\nQuestion: ${queryText}`;

  const { answer, output_tokens: genTokens } = await generate(systemPrompt, userPrompt, modelId, genEndpoint);

  // Billing
  const totalTokens = embedTokens + rerankTokens + genTokens;
  const costHalala = Math.ceil(
    (embedTokens / 1000)  * COST_PER_1K_EMBED_TOKENS_HALALA  +
    (rerankTokens / 1000) * COST_PER_1K_RERANK_TOKENS_HALALA +
    (genTokens / 1000)    * COST_PER_1K_GEN_TOKENS_HALALA
  );
  if (costHalala > 0) {
    try {
      db.prepare('UPDATE renters SET balance_halala = balance_halala - ? WHERE id = ?')
        .run(costHalala, req.renter.id);
    } catch (_) {}
  }

  return res.json({
    answer,
    source_chunks: topChunks.map((c, i) => ({
      rank: i + 1,
      text: c.text,
      relevance_score: parseFloat(c.score.toFixed(4)),
    })),
    model: modelId,
    token_usage: {
      embedding_tokens:  embedTokens,
      reranking_tokens:  rerankTokens,
      generation_tokens: genTokens,
      total_tokens:      totalTokens,
      cost_halala:       costHalala,
    },
    pipeline: {
      embedding_model:  RAG_EMBEDDING_MODEL,
      reranker_model:   RAG_RERANKER_MODEL,
      generation_model: modelId,
      embedding_source: embedSource,
      reranker_source:  rerankEndpoint ? 'live' : 'stub',
      generation_source: genEndpoint  ? 'live' : 'stub',
    },
  });
});

// ── GET /api/rag/status ───────────────────────────────────────────────────

router.get('/status', publicEndpointLimiter, (req, res) => {
  const portfolio = getPortfolio();
  const allModels = Object.values(portfolio.tiers || {}).flat();

  // Check which RAG-relevant models have live providers
  const ragModels = [RAG_EMBEDDING_MODEL, RAG_RERANKER_MODEL, ...RAG_GENERATION_MODELS];
  const modelStatus = ragModels.map(modelId => {
    const provider = findProviderForModel(modelId);
    const meta = allModels.find(m => m.id === modelId);
    return {
      model_id:    modelId,
      role:        modelId === RAG_EMBEDDING_MODEL  ? 'embedding'   :
                   modelId === RAG_RERANKER_MODEL   ? 'reranking'   : 'generation',
      status:      provider ? 'live' : 'stub',
      provider_id: provider?.id || null,
      min_vram_gb: meta?.min_vram_gb || null,
    };
  });

  const allLive       = modelStatus.every(m => m.status === 'live');
  const anyLive       = modelStatus.some(m => m.status === 'live');
  const pipelineReady = modelStatus.every(m => m.status === 'live');

  return res.json({
    pipeline_ready:    pipelineReady,
    mode:              allLive ? 'live' : anyLive ? 'partial' : 'stub',
    arabic_rag_available: true,  // always true — stub mode provides correct schema
    generation_models: RAG_GENERATION_MODELS,
    embedding_model:   RAG_EMBEDDING_MODEL,
    reranker_model:    RAG_RERANKER_MODEL,
    models:            modelStatus,
    portfolio_version: portfolio.version || 'unknown',
    collections_in_memory: _memStore.size,
  });
});

module.exports = router;
