import os
#!/usr/bin/env python3
"""
DCP Benchmark — RTX 3090 + Qwen 2.5 14B AWQ
Generates: Provider FAQ + Troubleshooting Database (200+ Q&A pairs)
Duration: 1 hour
"""

import json
import time
import urllib.request
from datetime import datetime, timezone

API_URL = "http://localhost:8083/v1/chat/completions"
API_KEY = os.environ.get("DC1_RENTER_KEY", "")  # SECURITY: hardcoded key removed; rotate old key
MODEL = "Qwen/Qwen2.5-14B-Instruct-AWQ"
DURATION_MINUTES = 60
OUTPUT_FILE = "/root/dcp-provider-faq.md"

SYSTEM_PROMPT = """You are a technical support expert for DCP (Decentralized Compute Platform), a GPU compute marketplace based in Saudi Arabia. Write clear, accurate FAQ answers for GPU providers who rent their hardware on DCP.

DCP facts:
- Providers install a daemon via: curl -sSL https://api.dcp.sa/install | bash
- The daemon detects GPU, installs vLLM, selects the best model for the VRAM, starts serving inference
- Providers earn SAR (Saudi Riyal) for each inference request routed to their GPU
- WireGuard VPN is used for home GPUs behind NAT
- Cloud GPUs (RunPod, Lambda) use proxy URLs for connectivity
- Minimum GPU: NVIDIA with 8GB VRAM
- The daemon heartbeats every 30 seconds to api.dcp.sa
- Models are served via vLLM (OpenAI-compatible API)
- Supported GPUs: RTX 3090, RTX 4090, RTX 5090, A100, L40S, H100, etc.
- PDPL (Saudi data protection law) compliance is built in
- Provider dashboard at dcp.sa/provider

Write each answer in 2-4 sentences. Be specific and actionable. No emojis."""

