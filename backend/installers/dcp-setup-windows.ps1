# DCP Provider Setup v4.0.0-alpha.2 — Windows
# Downloads and installs the DC1 daemon + Docker Desktop + NVIDIA Container Toolkit.
#
# Usage:
#   powershell -c "irm http://HOST/api/providers/download/setup?key=KEY&os=windows | iex"

$ErrorActionPreference = "Stop"

$DC1_API_KEY = "INJECT_KEY_HERE"
$DC1_API_URL = "INJECT_URL_HERE"
$INSTALL_DIR = "$env:LOCALAPPDATA\DCPProvider"
$LOG_DIR = "$env:USERPROFILE\dcp-provider\logs"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DCP Provider Setup v4.0.0-alpha.2 (Windows)" -ForegroundColor Cyan
Write-Host "  GPU Compute Marketplace — Saudi Arabia" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Python ──────────────────────────────────────────────────────
Write-Host "[1/8] Checking Python 3..." -ForegroundColor Yellow
$python = $null
foreach ($cmd in @("python3", "python", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3") {
            $python = $cmd
            Write-Host "  Found: $ver"
            break
        }
    } catch {}
}

if (-not $python) {
    Write-Host "  Python 3 not found. Attempting install via winget..." -ForegroundColor Yellow
    try {
        winget install Python.Python.3.11 --accept-source-agreements --accept-package-agreements -s winget
        $python = "python"
        Write-Host "  Python installed. You may need to restart your terminal." -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] Cannot install Python. Download from https://python.org" -ForegroundColor Red
        exit 1
    }
}

# ── Step 2: Pip packages ────────────────────────────────────────────────
Write-Host "[2/8] Installing Python packages..." -ForegroundColor Yellow
& $python -m pip install --quiet requests psutil 2>$null

# ── Step 3: NVIDIA Drivers ──────────────────────────────────────────────
Write-Host "[3/8] Checking NVIDIA drivers..." -ForegroundColor Yellow
try {
    $nvsmi = & nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>&1
    if ($nvsmi -and -not ($nvsmi -match "failed|error")) {
        Write-Host "  GPU: $nvsmi"
    } else {
        Write-Host "  [WARN] NVIDIA GPU not detected. Install drivers from:" -ForegroundColor Yellow
        Write-Host "    https://www.nvidia.com/download/index.aspx" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [WARN] nvidia-smi not found. Install NVIDIA drivers first." -ForegroundColor Yellow
}

# ── Step 4: Docker Desktop ──────────────────────────────────────────────
Write-Host "[4/8] Checking Docker..." -ForegroundColor Yellow
$dockerInstalled = $false
try {
    $dockerVer = & docker --version 2>&1
    if ($dockerVer -match "Docker version") {
        Write-Host "  Found: $dockerVer"
        $dockerInstalled = $true
    }
} catch {}

if (-not $dockerInstalled) {
    Write-Host "  Docker Desktop not found. Installing..." -ForegroundColor Yellow
    try {
        # Try winget first
        winget install Docker.DockerDesktop --accept-source-agreements --accept-package-agreements -s winget
        Write-Host "  Docker Desktop installed." -ForegroundColor Green
        Write-Host "  [IMPORTANT] You need to:" -ForegroundColor Yellow
        Write-Host "    1. Restart your computer" -ForegroundColor Yellow
        Write-Host "    2. Launch Docker Desktop" -ForegroundColor Yellow
        Write-Host "    3. Enable 'Use WSL 2' in Docker settings" -ForegroundColor Yellow
        Write-Host "    4. Re-run this installer" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Alternatively, download from: https://docker.com/products/docker-desktop" -ForegroundColor Yellow
    } catch {
        Write-Host "  [WARN] Could not auto-install Docker Desktop." -ForegroundColor Yellow
        Write-Host "  Download from: https://docker.com/products/docker-desktop" -ForegroundColor Yellow
        Write-Host "  Enable WSL 2 backend + NVIDIA GPU support in settings." -ForegroundColor Yellow
    }
}

# ── Step 5: NVIDIA Container Toolkit (Windows uses Docker Desktop GPU support) ──
Write-Host "[5/8] Checking NVIDIA Container Toolkit (Docker GPU support)..." -ForegroundColor Yellow
if ($dockerInstalled) {
    try {
        $gpuTest = & docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi --query-gpu=name --format=csv,noheader 2>&1
        if ($gpuTest -and -not ($gpuTest -match "error|Error")) {
            Write-Host "  Docker GPU passthrough working: $gpuTest" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] Docker GPU passthrough not working." -ForegroundColor Yellow
            Write-Host "  Ensure Docker Desktop has 'Use WSL 2 based engine' enabled." -ForegroundColor Yellow
            Write-Host "  Windows 11 + latest NVIDIA drivers required for GPU containers." -ForegroundColor Yellow
            Write-Host "  The daemon will fall back to bare-metal execution." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  [WARN] Could not test Docker GPU. Ensure Docker Desktop is running." -ForegroundColor Yellow
    }
} else {
    Write-Host "  [SKIP] Docker not installed yet. GPU containers will be configured after Docker setup." -ForegroundColor Yellow
}

# ── Step 6: Pre-pull base images ────────────────────────────────────────
Write-Host "[6/8] Pulling DCP base images..." -ForegroundColor Yellow
if ($dockerInstalled) {
    try {
        & docker pull nvidia/cuda:12.2.0-runtime-ubuntu22.04 2>$null
        Write-Host "  NVIDIA CUDA base image cached."
    } catch {
        Write-Host "  [WARN] Could not pull base image. Will pull on first job." -ForegroundColor Yellow
    }
} else {
    Write-Host "  [SKIP] Docker not available. Images will be pulled after Docker setup." -ForegroundColor Yellow
}

# ── Step 7: Download daemon ─────────────────────────────────────────────
Write-Host "[7/8] Downloading DCP daemon..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null

$daemonUrl = "$DC1_API_URL/api/providers/download/daemon?key=$DC1_API_KEY"
Invoke-WebRequest -Uri $daemonUrl -OutFile "$INSTALL_DIR\dcp_daemon.py" -UseBasicParsing
Write-Host "  Installed to $INSTALL_DIR\dcp_daemon.py"

# Save config
$config = @{
    api_key = $DC1_API_KEY
    api_url = $DC1_API_URL
    daemon_version = "3.3.0"
    run_mode = "always-on"
    force_bare_metal = $false
} | ConvertTo-Json
$config | Out-File "$INSTALL_DIR\config.json" -Encoding UTF8

# v4.1.0 (Task A10): Claim-token emitter.
# Generates a random 32-byte token and writes it to %USERPROFILE%\.dcp\claim.json
# so the daemon can attach it to its first heartbeat. The wizard polls
# the backend for a matching heartbeat and advances the provider through
# onboarding without copy-paste. ACL on the claim file restricts read to
# the current user only.
$claimDir = Join-Path $env:USERPROFILE ".dcp"
New-Item -ItemType Directory -Path $claimDir -Force | Out-Null
$claimBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($claimBytes)
$claimToken = -join ($claimBytes | ForEach-Object { $_.ToString("x2") })
$claimAt    = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$claimPath  = Join-Path $claimDir "claim.json"
@{
    claim_token  = $claimToken
    generated_at = $claimAt
} | ConvertTo-Json | Out-File $claimPath -Encoding UTF8
# Lock down ACL — only current user may read.
try {
    $acl = Get-Acl $claimPath
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $env:USERNAME, "FullControl", "Allow")
    $acl.AddAccessRule($rule)
    Set-Acl -Path $claimPath -AclObject $acl
} catch {
    Write-Host "  [WARN] Could not tighten ACL on $claimPath : $_" -ForegroundColor Yellow
}
Write-Host "  Claim token emitted: $claimPath"

