import os
#!/usr/bin/env python3
"""
DCP Gate 0 — 1-Hour Sustained Inference Load Test + Content Generation
Runs through api.dcp.sa → RunPod L40S → vLLM → Llama 3.1 8B

Produces: DCP Content Pack (bilingual EN/AR website copy, docs, FAQ, guides)
"""

import json
import time
import urllib.request
import sys
from datetime import datetime, timezone

API_URL = "https://api.dcp.sa/v1/chat/completions"
API_KEY = os.environ.get("DC1_RENTER_KEY", "")  # SECURITY: hardcoded key removed; rotate old key
MODEL = "hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4"
DURATION_MINUTES = 60
OUTPUT_FILE = "/root/dcp-content-pack.md"

# Content generation tasks — each produces useful DCP content
TASKS = [
    # === WEBSITE COPY ===
    {
        "section": "Website Copy",
        "title": "Homepage Hero — English",
        "prompt": "Write a compelling homepage hero section for DCP (Decentralized Compute Platform), a GPU compute marketplace based in Saudi Arabia. DCP lets AI developers access GPU compute through an OpenAI-compatible API, with PDPL-compliant Saudi data residency and SAR billing. Keep it under 100 words. Professional, modern tone. No emojis.",
        "max_tokens": 200,
    },
    {
        "section": "Website Copy",
        "title": "Homepage Hero — Arabic",
        "prompt": "Write the homepage hero section for DCP (منصة الحوسبة اللامركزية) in formal Modern Standard Arabic. DCP is a GPU compute marketplace in Saudi Arabia offering AI inference through OpenAI-compatible APIs, PDPL compliance, and SAR billing. Under 100 words. Professional tone.",
        "max_tokens": 250,
    },
    {
        "section": "Website Copy",
        "title": "For AI Developers — Value Proposition",
        "prompt": "Write a 150-word value proposition section for AI developers who want to use DCP. Emphasize: OpenAI-compatible API (drop-in replacement), Arabic-first model catalog (ALLaM, JAIS, Falcon), pay-per-token pricing in SAR, PDPL-compliant data residency in Saudi Arabia, and sub-200ms latency from Riyadh. No emojis.",
        "max_tokens": 300,
    },
    {
        "section": "Website Copy",
        "title": "For AI Developers — Arabic",
        "prompt": "Translate and adapt this for Arabic-speaking AI developers: DCP offers an OpenAI-compatible API for AI inference. Features: Arabic-first models (ALLaM, JAIS, Falcon), SAR billing, PDPL compliance, Saudi data residency. Write in formal Modern Standard Arabic, 150 words. Professional tone for developers.",
        "max_tokens": 350,
    },
    {
        "section": "Website Copy",
        "title": "For GPU Providers — Value Proposition",
        "prompt": "Write a 150-word section targeting GPU owners who want to earn money by renting their GPUs on DCP. Emphasize: passive income from idle GPUs, automatic job routing, WireGuard VPN for security, simple one-command setup (curl | bash), earnings dashboard, and the Saudi energy advantage (USD 0.048/kWh electricity). No emojis.",
        "max_tokens": 300,
    },
    {
        "section": "Website Copy",
        "title": "For GPU Providers — Arabic",
        "prompt": "Write a section in Modern Standard Arabic for GPU owners who want to earn money renting their GPUs on DCP. Mention: passive income, automatic job routing, simple setup, earnings dashboard, and Saudi Arabia's cheap electricity advantage. 150 words, professional tone.",
        "max_tokens": 350,
    },
    {
        "section": "Website Copy",
        "title": "Enterprise Section — English",
        "prompt": "Write a 150-word enterprise section for DCP targeting Saudi companies, government entities, and regulated industries. Emphasize: PDPL compliance, data stays in-Kingdom, SOC 2 Type II planned, dedicated inference endpoints, SLA guarantees, SAR invoicing, and Arabic language model support. Professional, trust-building tone. No emojis.",
        "max_tokens": 300,
    },
    {
        "section": "Website Copy",
        "title": "Enterprise Section — Arabic",
        "prompt": "Write the enterprise section for DCP in Modern Standard Arabic, targeting Saudi companies and government entities. Emphasize PDPL compliance, in-Kingdom data residency, SOC 2 certification plans, dedicated endpoints, SLA guarantees, SAR billing, and Arabic AI model support. 150 words, professional tone.",
        "max_tokens": 350,
    },
    # === PRICING PAGE ===
    {
        "section": "Pricing",
        "title": "Pricing Page Copy — English",
        "prompt": "Write pricing page copy for DCP's GPU inference service. Three tiers: (1) Developer Free Trial — SAR 50 free credits, OpenAI-compatible API, community support. (2) Growth — pay-per-token, priority routing, email support, usage dashboard. (3) Enterprise — custom pricing, dedicated endpoints, SLA, PDPL compliance report, account manager. Write a short description for each tier (2-3 sentences). No emojis.",
        "max_tokens": 400,
    },
    {
        "section": "Pricing",
        "title": "Pricing Page Copy — Arabic",
        "prompt": "Write pricing page content in Modern Standard Arabic for DCP's three tiers: (1) تجربة مجانية للمطورين — 50 ريال مجاني, API متوافق مع OpenAI. (2) النمو — دفع حسب الاستخدام, دعم بالبريد. (3) المؤسسات — تسعير مخصص, نقاط نهاية مخصصة, اتفاقية مستوى الخدمة. Write 2-3 sentences per tier. Professional tone.",
        "max_tokens": 400,
    },
    # === FAQ ===
    {
        "section": "FAQ",
        "title": "What is DCP?",
        "prompt": "Write a clear FAQ answer: 'What is DCP?' Answer: DCP (Decentralized Compute Platform) is a GPU compute marketplace based in Riyadh, Saudi Arabia. It connects AI developers who need GPU compute with GPU owners who have spare capacity. Developers access models through an OpenAI-compatible API. Keep it under 80 words, plain language.",
        "max_tokens": 150,
    },
    {
        "section": "FAQ",
        "title": "ما هي DCP؟ (Arabic)",
        "prompt": "Write a FAQ answer in Modern Standard Arabic: 'ما هي منصة DCP؟' — DCP is a decentralized GPU compute marketplace in Riyadh connecting AI developers with GPU providers. OpenAI-compatible API, SAR billing, PDPL compliance. Under 80 words.",
        "max_tokens": 200,
    },
    {
        "section": "FAQ",
        "title": "How is DCP different from AWS/Azure/GCP?",
        "prompt": "Write a FAQ answer explaining how DCP differs from hyperscalers (AWS, Azure, GCP). Key points: (1) Saudi data residency and PDPL compliance built-in, (2) SAR billing — no USD conversion fees, (3) Arabic-first model catalog, (4) decentralized GPU supply keeps costs 60-80% lower, (5) OpenAI-compatible API — no vendor lock-in. Under 100 words.",
        "max_tokens": 200,
    },
    {
        "section": "FAQ",
        "title": "What models are available?",
        "prompt": "Write a FAQ answer about DCP's model catalog. Available models: Llama 3.1 (8B, 70B), ALLaM (Saudi Arabic LLM by SDAIA), JAIS (bilingual Arabic-English by G42), Falcon (by TII Abu Dhabi). All accessible via OpenAI-compatible API. Mention that providers automatically serve the right model size for their GPU. Under 80 words.",
        "max_tokens": 200,
    },
    {
        "section": "FAQ",
        "title": "Is my data safe? PDPL compliance",
        "prompt": "Write a FAQ answer about data safety and PDPL compliance on DCP. Key points: all inference data stays in Saudi Arabia, PDPL (Personal Data Protection Law) compliant, no data stored after inference, SOC 2 Type II certification planned Q2 2026, WireGuard encrypted tunnels between platform and providers. Under 100 words.",
        "max_tokens": 200,
    },
    {
        "section": "FAQ",
        "title": "How do I become a GPU provider?",
        "prompt": "Write a FAQ answer about becoming a DCP GPU provider. Steps: (1) Register at dcp.sa/provider/register, (2) Run the install script: curl -sSL https://api.dcp.sa/install | bash, (3) The daemon detects your GPU, connects to the network, and starts receiving jobs. Minimum: NVIDIA GPU with 8GB VRAM. Earnings paid in SAR. Under 100 words.",
        "max_tokens": 200,
    },
    {
        "section": "FAQ",
        "title": "What GPUs are supported?",
        "prompt": "Write a FAQ answer about supported GPUs on DCP. Any NVIDIA GPU with 8GB+ VRAM works. Popular options: RTX 4090 (24GB), RTX 3090 (24GB), A100 (40/80GB), L40S (48GB), H100 (80GB). The daemon auto-detects GPU model, VRAM, and CUDA version. Both consumer and datacenter GPUs are welcome. Under 80 words.",
        "max_tokens": 200,
    },
    {
        "section": "FAQ",
        "title": "How does billing work?",
        "prompt": "Write a FAQ answer about DCP billing. Renters pay per token (input and output tokens priced separately). All billing in SAR (Saudi Riyal). Payment via Moyasar (credit/debit cards, Apple Pay, mada). Providers earn a percentage of each job. No minimum commitment, no reserved instances — pure pay-as-you-go. Under 80 words.",
        "max_tokens": 200,
    },
    {
        "section": "FAQ",
        "title": "FAQ — Arabic compilation (5 common questions)",
        "prompt": "Write 5 common FAQ entries in Modern Standard Arabic about DCP: (1) What is DCP, (2) How to sign up as a developer, (3) What models are available, (4) How billing works in SAR, (5) Is data safe under PDPL. Each answer should be 2-3 sentences. Format as Q&A pairs.",
        "max_tokens": 600,
    },
    # === DEVELOPER QUICKSTART ===
    {
        "section": "Developer Docs",
        "title": "Quickstart — Getting Your API Key",
        "prompt": "Write a developer quickstart section about getting a DCP API key. Steps: (1) Go to dcp.sa/renter/register, (2) Enter your email, (3) Check email for magic link (OTP), (4) Click to verify, (5) Your API key (dc1-renter-...) appears on the dashboard. The key works as a Bearer token in the Authorization header, just like OpenAI. Under 100 words.",
        "max_tokens": 200,
    },
    {
        "section": "Developer Docs",
        "title": "Quickstart — First API Call (curl)",
        "prompt": "Write a developer quickstart showing the first API call to DCP using curl. Endpoint: https://api.dcp.sa/v1/chat/completions. Use Authorization: Bearer dc1-renter-YOUR_KEY. Show a complete curl example with model 'meta-llama/Llama-3.1-8B-Instruct', a simple message, and max_tokens: 100. Show the expected response structure. Mention it's OpenAI-compatible.",
        "max_tokens": 400,
    },
    {
        "section": "Developer Docs",
        "title": "Quickstart — Python SDK",
        "prompt": "Write a developer quickstart showing how to use DCP with the OpenAI Python SDK. Since DCP is OpenAI-compatible, you just change base_url to https://api.dcp.sa/v1 and use your dc1-renter key. Show a complete Python example: install openai, create client with base_url override, make a chat completion call. Under 150 words.",
        "max_tokens": 300,
    },
    {
        "section": "Developer Docs",
        "title": "Quickstart — JavaScript/TypeScript SDK",
        "prompt": "Write a developer quickstart for using DCP with the OpenAI JavaScript/TypeScript SDK. Change baseURL to https://api.dcp.sa/v1 and use dc1-renter API key. Show a complete Node.js example with the openai npm package. Include: install command, client setup, chat completion call, response handling. Under 150 words.",
        "max_tokens": 300,
    },
    {
        "section": "Developer Docs",
        "title": "Available Models and Parameters",
        "prompt": "Write a reference section listing DCP's available models and their parameters. Models: (1) meta-llama/Llama-3.1-8B-Instruct — fast, good for chat and tasks, 8K context. (2) JAIS-13B — bilingual Arabic-English, 2K context. (3) ALLaM-7B — Saudi Arabic by SDAIA. (4) Falcon-7B — multilingual by TII. Parameters: model, messages, max_tokens, temperature (0-2), top_p, stream (boolean). Format as a clean reference table description.",
        "max_tokens": 400,
    },
    {
        "section": "Developer Docs",
        "title": "Streaming Responses",
        "prompt": "Write a developer guide section about streaming responses from DCP. Set stream: true in the request body. DCP returns Server-Sent Events (SSE) — same format as OpenAI. Show a Python example using the OpenAI SDK with stream=True, iterating over chunks. Mention that streaming reduces time-to-first-token. Under 150 words.",
        "max_tokens": 300,
    },
    {
        "section": "Developer Docs",
        "title": "Error Handling and Rate Limits",
        "prompt": "Write a developer docs section about error handling on DCP. HTTP status codes: 400 (bad request), 401 (invalid API key), 429 (rate limited), 503 (no providers available — retry). Rate limits: 60 requests/minute for free tier, 300/min for growth. Errors return JSON with error.message, error.type, error.code. Show how to handle 503 with exponential backoff. Under 150 words.",
        "max_tokens": 300,
    },
    # === PROVIDER GUIDE ===
    {
        "section": "Provider Guide",
        "title": "Provider Setup — Complete Guide",
        "prompt": "Write a complete provider setup guide for DCP. Steps: (1) System requirements: Linux (Ubuntu 20.04+), NVIDIA GPU 8GB+ VRAM, NVIDIA drivers installed, Python 3.8+. (2) Register at dcp.sa/provider/register. (3) Run: curl -sSL https://api.dcp.sa/install | bash. (4) The installer auto-detects GPU, registers with DCP, installs WireGuard VPN, downloads daemon, sets up systemd service. (5) Check status: systemctl status dcp-provider. (6) View logs: tail -f ~/dcp-provider/logs/daemon.log. Under 200 words.",
        "max_tokens": 400,
    },
    {
        "section": "Provider Guide",
        "title": "Cloud GPU Setup (RunPod/Lambda)",
        "prompt": "Write a guide for running DCP provider on cloud GPUs (RunPod, Lambda Labs). Steps: (1) Rent a GPU pod (e.g., RunPod L40S). (2) Start vLLM: python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-8B-Instruct --port 8000. (3) Set endpoint URL in DCP dashboard (Settings > Inference Endpoint) to https://YOUR_POD_ID-8000.proxy.runpod.net. (4) Run daemon: curl -sSL https://api.dcp.sa/install | bash. (5) The daemon heartbeats every 30s and DCP routes inference to your pod. Under 150 words.",
        "max_tokens": 300,
    },
    {
        "section": "Provider Guide",
        "title": "Provider Earnings Explainer",
        "prompt": "Write an explainer about how DCP provider earnings work. Providers earn a percentage of each inference job routed to their GPU. Earnings depend on: GPU model (higher VRAM = more valuable), uptime (consistent providers get priority routing), latency (faster responses = more jobs). Payments in SAR, visible on the provider dashboard. Monthly payouts via bank transfer. The Saudi energy advantage: electricity at USD 0.048/kWh means 3-6x higher margins than European providers. Under 150 words.",
        "max_tokens": 300,
    },
    {
        "section": "Provider Guide",
        "title": "Provider Setup — Arabic",
        "prompt": "Write a provider setup guide in Modern Standard Arabic. Steps: register at dcp.sa, run the install script, daemon auto-detects GPU and connects. Mention earnings in SAR, WireGuard VPN for security, and the energy cost advantage in Saudi Arabia. 150 words, professional tone.",
        "max_tokens": 350,
    },
    # === USE CASES ===
    {
        "section": "Use Cases",
        "title": "Use Case: Arabic Chatbot for Saudi Businesses",
        "prompt": "Write a use case description: A Saudi e-commerce company uses DCP to power an Arabic customer support chatbot. They use the ALLaM model via DCP's API. Benefits: Arabic-native responses, data stays in Saudi Arabia (PDPL), SAR billing, 60% cheaper than GPT-4 via OpenAI. The chatbot handles 10,000 customer queries/day. Under 120 words.",
        "max_tokens": 250,
    },
    {
        "section": "Use Cases",
        "title": "Use Case: University AI Research",
        "prompt": "Write a use case: A Saudi university research lab uses DCP for NLP experiments. They need GPU compute for fine-tuning Arabic language models but can't afford dedicated A100s. DCP gives them pay-per-use access to powerful GPUs. They run experiments through the API, paying only for tokens used. PDPL compliance means research data stays in-Kingdom. Under 120 words.",
        "max_tokens": 250,
    },
    {
        "section": "Use Cases",
        "title": "Use Case: Startup MVP with Arabic AI",
        "prompt": "Write a use case: A Riyadh-based startup is building an AI-powered legal document analyzer for Saudi regulations. They use DCP's API with JAIS (bilingual Arabic-English model) to parse and summarize legal texts. DCP's free developer trial (SAR 50 credits) lets them prototype without upfront costs. When ready to scale, they switch to pay-per-token. Under 120 words.",
        "max_tokens": 250,
    },
    {
        "section": "Use Cases",
        "title": "Use Case: Internet Cafe GPU Provider",
        "prompt": "Write a use case: An internet cafe owner in Jeddah has 20 gaming PCs with RTX 4090 GPUs that sit idle from midnight to 10 AM. He installs the DCP daemon on each machine. During off-hours, the GPUs serve AI inference jobs through DCP, earning SAR passively. With Saudi electricity at USD 0.048/kWh, the margins are excellent. Setup took 10 minutes per machine. Under 120 words.",
        "max_tokens": 250,
    },
    # === PDPL COMPLIANCE ===
    {
        "section": "Compliance",
        "title": "PDPL Compliance Overview — English",
        "prompt": "Write a PDPL (Personal Data Protection Law) compliance overview for DCP. Key points: (1) All inference data processed in Saudi Arabia, (2) No data stored after inference — zero retention policy, (3) Encrypted transport via WireGuard VPN, (4) Provider isolation — each job runs in sandboxed containers, (5) Audit logging for enterprise customers, (6) SOC 2 Type II certification planned Q2 2026, (7) Data processing agreement available for enterprise. Under 200 words, professional compliance tone.",
        "max_tokens": 400,
    },
    {
        "section": "Compliance",
        "title": "PDPL Compliance — Arabic",
        "prompt": "Write a PDPL compliance overview for DCP in Modern Standard Arabic. Cover: data stays in Saudi Arabia, no data retention after inference, encrypted transport, provider isolation, audit logging, SOC 2 planned. This is for enterprise customers and government entities. 200 words, formal professional tone.",
        "max_tokens": 450,
    },
    # === COMPETITIVE POSITIONING ===
    {
        "section": "Positioning",
        "title": "DCP vs Hyperscalers (AWS/Azure/GCP)",
        "prompt": "Write a comparison section: DCP vs AWS/Azure/GCP for Saudi AI workloads. DCP advantages: (1) Native PDPL compliance vs complex config, (2) SAR billing vs USD invoicing, (3) Arabic model catalog vs generic, (4) 60-80% lower cost via decentralized supply, (5) Saudi data residency by default vs opt-in regions. Hyperscaler advantages: (1) Broader service ecosystem, (2) Global reach, (3) Enterprise maturity. Honest, factual tone. Under 200 words.",
        "max_tokens": 400,
    },
    {
        "section": "Positioning",
        "title": "DCP vs HUMAIN/stc Cloud",
        "prompt": "Write a comparison: DCP vs Saudi competitors (HUMAIN by PIF, stc Cloud). DCP advantages: (1) Developer self-service — sign up and get API key in minutes vs enterprise-only sales process, (2) OpenAI-compatible API vs proprietary, (3) Pay-per-token vs minimum commitments, (4) Open model catalog vs single model. Their advantages: (1) Government backing, (2) Existing enterprise relationships. Respectful, factual tone. Under 150 words.",
        "max_tokens": 300,
    },
    # === ABOUT / TEAM ===
    {
        "section": "About",
        "title": "About DCP — Company Description",
        "prompt": "Write an 'About' page for DCP. DCP (Decentralized Compute Platform) is based in Riyadh, Saudi Arabia. Founded to democratize AI compute access in the MENA region. Mission: make GPU compute accessible, affordable, and compliant for every Arabic AI developer. Vision: become the default inference platform for Arabic AI. The platform connects GPU providers (who earn from idle hardware) with AI developers (who need affordable compute). Under 150 words, professional tone.",
        "max_tokens": 300,
    },
    {
        "section": "About",
        "title": "About DCP — Arabic",
        "prompt": "Write the 'About' page for DCP in Modern Standard Arabic. DCP based in Riyadh, mission to democratize AI compute in MENA, connecting GPU providers with AI developers, Arabic-first, PDPL compliant, SAR billing. 150 words, professional inspirational tone.",
        "max_tokens": 350,
    },
    # === EMAIL TEMPLATES ===
    {
        "section": "Email Templates",
        "title": "Welcome Email — New Developer",
        "prompt": "Write a welcome email for a new DCP developer who just registered. Subject line + body. Welcome them, give them their next steps: (1) Check dashboard for API key, (2) Try first API call (link to quickstart docs), (3) Free trial: SAR 50 credits to start. Friendly, professional tone. Include a curl example. Under 150 words.",
        "max_tokens": 300,
    },
    {
        "section": "Email Templates",
        "title": "Welcome Email — New Provider",
        "prompt": "Write a welcome email for a new DCP GPU provider. Subject line + body. Welcome them, next steps: (1) Run the install script, (2) Check daemon status on dashboard, (3) First earnings appear within hours of going online. Mention the earnings dashboard and support email. Under 150 words.",
        "max_tokens": 300,
    },
    {
        "section": "Email Templates",
        "title": "Welcome Email — Developer (Arabic)",
        "prompt": "Write a welcome email in Modern Standard Arabic for a new DCP developer. Subject + body. Welcome, mention API key on dashboard, free SAR 50 credits, link to docs. Professional, welcoming tone. Under 150 words.",
        "max_tokens": 350,
    },
    # === SOCIAL MEDIA ===
    {
        "section": "Social Media",
        "title": "Launch Announcement Tweets (5)",
        "prompt": "Write 5 tweet-length announcements for DCP's launch. Each under 280 characters. Topics: (1) General launch announcement, (2) Arabic AI models available, (3) PDPL compliance for Saudi developers, (4) GPU providers can earn SAR, (5) OpenAI-compatible API — switch in one line of code. Professional tech tone. No emojis.",
        "max_tokens": 400,
    },
    {
        "section": "Social Media",
        "title": "Launch Tweets — Arabic (5)",
        "prompt": "Write 5 Arabic tweet-length announcements for DCP launch. Each under 280 characters. Topics: (1) Launch announcement, (2) Arabic AI models, (3) PDPL compliance, (4) Earn from GPUs, (5) OpenAI-compatible. Modern Standard Arabic.",
        "max_tokens": 500,
    },
    {
        "section": "Social Media",
        "title": "LinkedIn Launch Post — English",
        "prompt": "Write a LinkedIn post announcing DCP's launch. Professional tone, suitable for Saudi tech/business audience. Mention: decentralized GPU compute, Arabic AI models, PDPL compliance, Saudi data residency, OpenAI-compatible API. Include a call to action for developers and GPU providers. Under 200 words. No emojis.",
        "max_tokens": 400,
    },
    {
        "section": "Social Media",
        "title": "LinkedIn Launch Post — Arabic",
        "prompt": "Write a LinkedIn post in Modern Standard Arabic announcing DCP's launch. Professional tone for Saudi tech audience. Mention decentralized GPU compute, Arabic models, PDPL, SAR billing. Call to action for developers and providers. Under 200 words.",
        "max_tokens": 450,
    },
]