CATEGORIES = [
    {
        "category": "Getting Started",
        "questions": [
            "What is DCP and how do I earn money with my GPU?",
            "What are the minimum hardware requirements to become a provider?",
            "How do I register as a GPU provider?",
            "What happens after I run the install script?",
            "How long does the setup take?",
            "Do I need technical knowledge to become a provider?",
            "Can I use my gaming PC as a provider?",
            "What operating systems are supported?",
            "Do I need a static IP address?",
            "Can I run DCP alongside my normal computer use?",
        ],
    },
    {
        "category": "Installation & Setup",
        "questions": [
            "The install script says 'command not found' — what do I do?",
            "How do I install the daemon on Ubuntu?",
            "How do I install the daemon on Windows?",
            "The install script fails with 'No NVIDIA GPU detected' — what's wrong?",
            "How do I check if my NVIDIA drivers are installed correctly?",
            "The install script says 'not enough disk space' — how much do I need?",
            "How do I update to the latest daemon version?",
            "The daemon won't start after installation — how do I troubleshoot?",
            "How do I install on a cloud GPU (RunPod, Lambda Labs)?",
            "What is the vLLM endpoint URL and when do I need it?",
            "How do I set up the WireGuard VPN?",
            "The WireGuard connection isn't working — how do I debug it?",
            "Can I install on multiple GPUs on the same machine?",
            "How do I uninstall the DCP daemon?",
            "The install script hangs during model download — what do I do?",
        ],
    },
    {
        "category": "GPU & Model Issues",
        "questions": [
            "Which AI models can my GPU run?",
            "My RTX 3090 (24GB) — what models work best?",
            "My RTX 4090 (24GB) — what models work best?",
            "My RTX 4080 (16GB) — what models work best?",
            "I have 8GB VRAM — can I still be a provider?",
            "The model download is taking forever — is this normal?",
            "vLLM says 'out of memory' — what do I do?",
            "Can I choose which model to serve?",
            "How do I switch to a different model?",
            "My GPU temperature is too high — will DCP throttle it?",
            "Can I use AMD GPUs?",
            "The daemon says 'CUDA not found' — how do I fix this?",
            "What CUDA version do I need?",
            "How much bandwidth does serving inference use?",
            "My GPU utilization is at 0% even though I'm online — why?",
        ],
    },
    {
        "category": "Daemon & Heartbeat",
        "questions": [
            "What does 'Heartbeat OK' mean in the logs?",
            "The daemon says 'Heartbeat failed' — what's wrong?",
            "My provider shows as 'offline' but the daemon is running — why?",
            "My provider shows as 'degraded' — what does that mean?",
            "How do I check if the daemon is running?",
            "How do I restart the daemon?",
            "How do I stop the daemon?",
            "The daemon keeps crashing and restarting — what's happening?",
            "What is the watchdog and how does it work?",
            "The daemon says 'Provider is not approved yet' — what do I do?",
            "How does auto-update work?",
            "The daemon logs show 'HMAC warning' — is this a problem?",
            "Where are the daemon log files?",
            "How do I check the daemon version?",
            "The daemon uses too much CPU — is this normal?",
        ],
    },
    {
        "category": "Earnings & Payments",
        "questions": [
            "How much can I earn as a GPU provider?",
            "How is my earnings calculated?",
            "When do I get paid?",
            "What payment methods are available?",
            "Can I see my earnings in real-time?",
            "Why are my earnings lower than expected?",
            "Does GPU model affect how much I earn?",
            "How does the Saudi energy cost advantage work?",
            "What is the platform fee?",
            "How do I withdraw my earnings?",
            "Are earnings paid in SAR or USD?",
            "My earnings show 0 even though I'm online — why?",
            "How does priority routing work?",
            "Do I earn more if my GPU is faster?",
            "What happens to my earnings if my GPU goes offline?",
        ],
    },
    {
        "category": "Cloud GPU Providers",
        "questions": [
            "How do I set up DCP on a RunPod GPU?",
            "How do I find my RunPod proxy URL?",
            "How do I set up DCP on Lambda Labs?",
            "What's the difference between cloud and home GPU setup?",
            "Is it profitable to rent a cloud GPU and re-sell on DCP?",
            "The endpoint URL isn't working — how do I troubleshoot?",
            "How do I set the endpoint URL in the provider dashboard?",
            "My RunPod pod restarted — do I need to reinstall?",
            "How do I make sure port 8000 is exposed on RunPod?",
            "Can I use DCP on a spot/preemptible instance?",
        ],
    },
    {
        "category": "Network & Security",
        "questions": [
            "Is my data safe when serving inference?",
            "What is PDPL and how does DCP comply?",
            "Does DCP store any of the inference data?",
            "How does WireGuard VPN protect my connection?",
            "Can other providers see my data?",
            "Is my API key safe?",
            "How do I rotate my provider API key?",
            "What ports does DCP use?",
            "Can I run DCP behind a corporate firewall?",
            "What data does the daemon send to DCP?",
        ],
    },
    {
        "category": "Provider Dashboard",
        "questions": [
            "How do I access my provider dashboard?",
            "What do the dashboard stats mean?",
            "How do I set my GPU preferences?",
            "What is the 'Inference Endpoint' setting?",
            "How do I set my temperature limit?",
            "What does 'VRAM Reserve' do?",
            "How do I switch between always-on and scheduled mode?",
            "Can I pause my provider temporarily?",
            "How do I see my job history?",
            "How do I export my earnings data?",
        ],
    },
    {
        "category": "Troubleshooting Common Errors",
        "questions": [
            "Error: 'Circular reference detected' in heartbeat",
            "Error: 'No API key configured'",
            "Error: 'Provider is not approved yet'",
            "Error: 'Docker not available — vllm_serve requires Docker'",
            "Error: 'No space left on device'",
            "Error: 'Rate limit exceeded' on heartbeat",
            "Error: 'CUDA out of memory'",
            "Error: 'Connection refused' to api.dcp.sa",
            "Error: 'Repository not found' when downloading model",
            "Error: 'Engine core initialization failed'",
            "The web terminal disconnected — is my daemon still running?",
            "vLLM process died but daemon is still heartbeating",
            "Provider shows 'Inactive' instead of 'Online'",
            "Jobs are stuck in 'assigned' status",
            "The daemon downloaded the wrong model — how do I change it?",
        ],
    },
    {
        "category": "Advanced Configuration",
        "questions": [
            "How do I override the auto-selected model?",
            "How do I change the heartbeat interval?",
            "How do I set custom vLLM parameters?",
            "Can I serve multiple models on one GPU?",
            "How do I set up a multi-GPU provider?",
            "How do I configure the daemon as a systemd service?",
            "How do I run the daemon with Docker?",
            "How do I set environment variables for the daemon?",
            "What is the DCP_MODEL_OVERRIDE variable?",
            "How do I benchmark my GPU performance?",
        ],
    },
]

