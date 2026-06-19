# @dcp/mcp — DCP Model Context Protocol server

Use **DCP** — Saudi Arabia's sovereign AI compute platform — directly from any MCP-capable agent (Claude Desktop, Claude Code, Cursor, or your own agent). Run sovereign in-Kingdom inference, rent whole GPUs, and manage persistent storage through native tool calls.

## Tools

| Tool | What it does |
|---|---|
| `list_models` | List currently-serveable models (OpenAI-style). |
| `chat` | Run a chat completion (OpenAI-compatible, in-Kingdom). |
| `get_balance` | Renter wallet balance (SAR). |
| `create_pod` | Rent a whole GPU (root + Jupyter + SSH), prepaid per minute. |
| `get_pod` | Pod status + access URL / SSH / time remaining. |
| `extend_pod` | Add time to a running pod, no restart. |
| `stop_pod` | Stop early; unused time refunded. |
| `rent_volume` | Rent an exclusive in-Kingdom persistent volume (10/20/30 GB). |
| `get_volume` | Active volume status + usage. |

## Setup

1. Create a renter account and fund the wallet (SAR) at **https://dcp.sa**. Copy your renter API key.
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
