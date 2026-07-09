# Template Catalog Contract API

Canonical renter-facing template catalog contract sourced from `docker-templates/`.

## Endpoint

`GET /api/templates/catalog`

## Auth

No authentication required.

## Contract

Response includes only stable fields needed by renter marketplace deploy rails:

```json
{
  "contract": "dcp.template_catalog.v1",
  "version": "2026-04-02",
  "templates": [
    {
      "id": "llama3-8b",
      "model_name": "meta-llama/Meta-Llama-3-8B-Instruct",
      "min_vram_gb": 16,
      "tier_hint": {
        "tier": "cached",
        "notes": "Cached tier — HuggingFace weights pulled on first run and kept hot on provider disk."
      },
      "deploy_defaults": {
        "duration_minutes": 60,
        "pricing_class": "standard",
        "job_type": "llm-inference",
        "params": {
          "model": "meta-llama/Meta-Llama-3-8B-Instruct",
          "max_tokens": 512
        }
      },
      "workflow_contract": {
        "version": "dcp.template_workflow.v1",
        "mode": "pod_local_openai_compatible",
        "workspace_mount": "/workspace",
        "endpoint": {
          "scope": "pod_local",
          "openai_base_url": "http://127.0.0.1:8000/v1",
          "public_route_enabled": false,
          "adapter_load_proof_required": true
        },
        "claim_guards": {
          "catalog_launches_pod": false,
          "catalog_mutates_balance": false,
          "managed_training_enabled": false,
          "public_endpoint_route_enabled": false,
          "adapter_billing_enabled": false,
          "exposes_provider_or_vendor": false,
          "requires_gpu_host_proof": true
        },
        "next_proof": "DCP_ADAPTER_VLLM_LIVE_PROOF_ALLOW=1 npm run proof:adapter-vllm-live-load"
      }
    }
  ],
  "count": 1
}
```

Ordering is deterministic: `sort_order` ascending, then `id` ascending.

## Validation Rules

Every template JSON file must parse and include:

- `id` (non-empty string)
- `name` (non-empty string)
- `job_type` (non-empty string)
- `min_vram_gb` (positive number)
- `params` (object)
- model derivation source (`params.model` or `env_vars.MODEL_ID.default`)

LoRA, QLoRA, and vLLM templates also expose `workflow_contract` metadata. The
contract is descriptive and read-only: the catalog cannot launch pods, mutate
balances, enable managed training, expose public endpoint routing, bill
adapters, or expose provider/vendor routing. Those templates must keep
`requires_gpu_host_proof: true` until the matching opt-in live proof succeeds.

Required workflow-contract modes:

- `lora-finetune`: `lora_dry_run`
- `qlora-finetune`: `qlora_dry_run`
- `vllm-serve`: `pod_local_openai_compatible`

If any file fails validation, the endpoint fails closed with `500` and explicit per-file errors.

## Error Shape

```json
{
  "error": "Template catalog contract validation failed",
  "contract": "dcp.template_catalog.v1",
  "details": [
    "broken-template.json: missing or invalid numeric field \"min_vram_gb\""
  ]
}
```
