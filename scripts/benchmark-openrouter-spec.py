import os
#!/usr/bin/env python3
"""
DCP Benchmark Run 7 — RTX 5090 + Qwen 3.5 27B AWQ
Generates: OpenRouter Integration Spec
Duration: 1 hour
"""

import json
import time
import urllib.request
from datetime import datetime, timezone

API_URL = "http://localhost:8083/v1/chat/completions"
API_KEY = os.environ.get("DC1_RENTER_KEY", "")  # SECURITY: hardcoded key removed; rotate old key
MODEL = "QuantTrio/Qwen3.5-27B-AWQ"
DURATION_MINUTES = 60
OUTPUT_FILE = "/root/dcp-openrouter-spec.md"

SYSTEM_PROMPT = """You are a senior API architect writing a technical integration specification for DCP (Decentralized Compute Platform) to be listed as a provider on OpenRouter.

DCP facts:
- OpenAI-compatible API at api.dcp.sa/v1/chat/completions
- Supports: chat completions, streaming (SSE), tool use, structured outputs
- Auth: Bearer token (dc1-renter-xxx)
- Models served: whatever providers have loaded (Qwen, Llama, Gemma, Mistral, etc.)
- Billing: SAR (Saudi Riyal), per-token pricing
- Rate limits: 60 req/min per renter key
- Provider routing: latency-gated selection from available providers
- PDPL compliant, Saudi data residency
- Multi-provider failover built in

OpenRouter integration requirements:
- Provider must expose OpenAI-compatible /v1/chat/completions
- Provider must report available models via /v1/models
- Provider must handle streaming and non-streaming
- Provider must return usage data (prompt_tokens, completion_tokens)
- Provider must handle error codes properly (400, 401, 429, 503)

Write detailed, production-ready technical documentation. Use proper markdown formatting with code examples."""

