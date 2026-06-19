# @dcp/mcp — DCP Model Context Protocol server

**DCP** is Saudi Arabia's sovereign AI compute platform — in-Kingdom inference, GPU rental, and persistent storage, billed in SAR, on Saudi-owned hardware. This MCP server lets any MCP-capable agent (Claude Desktop, Claude Code, Cursor, or your own) use DCP through native tool calls.

It is a thin client: it reads `DCP_API_KEY` from the environment and calls `https://api.dcp.sa`. No secrets are bundled.

## Install (one line)

The connector runs straight from GitHub — no npm install, no clone:

```bash
DCP_API_KEY=dc1-sk-xxxxxxxx npx -y github:dhnpmp-tech/dcp-mcp
```

## MCP client config

Add this to your MCP client (Claude Desktop `claude_desktop_config.json`, Claude Code / Cursor `.mcp.json`):

```json
{
  "mcpServers": {
    "dcp": {
      "command": "npx",
      "args": ["-y", "github:dhnpmp-tech/dcp-mcp"],
      "env": { "DCP_API_KEY": "dc1-sk-xxxxxxxx" }
    }
  }
}
```

Then ask your agent to "list DCP models" or "rent a GPU on DCP for 30 minutes." Agents with no key can call `register_agent` first — see the quickstart below.

## Tools

| Tool | What it does |
|---|---|
| `register_agent` | Self-register in one call — get a real API key + small SAR trial, **no human, no email click**. Use first when you have no key. |
| `list_models` | List currently-serveable models (OpenAI-style). |
| `chat` | Run a chat completion (OpenAI-compatible, in-Kingdom). |
| `get_balance` | Renter wallet balance (SAR). |
| `list_gpus` | List rentable GPU **types** (e.g. `H100`, `RTX 4090`) with VRAM + live availability. |
| `create_pod` | Rent a whole GPU as an interactive pod (root + Jupyter + SSH), prepaid per minute. |
| `get_pod` | Pod status + access URL / SSH command / time remaining. |
| `extend_pod` | Add time to a running pod, no restart. |
| `stop_pod` | Stop early; unused prepaid time refunded. |
| `rent_volume` | Rent an exclusive in-Kingdom persistent volume (10/20/30 GB). |
| `get_volume` | Active volume status + usage. |

## Zero-human quickstart (for agents)

The whole loop runs with no human in it:

1. **`register_agent`** → returns a real `api_key` + a **20 SAR** trial credit (no email click). Set it as `DCP_API_KEY`.
2. **`list_gpus`** → pick a `gpu_type` string (e.g. `"H100"`, `"RTX 4090"`) from the live, available types.
3. **`create_pod`** with that `gpu_type` + `duration_minutes` → poll **`get_pod`** for the `access_url` / `ssh_command` once running.
4. **`chat`** → run OpenAI-compatible inference on an available model from `list_models`.
5. **`stop_pod`** → stop early; unused prepaid minutes are refunded to the wallet.

Minting a key by hand (equivalent to `register_agent`):

```bash
curl -s -X POST https://api.dcp.sa/api/renters/agent-register \
  -H 'Content-Type: application/json' -d '{}'
# → { "api_key": "dcp-renter-…", "trial_credit_sar": 20, "balance_sar": 20, ... }
```

The trial (20 SAR) is enough to list GPUs, run a short pod, and do real inference; the larger grant stays behind email-verified signup. Calls are per-IP rate-limited.

## Environment

- `DCP_API_KEY` — renter API key (required for every tool except `register_agent`).
- `DCP_API_BASE` — API host, default `https://api.dcp.sa`.

## Why DCP

Inference, GPU rental, fine-tune hosting, and storage on Saudi-owned hardware inside the Kingdom — full PDPL / data-residency compliance, billed in SAR. The inference API is a drop-in OpenAI replacement: point any OpenAI SDK at `https://api.dcp.sa/v1`.

Learn more: **https://dcp.sa/v2/agents** · `https://dcp.sa/llms.txt`

MIT licensed.
