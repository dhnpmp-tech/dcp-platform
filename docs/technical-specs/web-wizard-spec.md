# DCP Provider Onboarding — Web Wizard Specification

**URL:** `provider.dcp.sa/setup`  
**Stack:** Next.js 14 (App Router) + Tailwind + shadcn/ui  
**API:** `api.dcp.sa/v1/*`  
**Target:** All OS — one codebase, OS-adaptive flow  

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           provider.dcp.sa (Next.js)         │
│                                             │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Wizard  │  │ Download │  │  Status    │  │
│  │  Steps   │──│  Hub     │──│  Dashboard │  │
│  │  1-6    │  │  Center  │  │  (Day 2+)   │  │
│  └─────────┘  └──────────┘  └────────────┘  │
│         │            │            │         │
│         ▼            ▼            ▼         │
│  ┌─────────────────────────────────────┐    │
│  │      api.dcp.sa/v1 (Daemon API)     │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

The wizard is a **browser flow**. It never touches the provider's machine directly.  
It builds trust, collects info, and ends with an **install command or download**  
that the provider runs locally. The native daemon then phones home to the same API.

---

## OS Detection & Adaptive Flow

On first visit, read `navigator.userAgent` + `navigator.platform`:

```typescript
// lib/os-detect.ts
export type DetectedOS = 'windows' | 'macos' | 'linux' | 'unknown';

export function detectOS(): DetectedOS {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? '';

  if (ua.includes('win') || platform.includes('win')) return 'windows';
  if (ua.includes('mac') || platform.includes('mac')) return 'macos';
  if (ua.includes('linux') || platform.includes('linux')) return 'linux';
  return 'unknown';
}
```

The OS determines:
- Step 3 content (GPU detection instructions)
- Step 5 install command (PowerShell vs curl vs DMG)
- Estimated earnings model (different GPU bandwidth tables)

---

## Wizard Steps

### Step 1: Welcome + Sign Up / Sign In

**URL:** `provider.dcp.sa/setup`

**Screen:**

```
┌──────────────────────────────────────────────────┐
│                                                  │
│        🖥️  Turn Your GPU Into Income             │
│                                                  │
│   DCP connects your idle GPU to AI workloads     │
│   across Saudi Arabia. Earn while your machine   │
│   sits idle.                                     │
│                                                  │
│   ┌────────────────────┐  ┌────────────────────┐  │
│   │   Create Account   │  │    Sign In          │ │
│   └────────────────────┘  └────────────────────┘  │
│                                                  │
│   [What is DCP?] [How earnings work] [Security]  │
│                                                  │
│   🇸🇦 Proudly built in Saudi Arabia               │
└──────────────────────────────────────────────────┘
```

**Sign Up Fields:**
- Email (required)
- Password (required, 12+ chars)
- Display name (optional)
- Phone (optional, for 2FA later)

**API Calls:**

```http
POST api.dcp.sa/v1/auth/register
{
  "email": "provider@example.com",
  "password": "<hashed-client-side>",
  "display_name": "Ahmad",
  "role": "provider"
}

→ 201 { "user_id": "usr_8x4k", "token": "jwt..." }
```

**Sign In:**

```http
POST api.dcp.sa/v1/auth/login
{
  "email": "provider@example.com",
  "password": "<hashed>"
}

→ 200 { "user_id": "usr_8x4k", "token": "jwt..." }
```

**Validation gate (NEW — spec gap fix):**
After auth, the wizard checks provider eligibility:

```http
GET api.dcp.sa/v1/provider/eligibility
Authorization: Bearer <token>

→ 200 {
  "eligible": true,
  "reason": null,
  "region": "SA",
  "account_status": "active"
}
```

If `eligible: false`, show reason (e.g., "Service not available in your region",  
"Account suspended — contact support").

---

### Step 2: System Requirements Check

**Title:** "Can Your Machine Run DCP?"

