# @dcp/mcp — DCP Model Context Protocol server

Use **DCP** — Saudi Arabia's sovereign AI compute platform — directly from any MCP-capable agent (Claude Desktop, Claude Code, Cursor, or your own agent). Run sovereign in-Kingdom inference, rent whole GPUs, and manage persistent storage through native tool calls.

## Tools

| Tool | What it does |
|---|---|
| `register_agent` | Self-register in one call — get a real API key + small SAR trial, **no human, no email click**. Use first when you have no key. |
| `list_models` | List currently-serveable models (OpenAI-style). |
| `chat` | Run a chat completion (OpenAI-compatible, in-Kingdom). |
| `get_balance` | Renter wallet balance (SAR). |
| `create_pod` | Rent a whole GPU (root + Jupyter + SSH), prepaid per minute. |
| `get_pod` | Pod status + access URL / SSH / time remaining. |
| `extend_pod` | Add time to a running pod, no restart. |
| `stop_pod` | Stop early; unused time refunded. |
| `rent_volume` | Rent an exclusive in-Kingdom persistent volume (10/20/30 GB). |
| `get_volume` | Active volume status + usage. |

## Zero-human quickstart (for agents)

No account yet? Mint one programmatically in a single call — no email click:

```bash
curl -s -X POST https://api.dcp.sa/api/renters/agent-register \
  -H 'Content-Type: application/json' -d '{}'
# → { "api_key": "dcp-renter-…", "trial_credit_sar": 20, "balance_sar": 20, ... }
```

Set the returned `api_key` as `DCP_API_KEY` and every other tool works immediately. The trial is a modest 20 SAR (enough to list GPUs, run a short pod, and do real inference); the larger grant stays behind email-verified signup. Calls are per-IP rate-limited.

## Setup

1. Create a renter account and fund the wallet (SAR) at **https://dcp.sa**. Copy your renter API key. (Agents: skip this — use `register_agent` / the zero-human quickstart above.)
2. Add the server to your MCP client. Example (Claude Desktop `claude_desktop_config.json` / Claude Code `.mcp.json`):

```json
{
  "mcpServers": {
    "dcp": {
      "command": "npx",
      "args": ["-y", "@dcp/mcp"],
      "env": { "DCP_API_KEY": "dc1-sk-xxxxxxxx" }
    }
  }
}
```

3. Ask your agent to "list DCP models" or "rent a GPU on DCP for 30 minutes."

## Environment

- `DCP_API_KEY` — renter API key (required for tool calls).
- `DCP_API_BASE` — API host, default `https://api.dcp.sa`.

## Why DCP

Inference, GPU rental, fine-tune hosting, and storage on Saudi-owned hardware inside the Kingdom — full PDPL / data-residency compliance, billed in SAR. The inference API is also a drop-in OpenAI replacement: point any OpenAI SDK at `https://api.dcp.sa/v1`. See https://dcp.sa/llms.txt.

MIT licensed.