# ── Step 8: Scheduled task ──────────────────────────────────────────────
Write-Host "[8/8] Creating Windows scheduled task..." -ForegroundColor Yellow

$taskName = "DCP Provider Daemon"
$taskAction = New-ScheduledTaskAction `
    -Execute $python `
    -Argument "$INSTALL_DIR\dcp_daemon.py" `
    -WorkingDirectory $INSTALL_DIR

$taskTrigger = New-ScheduledTaskTrigger -AtLogon
$taskSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Settings $taskSettings `
    -Description "DCP GPU compute provider daemon v2.0 (Docker-enabled)" `
    -RunLevel Limited

Write-Host "  Scheduled task '$taskName' created."

# Start daemon now
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  DCP Provider Daemon v4.0.0-alpha.2 — INSTALLED" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Daemon:  $INSTALL_DIR\dcp_daemon.py"
Write-Host "  Config:  $INSTALL_DIR\config.json"
Write-Host "  Logs:    $LOG_DIR\daemon.log"
Write-Host "  Key:     $($DC1_API_KEY.Substring(0,[Math]::Min(20,$DC1_API_KEY.Length)))..."
Write-Host ""
if ($dockerInstalled) {
    Write-Host "  Docker:  INSTALLED" -ForegroundColor Green
} else {
    Write-Host "  Docker:  NOT INSTALLED — install Docker Desktop and re-run" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Commands:" -ForegroundColor White
Write-Host "    Status: Get-ScheduledTask -TaskName '$taskName'"
Write-Host "    Logs:   Get-Content $LOG_DIR\daemon.log -Tail 20"
Write-Host "    Stop:   Stop-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "  Dashboard: $DC1_API_URL/api/providers/status/$DC1_API_KEY"
Write-Host "============================================" -ForegroundColor Green