**This is informational — the wizard can't probe the machine.  
It shows OS-specific requirements and asks the provider to confirm.**

**Windows Screen:**

```
┌──────────────────────────────────────────────────┐
│  ✅ Windows Requirements                          │
│                                                  │
│  Hardware:                                       │
│  ├─ NVIDIA GPU (GTX 1060 6GB or better)          │
│  ├─ 16 GB RAM minimum                            │
│  ├─ 50 GB free disk space                        │
│  └─ Stable internet (5+ Mbps upload)             │
│                                                  │
│  Software:                                       │
│  ├─ Windows 10/11 (64-bit)                       │
│  ├─ NVIDIA Driver 525+                           │
│  └─ PowerShell 5.1+ (pre-installed)              │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ ☑ My machine meets these requirements        │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  [Can't find your GPU? Check with Task Manager]  │
└──────────────────────────────────────────────────┘
```

**macOS Screen:**

```
┌──────────────────────────────────────────────────┐
│  🍎 macOS Requirements (Apple Silicon)           │
│                                                  │
│  Hardware:                                       │
│  ├─ Apple Silicon M1/M2/M3/M4 chip              │
│  ├─ 16 GB unified memory minimum                │
│  ├─ 50 GB free disk space                        │
│  └─ Stable internet (5+ Mbps upload)             │
│                                                  │
│  Software:                                       │
│  ├─ macOS 13 (Ventura) or later                  │
│  └─ Terminal.app (pre-installed)                 │
│                                                  │
│  💡 Apple Silicon uses unified memory — your     │
│     GPU shares RAM with the CPU. Models up to    │
│     30B parameters run efficiently on M2/M3.     │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ ☑ My Mac meets these requirements           │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  [How to check your Apple Silicon model]         │
└──────────────────────────────────────────────────┘
```

**Linux Screen:**

