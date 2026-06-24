import os
#!/usr/bin/env python3
"""
DCP Benchmark Run 5 — RTX 4090 + Qwen 2.5 14B AWQ
Generates: Investor Pitch Materials
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
OUTPUT_FILE = "/root/dcp-investor-pitch.md"

SYSTEM_PROMPT = """You are a senior investment banker and startup advisor writing investor pitch materials for DCP (Decentralized Compute Platform).

DCP facts:
- GPU compute marketplace based in Riyadh, Saudi Arabia
- Three pillars: Saudi energy arbitrage (USD 0.048/kWh), inference-as-a-service, enterprise PDPL compliance
- OpenAI-compatible API at api.dcp.sa
- Provider daemon: curl -sSL https://api.dcp.sa/install | bash (one command)
- Auto-detects GPU, installs vLLM, selects model, starts serving
- Supports: RTX 3090, 4090, 5090, A100, L40S, H100
- Arabic-first model portfolio: ALLaM (SDAIA), JAIS (G42), Falcon (TII)
- PDPL compliant, Saudi data residency
- SAR billing via Moyasar
- Gate 0 completed: 1-hour sustained inference test passed, 258 requests, 102K tokens
- Co-founders: Peter (CTO), Tareq, Fadi
- Target: Saudi AI startups, universities, SMBs, government entities
- Competitor gap: no other platform offers self-serve + Arabic-first + PDPL + SAR billing
- Saudi Arabia Vision 2030 alignment: digital transformation, AI adoption
- Market: MENA AI market projected $135B by 2030