def call_dcp(question, category):
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Category: {category}\nQuestion: {question}\n\nWrite a clear, helpful FAQ answer."},
        ],
        "max_tokens": 300,
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

    # Flatten all questions
    all_questions = []
    for cat in CATEGORIES:
        for q in cat["questions"]:
            all_questions.append({"category": cat["category"], "question": q})

    print(f"DCP Benchmark — Provider FAQ Generator")
    print(f"GPU: RTX 3090 | Model: {MODEL}")
    print(f"Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Target duration: {DURATION_MINUTES} minutes")
    print(f"Questions: {len(all_questions)} across {len(CATEGORIES)} categories")
    print(f"Output: {OUTPUT_FILE}")
    print("=" * 60)

    q_index = 0
    pass_number = 1

    while time.time() < end_time:
        item = all_questions[q_index % len(all_questions)]
        elapsed = time.time() - start
        remaining = end_time - time.time()

        extra = ""
        if pass_number > 1:
            extra = f" Provide a different perspective or additional detail compared to your previous answer."

        print(f"\n[{elapsed/60:.1f}m] Q{total_requests+1}: {item['category']} / {item['question']}")

        try:
            content, usage = call_dcp(item["question"] + extra, item["category"])
            total_prompt_tokens += usage.get("prompt_tokens", 0)
            total_completion_tokens += usage.get("completion_tokens", 0)
            total_requests += 1

            results.append({
                "category": item["category"],
                "question": item["question"],
                "answer": content,
                "tokens": usage.get("total_tokens", 0),
                "pass": pass_number,
            })

            preview = content[:80].replace("\n", " ")
            print(f"  OK ({usage.get('completion_tokens', 0)} tok): {preview}...")

        except Exception as e:
            errors += 1
            print(f"  ERROR: {e}")

        q_index += 1
        if q_index % len(all_questions) == 0:
            pass_number += 1
            print(f"\n{'='*60}")
            print(f"Pass {pass_number-1} complete ({len(all_questions)} questions). Starting pass {pass_number}.")
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
    print(f"Writing {OUTPUT_FILE}...")

    with open(OUTPUT_FILE, "w") as f:
        f.write(f"# DCP Provider FAQ & Troubleshooting Database\n\n")
        f.write(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n")
        f.write(f"Model: {MODEL} on RTX 3090\n")
        f.write(f"Total Q&A pairs: {total_requests} | Tokens: {total_prompt_tokens + total_completion_tokens:,} | Errors: {errors}\n")
        f.write(f"Duration: {elapsed_total/60:.1f} minutes\n\n")
        f.write("---\n\n")

        current_category = ""
        for r in results:
            if r["category"] != current_category:
                current_category = r["category"]
                f.write(f"## {current_category}\n\n")
            suffix = f" (v{r['pass']})" if r["pass"] > 1 else ""
            f.write(f"### Q: {r['question']}{suffix}\n\n")
            f.write(f"{r['answer']}\n\n")
            f.write("---\n\n")

    print(f"Done! FAQ saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