```
┌──────────────────────────────────────────────────┐
│  🐧 Linux Requirements                           │
│                                                  │
│  Hardware:                                       │
│  ├─ NVIDIA GPU (GTX 1060 6GB+) OR               │
│  ├─ AMD GPU (ROCm compatible, MI50+) OR          │
│  ├─ Apple Silicon (Asahi Linux, experimental)    │
│  ├─ 16 GB RAM minimum                            │
│  ├─ 50 GB free disk space                        │
│  └─ Stable internet (5+ Mbps upload)             │
│                                                  │
│  Software:                                       │
│  ├─ Ubuntu 20.04+ / Debian 11+ / RHEL 8+        │
│  ├─ NVIDIA Driver 525+ / ROCm 5.4+              │
│  ├─ Docker 20.10+ (optional, recommended)        │
│  └─ Python 3.9+                                  │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ ☑ My machine meets these requirements        │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

**"Can't find your GPU?" links expand into OS-specific detection guides:**

| OS | Detection Guide |
|---|---|
| Windows | "Open Task Manager → Performance → GPU. Look for NVIDIA" |
| macOS | " Menu → About This Mac. Look for 'Chip: Apple M1/M2/M3'" |
| Linux | "Run `nvidia-smi` or `rocminfo` in terminal" |

---

### Step 3: GPU Profile — What We Detected (or Ask Them)

**Title:** "Tell Us About Your GPU"

The wizard asks the provider to identify their hardware.  
In Phase 2, the native installer will auto-detect and pre-fill this.

**GPU Selection UI:**

```
┌──────────────────────────────────────────────────┐
│  Select Your GPU                                 │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 🔍 Search: "RTX 4090"                    │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  NVIDIA                                          │
│  ├── RTX 4090 (24 GB)     ← $0.42/hr est.       │
│  ├── RTX 4080 (16 GB)     ← $0.28/hr est.       │
│  ├── RTX 3090 (24 GB)     ← $0.35/hr est.       │
│  ├── RTX 3080 (10 GB)     ← $0.18/hr est.       │
│  ├── RTX 4060 Ti (16 GB)  ← $0.15/hr est.       │
│  └── ...                                         │
│                                                  │
│  Apple Silicon                                   │
│  ├── M4 Ultra (192 GB)   ← $0.55/hr est.        │
│  ├── M3 Ultra (128 GB)   ← $0.42/hr est.        │
│  ├── M3 Max (96 GB)      ← $0.32/hr est.        │
│  ├── M2 Ultra (192 GB)  ← $0.48/hr est.        │
│  ├── M2 Max (96 GB)      ← $0.28/hr est.        │
│  ├── M1 Ultra (128 GB)  ← $0.35/hr est.        │
│  └── ...                                         │
│                                                  │
│  ☑ I have multiple GPUs  [Configure multi-GPU]   │
│                                                  │
│  ─────────────────────────────────────────────   │
│  Can't find your GPU? [Enter manually]           │
└──────────────────────────────────────────────────┘
```

**Multi-GPU expansion:**

If "I have multiple GPUs" is checked, an additional selector appears:

```
┌──────────────────────────────────────────────────┐
│  GPU #1: RTX 4090 (24 GB)         [Remove]       │
│  GPU #2: RTX 3090 (24 GB)         [Remove]       │
│  [+ Add another GPU]                            │
│                                                  │
│  Combined VRAM: 48 GB                             │
│  Combined est. earnings: $0.77/hr                │
└──────────────────────────────────────────────────┘
```

**Manual entry (for unlisted GPUs):**

```
┌──────────────────────────────────────────────────┐
│  Manual GPU Entry                                │
│                                                  │
│  Vendor:    [NVIDIA ▼] [AMD ▼] [Apple ▼]       │
│  Model:     [________________]                    │
│  VRAM/UM:   [____] GB                            │
│  GPU Count: [____]                               │
│                                                  │
│  ⚠️ Manual entries may affect estimated earnings. │
│  The daemon will verify your GPU on first run.   │
└──────────────────────────────────────────────────┘
```

**API: Register GPU Profile**

```http
POST api.dcp.sa/v1/provider/gpu-profile
Authorization: Bearer <token>
{
  "gpus": [
    {
      "vendor": "nvidia",
      "model": "rtx_4090",
      "vram_gb": 24,
      "count": 1
    }
  ],
  "detected_by": "manual_web",   // or "auto_installer" in Phase 2
  "ram_gb": 64,
  "os": "windows"
}

