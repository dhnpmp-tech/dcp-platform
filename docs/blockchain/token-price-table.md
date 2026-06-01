# DCP Token Price Table

> Per-token and per-1K-token halala costs for each GPU tier and model class.
> All values derived from platform pricing model floor prices + SAR/USD = 3.75.

---

## 1. Per-Token Rates (vLLM Billing — `cost_rates` table)

These are the rates directly billed per generated token for live inference sessions.

| Model                                   | Halala / token | Halala / 1K tokens | SAR / 1K tokens | USD / 1K tokens |
|-----------------------------------------|---------------:|-------------------:|----------------:|----------------:|
| `meta-llama/Meta-Llama-3-8B-Instruct`   | 3              | 3,000              | 30.00           | $0.0080         |
| `mistralai/Mistral-7B-Instruct-v0.2`    | 2              | 2,000              | 20.00           | $0.0053         |
| `microsoft/Phi-3-mini-4k-instruct`      | 1              | 1,000              | 10.00           | $0.0027         |
| `google/gemma-2b-it`                    | 1              | 1,000              | 10.00           | $0.0027         |
| `TinyLlama/TinyLlama-1.1B-Chat-v1.0`   | 1              | 1,000              | 10.00           | $0.0027         |
| `__default__` (unlisted models)         | 1              | 1,000              | 10.00           | $0.0027         |

---

## 2. Derived Per-Token Cost from GPU Hourly Rate

When billed by time (not token count), the effective per-token cost depends on inference throughput.
Typical sustained throughput for a single-GPU serving session:

| GPU     | Typical tokens/sec (7-8B model) | Typical tokens/sec (70B+ model) |
|---------|--------------------------------:|--------------------------------:|
| RTX 4090 | 80–120 (avg 100)               | 8–15 (avg 10)                   |
| RTX 4080 | 50–80 (avg 65)                 | 4–8 (avg 6)                     |
| H100     | 1,500–3,000 (avg 2,000)        | 150–400 (avg 250)               |
| H200     | 2,000–4,000 (avg 3,000)        | 200–500 (avg 350)               |

### RTX 4090 — $0.267/hr

| Metric             | Calculation                          | Value              |
|--------------------|--------------------------------------|--------------------|
| Hourly rate        | $0.267 × 3.75 × 100                  | 100.1 halala/hr    |
| Per-minute rate    | 100.1 ÷ 60                           | 1.669 halala/min   |
| Per-second rate    | 1.669 ÷ 60                           | 0.0278 halala/sec  |
| At 100 tok/sec → halala/1K tokens | 1000 ÷ 100 × 0.0278 | **0.278 halala**   |
| At 100 tok/sec → SAR/1K tokens    |                     | **0.00278 SAR**    |
| At 100 tok/sec → USD/1K tokens    |                     | **$0.00074**       |

### RTX 4080 — $0.178/hr

| Metric             | Calculation                          | Value              |
|--------------------|--------------------------------------|--------------------|
| Hourly rate        | $0.178 × 3.75 × 100                  | 66.75 halala/hr    |
| Per-second rate    | 66.75 ÷ 3600                         | 0.01854 halala/sec |
| At 65 tok/sec → halala/1K tokens  | 1000 ÷ 65 × 0.01854 | **0.285 halala**  |
| At 65 tok/sec → SAR/1K tokens     |                     | **0.00285 SAR**   |
| At 65 tok/sec → USD/1K tokens     |                     | **$0.00076**      |

### H100 — $1.890/hr

| Metric             | Calculation                          | Value              |
|--------------------|--------------------------------------|--------------------|
| Hourly rate        | $1.890 × 3.75 × 100                  | 708.75 halala/hr   |
| Per-second rate    | 708.75 ÷ 3600                        | 0.1969 halala/sec  |
| At 2000 tok/sec → halala/1K tokens | 1000 ÷ 2000 × 0.1969 | **0.098 halala** |
| At 2000 tok/sec → SAR/1K tokens   |                     | **0.00098 SAR**   |
| At 2000 tok/sec → USD/1K tokens   |                     | **$0.00026**      |

### H200 — $2.450/hr

| Metric             | Calculation                          | Value              |
|--------------------|--------------------------------------|--------------------|
| Hourly rate        | $2.450 × 3.75 × 100                  | 918.75 halala/hr   |
| Per-second rate    | 918.75 ÷ 3600                        | 0.2552 halala/sec  |
| At 3000 tok/sec → halala/1K tokens | 1000 ÷ 3000 × 0.2552 | **0.085 halala** |
| At 3000 tok/sec → SAR/1K tokens   |                     | **0.00085 SAR**   |
| At 3000 tok/sec → USD/1K tokens   |                     | **$0.00023**      |

---

## 3. Competitive Comparison — Cost per 1M Tokens

The following compares DCP effective cost against hyperscalers for a 7B model workload.

| Provider        | USD / 1M tokens (input) | USD / 1M tokens (output) | Notes                    |
|-----------------|------------------------:|-------------------------:|--------------------------|
| OpenAI GPT-4o   | $2.50                   | $10.00                   | Proprietary, US data     |
| AWS Bedrock     | $0.60–$1.50             | $0.60–$2.00              | Hosted APIs              |
| RunPod (H100)   | ~$0.26                  | ~$0.26                   | Self-managed vLLM        |
| **DCP (H100)**  | **~$0.26**              | **~$0.26**               | Saudi rates, PDPL        |
| **DCP (RTX 4090)** | **~$0.74**           | **~$0.74**               | Internet cafe tier       |
| **DCP (H200)**  | **~$0.23**              | **~$0.23**               | Best-in-class throughput |

> DCP H200 is the lowest-cost inference option in this table for unconstrained throughput workloads.
> DCP RTX 4090 remains 40–70% below OpenAI API pricing even at consumer-GPU throughput.

---

## 4. Arabic Model Portfolio — Token Rates

For Arabic-specific models in the DCP catalog (from `infra/config/arabic-portfolio.json`):

| Model                | VRAM (GB) | Tokens/sec (est.) | Halala/1K tokens (time-based H100) |
|----------------------|:---------:|------------------:|-----------------------------------:|
| ALLaM 7B             | 14        | 400               | 0.49                               |
| JAIS 13B             | 26        | 200               | 0.98                               |
| Falcon H1 7B         | 14        | 400               | 0.49                               |
| Qwen 2.5 7B          | 14        | 400               | 0.49                               |
| Llama 3 8B           | 16        | 350               | 0.56                               |
| Mistral 7B           | 14        | 400               | 0.49                               |
| Nemotron Nano 4B     | 8         | 700               | 0.28                               |
| JAIS 30B             | 60        | 80                | 2.46                               |
| BGE-M3 (embeddings)  | 8         | N/A               | flat rate 0.05/1K chars            |

---

## 5. Summary Conversion Reference

```
1 USD  = 3.75 SAR  = 375 halala
1 SAR  = 100 halala
1 halala = 0.01 SAR = $0.00267

RTX 4090 DCP floor:
  $0.267/hr  →  1.00 SAR/hr  →  100 halala/hr  →  1.67 halala/min  →  0.0278 halala/sec

H100 DCP floor:
  $1.890/hr  →  7.09 SAR/hr  →  709 halala/hr  →  11.8 halala/min  →  0.197 halala/sec

H200 DCP floor:
  $2.450/hr  →  9.19 SAR/hr  →  919 halala/hr  →  15.3 halala/min  →  0.255 halala/sec
```

---

*Source: `backend/src/config/pricing.js`, `backend/src/db.js` (cost_rates), `backend/src/config/pricing.js`*
*Last updated: 2026-03-24 — DCP-811*
