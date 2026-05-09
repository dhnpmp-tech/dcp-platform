# DCP Provider Model Catalog

**Audience:** GPU providers running the DCP daemon, plus the Nexus and DCP
Agent assistants that guide them through onboarding.

**Why this exists:** Real providers (Tareq, Fadi) hit "pull model manifest:
file does not exist" errors during onboarding because they tried Ollama tags
that don't exist (e.g. `qwen3:35b`). This page is the single source of truth
for **valid** model identifiers across DCP's supported engines.

---

## TL;DR — what to install

For most consumer GPUs (16–32 GB VRAM), pull these from Ollama on Day 1:

```bash
ollama pull qwen3:8b           # 4.9 GB — good general baseline
ollama pull qwen2.5-coder:7b   # 4.7 GB — coding-tuned, fast
ollama pull gemma3:4b          # 3.3 GB — small, very fast
```

After they finish, register them with the DCP daemon. The daemon will
advertise them in the marketplace heartbeat.

---

## Valid Ollama tags (verified 2026-05-09)

> ⚠️ Ollama's `registry.ollama.ai/v2/library/<model>/tags` endpoint
> currently returns 404 from the public web — that's a known Ollama API
> change, *not* a DCP problem. Use `ollama list` after a pull, or browse
> [ollama.com/library](https://ollama.com/library) for the canonical list.

### Qwen 3 family

| Tag | Size on disk | Min VRAM | Notes |
|---|---|---|---|
| `qwen3:0.6b` | 0.5 GB | 2 GB | Smallest — laptop/edge |
| `qwen3:1.7b` | 1.4 GB | 4 GB | Tiny, fast |
| `qwen3:4b` | 2.6 GB | 6 GB | Good balance |
| `qwen3:8b` | 4.9 GB | 8 GB | **Recommended default** |
| `qwen3:14b` | 9.3 GB | 12 GB | Better reasoning |
| `qwen3:32b` | 20 GB | 24 GB | High-end consumer |
| `qwen3:30b-a3b` | 19 GB | 24 GB | MoE variant — 3B active |

❌ **`qwen3:35b` does NOT exist.** If a user asks, point them to `qwen3:32b`.

### Qwen 2.5 family (coder/instruct)

| Tag | Size | Min VRAM | Use case |
|---|---|---|---|
| `qwen2.5-coder:7b` | 4.7 GB | 8 GB | Code completion |
| `qwen2.5-coder:14b` | 9.0 GB | 12 GB | Better code |
| `qwen2.5-coder:32b` | 19.8 GB | 24 GB | AAA code workloads |
| `qwen2.5:7b` | 4.7 GB | 8 GB | General instruct |
| `qwen2.5:14b` | 9.0 GB | 12 GB | General instruct |

### Gemma family

| Tag | Size | Min VRAM |
|---|---|---|
| `gemma3:1b` | 0.8 GB | 2 GB |
| `gemma3:4b` | 3.3 GB | 6 GB |
| `gemma3:12b` | 8.1 GB | 12 GB |
| `gemma3:27b` | 17 GB | 20 GB |

> Gemma 4 is **not** supported via Ollama (a known performance bug, see
> `feedback_gemma4_llamacpp.md`). Use llama.cpp directly if you need Gemma 4.

### Llama 3 family

| Tag | Size | Min VRAM |
|---|---|---|
| `llama3:8b` | 4.7 GB | 8 GB |
| `llama3.1:8b` | 4.9 GB | 8 GB |
| `llama3.1:70b` | 40 GB | 48 GB |
| `llama3.2:1b` | 1.3 GB | 2 GB |
| `llama3.2:3b` | 2.0 GB | 4 GB |

### Mistral family

| Tag | Size | Min VRAM |
|---|---|---|
| `mistral:7b` | 4.1 GB | 8 GB |
| `mistral-nemo:12b` | 7.1 GB | 12 GB |

### Embedding models (always small — pull at least one)

| Tag | Size | Notes |
|---|---|---|
| `bge-m3:latest` | 1.2 GB | Multilingual, recommended |
| `nomic-embed-text:latest` | 0.3 GB | English-only, very fast |

---

## How to find a valid tag

When a user (or an agent) is unsure whether a tag exists:

```bash
# 1. Browse the catalog in your browser:
open https://ollama.com/library

# 2. Or pull and let Ollama validate:
ollama pull qwen3:8b
# If the tag exists, you'll see download progress.
# If not, you'll see: "Error: pull model manifest: file does not exist"

# 3. Check what's already on disk:
ollama list

# 4. After pulling, verify the model loads:
ollama run qwen3:8b "hello"
```

There is no `ollama search` subcommand in the current CLI — that's a common
misconception. The catalog browser at ollama.com/library is the canonical
discovery tool.

---

## DCP-engine support matrix

| Engine | Maps Ollama tag? | Notes |
|---|---|---|
| `ollama` | ✅ direct | Default for consumer GPUs ≤ 24 GB |
| `vllm` | ❌ uses HF repo IDs | See `model-cards.mdx` for vLLM model IDs |
| `llama.cpp` (direct) | ❌ uses local GGUF paths | Required for Gemma 4 (`feedback_gemma4_llamacpp.md`) |

If you see Ollama tags in DCP code, they are normalized through
`backend/src/lib/model-aliases.js` — that file is the canonical alias map.

---

## Common mistakes (from real onboarding sessions)

| What the user did | What they should do |
|---|---|
| `ollama pull qwen3:35b` (doesn't exist) | `ollama pull qwen3:32b` |
| `ollama pull qwen-3-8b` (wrong format) | `ollama pull qwen3:8b` |
| `ollama search ...` (not a real command) | Browse [ollama.com/library](https://ollama.com/library) |
| `curl https://registry.ollama.ai/v2/library/qwen3/tags` (returns 404) | Same — use ollama.com/library instead |
| `curl https://api.dcp.sa/api/providers/heartbeat` returning 404 | That endpoint is **POST-only** — manual GET will always 404. See the docblock at `backend/src/routes/providers.js` for the correct probe command. |

---

## Updating this doc

When a new Ollama tag is added, update both:
1. This file — for human readers and agent context.
2. `backend/src/lib/model-aliases.js` — for the runtime alias resolver.

Last verified: **2026-05-09**.