→ 201 {
  "profile_id": "gpu_prof_k9x2",
  "estimated_hourly_rate": 0.42,
  "estimated_monthly_rate": 302.40,
  "supported_models": ["llama-3.3-70b", "qwen-72b", "mixtral-8x22b"],
  "bandwidth_gbps": 1008
}
```

**Apple Silicon bandwidth table (NEW — fills spec gap):**

| Chip | Memory | Bandwidth | Cores | Est. $/hr |
|---|---|---|---|---|
| M1 | 8-16 GB | 68 GB/s | 7-8 | $0.08 |
| M1 Pro | 16-32 GB | 200 GB/s | 14-16 | $0.15 |
| M1 Ultra | 64-128 GB | 800 GB/s | 20-24 | $0.35 |
| M2 | 8-24 GB | 100 GB/s | 8-10 | $0.10 |
| M2 Pro | 16-32 GB | 200 GB/s | 16-19 | $0.16 |
| M2 Max | 32-96 GB | 400 GB/s | 24-30 | $0.28 |
| M2 Ultra | 64-192 GB | 800 GB/s | 24-30 | $0.48 |
| M3 | 8-24 GB | 100 GB/s | 8-10 | $0.10 |
| M3 Pro | 18-36 GB | 150 GB/s | 14-18 | $0.18 |
| M3 Max | 36-128 GB | 400 GB/s | 30-40 | $0.35 |
| M3 Ultra | 128-192 GB | 819 GB/s | 60-76 | $0.55 |
| M4 | 16-32 GB | 120 GB/s | 10 | $0.12 |
| M4 Pro | 24-48 GB | 273 GB/s | 16-20 | $0.22 |
| M4 Max | 48-128 GB | 546 GB/s | 30-40 | $0.40 |
| M4 Ultra | 128-512 GB | 819 GB/s | 60-80 | $0.65 |

*Pricing is estimated based on unified memory bandwidth as throughput proxy.  
Actual rates determined by demand, model allocation, and SLA tier.*

---

### Step 4: Earnings Preview + Configuration

**Title:** "Your Estimated Earnings"

```
┌──────────────────────────────────────────────────┐
│  💰 Earnings Preview                              │
│                                                  │
│  Your Hardware: 1x RTX 4090 (24 GB)              │
│  Availability:  ───────●────── 8 hrs/day        │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Estimated Earnings                      │    │
│  │                                          │    │
│  │  Hourly:     $0.42 / hr                  │    │
│  │  Daily:      $3.36 / day (8 hrs)         │    │
│  │  Monthly:    $100.80 / month             │    │
│  │                                          │    │
│  │  If 24/7:    $302.40 / month             │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ⚠️ Estimates based on current network demand.    │
│  Actual earnings vary with utilization.          │
│                                                  │
│  Configuration:                                  │
│  ├─ Schedule:     [Always On ▼]                  │
│  │                (Always On / Smart Hours /     │
│  │                 Custom Schedule)              │
│  ├─ Max GPU Load: [100% ──●─────]               │
│  ├─ Max VRAM:     [100% ──●─────]               │
│  └─ Power Limit:  [Default ▼]                    │
│                   (Default / 250W / 200W / Eco) │
│                                                  │
│  💡 Smart Hours = higher demand periods = more $ │
└──────────────────────────────────────────────────┘
```

**Schedule options:**

| Option | Behavior |
|---|---|
| Always On | Daemon runs whenever machine is on |
| Smart Hours | Only during peak demand (typically 6pm-2am KST) |
| Custom | Provider picks days + hours |

**Power Limit options (NVIDIA only):**

| Option | Effect |
|---|---|
| Default | No power limit applied |
| 250W | `nvidia-smi -pl 250` — reduces heat, slightly lower throughput |
| 200W | `nvidia-smi -pl 200` — significant heat reduction, ~5% perf loss |
| Eco | `nvidia-smi -pl 150` — minimal power, best for laptops |

**API: Save Configuration**

```http
POST api.dcp.sa/v1/provider/config
Authorization: Bearer <token>
{
  "schedule": "smart_hours",
  "gpu_load_max_pct": 100,
  "vram_max_pct": 100,
  "power_limit": "default",
  "timezone": "Asia/Riyadh"
}

