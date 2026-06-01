# DCP GPU Compute — VS Code Extension

Submit and monitor GPU jobs on **DCP** directly from VS Code or Cursor.

## Features

### 🎛️ Template Catalog
- **Template Catalog** tree view showing 20 docker templates grouped by category (LLM, Embedding, Image, Notebook, Training)
- Each template shows minimum VRAM, estimated price/hour, difficulty level, and deployment tier
- Rich tooltips with complete specifications and example usage
- **Search templates** by name or description with fuzzy matching
- **Filter by VRAM tier** (4 GB to 80 GB+ options)
- **Deploy template** with one click → select duration → submit to available GPU provider

### 🧠 Model Catalog
- **Model Catalog** tree view showing available models with Arabic capability detection
- Arabic models marked with 🌍 emoji for easy identification
- Each model shows availability status, VRAM requirement, pricing, and provider count
- **Competitive pricing display** showing DCP price vs Vast.ai/RunPod/AWS with savings percentage
- **Auto-refresh** every 5 minutes to show latest availability and pricing

### 🚀 One-Click Deployment
- **Arabic RAG Quick-Start** command (`dc1.startArabicRagSession`) deploys complete Arabic RAG bundle with single command
- Shows progress notification with job ID, estimated cost, and endpoint availability notice
- Integrates with job monitoring for real-time status tracking

### Provider workflow
- Provider status sidebar (`DCP Provider`) with online state, GPU profile, jobs, and earnings.
- Provider API key stored in VS Code `SecretStorage`.
- Provider connection status bar (`DCP Provider ✅/❌`).

### Renter workflow
- GPU marketplace tree (`Available GPUs`) with model, VRAM, location, and reliability.
- `DCP: Run AI Inference` panel for vLLM prompts and model selection.
- `DCP: Submit Container Job (Advanced)` panel for explicit container spec jobs.
- `My Jobs` tree with status icons and per-job log viewing.
- Live log streaming command (`DCP: Watch Job Logs`) with auto-retry and polling fallback when SSE is unavailable.
- Wallet/status bar signal showing active jobs and quick link to billing (`https://dcp.sa/renter/billing`).

## Key Commands

### Template & Model Discovery
- `DCP: Search Templates` - Search 20+ templates by name or description
- `DCP: Filter Templates by VRAM` - Filter templates by minimum VRAM requirement
- `DCP: Clear Template Filters` - Reset all template search and VRAM filters
- `DCP: Deploy Template` - One-click template deployment (right-click in Template Catalog)
- `DCP: Start Arabic RAG Session` - Deploy complete Arabic RAG bundle in one command
- `DCP: Refresh Templates` - Manually refresh template catalog
- `DCP: Refresh Models` - Manually refresh model catalog

### Job & Inference
- `DCP: Run AI Inference` - Open vLLM inference panel with model selection
- `DCP: Submit Container Job (Advanced)` - Advanced job submission with custom container spec
- `DCP: Watch Job Logs` - Stream live logs for a specific job
- `DCP: Cancel Job` - Cancel a running job (from My Jobs tree)

### Authentication & Settings
- `DCP: Set Renter API Key` - Set or update your renter API key
- `DCP: Set Provider API Key` - Set or update your provider API key
- `DCP: Settings` - Open DCP settings panel
- `DCP: Model Cache Status` - View provider model cache status

## Configuration

| Setting | Default | Description |
|---|---|---|
| `dc1.apiBase` | `https://api.dcp.sa` | DCP API base URL |
| `dc1.renterApiKey` | `""` | Optional renter key in settings (prefer command + SecretStorage) |
| `dc1.pollIntervalSeconds` | `10` | Job status polling interval (seconds) |
| `dc1.autoRefreshGPUs` | `true` | Auto-refresh GPU list every 30s |
| `dc1.autoRefreshTemplates` | `true` | Auto-refresh template catalog every 5 minutes |
| `dc1.autoRefreshModels` | `true` | Auto-refresh model catalog every 5 minutes |

## Security Notes

- Preferred key storage is VS Code `SecretStorage` via `DCP: Set Renter API Key` or `DCP: Set Provider API Key`.
- If a renter key was previously saved in `dc1.renterApiKey`, the extension now migrates it into `SecretStorage` on load and clears the plain-text setting.
- Auth/session failures (401/403) trigger a re-authentication prompt during submit and log operations.
- Avoid committing workspace/user settings files that contain API keys.

## Reliability Behavior

- Job submission (container and vLLM) retries transient failures up to 3 attempts with short backoff.
- Log streaming retries transient connect failures before reporting stream unavailability.
- When streaming remains unavailable, the extension falls back to job status polling using `dc1.pollIntervalSeconds`.

## Quick Start

1. Install extension from VSIX.
2. Run `DCP: Set Renter API Key` (or provider key for provider workflow).
3. Open the `DCP Compute` activity bar view.
4. Run `DCP: Run AI Inference` and submit a test prompt.
5. Use `DCP: Watch Job Logs` for live stream output.

## API Surface Used

### Core APIs
- `GET /api/renters/available-providers` - List available GPU providers
- `GET /api/renters/me?key=` - Get renter info and job list
- `POST /api/jobs/submit` - Submit job to GPU provider
- `GET /api/jobs/:id/output` - Get job output
- `GET /api/jobs/:id/logs/stream` - Stream job logs (SSE)
- `GET /api/vllm/models` - List vLLM model registry
- `POST /api/vllm/complete` - Run LLM inference
- `GET /api/providers/me?key=` - Get provider info

### Template & Model APIs
- `GET /api/templates` - List available docker templates (20+ templates)
- `GET /api/models` - List available models with competitive pricing
  - Returns `competitor_prices` (Vast.ai, RunPod, AWS) and `savings_pct` for pricing display

## Demo Script

Use [`DEMO-SCRIPT.md`](./DEMO-SCRIPT.md) for a partner-ready live demo flow.