def call_dcp(prompt, max_tokens=200):
    """Make an inference call through the DCP API."""
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are a professional content writer for DCP (Decentralized Compute Platform), a GPU compute marketplace based in Saudi Arabia. Write clean, professional content. No markdown headers unless specifically asked. No emojis."},
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
    resp = urllib.request.urlopen(req, timeout=60)
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

    print(f"DCP Gate 0 — 1-Hour Load Test + Content Generation")
    print(f"Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Target duration: {DURATION_MINUTES} minutes")
    print(f"Tasks: {len(TASKS)} content pieces")
    print(f"Output: {OUTPUT_FILE}")
    print("=" * 60)

    task_index = 0
    pass_number = 1

    while time.time() < end_time:
        task = TASKS[task_index % len(TASKS)]
        elapsed = time.time() - start
        remaining = end_time - time.time()

        # On repeat passes, add variation
        extra = ""
        if pass_number > 1:
            extra = f" (Variation {pass_number}: provide a different angle, different wording, fresh perspective)"

        print(f"\n[{elapsed/60:.1f}m] Task {total_requests+1}: {task['section']} / {task['title']}{' (v'+str(pass_number)+')' if pass_number > 1 else ''}")
        print(f"  Remaining: {remaining/60:.1f}m | Tokens so far: {total_prompt_tokens+total_completion_tokens:,}")

        try:
            content, usage = call_dcp(task["prompt"] + extra, task["max_tokens"])
            total_prompt_tokens += usage.get("prompt_tokens", 0)
            total_completion_tokens += usage.get("completion_tokens", 0)
            total_requests += 1

            results.append({
                "section": task["section"],
                "title": task["title"] + (f" v{pass_number}" if pass_number > 1 else ""),
                "content": content,
                "tokens": usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            preview = content[:80].replace("\n", " ")
            print(f"  OK ({usage.get('completion_tokens', 0)} tokens): {preview}...")

        except Exception as e:
            errors += 1
            print(f"  ERROR: {e}")

        task_index += 1
        if task_index % len(TASKS) == 0:
            pass_number += 1
            print(f"\n{'='*60}")
            print(f"Pass {pass_number-1} complete. Starting pass {pass_number} with variations.")
            print(f"{'='*60}")

        # Small delay between requests to avoid hammering
        time.sleep(2)

    # Write output
    elapsed_total = time.time() - start
    print(f"\n{'='*60}")
    print(f"COMPLETE")
    print(f"Duration: {elapsed_total/60:.1f} minutes")
    print(f"Requests: {total_requests}")
    print(f"Errors: {errors}")
    print(f"Total tokens: {total_prompt_tokens + total_completion_tokens:,} (prompt: {total_prompt_tokens:,}, completion: {total_completion_tokens:,})")
    print(f"Avg tokens/request: {(total_prompt_tokens + total_completion_tokens) // max(total_requests, 1)}")
    print(f"Writing {OUTPUT_FILE}...")

    with open(OUTPUT_FILE, "w") as f:
        f.write(f"# DCP Content Pack\n\n")
        f.write(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n")
        f.write(f"Model: {MODEL}\n")
        f.write(f"Total requests: {total_requests} | Tokens: {total_prompt_tokens + total_completion_tokens:,} | Errors: {errors}\n")
        f.write(f"Duration: {elapsed_total/60:.1f} minutes\n\n")
        f.write("---\n\n")

        current_section = ""
        for r in results:
            if r["section"] != current_section:
                current_section = r["section"]
                f.write(f"## {current_section}\n\n")
            f.write(f"### {r['title']}\n\n")
            f.write(f"{r['content']}\n\n")
            f.write("---\n\n")

    print(f"Done! Content pack saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