→ 201 { "config_id": "cfg_m3v7" }
```

---

### Step 5: Install — OS-Specific Commands

**Title:** "Install DCP on Your Machine"

**This is the critical handoff.** The wizard generates an install command  
personalized with the provider's token and config.

#### Windows Screen:

```
┌──────────────────────────────────────────────────┐
│  🪟 Install on Windows                           │
│                                                  │
│  Step 1: Copy this command                       │
│  ┌──────────────────────────────────────────┐    │
│  │ powershell -ExecutionPolicy Bypass -C `   │    │
│  │   "Invoke-WebRequest -Uri                 │    │
│  │    'https://get.dcp.sa/install.ps1'      │    │
│  │    -OutFile dcp_setup.ps1; `             │    │
│  │    .\dcp_setup.ps1 -Token 'dcpt_x9k2m'"  │    │
│  └──────────────────────────────────────────┘    │
│  [📋 Copy Command]                              │
│                                                  │
│  Step 2: Open PowerShell as Administrator        │
│  (Right-click Start → Terminal (Admin))          │
│                                                  │
│  Step 3: Paste and press Enter                   │
│                                                  │
│  ────────────────────────────────────────────    │
│                                                  │
│  What the installer does:                         │
│  ✅ Installs DCP daemon to C:\DCP\               │
│  ✅ Creates Windows service (auto-start)         │
│  ✅ Adds system tray app for monitoring          │
│  ✅ Configures firewall exceptions               │
│  ✅ Verifies GPU + NVIDIA driver                 │
│  ✅ Registers with api.dcp.sa                    │
│                                                  │
│  ⚙️ Advanced: [Download .exe installer]          │
│  📦 Offline: [Download .zip (air-gapped)]        │
│                                                  │
│  [Having trouble?] [View full docs]              │
└──────────────────────────────────────────────────┘
```

#### macOS Screen:

```
┌──────────────────────────────────────────────────┐
│  🍎 Install on macOS                             │
│                                                  │
│  Option A: Terminal (fastest)                    │
│  ┌──────────────────────────────────────────┐    │
│  │ curl -fsSL https://get.dcp.sa/install.sh │    │
│  │   | sudo bash -s -- --token dcpt_x9k2m   │    │
│  └──────────────────────────────────────────┘    │
│  [📋 Copy Command]                              │
│                                                  │
│  Option B: DMG Installer                         │
│  [⬇️ Download DCP-4.0.3-macos-arm64.dmg]        │
│  (Opens like any Mac app — drag to Applications) │
│                                                  │
│  ────────────────────────────────────────────    │
│                                                  │
│  What the installer does:                         │
│  ✅ Installs DCP daemon to /usr/local/dcp/       │
│  ✅ Creates launchd agent (auto-start on login)  │
│  ✅ Adds menu bar app for monitoring             │
│  ✅ Detects Apple Silicon / GPU memory           │
│  ✅ Registers with api.dcp.sa                    │
│                                                  │
│  💡 Apple Silicon: Your Mac's unified memory     │
│     handles both CPU and AI inference. No        │
│     separate GPU needed.                         │
└──────────────────────────────────────────────────┘
```

#### Linux Screen:

```
┌──────────────────────────────────────────────────┐
│  🐧 Install on Linux                             │
│                                                  │
│  One-liner:                                      │
│  ┌──────────────────────────────────────────┐    │
│  │ curl -fsSL https://get.dcp.sa/install.sh │    │
│  │   | sudo bash -s -- --token dcpt_x9k2m   │    │
│  └──────────────────────────────────────────┘    │
│  [📋 Copy Command]                              │
│                                                  │
│  Docker (alternative):                           │
│  ┌──────────────────────────────────────────┐    │
│  │ docker run -d --gpus all \                │    │
│  │   --name dcp-daemon \                     │    │
│  │   -e DCP_TOKEN=dcpt_x9k2m \              │    │
│  │   -v /opt/dcp:/data \                     │    │
│  │   ghcr.io/dcp/daemon:latest               │    │
│  └──────────────────────────────────────────┘    │
│  [📋 Copy Docker Command]                       │
│                                                  │
│  ────────────────────────────────────────────    │
│                                                  │
│  What the installer does:                         │
│  ✅ Installs DCP daemon to /opt/dcp/            │
│  ✅ Creates systemd service (dcpd.service)      │
│  ✅ Configures udev rules for GPU access         │
│  ✅ Verifies NVIDIA/ROCm driver                  │
│  ✅ Registers with api.dcp.sa                    │
│                                                  │
│  🛠️ Manual: [View raw install script]           │
│  📦 Config: [Generate systemd unit file]        │
└──────────────────────────────────────────────────┘
```

**Token generation:**

```http
POST api.dcp.sa/v1/provider/install-token
Authorization: Bearer <token>