Write professional, data-driven investor pitch content. Use specific numbers where possible. No emojis."""

SECTIONS = [
    {"title": "Executive Summary — One Pager", "prompt": "Write a one-page executive summary for DCP investors. Cover: problem (no PDPL-compliant, Arabic-first compute in Saudi), solution (decentralized GPU marketplace), traction (Gate 0 completed, one-command provider onboarding, OpenAI-compatible API), market ($135B MENA AI by 2030), business model (per-token pricing, platform fee), team, ask (seed round amount and use of funds). 300 words max.", "max_tokens": 500},
    {"title": "Problem Statement", "prompt": "Write the problem statement for DCP's investor pitch. Cover: Saudi AI developers face three barriers — (1) no local GPU compute (data leaves the country, PDPL violation risk), (2) USD billing from hyperscalers (currency conversion costs, no mada/Apple Pay), (3) no Arabic-optimized models readily available via API. Quantify each problem with data.", "max_tokens": 500},
    {"title": "Solution — How DCP Works", "prompt": "Write the solution section. Explain DCP's three-sided marketplace: providers supply GPUs, renters consume inference, DCP routes and bills. One-command setup for providers, OpenAI-compatible API for renters, PDPL compliance by design. Include a diagram description showing the flow.", "max_tokens": 500},
    {"title": "Market Size — TAM SAM SOM", "prompt": "Write the TAM/SAM/SOM analysis for DCP. TAM: global GPU cloud market ($XX B). SAM: MENA AI compute market. SOM: Saudi inference-as-a-service for SMBs and startups in year 1-2. Use real market data and projections. Show the path from SOM to SAM.", "max_tokens": 500},
    {"title": "Saudi Arabia — Why Now", "prompt": "Write the 'Why Now' section focused on Saudi Arabia. Cover: Vision 2030 AI investment ($40B+ via PIF/HUMAIN), PDPL enforcement timeline, SDAIA's ALLaM model launch, local AI startup ecosystem growing, Saudi electricity advantage (cheapest in G20), young tech-savvy population, government mandates for data localization.", "max_tokens": 500},
    {"title": "Energy Arbitrage — The Saudi Advantage", "prompt": "Write a deep-dive section on the energy arbitrage thesis. Saudi electricity: $0.048/kWh vs EU $0.20-0.30/kWh vs US $0.12-0.15/kWh. Calculate the margin advantage per GPU-hour for RTX 4090, A100, H100. Show how Saudi providers earn 3-6x higher margins than European providers for the same hardware. This is DCP's structural moat.", "max_tokens": 600},
    {"title": "Business Model — Revenue Streams", "prompt": "Write the business model section. Revenue streams: (1) Platform fee on inference (15-20% of token cost), (2) Enterprise SLA contracts (dedicated endpoints, guaranteed uptime), (3) Model hosting fees (providers pay to list custom models), (4) OpenRouter revenue share (listed as provider). Unit economics: cost per token, margin per token, gross margin target.", "max_tokens": 500},
    {"title": "Competitive Landscape", "prompt": "Write the competitive landscape section. Compare DCP to: HUMAIN (PIF, enterprise-only), stc Cloud (no self-serve), Hyperfusion (UAE, no PDPL), Arabic.ai (no SAR billing), AWS/Azure/GCP (expensive, no Arabic focus, complex PDPL). Show DCP's unique position in a 2x2 matrix: self-serve vs enterprise, Arabic-first vs generic.", "max_tokens": 600},
    {"title": "Traction & Milestones", "prompt": "Write the traction section. Milestones achieved: Gate 0 live inference (258 requests, 102K tokens, 1-hour sustained), one-command provider onboarding, daemon auto-update, RTX 3090/4090 tested, OpenAI-compatible API, 14 AI agents managing development, provider FAQ database generated. Upcoming: OpenRouter listing, first paying customer, multi-GPU benchmarks.", "max_tokens": 500},
    {"title": "Go-to-Market Strategy", "prompt": "Write the GTM strategy. Phase 1 (0-6 months): 10 Saudi AI researchers as design partners, free credits program (SAR 50), list on OpenRouter. Phase 2 (6-12 months): internet cafe GPU network pilot, university partnerships (KAUST, KAU), 3 enterprise contracts. Phase 3 (12-24 months): MENA expansion (UAE, Egypt), provider marketplace with 100+ GPUs.", "max_tokens": 500},
    {"title": "Technology Architecture", "prompt": "Write the technology section for technical investors. Cover: Next.js frontend on Vercel, Express.js backend, SQLite (migrating to Postgres), Supabase auth, provider daemon (Python, auto-detect GPU, vLLM serving, WireGuard VPN), OpenAI-compatible API with latency-gated routing, multi-provider failover, HMAC task verification, auto-update mechanism.", "max_tokens": 500},
    {"title": "Team", "prompt": "Write the team section. Peter (CTO) — platform architect, built the entire technical stack including daemon, API, agent system. Tareq — Saudi market, business development, government relationships. Fadi — operations, provider network. Advisory board: [to be filled]. Why this team: deep Saudi market knowledge + technical execution speed (222 issues completed, 104+ commits in one sprint).", "max_tokens": 400},
    {"title": "Financial Projections — 3 Year", "prompt": "Write 3-year financial projections. Year 1: 50 providers, 200 renters, $50K MRR target, focus on unit economics. Year 2: 500 providers, 2,000 renters, $500K MRR, OpenRouter revenue, 3 enterprise contracts. Year 3: 2,000 providers, 10,000 renters, $2M MRR, MENA expansion. Show revenue, gross margin, burn rate, path to profitability.", "max_tokens": 600},
    {"title": "Use of Funds", "prompt": "Write the use of funds section for a seed round. Seed round: SAR 2M ($530K). Allocation: 40% engineering (2 senior devs, infrastructure), 25% go-to-market (developer advocacy, university partnerships), 15% provider acquisition (subsidized GPU credits, internet cafe pilots), 10% compliance (SOC 2 Type II, PDPL audit), 10% operations. Runway: 18 months.", "max_tokens": 400},
    {"title": "Risk Factors & Mitigations", "prompt": "Write the risk factors section honestly. Risks: (1) hyperscaler competition — mitigation: they can't match PDPL + Arabic + SAR, (2) provider supply — mitigation: energy arbitrage makes it profitable, (3) regulatory changes — mitigation: aligned with PDPL, (4) technical execution — mitigation: proven with Gate 0, (5) market adoption — mitigation: free credits + design partners.", "max_tokens": 500},
    {"title": "Appendix — Key Metrics Dashboard", "prompt": "Write the key metrics appendix. Define the metrics investors should track: (1) Provider metrics: online GPUs, uptime %, heartbeat health, (2) Renter metrics: API calls/day, tokens/day, DAU, (3) Revenue metrics: MRR, ARPU, gross margin, (4) Platform metrics: latency P50/P95, error rate, provider failover rate. Show target values for each at 6/12/24 months.", "max_tokens": 500},
    {"title": "Appendix — PDPL Compliance Summary", "prompt": "Write a PDPL compliance summary appendix for investors. Cover: what PDPL requires (data residency, consent, breach notification), how DCP complies (all data in Saudi, zero retention, encrypted transport, audit logging), competitive advantage vs non-compliant alternatives, SOC 2 Type II timeline, enterprise DPA availability.", "max_tokens": 400},
    {"title": "Appendix — Comparable Transactions", "prompt": "Write a comparable transactions appendix. List recent funding rounds in GPU cloud/AI infrastructure: Together AI ($100M+), Lambda Labs ($320M), CoreWeave ($7.5B), Hyperfusion ($30M SAR), OmniOps/Bunyan ($30M SAR). Show DCP's positioning relative to these and why the market is hot.", "max_tokens": 400},
]

def call_dcp(prompt, max_tokens=500):
    payload = {"model": MODEL, "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}], "max_tokens": max_tokens, "temperature": 0.7}
    data = json.dumps(payload).encode()
    req = urllib.request.Request(API_URL, data=data, headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"})
    resp = urllib.request.urlopen(req, timeout=120)
    body = json.loads(resp.read())
    return body["choices"][0]["message"]["content"], body.get("usage", {})

def main():
    start = time.time()
    end_time = start + (DURATION_MINUTES * 60)
    results, total_prompt, total_completion, total_requests, errors = [], 0, 0, 0, 0
    print(f"DCP Benchmark Run 5 — Investor Pitch Materials")
    print(f"GPU: RTX 4090 | Model: {MODEL}")
    print(f"Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"Sections: {len(SECTIONS)} | Duration: {DURATION_MINUTES}min")
    print(f"Output: {OUTPUT_FILE}")
    print("=" * 60)
    si, pn = 0, 1
    while time.time() < end_time:
        s = SECTIONS[si % len(SECTIONS)]
        elapsed = time.time() - start
        extra = f"\n\nRevision {pn}: expand with more detail and data." if pn > 1 else ""
        print(f"\n[{elapsed/60:.1f}m] {s['title']}{' (v'+str(pn)+')' if pn > 1 else ''}")
        try:
            content, usage = call_dcp(s["prompt"] + extra, s["max_tokens"])
            total_prompt += usage.get("prompt_tokens", 0)
            total_completion += usage.get("completion_tokens", 0)
            total_requests += 1
            results.append({"title": s["title"] + (f" (v{pn})" if pn > 1 else ""), "content": content})
            print(f"  OK ({usage.get('completion_tokens', 0)} tok): {content[:80].replace(chr(10), ' ')}...")
        except Exception as e:
            errors += 1
            print(f"  ERROR: {e}")
        si += 1
        if si % len(SECTIONS) == 0:
            pn += 1
            print(f"\n{'='*60}\nPass {pn-1} complete. Starting pass {pn}.\n{'='*60}")
        time.sleep(1)
    elapsed_total = time.time() - start
    print(f"\n{'='*60}\nCOMPLETE\nDuration: {elapsed_total/60:.1f}min | Requests: {total_requests} | Errors: {errors}")
    print(f"Tokens: {total_prompt + total_completion:,}")
    with open(OUTPUT_FILE, "w") as f:
        f.write(f"# DCP Investor Pitch Materials\n\nGenerated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\nModel: {MODEL} on RTX 4090\nSections: {total_requests} | Tokens: {total_prompt + total_completion:,}\n\n---\n\n")
        for r in results:
            f.write(f"## {r['title']}\n\n{r['content']}\n\n---\n\n")
    print(f"Done! Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
