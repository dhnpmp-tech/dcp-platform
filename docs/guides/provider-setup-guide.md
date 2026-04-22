# Provider Setup Guide — Start Earning in Minutes

**Time required:** 5-10 minutes  
**Difficulty:** Easy  
**Prerequisite:** NVIDIA GPU with at least 8 GB VRAM

## Overview

This guide covers the current onboarding path:

1. Register as a provider and get your provider key.
2. Run one install command.
3. (Home internet) complete WireGuard peer setup.
4. Verify daemon health from CLI or tray app.

## Step 1: Register and get your provider key

- Visit `https://dcp.sa/setup`
- Complete registration and save your provider key
- Open your provider dashboard after registration

## Step 2: Quick install

### Linux and macOS

```bash
curl -fsSL "https://api.dcp.sa/install" | bash
```

Direct endpoint (same flow, explicit key in URL):

```bash
curl -fsSL "https://api.dcp.sa/api/providers/download/setup?key=YOUR_KEY" | bash
```

### Windows PowerShell

```powershell
irm "https://api.dcp.sa/api/providers/download/setup?key=YOUR_KEY&os=windows" | iex
```

Installer highlights:

- Detects GPU and validates runtime prerequisites
- Installs daemon dependencies
- Generates WireGuard keypair for home-provider routing
- Starts daemon bootstrap flow

## Step 3: Home provider WireGuard setup (NAT safe)

If your node is behind residential NAT or you cannot open inbound ports, use WireGuard.

- DCP WireGuard endpoint: `76.13.179.86:51820`
- DCP server public key: `zVxlVgKwnxq4Z9l6jGgD0yMJH5meHrlodJYyRHrL+wM=`

If needed, generate keys manually:

```bash
wg genkey | tee privatekey | wg pubkey > publickey
cat publickey
```

Send your WireGuard public key to `setup@dcp.sa` to request peer addition.

## Step 4: Install the system monitor tray app

After daemon install, download tray app builds from provider dashboard or direct endpoints:

- Windows: `/api/providers/download/tray-windows`
- Linux: `/api/providers/download/tray-linux`
- macOS: `/api/providers/download/tray-mac`

The tray app shows:

- Daemon status
- GPU utilization
- Jobs served
- Earnings in SAR

## Step 5: Confirm supported models and VRAM

Daemon `v4.0.0-alpha.2` whitelist currently includes:

### Arabic

- `ALLaM-7B Instruct` — 24 GB VRAM (Node 3 rollout)
- `JAIS-13B Chat` — 24 GB VRAM

### Multilingual

- `Qwen2.5-7B Instruct` — 8 GB VRAM minimum
- `Qwen2.5-14B Instruct` — 24 GB VRAM recommended

### Standard

- `Llama 3.1 8B Instruct AWQ INT4` — 8 GB VRAM minimum
- `Mistral 7B Instruct v0.2 AWQ` — 8 GB VRAM minimum
- `Phi-3.5 Mini Instruct` — 8 GB VRAM minimum

## Troubleshooting quick checks

```bash
nvidia-smi
systemctl status dcp-daemon
journalctl -u dcp-daemon -n 50 --no-pager
```

If onboarding fails, include your provider key (masked), OS, GPU model, and last 50 daemon log lines when contacting support.