→ 201 { "install_token": "dcpt_x9k2m", "expires_at": "2026-04-27T22:00:00Z" }
```

Install tokens are **single-use** and expire in 7 days.  
After first daemon handshake, the token is consumed and replaced  
with a long-lived daemon API key.

---

### Step 6: Verification + Live Dashboard Link

**Title:** "Verify Your Installation"

**The wizard polls the API waiting for the daemon to phone home.**

```
┌──────────────────────────────────────────────────┐
│  🔍 Waiting for Your Daemon...                   │
│                                                  │
│  Status: ⏳ Waiting for connection               │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  ████████████░░░░░░░░  Polling...         │  │
│  │  (checking every 5 seconds)                │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Don't close this page. Once your daemon          │
│  connects, we'll verify everything automatically. │
│                                                  │
│  ────────────────────────────────────────────    │
│                                                  │
│  Troubleshooting:                                │
│  • Command didn't run? [Re-show install command]  │
│  • Error in terminal? [Common fixes]             │
│  • Taking too long? [Check firewall]             │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Daemon phones home:**

When the daemon starts, it calls:

```http
POST api.dcp.sa/v1/provider/register-node
{
  "install_token": "dcpt_x9k2m",
  "hostname": "AHMAD-PC",
  "os": "windows",
  "os_version": "10.0.19045",
  "gpu_detected": [
    {
      "vendor": "nvidia",
      "model": "RTX 4090",
      "vram_mb": 24576,
      "driver_version": "535.104.05",
      "cuda_version": "12.2"
    }
  ],
  "ram_gb": 64,
  "cpu_model": "AMD Ryzen 9 7950X",
  "daemon_version": "4.0.3"
}

→ 201 {
  "node_id": "node_q7w3",
  "api_key": "dcpk_...long_lived...",
  "status": "active",
  "websocket_url": "wss://api.dcp.sa/v1/ws/node_q7w3"
}
```

**Wizard detects the handshake and transitions:**

```
┌──────────────────────────────────────────────────┐
│  ✅ You're Live!                                 │
│                                                  │
│  Node ID:     node_q7w3                          │
│  GPU:         1x RTX 4090 (24 GB) ✓ Verified    │
│  Driver:      535.104.05 ✓                       │
│  Daemon:      v4.0.3 ✓                           │
│  Status:      🟢 Active                           │
│                                                  │
│  Your node is now earning. Current demand:        │
│  ▮▮▮▮▮▮▮▮▮▱▱▱▱▱▱ 65% utilization                │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Go to Dashboard →                       │    │
│  │  provider.dcp.sa/dashboard                │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  📱 Also available:                              │
│  • Desktop app (Tauri) — [Download for Windows]   │
│  • Telegram bot — /start @DCPProviderBot         │
│  • API docs — docs.dcp.sa                        │
│                                                  │
│  Welcome to DCP 🇸🇦                               │
└──────────────────────────────────────────────────┘
```

---

## Day 2+: Dashboard (Brief)

The web dashboard at `provider.dcp.sa/dashboard` replaces the wizard  
for ongoing monitoring. Key panels:

| Panel | Data |
|---|---|
| Live Status | Online/Offline, current workload, GPU utilization |
| Earnings | Today / This Week / This Month, payout history |
| Workload | Current model being served, tokens processed |
| Health | GPU temp, VRAM usage, driver status, uptime |
| Settings | Schedule, power limits, withdraw address |

This is a **separate page** from the wizard. The wizard's job ends at Step 6.  
The Tauri native app mirrors this dashboard plus adds system tray controls.

---

## Security Considerations

### Install Command Security

1. **Token is single-use.** Even if leaked, it can only register one node.
2. **Install script is served over HTTPS.** `get.dcp.sa` is CDN-backed.
3. **Script is auditable.**" View raw install script" link shows the source before running.
4. **No root required for daemon.** The daemon runs as `dcp` user.  
   Only the installer needs sudo to create the service.

### macOS-Specific

- The DMG is **signed + notarized** with an Apple Developer ID.
- Gatekeeper will show "verified developer" prompt, not "unidentified developer."
- The menu bar app is sandboxed — it only talks to the daemon via localhost:8732.

