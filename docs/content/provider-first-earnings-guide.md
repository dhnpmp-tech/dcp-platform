# Provider Setup: First Completed Workload

This guide is for NVIDIA GPU owners who want to start with DCP as providers, run the daemon, and complete a first workload that can settle in the wallet and earnings view.

DCP is tuned for Saudi operators who want SAR-native compute economics and local AI workload alignment.

## What you need before starting
- A supported NVIDIA GPU with stable driver installation.
- A supported host OS (Windows, Linux, or macOS where applicable in current setup flows).
- Reliable internet connection for heartbeat and job polling.
- A DCP provider account and provider API key.

## Step 1: Register as a provider
Complete provider registration to create your account and receive your provider key.

Recommended checks after registration:
- Confirm your GPU details are entered correctly.
- Save the provider key in a secure location.
- Verify you can access provider dashboard routes.

## Step 2: Download and install the daemon package
Use the provider download flow to retrieve the daemon script or setup package tied to your key.

What the daemon does:
- Sends heartbeat signals to report machine availability.
- Polls for assigned jobs.
- Executes workloads in containerized job paths.

## Step 3: Start daemon and verify first heartbeat
Run the daemon locally and confirm your machine appears as online.

Minimum verification targets:
- Heartbeat interval is stable.
- Provider status updates without repeated disconnects.
- Machine appears in expected provider status views.

## Step 4: Confirm machine readiness for jobs
Before waiting for production traffic, validate readiness signals:
- API key auth is accepted by provider endpoints.
- GPU visibility and machine metadata are correct.
- Provider is not paused.

## Step 5: Operate with uptime discipline
Provider earnings are tied to completed jobs and machine availability; wallet updates should be reviewed after completion events are finalized.

Practical operating habits:
- Keep daemon process supervised and auto-restart capable.
- Monitor heartbeat stability after host restarts.
- Use pause/resume intentionally during maintenance windows.

## Step 6: Understand earnings accounting
Completed jobs map to provider earnings under the platform split:
- Provider share: `75%`
- Platform share: `25%`

Track progress in provider dashboard metrics and earnings views as jobs complete.

## First-day checklist
- Provider account created.
- Daemon running with valid key.
- Heartbeat confirmed online.
- One full job lifecycle observed (`pending` -> `queued` -> `running` -> `completed`).
- Earnings view updated after completion.

## CTA
### Complete your first provider earnings run
- Register provider account: `/setup`
- Use provider onboarding docs: `/docs/provider-guide`
- Review API reference for provider endpoints: `/docs/api`
- Open provider dashboard status view: `/provider`
