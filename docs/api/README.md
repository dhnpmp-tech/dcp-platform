# DCP API Documentation

Welcome to the DCP (Decentralized Compute Platform) API documentation. This guide will help you integrate with the DCP marketplace to either provide GPU compute resources or submit compute jobs.

## Quick Links

- **[OpenRouter 60-Second First Request](./openrouter-60s-quickstart.md)** — Signup to first `/v1/chat/completions` call with cURL, Node, and Python
- **[Provider Quickstart](./quickstart-provider.md)** — Register your GPUs and start earning in 5 minutes
- **[Renter Quickstart](./quickstart-renter.md)** — Submit your first compute job in 5 minutes
- **[Provider Activation State API](./provider-activation-state.md)** — Canonical onboarding status + blocker codes
- **[Template Catalog Contract API](./template-catalog-contract.md)** — Canonical renter template metadata contract from `docker-templates/`
- **[OpenAPI Specification](../openapi.yaml)** — Complete API schema (Swagger/OpenAPI format)
- **[SDK Examples](./sdk-examples.md)** — Code examples in JavaScript, Python, and cURL

## What is DCP?

DCP is a GPU compute marketplace where:

- **Providers** register their NVIDIA GPUs and earn SAR (Saudi Riyal) when compute jobs run
- **Renters** submit compute jobs (LLM inference, image generation, training, etc.) that execute on provider hardware
- **DCP** takes a 25% platform fee; providers earn 75% of job revenue

## Platform Basics

### Base URL
```
https://api.dcp.sa
```

### Authentication

Three auth schemes for different user types:

| Role | Authentication | Example |
|------|---|---|
| **Renter** | API key in header or query param | `x-renter-key: dcp-renter-xxx` |
| **Provider** | API key in header or query param | `x-provider-key: dcp-xxx` |
| **Admin** | Admin token in header | `x-admin-token: <token>` |

### Currency

All amounts are in **halala** (1 SAR = 100 halala) unless the field name ends in `_sar`.

```json
{
  "amount_halala": 1000,    // 10 SAR
  "amount_sar": 10.0        // Same amount in SAR
}
```

### Rate Limits

Rate limits protect the platform. Exceeded limits return `429 Too Many Requests`:

| Endpoint | Limit |
|---|---|
| Provider register | 5 / IP / 10 minutes |
| Provider heartbeat | 4 / IP / minute |
| Renter register | 5 / IP / 10 minutes |
| Job submit | 10 / API key / minute |
| Provider marketplace | 60 / API key / minute |
| Renter top-up | 10 / IP / minute |

## Supported Job Types

DCP supports the following compute job types:

| Job Type | Description | Use Case |
|---|---|---|
| `llm_inference` | Text generation with large language models | Chatbots, content generation, Q&A |
| `image_generation` | Image synthesis from text prompts | Creative tools, design automation |
| `vllm_serve` | OpenAI-compatible inference endpoint | Drop-in replacement for OpenAI API |
| `custom_container` | Run custom Docker containers | Specialized workloads |
| `training` | Fine-tune or train custom models | Model customization |
| `rendering` | 3D rendering and video synthesis | VFX, animation |
| `benchmark` | Benchmark GPU performance | Hardware evaluation |

## Supported GPU Models

DCP supports NVIDIA GPUs including:

- RTX 4090, RTX 4080, RTX 4070 Ti
- A100, A40, L40
- H100 (HOPPER architecture)
- T4, V100 (legacy support)

Filters: Specify `min_vram_gb` in job submissions to ensure adequate GPU memory.

## Status Codes

All responses use standard HTTP status codes:

| Code | Meaning |
|---|---|
| `200` | Success (GET, POST update) |
| `201` | Resource created (POST create) |
| `400` | Bad request (validation error) |
| `401` | Unauthorized (missing/invalid auth) |
| `403` | Forbidden (no permission) |
| `404` | Not found |
| `409` | Conflict (resource already exists) |
| `429` | Rate limit exceeded |
| `500` | Server error |

## Error Response Format

All errors follow this format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "details": {
    "field": "Additional context if applicable"
  }
}
```

## Next Steps

1. **New to DCP?**
   - Run [OpenRouter 60-Second First Request](./openrouter-60s-quickstart.md) for `/v1` onboarding
   - Read [Provider Quickstart](./quickstart-provider.md) to set up your GPU
   - Or read [Renter Quickstart](./quickstart-renter.md) to submit a job

2. **Building an integration?**
   - Reference the [OpenAPI Specification](../openapi.yaml)
   - Check [SDK Examples](./sdk-examples.md) for your language

3. **Need help?**
   - Email support@dcp.sa
   - Check the [DCP Documentation](https://dcp.sa/docs)

---

**Last Updated:** April 2, 2026
**API Version:** 1.0
**Status:** Production