### Windows-Specific

- The PowerShell script checks `ExecutionPolicy` and self-elevates if needed.
- The installer adds a Windows Firewall rule for `C:\DCP\dcp-daemon.exe`.
- The tray app is signed with an EV code signing certificate (SmartScreen compliant).

---

## API Endpoint Summary

All endpoints under `api.dcp.sa/v1`:

| Endpoint | Method | Purpose | Auth |
|---|---|---|---|
| `/auth/register` | POST | Create account | None |
| `/auth/login` | POST | Sign in | None |
| `/provider/eligibility` | GET | Check if account can onboard | Bearer |
| `/provider/gpu-profile` | POST | Register GPU hardware | Bearer |
| `/provider/config` | POST | Save schedule/preferences | Bearer |
| `/provider/install-token` | POST | Generate one-time install token | Bearer |
| `/provider/register-node` | POST | Daemon handshake on first run | Install Token |
| `/provider/node-status` | GET | Poll daemon status (for wizard Step 6) | Bearer |
| `/provider/earnings` | GET | Earnings summary | Bearer |

---

## Implementation Notes

### Frontend

- **Next.js 14** with App Router (server components for API calls, client components for wizard UI)
- **shadcn/ui** for all form elements, dialogs, toasts
- **Framer Motion** for step transitions (slide right/left)
- **Zustand** for wizard state (persisted to localStorage so refresh doesn't lose progress)
- **Arabic i18n** ready (RTL layout support via `dir="rtl"` on `<html>`)
- **Dark mode** by default (fits the DCP brand)

### Wizard State Machine

```typescript
type WizardStep = 
  | 'welcome'        // Step 1
  | 'requirements'   // Step 2
  | 'gpu-profile'   // Step 3
  | 'earnings'      // Step 4
  | 'install'       // Step 5
  | 'verification'  // Step 6
  | 'complete';     // Done

interface WizardState {
  step: WizardStep;
  os: DetectedOS;
  authToken: string | null;
  userId: string | null;
  gpuProfileId: string | null;
  configId: string | null;
  installToken: string | null;
  nodeId: string | null;
  daemonConnected: boolean;
}
```

### Polling Logic (Step 6)

```typescript
// Poll every 5s, up to 5 minutes, then show "check manually" fallback
async function waitForDaemon(token: string): Promise<NodeStatus> {
  const maxAttempts = 60; // 5 min / 5s
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch('/api/provider/node-status', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.node_id) return data;
    await sleep(5000);
  }
  throw new Error('TIMEOUT');
}
```

### Phase 2: Auto-Detect in Browser

Future enhancement — use **WebGPU API** to detect GPU in the browser:

```javascript
if (navigator.gpu) {
  const adapter = await navigator.gpu.requestAdapter();
  // adapter.info.vendor, adapter.info.architecture, adapter.info.device
  // Pre-fill Step 3 automatically
}
```

This works in Chrome 113+ and removes the need for manual GPU selection  
for most NVIDIA/AMD users. Apple Silicon detection still needs  
the manual selector (WebGPU doesn't report Apple chip tier).

---

## Build Order

| Phase | Deliverable | Sprint | Notes |
|---|---|---|---|
| **1a** | Steps 1-5 (browser wizard) | 1 week | Core flow, all OS |
| **1b** | Step 6 (verification polling) | 2 days | Daemon handshake |
| **1c** | Arabic i18n | 2 days | RTL layout |
| **2** | Web dashboard (Day 2+) | 1 week | Earnings, health, settings |
| **3** | Windows Tauri tray app | 1 week | Fadi leads |
| **4** | macOS Tauri tray app | 3 days | Shared backend with Windows |
| **5** | WebGPU auto-detect | 3 days | Chrome 113+ only |

**Total: ~4 weeks to full cross-platform onboarding + dashboard.**