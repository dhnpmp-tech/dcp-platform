# DCP GPU Compute — Changelog

## [0.5.0] — 2026-03-23

### Added - Template Catalog & Arabic RAG Deployment

#### 🎛️ Template Catalog Browser
- New **Template Catalog** tree view in DCP Explorer sidebar showing 20 docker templates
- Templates grouped by category: LLM, Embedding, Image, Notebook, Training with emoji icons
- Each template shows name, minimum VRAM, estimated price/hr, difficulty, and tier
- Rich markdown tooltips with complete specs, Docker image, job type, and example usage
- Auto-refresh every 5 minutes (configurable via `dc1.autoRefreshTemplates`)
- **Commands:**
  - `dc1.deployTemplate` - Right-click on template → Deploy with duration prompt
  - `dc1.refreshTemplates` - Manual refresh button in tree header

#### 🧠 Model Catalog View
- New **Model Catalog** tree view showing available models grouped by Arabic capability
- Arabic models marked with 🌍 emoji for quick identification
- Each model shows: availability status (✅/❌), VRAM requirement, price/hour, provider count
- Rich tooltips with model family, context window, use cases, and Arabic detection
- Auto-refresh every 5 minutes (configurable via `dc1.autoRefreshModels`)
- **Commands:**
  - `dc1.refreshModels` - Manual refresh button in tree header

#### 🚀 One-Click Deployment
- **Arabic RAG Quick-Start:** `dc1.startArabicRagSession`
  - Deploy complete Arabic RAG bundle (embeddings + reranker + LLM) with one command
  - Duration input dialog (default 120 minutes)
  - Progress notification with output channel showing job ID and cost
  - Auto-integrates with job monitoring

#### 💰 Competitive Pricing Display
- **Model Catalog Pricing:** Tooltips show DCP vs Vast.ai/RunPod/AWS comparison
  - Price differential for each competitor (SAR/hour)
  - Savings percentage vs Vast.ai baseline
  - Data from `/api/models` competitor_prices field

- **Template Catalog Pricing:** Estimated savings based on VRAM tier
  - Shows DCP price and estimated Vast.ai competitor price
  - Displays estimated savings percentage
  - Helps renters understand cost advantages during discovery

#### 🔍 Template Search & VRAM Filtering
- **Search Templates:** Fuzzy search by template name or description (case-insensitive)
  - Available via `dc1.searchTemplates` command or tree header button

- **Filter by VRAM:** Quick-pick menu for hardware-based filtering
  - Options: All, 4 GB+, 8 GB+, 16 GB+, 24 GB+, 40 GB+, 80 GB+
  - Via `dc1.filterTemplatesByVram` command or tree header button

- **Clear Filters:** Reset all search and VRAM filters
  - Via `dc1.clearTemplateFilters` command or tree header button

### Changed
- Extended TypeScript API client with template and model fetching
- Added CompetitorPricing interface for pricing comparisons
- Enhanced Model interface with Arabic detection and competitor pricing fields
- Extended DockerTemplate interface with params field for deployment

### Fixed
- Fixed Timer type compatibility (NodeJS.Timer → NodeJS.Timeout) in catalog providers
- Resolved TypeScript compilation warnings in new providers
- Added proper error/loading states for template and model tree views

### New Configuration Options
- `dc1.autoRefreshTemplates` (boolean, default: true) - Auto-refresh template catalog every 5 minutes
- `dc1.autoRefreshModels` (boolean, default: true) - Auto-refresh model catalog every 5 minutes

### Dependencies
- No new external dependencies; uses existing VS Code API
- Compatible with VS Code 1.85.0 and later

---

## [0.4.1] — 2026-03-21

### Fixed
- `dc1.watchJobLogs` now falls back to periodic `GET /api/jobs/:id/output` polling when SSE log streaming is unavailable at stream start.
- API client response parsing is more resilient for empty-body and non-JSON error responses, improving user-facing error messages instead of generic parse failures.
- vLLM submit panel now shows explicit model-load errors and includes a `Reload Models` action to recover quickly during demos without reloading the extension host.

### Docs
- Updated extension README for current DCP branding, commands, default API base, and supported API surface.
- Added a demo runbook (`DEMO-SCRIPT.md`) with expected outputs for partner walkthroughs.

## [0.3.0] — 2026-03-20

### Added
- **Budget Widget**: Status bar now shows renter's remaining balance as `DCP: XX.XX SAR` (bottom-right). Refreshes every 60 seconds or after a job completes. Clicking opens the DCP billing page in the browser.
- **Job Log Streaming**: After job submission, each job gets its own VS Code output channel named `DCP Job #<id>`. Live logs are streamed via SSE (`GET /api/jobs/:id/logs/stream`) and displayed in real-time. Falls back to polling automatically if the SSE endpoint is not yet available.

### Changed
- Extension renamed from `dc1-compute` → `dcp-compute` and branding updated throughout.
- Status bar budget widget click now opens `https://dcp.sa/renter/billing` instead of the wallet webview panel.
- Per-job output channels replace the previous shared `DCP Job Logs` channel — each job's output is isolated and persists for the session.
- API base config description updated to reference `https://api.dcp.sa`.

---

## [0.2.0] — 2026-03-01

### Added
- Provider status sidebar (ProviderStatusTreeProvider) — GPU model, earnings, heartbeat status.
- Wallet & Billing webview panel (WalletPanel) — balance, top-up, job history.
- Job cancellation command (`dc1.cancelJob`) with confirmation dialog.
- `dc1.submitJobOnProvider` context-menu command from GPU tree item.

---

## [0.1.0] — 2026-02-14

### Initial release
- Available GPUs sidebar (TreeDataProvider) with live refresh.
- My Jobs sidebar with status badges.
- Job submission webview panel (GPU model, VRAM, duration, job type, container image).
- API key auth stored in VS Code Secrets Store.
- Provider status bar item showing connection state.
- Basic job output polling.
