# DCP Windows Installer -- Comprehensive UX Design Document

**Version:** 1.0
**Date:** 2026-04-12
**Author:** UI Designer Agent
**Status:** Design proposal

---

## Table of Contents

1. [Competitive Analysis](#1-competitive-analysis)
2. [Technology Recommendation](#2-technology-recommendation)
3. [Installation Flow -- Screen by Screen](#3-installation-flow)
4. [System Tray Application Design](#4-system-tray-application-design)
5. [First-Run Experience](#5-first-run-experience)
6. [Visual Design Specification](#6-visual-design-specification)
7. [Design Token System](#7-design-token-system)
8. [Accessibility & Localization](#8-accessibility--localization)
9. [MVP vs Full-Featured Scope](#9-mvp-vs-full-featured-scope)
10. [Implementation Timeline](#10-implementation-timeline)

---

## 1. Competitive Analysis

### Competitor Matrix

| Feature | Salad.ai | NiceHash | Parsec | Discord | Vast.ai | io.net | Folding@Home | DCP (Current) |
|---|---|---|---|---|---|---|---|---|
| **Installer Tech** | Electron (custom) | .NET/WPF (custom) | Electron + Squirrel | Electron + Squirrel | CLI / WSL script | Docker-based | NSIS (classic) | NSIS 2.3 |
| **Clicks to Running** | 3-4 | 5-6 | 3 | 2 | 10+ (CLI) | 8+ (Docker setup) | 3-4 | 7+ (PowerShell) |
| **GPU Detection** | Auto (WSL2 probe) | Auto (benchmark) | N/A | N/A | Manual (nvidia-smi) | Manual (Docker GPU) | Auto (slot config) | nvidia-smi parse |
| **Run on Startup** | Built-in toggle | Built-in toggle | Default on | Default on | N/A (server) | Service | Windows service | Scheduled task |
| **System Tray** | Full app (earnings, GPU stats) | Full app (hashrate, temp) | Persistent (connections) | Persistent | None (web UI) | None (web UI) | System tray icon | Python/pystray |
| **Auto-Update** | Silent | Silent | Squirrel (silent) | Squirrel (silent) | N/A | Manual | Manual | None |
| **Admin Required** | No (WSL setup may) | No | No | No | Yes (Docker) | Yes (Docker) | No | No |
| **First-Run Wizard** | Onboarding + benchmarks | Account + benchmark | Login only | Login only | None | Hardware verify | Team/user config | API key + mode |
| **Earnings Display** | Real-time in tray | Real-time in tray | N/A | N/A | Web dashboard | Web dashboard | Work units | Dashboard link |
| **Download Size** | ~120 MB | ~80 MB | ~15 MB | ~100 MB | ~5 KB (script) | ~2 KB (script) | ~5 MB | ~800 KB |
| **Install Time** | 30-60s | 30-45s | 10-15s | 15-20s | 5-30 min (Docker) | 10-30 min | 20-30s | 2-5 min |

### Detailed Competitor Analysis

#### Salad.ai -- The Gold Standard for GPU Sharing

**What makes it great:**
- The desktop app IS the product. No separate installer and tray app -- it is one cohesive Electron application that handles everything: onboarding, GPU detection, workload management, earnings tracking.
- New machine onboarding screen shows expected demand and earning estimates before the user commits, reducing anxiety about "is this worth it?"
- Automatically detects missing Windows features (WSL2, GPU drivers) and guides the user through fixing them inline rather than failing with an error.
- RAM allocation warnings appear proactively when the container environment is suboptimal.
- Earnings are gamified: gift cards, Steam credit, PayPal cash -- tangible rewards, not abstract "credits."

**What to steal:**
- Inline prerequisite detection and guided fix flows
- Earnings estimation during onboarding (before the user has earned anything)
- Single application architecture: installer + tray + dashboard = one app

**What to avoid:**
- Windows-only limitation (acceptable for DCP's current scope)
- WSL2 dependency adds complexity and failure points

#### NiceHash -- Battle-Tested for Gamers

**What makes it great:**
- One-click benchmarking after install automatically finds the optimal algorithm for each GPU. The user never needs to understand what they are running.
- Built-in temperature control and performance throttling prevent hardware damage -- critical for convincing gamers their expensive GPU is safe.
- Mining address (equivalent to API key) is retrieved automatically after login rather than requiring manual copy-paste.
- Profitability calculator on the website pre-qualifies leads before download.

**What to steal:**
- Auto-benchmark to determine optimal workload assignment
- Hardware safety features (temp limits, throttling) prominently displayed
- Profitability calculator on the download page

**What to avoid:**
- Crypto-adjacent reputation and trust issues
- Complex algorithm switching UI confuses non-technical users

#### Parsec -- The "Just Works" Installer

**What makes it great:**
- Installs in under 15 seconds. Download is ~15 MB. The installer is invisible -- download, double-click, done.
- No wizard, no pages, no configuration. It installs, shows a login screen, and you are using the product.
- Per-user install (no admin) is the default, just like DCP's current approach.

**What to steal:**
- Speed and simplicity as design principles
- Per-user install as default (already matching)
- The installer should feel like it takes zero effort

**What to avoid:**
- Too minimal for DCP's use case (GPU sharing needs setup and trust-building)

#### Discord -- The Reference Implementation

**What makes it great:**
- 2 clicks from download to running: download .exe, run it. No Next/Next/Next wizard.
- Uses Electron + Squirrel.Windows for silent background updates. The user never sees an update prompt.
- The app installs to %LOCALAPPDATA% (per-user, no admin), identical to DCP's current approach.
- First run goes straight to the product experience (login/registration) with no installer chrome.

**What to steal:**
- Squirrel-style silent auto-updates
- Zero-config installation (sensible defaults for everything)
- Going straight to the value proposition after install

**What to avoid:**
- Discord's approach works because there is nothing to configure. DCP requires GPU setup, API keys, and model selection -- a wizard is necessary.

#### Vast.ai -- The Cautionary Tale

**What is terrible:**
- Provider setup requires WSL, Ubuntu, NVIDIA drivers, Docker, port forwarding, and CLI commands. It is a 10+ step manual process.
- Windows support is an afterthought; the primary target is Linux servers.
- No desktop application -- everything is managed through a web dashboard.
- Identity verification adds friction before a provider can even test the platform.

**What to learn:**
- DCP has a massive competitive advantage by offering a real Windows installer
- The "lightweight client that gets you on the marketplace in minutes" messaging is aspirational but Vast.ai does not deliver it for Windows users
- Provider-set pricing is a nice feature but adds complexity to onboarding

#### io.net -- The Docker Dependency Problem

**What is problematic:**
- Requires Docker Desktop + CUDA + NVIDIA drivers to be pre-installed
- If the GPU is not detected during Docker probe, setup fails with no recovery path
- 12-hour validation period before the node goes live -- huge psychological barrier
- The "IO Worker" app exists but is secondary to the Docker infrastructure

**What to learn:**
- DCP's bare-metal execution fallback (when Docker is unavailable) is a genuine advantage
- Validation periods kill momentum; DCP should show activity immediately
- Temperature and power consumption tracking in the worker app is a good feature

#### Folding@Home -- The Original Distributed Computing UX

**What makes it relevant:**
- Proved that millions of non-technical users will donate GPU time if onboarding is simple enough
- Standard Windows installer (NSIS), 3 clicks, auto-detects GPU, auto-configures slots
- System tray with simple status (folding/paused/idle) -- no overwhelming dashboards
- "Team" concept creates community and competition

**What to steal:**
- Simplicity of the tray icon states (3 states is enough for quick glance)
- Auto-configuration of GPU slots without requiring user knowledge
- Community/team leaderboard concept for provider engagement

---

## 2. Technology Recommendation

### Option Comparison

| Technology | Bundle Size | Native Feel | Custom UI | GPU Access | Auto-Update | Dev Effort | Windows 10/11 |
|---|---|---|---|---|---|---|---|
| **NSIS (current)** | ~800 KB | Windows classic | Very limited | nvidia-smi | None | Low | Yes |
| **Inno Setup** | ~300 KB | Windows classic+ | Limited but better | nvidia-smi | None | Low | Yes |
| **WiX/MSI** | ~200 KB | Enterprise native | None | nvidia-smi | MSI patch | Medium | Yes |
| **Electron** | ~120 MB | Web-rendered | Full control | Node child_process | Squirrel | Medium | Yes |
| **Tauri 2.0** | ~5-8 MB | WebView2 native | Full control | Rust sidecar | Built-in | Medium-High | Yes (WebView2) |
| **WinUI 3 / WPF** | ~15-25 MB | True native | Full control (.NET) | P/Invoke / WMI | MSIX | High | Yes |

### Recommendation: Tauri 2.0 -- Installer + Tray App as One Application

**Primary choice: Tauri 2.0 with a web frontend (React/Svelte) and Rust backend.**

Rationale:

1. **Size advantage.** A complete Tauri app (installer wizard + system tray + status dashboard) ships at 5-8 MB. Electron equivalent: 120+ MB. For a provider app that users download from a marketplace website, download size directly impacts conversion. Every MB matters.

2. **Performance.** Tauri apps launch in under 500ms. Electron apps take 1-2 seconds. The tray app will be running 24/7 on gamers' PCs -- low memory footprint (~30-40 MB vs ~200+ MB for Electron) means users do not complain about resource usage.

3. **Security.** Tauri's Rust backend enforces a permission system where the frontend can only access system APIs explicitly whitelisted. For an app that has GPU access and API keys, this is a meaningful security posture. The attack surface is narrower than Electron's Node.js bridge.

4. **GPU integration.** Tauri's sidecar system lets us bundle `nvidia-smi` calls and GPU monitoring through Rust's `std::process::Command` or the `nvml-wrapper` crate (NVIDIA Management Library bindings for Rust). This provides direct GPU telemetry (temperature, utilization, VRAM, driver version, clock speeds) without shelling out to nvidia-smi repeatedly.

5. **Auto-update.** Tauri 2.0 has a built-in updater plugin that supports Windows (uses the platform's native mechanisms). Silent background updates, exactly like Discord/Salad.

6. **WebView2 dependency.** Tauri uses Microsoft Edge WebView2, which is pre-installed on Windows 10 (version 1803+) and all Windows 11 machines. No bundled browser engine. The DCP target audience (gamers with current GPUs) will have Windows 10/11 with Edge already present.

7. **Ecosystem maturity.** Tauri 2.0 (released late 2024) has 120+ plugins, 25,000+ Discord community members, and production use by apps like Cody (Sourcegraph), Spacedrive, and others. It is no longer experimental.

8. **Team alignment.** DCP's frontend is Next.js/React. Tauri's frontend is any web technology. The same React components (with design tokens from the DCP design system) can power both the website and the desktop app. No new UI framework to learn.

**Fallback choice: Inno Setup (for the MSP scope only)**

If Tauri is too much engineering investment for the immediate term, use Inno Setup to replace the current NSIS installer. Inno Setup provides a prettier wizard, Pascal-based scripting that is more readable, and a built-in GUI editor. Keep the Python-based tray app (`dcp_tray_windows.py`) but bundle it as a PyInstaller .exe to eliminate the Python dependency.

### Architecture: Single Application, Two Modes

```
dcp-provider.exe (Tauri app, ~6 MB)
    |
    +-- Mode 1: SETUP WIZARD
    |   Runs on first launch or when --setup flag is passed.
    |   Full-window UI: Welcome > GPU Check > Account > Settings > Install > Done
    |
    +-- Mode 2: SYSTEM TRAY
    |   Runs on subsequent launches and at Windows startup.
    |   Tray icon + popup status window + settings panel
    |
    +-- Rust Backend (sidecar)
        - GPU monitoring via NVML
        - Daemon process management (start/stop/restart)
        - Heartbeat to api.dcp.sa
        - Config file management
        - Auto-updater
```

This mirrors the Salad.ai approach: one download, one app, does everything. No separate installer and tray application.

---

## 3. Installation Flow

### Pre-Install: The Download Page (dcp.sa/provider)

Before the user downloads anything, the website must do three things: qualify the lead, set earnings expectations, and make the download feel safe.

**Layout:**

```
+------------------------------------------------------------------+
| [DCP Logo]                                    [Login] [Dashboard] |
+------------------------------------------------------------------+
|                                                                   |
|  EARN WITH YOUR GPU                                               |
|  Turn your gaming PC into a passive income machine.               |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |  EARNINGS CALCULATOR                                        |  |
|  |                                                             |  |
|  |  Select your GPU: [RTX 4090 v]                              |  |
|  |  Hours per day:   [====O========] 8 hours                   |  |
|  |                                                             |  |
|  |  Estimated monthly earnings:                                |  |
|  |                                                             |  |
|  |      SAR 450 - 680 / month                                  |  |
|  |      ($120 - $181 USD)                                      |  |
|  |                                                             |  |
|  |  Based on current network demand and RTX 4090 pricing.      |  |
|  +------------------------------------------------------------+  |
|                                                                   |
|  [  Download for Windows  ]  (6 MB, no admin required)            |
|  Windows 10/11 | NVIDIA GPU required | v3.3.0                    |
|                                                                   |
|  Trusted by 43 providers across Saudi Arabia                      |
|  Verified by [Norton/VirusTotal badge]                            |
|                                                                   |
+------------------------------------------------------------------+
```

**Key design decisions:**
- Earnings calculator is above the download button. The user sees the value before committing.
- Download size is stated explicitly ("6 MB") to set expectations. Compare to Salad at 120 MB.
- "No admin required" reduces anxiety about system modification.
- Norton/VirusTotal badge addresses the primary concern: "is this safe?"
- GPU dropdown pre-qualifies leads (if they do not have an NVIDIA GPU, tell them before download)

---

### Screen 1: Splash / Welcome

**Trigger:** User double-clicks `dcp-provider.exe` for the first time.

```
+------------------------------------------------------------------+
|                        [DCP Logo + Infinity]                      |
|                                                                   |
|              Decentralized Compute Platform                       |
|              Provider Setup v3.3.0                                |
|                                                                   |
|  ---------------------------------------------------------------- |
|                                                                   |
|  Your GPU earns money while you sleep, game, or work.             |
|  DCP connects your NVIDIA GPU to AI workloads and pays you        |
|  in SAR for every computation it runs.                            |
|                                                                   |
|  What happens during setup:                                       |
|    1. We detect your GPU and verify compatibility                 |
|    2. You connect your DCP account                                |
|    3. You choose your preferences                                 |
|    4. Your GPU starts earning                                     |
|                                                                   |
|  Takes about 2 minutes. No admin privileges needed.               |
|                                                                   |
|                                      [Get Started ->]             |
|                                                                   |
+------------------------------------------------------------------+
```

**Design notes:**
- Dark navy (#0D1B2A) background, white text, teal accent on the CTA button
- DCP infinity gradient logo at top, centered
- The four steps set expectations for how long this will take
- Single CTA button -- no "Cancel" on the first screen (close button in title bar suffices)
- Subtle animation: infinity symbol pulses gently (2s ease-in-out opacity cycle)

---

### Screen 2: GPU Detection

**Trigger:** Automatic, as soon as the user clicks "Get Started."

This screen runs GPU detection in the background and shows results in real-time.

```
+------------------------------------------------------------------+
|  GPU Detection                                         [X close]  |
|  ================================================================ |
|                                                                   |
|  [Scanning...]  (animated progress indicator)                     |
|                                                                   |
|  -- Transitions to: --                                            |
|                                                                   |
|  [Checkmark Icon]  GPU DETECTED                                   |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |                                                             |  |
|  |  GPU Model     NVIDIA GeForce RTX 4070 Ti SUPER            |  |
|  |  VRAM          16,384 MB (16 GB)                            |  |
|  |  Driver        560.94                                       |  |
|  |  CUDA          12.6                                         |  |
|  |  Temperature   42 C (idle)                                  |  |
|  |  Status        Compatible -- Ready for DCP                  |  |
|  |                                                             |  |
|  +------------------------------------------------------------+  |
|                                                                   |
|  Estimated earnings for RTX 4070 Ti SUPER:                        |
|  SAR 280 - 420 / month (at 8 hrs/day)                             |
|                                                                   |
|  [<- Back]                                    [Continue ->]       |
|                                                                   |
+------------------------------------------------------------------+
```

**States:**

1. **Scanning** -- Animated spinner, "Detecting NVIDIA GPU..." text. Takes 1-3 seconds.

2. **GPU Found** (happy path) -- Green checkmark, GPU specs card, earnings estimate. The Status line says "Compatible" in teal. Continue button is enabled.

3. **GPU Found but Low VRAM** (<6GB) -- Orange warning icon. Status says "Limited compatibility -- some models may not fit in your VRAM." Continue is still enabled but shows a note: "You can still earn with smaller models."

4. **No GPU Found** -- Red X icon. Status says "No NVIDIA GPU detected." Shows troubleshooting:
   - "NVIDIA drivers may not be installed"
   - "Your GPU may not be NVIDIA (AMD/Intel GPUs are not yet supported)"
   - Link: "Download NVIDIA drivers" (opens nvidia.com/download)
   - Continue button becomes "Continue Anyway" with a warning that the daemon may not function.

5. **Outdated Drivers** -- Orange warning. "Your NVIDIA driver (version 450.xx) is outdated. DCP works best with driver 525+." Link to update. Continue still enabled.

**Implementation:**
- Rust backend calls NVML (NVIDIA Management Library) directly for fast, reliable GPU detection
- Fallback to `nvidia-smi --query-gpu=name,memory.total,driver_version,temperature.gpu --format=csv,noheader,nounits`
- Earnings estimate pulled from api.dcp.sa/api/pricing/estimate?gpu=RTX4070TiSUPER (live data, cached for 1 hour)

---

### Screen 3: Account Connection

**Trigger:** User clicks Continue from GPU Detection.

Two paths: new user (sign up) or returning user (paste API key).

```
+------------------------------------------------------------------+
|  Connect Your Account                                  [X close]  |
|  ================================================================ |
|                                                                   |
|  [Tab: New Account]  [Tab: Existing Account]                      |
|                                                                   |
|  -- NEW ACCOUNT TAB --                                            |
|                                                                   |
|  Enter your email to create a DCP provider account:               |
|                                                                   |
|  Email:  [____________________________]                           |
|                                                                   |
|  [Create Account & Get API Key]                                   |
|                                                                   |
|  We will send you a verification code.                            |
|  No password needed -- DCP uses magic link authentication.        |
|                                                                   |
|  -- EXISTING ACCOUNT TAB --                                       |
|                                                                   |
|  Paste your Provider API Key:                                     |
|                                                                   |
|  API Key:  [dc1-provider-________________________]                |
|                                                                   |
|  Find your key at dcp.sa/provider/settings                        |
|                                                                   |
|  [Validate Key]                                                   |
|                                                                   |
|  [<- Back]                                    [Continue ->]       |
|                                                                   |
+------------------------------------------------------------------+
```

**New Account flow:**
1. User enters email
2. App calls `POST api.dcp.sa/api/providers/register` with email + GPU info
3. Supabase sends magic link / OTP code to email
4. User enters the 6-digit code in the app
5. App receives API key, stores it securely in Windows Credential Manager
6. Continue button enables

**Existing Account flow:**
1. User pastes API key (format: `dc1-provider-XXXXXXXXXX`)
2. App calls `GET api.dcp.sa/api/providers/me?key=XXX` to validate
3. If valid: shows provider name, green checkmark, Continue enables
4. If invalid: red error "This API key is not recognized. Check your email or create a new account."

**Key design decision:** The API key is stored in Windows Credential Manager (via Tauri's `tauri-plugin-store` with encryption), never in a plain text config file. This is a security improvement over the current `config.json` approach.

---

### Screen 4: Configuration

**Trigger:** User clicks Continue from Account Connection.

This replaces the separate "Run Mode" and "Schedule" pages from the current NSIS installer with a single, richer configuration screen.

```
+------------------------------------------------------------------+
|  Configuration                                         [X close]  |
|  ================================================================ |
|                                                                   |
|  WHEN SHOULD YOUR GPU EARN?                                       |
|                                                                   |
|  (*) Always On (recommended)                                      |
|      GPU earns whenever your PC is on and idle.                   |
|      DCP automatically pauses when you game or use GPU apps.      |
|                                                                   |
|  ( ) Scheduled                                                    |
|      Set specific hours: [23:00] to [07:00]                       |
|      Ideal for overnight earning.                                 |
|                                                                   |
|  ( ) Manual                                                       |
|      You start and stop earning from the tray icon.               |
|                                                                   |
|  ---------------------------------------------------------------- |
|                                                                   |
|  GPU USAGE LIMIT                                                  |
|                                                                   |
|  Maximum GPU utilization:  [========O==] 80%                      |
|  Reserves 20% for your other applications.                        |
|                                                                   |
|  Temperature limit:        [=======O===] 83 C                     |
|  DCP will throttle if your GPU exceeds this temperature.          |
|  (Your GPU's thermal limit: 90 C)                                 |
|                                                                   |
|  ---------------------------------------------------------------- |
|                                                                   |
|  STARTUP                                                          |
|                                                                   |
|  [x] Start DCP when Windows starts                                |
|  [x] Minimize to system tray on startup                           |
|                                                                   |
|  [<- Back]                                    [Continue ->]       |
|                                                                   |
+------------------------------------------------------------------+
```

**Design notes:**
- "Always On" is pre-selected and recommended because it maximizes earnings
- The "auto-pause when gaming" note under Always On is critical -- it resolves the primary concern gamers have
- GPU usage slider defaults to 80% (not 100%) to leave headroom
- Temperature limit defaults to 83C (conservative, well below typical thermal throttle points)
- The slider shows the GPU's actual thermal limit for reference
- Both checkboxes default to checked
- Schedule inputs only appear (expand with animation) when "Scheduled" is selected

**What is intentionally absent:**
- Engine selection (vLLM vs Ollama). This should be fully automatic. The daemon selects the optimal engine based on the GPU's VRAM and available models. Exposing this to a gamer is confusing and unnecessary. Power users can override in the config file.
- Model selection. Also automatic. The daemon registers with the API, and the API assigns the most profitable model that fits in the GPU's VRAM. Showing model selection during install adds cognitive load with no benefit to the average user. Model preferences can be changed later in the tray app settings.

---

### Screen 5: Installation Progress

**Trigger:** User clicks Continue from Configuration.

```
+------------------------------------------------------------------+
|  Setting Up                                            [X close]  |
|  ================================================================ |
|                                                                   |
|  [====================                    ] 52%                   |
|                                                                   |
|  [check] Validating GPU compatibility                             |
|  [check] Connecting to DCP network                                |
|  [spin]  Registering provider with api.dcp.sa                     |
|  [ ]     Configuring daemon service                               |
|  [ ]     Starting DCP Provider daemon                             |
|  [ ]     Verifying first heartbeat                                |
|                                                                   |
|  Current step: Registering your RTX 4070 Ti SUPER with the        |
|  DCP network. This tells the marketplace your GPU is available.   |
|                                                                   |
|  ---------------------------------------------------------------- |
|                                                                   |
|  TIP: DCP auto-pauses when it detects a fullscreen game or        |
|  GPU-intensive application. Your gaming experience is protected.  |
|                                                                   |
+------------------------------------------------------------------+
```

**Progress steps and what actually happens:**

1. **Validating GPU compatibility** (2s) -- Confirms NVML connection, reads GPU capabilities, checks VRAM
2. **Connecting to DCP network** (1-3s) -- Tests connectivity to api.dcp.sa, measures latency
3. **Registering provider** (2-5s) -- `POST /api/providers/register` or `PUT /api/providers/gpu-update` with GPU specs
4. **Configuring daemon service** (1-2s) -- Writes config to `%LOCALAPPDATA%\DCP\config.json`, sets up Windows scheduled task or service
5. **Starting DCP Provider daemon** (2-3s) -- Launches the daemon process, waits for initialization
6. **Verifying first heartbeat** (3-10s) -- Waits for the daemon to successfully heartbeat to the API and receive confirmation

**Design notes:**
- Each completed step gets a teal checkmark
- Active step has an animated spinner
- Progress bar moves smoothly (not jumping) to indicate real progress
- Description text below the checklist explains what the current step does in plain language
- Rotating tips appear at the bottom (gaming pause, earnings info, safety features)
- If any step fails, the progress stops and shows a clear error with a "Retry" button and a "View Log" link

---

### Screen 6: Completion -- "You're Earning"

**Trigger:** First heartbeat verified successfully.

```
+------------------------------------------------------------------+
|                                                                   |
|              [Animated Checkmark -- teal circle]                  |
|                                                                   |
|              You're all set.                                      |
|              Your GPU is now earning.                             |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |                                                             |  |
|  |  GPU           RTX 4070 Ti SUPER (16 GB)                    |  |
|  |  Status        Online -- Awaiting first job                 |  |
|  |  Estimated     SAR 280 - 420 / month                        |  |
|  |  Mode          Always On (auto-pauses for games)            |  |
|  |  Daemon        v3.3.0 (auto-updating)                       |  |
|  |                                                             |  |
|  +------------------------------------------------------------+  |
|                                                                   |
|  What happens next:                                               |
|  - DCP assigns AI workloads to your GPU automatically             |
|  - You earn SAR for every computation                             |
|  - The tray icon shows your status (look for the DCP icon         |
|    near your clock)                                               |
|  - Right-click the tray icon for options                          |
|                                                                   |
|  [Open Dashboard]              [Close -- Minimize to Tray]        |
|                                                                   |
+------------------------------------------------------------------+
```

**Design notes:**
- The animated checkmark is a satisfying moment -- a circle draws itself, then the check draws inside it, teal (#00E5C8) on navy
- Status says "Awaiting first job" (honest), not "Earning!" (premature)
- "Open Dashboard" is the primary CTA (teal button) linking to dcp.sa/provider
- "Close" is the secondary CTA -- it minimizes to tray rather than quitting
- The tray icon callout ("look near your clock") with a small arrow/illustration helps users find the tray icon, which many users overlook

**Post-completion behavior:**
- The setup wizard window closes
- The tray icon appears in the Windows notification area
- A Windows toast notification appears: "DCP Provider is running. Your RTX 4070 Ti SUPER is ready to earn."
- If the user selected "Start with Windows," a startup entry is created

---

## 4. System Tray Application Design

### Tray Icon Design

The tray icon uses the DCP infinity symbol at 16x16 px (Windows standard tray icon size) with color states:

| State | Icon Description | Tooltip Text |
|---|---|---|
| **Idle** | Infinity symbol in white outline on transparent | "DCP -- Idle, waiting for jobs" |
| **Working** | Infinity symbol filled with teal-to-orange gradient, subtle pulse animation | "DCP -- Processing job (RTX 4070 Ti)" |
| **Paused** | Infinity symbol in gold/amber | "DCP -- Paused (gaming detected)" |
| **Error** | Infinity symbol in red | "DCP -- Error: connection lost" |
| **Updating** | Infinity symbol with rotating arrows overlay | "DCP -- Updating to v3.4.0..." |
| **Offline** | Infinity symbol in grey, low opacity | "DCP -- Offline" |

**Icon rendering:** The icon is rendered at 16x16, 20x20, 24x24, and 32x32 px for Windows DPI scaling. SVG source is rasterized to ICO format at build time. The infinity symbol is recognizable even at 16px because of its distinctive shape.

### Right-Click Context Menu

```
+-----------------------------------+
|  DCP Provider v3.3.0              |
|  -------------------------------- |
|  Status: Online -- Working        |
|  GPU: RTX 4070 Ti SUPER           |
|  Earnings today: SAR 4.20         |
|  -------------------------------- |
|  Open Status Window          Ctrl+D|
|  Open Dashboard (web)             |
|  -------------------------------- |
|  Pause Earning                    |
|  Resume Earning            (grey) |
|  -------------------------------- |
|  Settings...                      |
|  View Logs                        |
|  Check for Updates                |
|  -------------------------------- |
|  Quit DCP Provider                |
+-----------------------------------+
```

**Menu design notes:**
- Top section is informational (not clickable, styled as disabled/dim text)
- "Earnings today" updates in real-time from the daemon
- "Pause Earning" and "Resume Earning" are mutually exclusive (one is greyed)
- "Settings..." opens the settings panel (same Tauri window, settings view)
- "View Logs" opens the log file in Notepad
- "Quit" fully exits (stops daemon and removes tray icon). A confirmation dialog appears: "Quitting will stop your GPU from earning. Are you sure?"

### Status Popup Window

Clicking the tray icon (left-click) opens a compact popup anchored to the tray, similar to the Windows Volume mixer or Bluetooth popup.

```
+-------------------------------------------+
|  DCP Provider                    [Gear] X |
|  ========================================= |
|                                            |
|  [GPU ICON]  RTX 4070 Ti SUPER             |
|              16 GB VRAM | Driver 560.94    |
|                                            |
|  STATUS     Online -- Processing job       |
|  UPTIME     14h 32m today                  |
|  TEMP       67 C  [=======---] 83 C max    |
|  GPU LOAD   78%   [========--]             |
|  VRAM USED  12.4 / 16.0 GB                |
|                                            |
|  ========================================= |
|                                            |
|  EARNINGS                                  |
|                                            |
|      Today        SAR 4.20                 |
|      This week    SAR 28.50                |
|      This month   SAR 112.80              |
|      All time     SAR 1,847.30            |
|                                            |
|  ========================================= |
|                                            |
|  RECENT JOBS                               |
|                                            |
|  [teal dot] Llama-3.1-8B inference  2m ago |
|  [teal dot] Qwen-2.5-7B inference  18m ago |
|  [grey dot] Nemotron-Nano-4B       1h ago  |
|                                            |
|  ========================================= |
|                                            |
|  [  Pause  ]    [ Open Dashboard ]         |
|                                            |
+-------------------------------------------+
```

**Window dimensions:** 340px wide x 520px tall (compact, does not feel like a full application).

**Design notes:**
- Dark navy background (#0D1B2A), consistent with brand
- Temperature bar changes color: teal (< 70C), gold (70-80C), orange (80-85C), red (> 85C)
- Earnings section uses Inter Bold for the SAR amounts, making them visually prominent
- Recent jobs show model name and time ago, with colored dots (teal = success, orange = in progress, grey = completed)
- Gear icon opens full settings panel
- X closes the popup (does not quit the app)
- The popup animates in from the tray (slide up, 200ms ease)

### Notification Design

Notifications use Windows native toast notifications (via Tauri's notification plugin) for maximum compatibility and user trust.

**Notification types and frequency:**

| Event | Title | Body | Frequency |
|---|---|---|---|
| First job completed | "First earnings!" | "Your RTX 4070 Ti just completed its first job. SAR 0.12 earned." | Once ever |
| Earnings milestone | "Earnings milestone" | "You've earned SAR 100 total! Keep your GPU running to earn more." | At SAR 10, 50, 100, 500, 1000 |
| GPU too hot | "Temperature warning" | "GPU at 87C. DCP has throttled to protect your hardware." | Max 1 per hour |
| Connection lost | "Connection issue" | "Cannot reach api.dcp.sa. Will retry automatically." | Max 1 per 4 hours |
| Auto-paused for game | "Paused for gaming" | "Detected [Game Name]. DCP paused. Will resume when you're done." | Max 1 per gaming session |
| Auto-resumed | "Back to earning" | "Gaming session ended. GPU is earning again." | Max 1 per resume |
| Update installed | "Updated to v3.4.0" | "DCP Provider updated. No action needed." | Per update |
| Daily summary | "Daily earnings" | "Your GPU earned SAR 14.20 yesterday (12.5 hours active)." | Once daily at 9 AM |

**Notification philosophy:**
- Positive reinforcement (earnings milestones) early and often, then tapering
- Warnings only when actionable (temperature, connection)
- Gaming detection notifications only on first occurrence per session
- Daily summary at 9 AM so the user sees it when they start their day
- All notifications respect Windows Focus Assist / Do Not Disturb

---

## 5. First-Run Experience

### What Happens at First PC Boot After Install

1. **Windows starts.** DCP Provider launches silently (tray icon appears, no window).
2. **Daemon starts.** Connects to api.dcp.sa, sends heartbeat with GPU specs.
3. **No notification immediately.** Wait 5 minutes before any notification to avoid being annoying during boot.
4. **After 5 minutes:** If a job has been assigned, show a gentle notification: "DCP is running. Your GPU is earning."
5. **If no job yet:** No notification. Silence is better than "still waiting."

### Gaming Detection and Auto-Pause

The Rust backend monitors running processes and GPU utilization:

1. **Process detection:** Maintains a list of known game executables (steam_game.exe, etc.) and checks the active process list every 10 seconds.
2. **GPU utilization spike:** If GPU utilization exceeds 90% from a non-DCP process, assume the user is doing something GPU-intensive.
3. **Fullscreen detection:** Check if any window is in exclusive fullscreen mode.
4. **On detection:** Immediately pause the DCP workload (gracefully terminate current inference, do not accept new jobs). Show a toast notification: "Paused for gaming."
5. **On game exit:** Wait 60 seconds after GPU utilization drops below 20% (debounce to avoid flapping), then resume DCP workloads. Show: "Back to earning."

### Earnings Display Strategy

**First 24 hours:** The status popup shows "Estimated earnings" based on GPU model and network demand, clearly labeled as estimates. Once the first real job completes, switch to actual earnings.

**First week:** Show daily earnings prominently. The daily summary notification at 9 AM reinforces the value proposition during the critical retention window.

**After first week:** Shift to weekly and monthly totals. Daily granularity becomes noise.

**Payout visibility:** Show a "Next payout" field in the status popup once the provider reaches the minimum payout threshold. Display the threshold and progress toward it.

---

## 6. Visual Design Specification

### Color Palette (Design Tokens)

All colors derived from the approved DCP Brand Guidelines v1.

```css
:root {
  /* Brand Colors */
  --dcp-navy:           #0D1B2A;
  --dcp-navy-mid:       #1A2F45;
  --dcp-navy-light:     #243B55;
  --dcp-teal:           #00E5C8;
  --dcp-teal-muted:     #00B39E;
  --dcp-teal-dim:       #007A6B;
  --dcp-orange:         #FF6B00;
  --dcp-orange-muted:   #CC5500;
  --dcp-gold:           #D4A574;
  --dcp-white:          #FFFFFF;
  --dcp-text-secondary: #A8B8C8;
  --dcp-text-dim:       #6B7D8D;

  /* Semantic Colors */
  --color-success:      #00E5C8;  /* teal -- aligns with brand */
  --color-warning:      #FF6B00;  /* orange -- aligns with brand */
  --color-error:        #FF3B3B;
  --color-info:         #60A5FA;

  /* Surface Colors */
  --surface-primary:    #0D1B2A;
  --surface-elevated:   #1A2F45;
  --surface-card:       #1A2F45;
  --surface-input:      #243B55;
  --surface-hover:      #2A3F5F;

  /* Border Colors */
  --border-default:     #243B55;
  --border-focus:       #00E5C8;
  --border-error:       #FF3B3B;
}
```

### Typography

```css
:root {
  --font-primary:     'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-arabic:      'Cairo', 'Noto Sans Arabic', sans-serif;
  --font-mono:        'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;

  --text-display:     700 28px/1.2 var(--font-primary);   /* Setup wizard titles */
  --text-heading:     700 20px/1.3 var(--font-primary);   /* Section headings */
  --text-subheading:  600 16px/1.4 var(--font-primary);   /* Card headers */
  --text-body:        400 14px/1.6 var(--font-primary);   /* Standard body */
  --text-caption:     400 12px/1.5 var(--font-primary);   /* Labels, secondary */
  --text-code:        400 13px/1.5 var(--font-mono);      /* API keys, logs */

  /* Note: Installer uses 14px base (smaller than web's 16px)
     because the installer window is compact (600x480) */
}
```

### Spacing System

```css
:root {
  --space-1:   4px;
  --space-2:   8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### Component Specifications

#### Primary Button (CTA)

```css
.btn-primary {
  background: linear-gradient(135deg, #00E5C8, #00B39E);
  color: #0D1B2A;
  font: 600 14px/1 var(--font-primary);
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease;
  min-height: 44px;         /* Touch target */
  min-width: 120px;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #00FFE0, #00E5C8);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 229, 200, 0.3);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-primary:focus-visible {
  outline: 2px solid #00E5C8;
  outline-offset: 2px;
}
```

#### Secondary Button

```css
.btn-secondary {
  background: transparent;
  color: #A8B8C8;
  font: 500 14px/1 var(--font-primary);
  padding: 12px 24px;
  border: 1px solid #243B55;
  border-radius: 8px;
  cursor: pointer;
  transition: all 150ms ease;
  min-height: 44px;
}

.btn-secondary:hover {
  border-color: #00E5C8;
  color: #00E5C8;
  background: rgba(0, 229, 200, 0.05);
}
```

#### Input Field

```css
.input {
  background: #243B55;
  color: #FFFFFF;
  font: 400 14px var(--font-primary);
  padding: 12px 16px;
  border: 1px solid #243B55;
  border-radius: 8px;
  transition: all 150ms ease;
  width: 100%;
}

.input:focus {
  border-color: #00E5C8;
  box-shadow: 0 0 0 3px rgba(0, 229, 200, 0.15);
  outline: none;
}

.input::placeholder {
  color: #6B7D8D;
}

.input-error {
  border-color: #FF3B3B;
  box-shadow: 0 0 0 3px rgba(255, 59, 59, 0.15);
}
```

#### GPU Info Card

```css
.gpu-card {
  background: #1A2F45;
  border: 1px solid #243B55;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gpu-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.gpu-card-label {
  font: 400 12px var(--font-primary);
  color: #6B7D8D;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.gpu-card-value {
  font: 600 14px var(--font-primary);
  color: #FFFFFF;
}

.gpu-card-status-compatible {
  color: #00E5C8;
  font-weight: 600;
}
```

#### Progress Bar

```css
.progress-track {
  background: #243B55;
  border-radius: 4px;
  height: 8px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #00E5C8, #D4A574, #FF6B00);
  transition: width 300ms ease;
}
```

#### Slider

```css
.slider-track {
  background: #243B55;
  border-radius: 4px;
  height: 6px;
  position: relative;
}

.slider-fill {
  background: linear-gradient(90deg, #00E5C8, #D4A574);
  height: 100%;
  border-radius: 4px;
}

.slider-thumb {
  width: 20px;
  height: 20px;
  background: #FFFFFF;
  border: 2px solid #00E5C8;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: grab;
}

.slider-thumb:active {
  cursor: grabbing;
  transform: scale(1.1);
  border-color: #00FFE0;
}
```

### Window Chrome

```
Installer Window:  600px wide x 480px tall (fixed, not resizable)
Tray Popup:        340px wide x 520px tall (fixed, anchored to tray)
Settings Panel:    480px wide x 600px tall (fixed)
```

- Custom title bar (Tauri `decorations: false`) with DCP navy background
- Title bar contains: DCP icon (16px) + "DCP Provider" text + minimize/close buttons
- Close button: X icon, hover state turns red (#FF3B3B)
- Window has 1px border in #243B55 and subtle shadow (0 8px 32px rgba(0,0,0,0.5))
- Window corner radius: 8px (matches Windows 11 design language)

### Icon Style

- **Style:** Outlined, 1.5px stroke weight, rounded line caps
- **Grid:** 24x24 px with 2px padding (20x20 active area)
- **Colors:** White (#FFFFFF) default, teal (#00E5C8) for active/selected states
- **Source:** Lucide Icons (open source, consistent with DCP web design system)
- **Key icons needed:**
  - GPU/chip icon (for GPU detection screen)
  - Shield/lock icon (for API key screen)
  - Clock icon (for scheduling)
  - Thermometer icon (for temperature display)
  - Activity/pulse icon (for heartbeat status)
  - Coins/wallet icon (for earnings)
  - Settings/gear icon (for configuration)
  - Play/pause icons (for daemon control)
  - Check/X icons (for status states)
  - Download icon (for updates)

### Animation Guidelines

| Animation | Duration | Easing | Purpose |
|---|---|---|---|
| Page transition (wizard) | 300ms | ease-in-out | Slide left/right between setup screens |
| Button hover | 150ms | ease | Subtle lift + glow |
| Progress bar fill | 300ms | ease | Smooth progress updates |
| Checkmark draw | 500ms | ease-out | Success confirmation (SVG path animation) |
| Tray popup open | 200ms | ease-out | Slide up from tray position |
| Tray popup close | 150ms | ease-in | Slide down to tray position |
| Spinner | 1000ms | linear | Continuous rotation for loading states |
| Infinity pulse (idle) | 3000ms | ease-in-out | Subtle opacity pulse on tray icon |
| Earnings counter | 400ms | ease-out | Number count-up when earnings update |
| Temperature bar color | 500ms | ease | Smooth color transition between temp ranges |

**Animation philosophy:** Subtle, professional, functional. No bouncing, no particles, no confetti. Animations communicate state changes and provide feedback. They should feel like a premium financial app, not a game launcher.

---

## 7. Design Token System

### Token Architecture for Cross-Platform Consistency

These tokens are shared between the DCP website (Next.js), the installer/tray app (Tauri), and any future mobile app.

```json
{
  "color": {
    "brand": {
      "navy":       { "value": "#0D1B2A" },
      "navy-mid":   { "value": "#1A2F45" },
      "navy-light": { "value": "#243B55" },
      "teal":       { "value": "#00E5C8" },
      "teal-muted": { "value": "#00B39E" },
      "orange":     { "value": "#FF6B00" },
      "gold":       { "value": "#D4A574" },
      "white":      { "value": "#FFFFFF" }
    },
    "semantic": {
      "success":    { "value": "{color.brand.teal}" },
      "warning":    { "value": "{color.brand.orange}" },
      "error":      { "value": "#FF3B3B" },
      "info":       { "value": "#60A5FA" }
    },
    "text": {
      "primary":    { "value": "{color.brand.white}" },
      "secondary":  { "value": "#A8B8C8" },
      "dim":        { "value": "#6B7D8D" },
      "inverse":    { "value": "{color.brand.navy}" }
    },
    "surface": {
      "base":       { "value": "{color.brand.navy}" },
      "elevated":   { "value": "{color.brand.navy-mid}" },
      "input":      { "value": "{color.brand.navy-light}" }
    },
    "border": {
      "default":    { "value": "{color.brand.navy-light}" },
      "focus":      { "value": "{color.brand.teal}" },
      "error":      { "value": "{color.semantic.error}" }
    }
  },
  "spacing": {
    "1":  { "value": "4px" },
    "2":  { "value": "8px" },
    "3":  { "value": "12px" },
    "4":  { "value": "16px" },
    "5":  { "value": "20px" },
    "6":  { "value": "24px" },
    "8":  { "value": "32px" },
    "10": { "value": "40px" },
    "12": { "value": "48px" },
    "16": { "value": "64px" }
  },
  "radius": {
    "sm":   { "value": "4px" },
    "md":   { "value": "8px" },
    "lg":   { "value": "12px" },
    "full": { "value": "9999px" }
  },
  "shadow": {
    "sm":  { "value": "0 1px 2px rgba(0, 0, 0, 0.3)" },
    "md":  { "value": "0 4px 12px rgba(0, 0, 0, 0.4)" },
    "lg":  { "value": "0 8px 32px rgba(0, 0, 0, 0.5)" },
    "glow-teal": { "value": "0 4px 12px rgba(0, 229, 200, 0.3)" }
  },
  "transition": {
    "fast":   { "value": "150ms ease" },
    "normal": { "value": "300ms ease" },
    "slow":   { "value": "500ms ease" }
  }
}
```

---

## 8. Accessibility & Localization

### WCAG AA Compliance

| Check | Requirement | DCP Implementation |
|---|---|---|
| **Color contrast** | 4.5:1 normal text, 3:1 large text | White (#FFF) on navy (#0D1B2A) = 15.4:1. Teal (#00E5C8) on navy = 9.8:1. Both exceed AA. |
| **Keyboard navigation** | All interactive elements reachable via Tab | Tab order follows visual flow. Focus indicators use 2px teal outline. |
| **Screen reader** | All UI elements have accessible names | ARIA labels on all buttons, inputs, sliders. Progress bar uses `role="progressbar"` with `aria-valuenow`. |
| **Focus indicators** | Visible focus ring on all focusable elements | 2px solid #00E5C8, 2px offset. High contrast against navy background. |
| **Touch targets** | 44px minimum for interactive elements | All buttons min-height 44px. Slider thumb 20px with 44px hit area. |
| **Motion sensitivity** | Respect `prefers-reduced-motion` | All animations disabled when `prefers-reduced-motion: reduce` is set. |
| **Text scaling** | UI remains usable at 200% browser zoom | Tauri WebView respects system text scaling. Layout uses relative units. |

### Contrast Verification

| Foreground | Background | Ratio | Pass (AA) |
|---|---|---|---|
| #FFFFFF (white) | #0D1B2A (navy) | 15.4:1 | Yes |
| #00E5C8 (teal) | #0D1B2A (navy) | 9.8:1 | Yes |
| #FF6B00 (orange) | #0D1B2A (navy) | 6.3:1 | Yes |
| #A8B8C8 (secondary text) | #0D1B2A (navy) | 7.2:1 | Yes |
| #6B7D8D (dim text) | #0D1B2A (navy) | 3.8:1 | Yes (large text only) |
| #0D1B2A (navy text) | #00E5C8 (teal button) | 9.8:1 | Yes |

### Arabic / RTL Support

The installer must support Arabic text for the Saudi market:

- All static strings are externalized into a locale JSON file
- Arabic locale uses Cairo font
- RTL layout flips the page transition direction (slide right instead of left)
- Navigation buttons swap position (Back on right, Continue on left for RTL)
- Numbers remain LTR (SAR amounts, GPU specs)
- The installer detects the Windows system locale and defaults to Arabic if the system is set to Arabic
- Language toggle in the title bar: [EN | AR]

**Minimum locale files:**
- `en.json` -- English (default)
- `ar.json` -- Arabic (Saudi Arabia)

---

## 9. MVP vs Full-Featured Scope

### MVP (Phase 1) -- Ship in 4-6 weeks

The minimum viable installer that is meaningfully better than the current NSIS + PowerShell approach.

| Feature | Included | Notes |
|---|---|---|
| Inno Setup installer (replacing NSIS) | Yes | Prettier wizard, same lightweight approach |
| GPU detection screen | Yes | nvidia-smi based, shows model + VRAM |
| API key input (paste only) | Yes | No in-app registration yet |
| Run mode selection (always/scheduled/manual) | Yes | Replicates current NSIS flow |
| Temperature limit setting | Yes | New -- addresses safety concern |
| Improved tray app (PyInstaller bundle) | Yes | Bundle dcp_tray_windows.py as .exe, no Python dependency |
| Auto-start on Windows login | Yes | Windows scheduled task (existing) |
| Branded icon and splash | Yes | DCP infinity symbol ICO file |
| Uninstaller in Add/Remove Programs | Yes | Already exists, polish it |

**What is NOT in MVP:**
- No Tauri rewrite (too much engineering)
- No in-app account creation
- No earnings calculator on download page
- No gaming auto-pause
- No silent auto-updates
- No Arabic localization

**MVP removes these pain points:**
1. User no longer needs Python pre-installed (PyInstaller bundles it)
2. Temperature limit setting builds trust ("my GPU is safe")
3. Prettier installer wizard feels professional, not sketchy
4. Branded tray icon (infinity symbol) instead of generic hexagon

### Full Version (Phase 2) -- Ship in 3-4 months

The complete Tauri-based application described in this document.

| Feature | Included | Notes |
|---|---|---|
| Tauri 2.0 single application | Yes | Installer wizard + tray app in one 6 MB download |
| NVML-based GPU detection | Yes | Direct GPU telemetry, no nvidia-smi shelling |
| In-app account creation | Yes | Email + magic link, no manual API key paste |
| Earnings calculator (pre-install + in-app) | Yes | Live data from api.dcp.sa |
| Gaming auto-pause | Yes | Process detection + GPU utilization monitoring |
| Silent auto-updates (Tauri updater) | Yes | Background download and install on restart |
| Status popup window | Yes | Compact dashboard anchored to tray |
| Real-time earnings display | Yes | Today / week / month / all-time |
| Temperature + utilization monitoring | Yes | Live GPU stats with visual bars |
| Smart notifications | Yes | Milestones, warnings, daily summary |
| Arabic localization | Yes | Full RTL support with Cairo font |
| Settings panel | Yes | Change model preferences, GPU cap, schedule |
| Windows Credential Manager for API keys | Yes | Secure key storage |
| Profitability calculator on dcp.sa | Yes | Website feature, not installer |

### Phase 3 -- Future Enhancements (6+ months)

| Feature | Notes |
|---|---|
| Multi-GPU support | Detect and configure multiple GPUs independently |
| Provider leaderboard | Gamification -- rank among other KSA providers |
| Referral system | "Invite a friend, both earn bonus SAR" |
| Bandwidth sharing | Earn from unused internet bandwidth |
| Model preference marketplace | Let providers choose which models to serve |
| MSIX distribution | Distribute through Windows Package Manager (winget) |
| Performance benchmarking | Auto-benchmark on first run, show competitive percentile |

---

## 10. Implementation Timeline

### Phase 1: MVP (Inno Setup + Bundled Tray App)

| Week | Deliverable | Owner |
|---|---|---|
| Week 1 | Design DCP infinity ICO file (16/32/48/256 px). Port NSIS script to Inno Setup. | UI Designer + DevOps |
| Week 2 | Add temperature limit slider to Inno Setup wizard. Bundle dcp_tray_windows.py with PyInstaller. | Backend Engineer |
| Week 3 | Test installer on Windows 10 and 11 (clean VM). Fix GPU detection edge cases. | QA |
| Week 4 | Update dcp.sa/provider download page with new installer. Write release notes. | Frontend + DevRel |
| Week 5-6 | Buffer for bug fixes, Windows Defender false positive resolution, code signing. | DevOps |

**Estimated cost:** 1 engineer, 4-6 weeks.

### Phase 2: Full Tauri Application

| Week | Deliverable | Owner |
|---|---|---|
| Week 1-2 | Tauri project scaffolding. Rust backend: NVML integration, config management, process control. | Rust/Backend Engineer |
| Week 3-4 | Setup wizard UI (React): all 6 screens with navigation, GPU detection, account connection. | Frontend Engineer |
| Week 5-6 | System tray integration: icon states, right-click menu, status popup window. | Frontend + Rust |
| Week 7-8 | Gaming detection, auto-pause, notification system, auto-updater. | Rust Engineer |
| Week 9-10 | Arabic localization, accessibility audit, Windows Credential Manager integration. | Frontend + QA |
| Week 11-12 | End-to-end testing on multiple GPU configs (RTX 3060, 4060, 4070, 4080, 4090). Code signing with EV certificate. | QA + DevOps |
| Week 13-14 | Beta release to 10 existing providers. Collect feedback. Iterate. | All |
| Week 15-16 | Public release. Update download page. Marketing push. | All |

**Estimated cost:** 2 engineers (1 Rust/backend, 1 frontend), 16 weeks.

### Critical Path Items

1. **Code signing certificate.** Without an EV code signing certificate, Windows SmartScreen will warn users that the app is from an "unknown publisher." This is the single biggest conversion killer for Windows installers. An EV certificate costs ~$400/year and requires identity verification for the company (DC Power Solutions Co). This must be procured before any public release.

2. **Windows Defender false positives.** GPU-monitoring applications frequently trigger antivirus false positives. Submit the signed binary to Microsoft for analysis before release. Also submit to VirusTotal and include the clean scan link on the download page.

3. **WebView2 runtime.** While WebView2 is pre-installed on most Windows 10/11 machines, the Tauri app should bundle the WebView2 bootstrapper as a fallback. This adds ~1.5 MB to the download but prevents a class of "app won't start" support tickets.

4. **NVML library.** The Rust `nvml-wrapper` crate links against `nvml.dll`, which is installed as part of the NVIDIA driver package. The app must gracefully handle the case where NVML is not available (old drivers, no NVIDIA GPU) by falling back to nvidia-smi or showing a clear error.

---

## Appendix A: File Structure (Tauri Project)

```
dcp-provider-app/
  src-tauri/
    src/
      main.rs              -- Tauri entry point
      gpu.rs               -- NVML GPU detection and monitoring
      daemon.rs            -- Daemon process management
      config.rs            -- Config file read/write
      heartbeat.rs         -- API heartbeat client
      gaming.rs            -- Game detection and auto-pause
      notifications.rs     -- Windows notification management
      updater.rs           -- Auto-update logic
    tauri.conf.json        -- Tauri configuration
    icons/
      icon.ico             -- DCP infinity symbol, all sizes
      icon.png             -- 1024x1024 source
    Cargo.toml
  src/
    App.tsx                -- React root
    pages/
      Welcome.tsx          -- Setup wizard: welcome screen
      GpuDetection.tsx     -- Setup wizard: GPU detection
      AccountConnect.tsx   -- Setup wizard: account connection
      Configuration.tsx    -- Setup wizard: settings
      Installing.tsx       -- Setup wizard: progress
      Complete.tsx         -- Setup wizard: completion
    components/
      TrayPopup.tsx        -- System tray status popup
      SettingsPanel.tsx    -- Full settings panel
      EarningsCard.tsx     -- Earnings display component
      GpuStatusBar.tsx     -- GPU temperature/utilization bar
      SliderInput.tsx      -- Custom slider component
      ProgressStep.tsx     -- Installation progress step
    hooks/
      useGpuInfo.ts        -- GPU telemetry hook
      useDaemonStatus.ts   -- Daemon status hook
      useEarnings.ts       -- Earnings data hook
    locales/
      en.json              -- English strings
      ar.json              -- Arabic strings
    tokens/
      colors.ts            -- Color design tokens
      typography.ts        -- Typography tokens
      spacing.ts           -- Spacing tokens
    styles/
      global.css           -- Global styles with CSS custom properties
  package.json
  tsconfig.json
```

---

## Appendix B: Current State Assessment

### What Exists Today (and its limitations)

| Component | File | Limitation |
|---|---|---|
| NSIS installer | `backend/installers/dc1-provider-Windows.nsi` | Classic Windows wizard look. No brand polish. Functional but generic. |
| PowerShell setup script | `backend/installers/dc1-setup-windows.ps1` | Requires Python pre-installed. 8-step CLI process. Not user-friendly. |
| Python tray app | `backend/installers/dcp_tray_windows.py` | Requires Python + pystray + Pillow + requests. Generic hexagon icon. Functional but brittle. |
| Installer test | `backend/tests/windows-installer.test.js` | Tests the API route that serves the PowerShell script. Good coverage. |
| Provider install library | `app/lib/provider-install.ts` | Frontend helper for building install commands. Well-structured. |
| Install telemetry | `app/lib/provider-install-telemetry.ts` | Tracks install events to analytics. Keep this. |

### What Must Be Preserved in Any Redesign

1. **Per-user install to %LOCALAPPDATA%** -- No admin required. This is correct and must not change.
2. **API key format validation** -- `dc1-provider-XXXXX` prefix check. Already implemented in NSIS.
3. **Scheduled task for auto-start** -- Windows scheduled task at logon trigger. Working approach.
4. **Uninstaller in Add/Remove Programs** -- Registry keys in HKCU. Already implemented.
5. **Install telemetry** -- The `provider-install-telemetry.ts` event system. Must be wired into the new installer.
6. **Bare-metal execution fallback** -- When Docker is not available, the daemon runs directly. This flexibility is a competitive advantage over io.net and Vast.ai.

---

## Appendix C: Competitive Positioning Summary

### DCP Installer Advantage After This Redesign

| Dimension | Vast.ai | io.net | Salad | DCP (Proposed) |
|---|---|---|---|---|
| **Windows support** | Weak (WSL/CLI) | Weak (Docker) | Strong (Electron) | Strong (Tauri) |
| **Download to earning** | 30+ min | 15+ min | 2-5 min | 2-3 min |
| **Admin required** | Yes (Docker) | Yes (Docker) | No | No |
| **Download size** | N/A (script) | N/A (Docker) | ~120 MB | ~6 MB |
| **Memory footprint** | N/A | Docker overhead | ~200 MB (Electron) | ~35 MB (Tauri) |
| **GPU detection** | Manual | Manual (Docker) | Auto (WSL2 probe) | Auto (NVML native) |
| **Gaming auto-pause** | No | No | Idle detection | Active game detection |
| **Auto-update** | No | No | Yes (silent) | Yes (silent) |
| **Earnings in tray** | No (web only) | No (web only) | Yes | Yes |
| **Arabic support** | No | No | No | Yes |
| **Temperature protection** | No | No | RAM warning only | GPU temp + throttle |
| **Brand polish** | Generic | Generic | Good | Premium (DCP brand) |

DCP's proposed installer would be the smallest download, fastest setup, lowest memory footprint, and only Arabic-supporting GPU provider app in the market. Combined with the no-Docker, no-admin approach, this creates a genuinely differentiated onboarding experience for the Saudi gamer audience.