SECTIONS = [
    {
        "title": "Executive Summary",
        "prompt": "Write an executive summary for the DCP-OpenRouter integration spec. Cover: what DCP is, why it should be listed on OpenRouter, what makes it unique (Saudi data residency, PDPL compliance, SAR billing, Arabic-first models, decentralized GPU supply). 200 words.",
        "max_tokens": 400,
    },
    {
        "title": "API Compatibility Checklist",
        "prompt": "Write a detailed API compatibility checklist for DCP's integration with OpenRouter. For each item, mark it as [PASS], [PARTIAL], or [TODO]. Cover: POST /v1/chat/completions, GET /v1/models, streaming SSE format, stop sequences, temperature/top_p, max_tokens, tool_choice/tools, response_format (JSON mode), logprobs, n parameter, seed, user field, system messages, multi-turn conversations, error response format, rate limit headers.",
        "max_tokens": 600,
    },
    {
        "title": "Endpoint Specification — /v1/chat/completions",
        "prompt": "Write the complete endpoint specification for DCP's /v1/chat/completions. Include: HTTP method, URL, headers (Authorization, Content-Type), request body schema with all fields (model, messages, max_tokens, temperature, top_p, stream, tools, tool_choice, response_format, stop, seed, n, user), response body schema, streaming chunk format (data: {json}\\n\\n), error response format. Include curl examples for both streaming and non-streaming.",
        "max_tokens": 800,
    },
    {
        "title": "Endpoint Specification — /v1/models",
        "prompt": "Write the complete endpoint specification for DCP's /v1/models. Include: what models are currently available, how the model list is dynamic (depends on which providers are online), response format matching OpenAI's model list schema, how model IDs map to HuggingFace model names, permissions object.",
        "max_tokens": 500,
    },
    {
        "title": "Authentication & API Keys",
        "prompt": "Write the authentication specification. Cover: Bearer token format (dc1-renter-xxx), how to obtain API keys (register at dcp.sa/renter/register), key rotation via dashboard, scoped keys (inference, billing, admin), rate limits per key tier (free: 20 req/min, growth: 60 req/min, enterprise: custom).",
        "max_tokens": 500,
    },
    {
        "title": "Pricing Model — Token Rates",
        "prompt": "Write the pricing model specification for OpenRouter integration. Cover: per-token pricing (prompt tokens and completion tokens priced separately), pricing in USD (for OpenRouter compatibility) and SAR (native), how pricing varies by model size (7B, 14B, 27B, 70B), how to query current rates via API, the pricing response format that OpenRouter expects from providers, currency conversion handling.",
        "max_tokens": 500,
    },
    {
        "title": "Rate Limiting Specification",
        "prompt": "Write the rate limiting specification. Cover: rate limit headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After), per-key limits, per-IP fallback limits, how 429 responses are formatted, exponential backoff recommendations, how OpenRouter should handle DCP's rate limits, burst handling.",
        "max_tokens": 500,
    },
    {
        "title": "Provider Routing & Failover",
        "prompt": "Write the provider routing specification. Cover: how DCP selects which GPU provider serves a request (latency-gated selection), multi-provider failover (if primary fails, automatic retry on fallback), how this is transparent to OpenRouter (single endpoint, routing is internal), provider health monitoring, heartbeat-based availability, degraded vs online vs offline states.",
        "max_tokens": 500,
    },
    {
        "title": "Streaming Implementation",
        "prompt": "Write the detailed streaming implementation spec. Cover: SSE format (data: {json}\\n\\n), chunk format matching OpenAI spec (id, object, created, model, choices[{delta}]), final chunk with finish_reason and usage, [DONE] sentinel, how DCP proxies streaming from vLLM providers, error handling during streams, connection timeout behavior. Include a complete example of a streamed response sequence.",
        "max_tokens": 600,
    },
    {
        "title": "Tool Use / Function Calling",
        "prompt": "Write the tool use specification. Cover: tools array format (type: function, function: {name, description, parameters}), tool_choice options (auto, none, required, specific function), how tool calls appear in assistant messages, how tool results are sent back, parallel tool calls, which DCP models support tool use, limitations vs OpenAI's implementation.",
        "max_tokens": 600,
    },
    {
        "title": "Error Handling Specification",
        "prompt": "Write the complete error handling specification. Cover: all HTTP status codes (400 bad request, 401 invalid key, 403 forbidden, 404 model not found, 429 rate limited, 500 internal error, 503 no providers available), error response JSON format (error.message, error.type, error.code, error.status), how each error should be mapped to OpenRouter's error taxonomy, retryable vs non-retryable errors.",
        "max_tokens": 600,
    },
    {
        "title": "Model Catalog & Capabilities Matrix",
        "prompt": "Write the model catalog specification. List all models DCP can serve with their capabilities: Qwen 3.5 27B (general, coding, reasoning), Qwen 2.5 14B/7B (general), Llama 3.1 8B/70B (general), Gemma 4 26B (multimodal), Devstral 24B (coding), ALLaM 7B (Arabic), JAIS 13B (Arabic-English). For each: context length, supports tools, supports streaming, supports JSON mode, quantization options, minimum VRAM.",
        "max_tokens": 800,
    },
    {
        "title": "PDPL Compliance & Data Residency",
        "prompt": "Write the PDPL compliance section for OpenRouter's review. Cover: all inference data processed in Saudi Arabia, zero data retention after inference, encrypted transport (TLS 1.3 + WireGuard), provider isolation, audit logging for enterprise, SOC 2 Type II planned, how this differentiates DCP from other OpenRouter providers, data processing agreement availability.",
        "max_tokens": 500,
    },
    {
        "title": "Performance SLAs & Benchmarks",
        "prompt": "Write the performance section. Cover: time-to-first-token targets by model size, tokens-per-second throughput benchmarks on different GPUs (RTX 3090: 14-20 tok/s, RTX 4090: 20-30 tok/s, L40S: 15-25 tok/s), uptime target (99.5% for multi-provider routing), P50/P95 latency targets, how multi-provider routing improves reliability vs single-provider.",
        "max_tokens": 500,
    },
    {
        "title": "Integration Testing Checklist",
        "prompt": "Write a comprehensive integration testing checklist that OpenRouter's team would use to verify DCP works correctly. Cover: basic completion test, streaming test, tool use test, error handling test (invalid key, rate limit, no providers), model listing test, usage reporting accuracy test, concurrent request test, long context test, Unicode/Arabic text test, max_tokens boundary test. Include exact curl commands for each test.",
        "max_tokens": 800,
    },
    {
        "title": "Onboarding Steps for OpenRouter",
        "prompt": "Write the step-by-step onboarding guide for OpenRouter to add DCP as a provider. Cover: 1) API endpoint registration, 2) API key exchange, 3) Model catalog sync, 4) Pricing configuration, 5) Rate limit configuration, 6) Health check endpoint setup, 7) Monitoring dashboard setup, 8) Go-live checklist. Include the exact configuration JSON that OpenRouter would need.",
        "max_tokens": 600,
    },
    {
        "title": "Arabic Language Model Specialty",
        "prompt": "Write a section highlighting DCP's Arabic language model capabilities — this is a unique selling point for OpenRouter. Cover: ALLaM (by SDAIA, Saudi-trained), JAIS (by G42, bilingual Arabic-English), Arabic fine-tuned variants of Qwen and Llama, why Arabic NLP users should route through DCP (data residency, model quality, cultural context), example use cases (Arabic chatbots, document analysis, translation).",
        "max_tokens": 500,
    },
    {
        "title": "Appendix A — Complete curl Examples",
        "prompt": "Write a comprehensive appendix with curl examples for every DCP API operation. Include: basic chat completion, streaming chat, multi-turn conversation, tool use with weather function, JSON mode, Arabic language query, model listing, error scenarios (bad key, rate limit). Each example should be copy-pasteable with the base URL https://api.dcp.sa.",
        "max_tokens": 800,
    },
    {
        "title": "Appendix B — OpenRouter Provider Config JSON",
        "prompt": "Write the exact JSON configuration that OpenRouter would use to add DCP as a provider. Include: provider ID, display name, base URL, auth configuration, supported models array with pricing, rate limits, capabilities (streaming, tools, json_mode), health check endpoint, logo URL, description, tags (arabic, saudi, pdpl, decentralized).",
        "max_tokens": 600,
    },
    {
        "title": "Appendix C — Frequently Asked Questions",
        "prompt": "Write an FAQ section for OpenRouter's team evaluating DCP. Cover: How does decentralized GPU supply work? What happens if a provider goes offline mid-request? How is data privacy ensured? Can DCP handle burst traffic? What's the cold start time for a new model? How does DCP compare to other OpenRouter providers like DeepInfra or Together? What's the minimum order for enterprise?",
        "max_tokens": 600,
    },
]

def call_dcp(prompt, max_tokens=500):
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.7,
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
    )
    resp = urllib.request.urlopen(req, timeout=120)
    body = json.loads(resp.read())
    content = body["choices"][0]["message"]["content"]
    usage = body.get("usage", {})
    return content, usage


def main():
    start = time.time()
    end_time = start + (DURATION_MINUTES * 60)
    results = []
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_requests = 0
    errors = 0

    print(f"DCP Benchmark Run 7 — OpenRouter Integration Spec")
    print(f"GPU: RTX 5090 (32GB) | Model: {MODEL}")
    print(f"Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Target duration: {DURATION_MINUTES} minutes")
    print(f"Sections: {len(SECTIONS)}")
    print(f"Output: {OUTPUT_FILE}")
    print("=" * 60)

    section_index = 0
    pass_number = 1

    while time.time() < end_time:
        section = SECTIONS[section_index % len(SECTIONS)]
        elapsed = time.time() - start
        remaining = end_time - time.time()

        extra = ""
        if pass_number > 1:
            extra = f"\n\nThis is revision {pass_number}. Expand on the previous version with more detail, more examples, and deeper technical specifics."

        print(f"\n[{elapsed/60:.1f}m] Section {total_requests+1}: {section['title']}{' (v'+str(pass_number)+')' if pass_number > 1 else ''}")
        print(f"  Remaining: {remaining/60:.1f}m | Tokens: {total_prompt_tokens+total_completion_tokens:,}")

        try:
            content, usage = call_dcp(section["prompt"] + extra, section["max_tokens"])
            total_prompt_tokens += usage.get("prompt_tokens", 0)
            total_completion_tokens += usage.get("completion_tokens", 0)
            total_requests += 1

            results.append({
                "title": section["title"] + (f" (v{pass_number})" if pass_number > 1 else ""),
                "content": content,
                "tokens": usage.get("total_tokens", 0),
                "pass": pass_number,
            })

            preview = content[:80].replace("\n", " ")
            print(f"  OK ({usage.get('completion_tokens', 0)} tok): {preview}...")

        except Exception as e:
            errors += 1
            print(f"  ERROR: {e}")

        section_index += 1
        if section_index % len(SECTIONS) == 0:
            pass_number += 1
            print(f"\n{'='*60}")
            print(f"Pass {pass_number-1} complete. Starting pass {pass_number} with deeper detail.")
            print(f"{'='*60}")

        time.sleep(1)

    # Write output
    elapsed_total = time.time() - start
    print(f"\n{'='*60}")
    print(f"COMPLETE")
    print(f"Duration: {elapsed_total/60:.1f} minutes")
    print(f"Requests: {total_requests}")
    print(f"Errors: {errors}")
    print(f"Total tokens: {total_prompt_tokens + total_completion_tokens:,}")

    with open(OUTPUT_FILE, "w") as f:
        f.write(f"# DCP × OpenRouter Integration Specification\n\n")
        f.write(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n")
        f.write(f"Model: {MODEL} on RTX 5090 (32GB)\n")
        f.write(f"Sections: {total_requests} | Tokens: {total_prompt_tokens + total_completion_tokens:,} | Errors: {errors}\n")
        f.write(f"Duration: {elapsed_total/60:.1f} minutes\n\n")
        f.write("---\n\n")

        for r in results:
            f.write(f"## {r['title']}\n\n")
            f.write(f"{r['content']}\n\n")
            f.write("---\n\n")

    print(f"Done! Spec saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
