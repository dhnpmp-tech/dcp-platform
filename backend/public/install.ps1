# DCP Provider Setup — Windows (install.ps1)
# ---------------------------------------------------------------------------
# Served at https://dcp.sa/install.ps1 (rewritten to the backend /install.ps1
# route). The /setup wizard emits:
#
#   powershell -ExecutionPolicy Bypass -Command "
#     Invoke-WebRequest -Uri 'https://dcp.sa/install.ps1' -OutFile dcp_setup.ps1;
#     .\dcp_setup.ps1 -Token '<install_token>'"
#
# This mirrors the Linux/macOS install.sh wizard path: it trades the single-use
# wizard install_token (dcpt_…) for a long-lived api_key via
# POST /v1/provider/register-node, downloads the daemon, writes config, and
# registers a scheduled task that runs the daemon at logon.
#
# Flags:
#   -Token   <dcpt_…>   wizard install_token (preferred path)
#   -ApiKey  <dcpk_…>   existing provider api_key (manual install / re-run)
#   -ApiBase <url>      API base (default https://api.dcp.sa)
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [Alias('t')]
    [string]$Token = $env:DCP_INSTALL_TOKEN,

    [Alias('k')]
    [string]$ApiKey = $env:DCP_PROVIDER_KEY,

    [string]$ApiBase = $(if ($env:DCP_API_BASE) { $env:DCP_API_BASE } else { 'https://api.dcp.sa' })
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$INSTALL_DIR = "$env:LOCALAPPDATA\DCPProvider"
$LOG_DIR     = "$env:USERPROFILE\dcp-provider\logs"
$API_BASE    = $ApiBase.TrimEnd('/')

function Write-Step($n, $total, $msg) {
    Write-Host "[$n/$total] $msg" -ForegroundColor Yellow
}
function Fail($msg) {
    Write-Host "  [ERROR] $msg" -ForegroundColor Red
    exit 1
}
function Get-Sha256Hex($Path) {
    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}
function Get-MiningGuardExpectedSha256($GuardUrl) {
    $guardManifestUrl = "$GuardUrl&check_only=true"
    try {
        $manifest = Invoke-RestMethod -Uri $guardManifestUrl -UseBasicParsing
    } catch {
        Fail "Failed to read mining_guard.py sha256 manifest from $API_BASE."
    }
    if (-not $manifest.sha256 -or $manifest.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
        Fail "Mining guard manifest did not include a valid sha256."
    }
    return $manifest.sha256.ToLowerInvariant()
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  DCP Provider Setup (Windows)" -ForegroundColor Cyan
Write-Host "  GPU Compute Marketplace — Saudi Arabia" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

if (-not $Token -and -not $ApiKey) {
    Fail "No -Token or -ApiKey provided. Re-copy the install command from dcp.sa/setup."
}

# ── Step 1: Python ──────────────────────────────────────────────────────
Write-Step 1 7 "Checking Python 3..."
$python = $null
foreach ($cmd in @('python3', 'python', 'py')) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match 'Python 3') { $python = $cmd; Write-Host "  Found: $ver"; break }
    } catch {}
}
if (-not $python) {
    Write-Host "  Python 3 not found. Attempting install via winget..." -ForegroundColor Yellow
    try {
        winget install Python.Python.3.11 --accept-source-agreements --accept-package-agreements -s winget
        $python = 'python'
        Write-Host "  Python installed. You may need to restart your terminal." -ForegroundColor Green
    } catch {
        Fail "Cannot install Python. Download from https://python.org and re-run."
    }
}

# ── Step 2: Pip packages ────────────────────────────────────────────────
Write-Step 2 7 "Installing Python packages..."
& $python -m pip install --quiet requests psutil 2>$null

# ── Step 3: GPU check (informational) ───────────────────────────────────
Write-Step 3 7 "Checking NVIDIA drivers..."
try {
    $nvsmi = & nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>&1
    if ($nvsmi -and -not ($nvsmi -match 'failed|error')) {
        Write-Host "  GPU: $nvsmi"
    } else {
        Write-Host "  [WARN] NVIDIA GPU not detected. Install drivers from:" -ForegroundColor Yellow
        Write-Host "    https://www.nvidia.com/download/index.aspx" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [WARN] nvidia-smi not found. Install NVIDIA drivers first." -ForegroundColor Yellow
}

# ── Step 4: Exchange install token for an api_key ───────────────────────
# Mirrors install.sh exchange_install_token(): POST /v1/provider/register-node
# with the single-use install_token; the backend returns (and, after the
# go-live fix, REUSES) the provider's api_key. Idempotent on a same-machine
# retry.
if (-not $ApiKey -and $Token) {
    Write-Step 4 7 "Exchanging wizard install token for API key..."
    $hostName = $env:COMPUTERNAME
    if (-not $hostName) { $hostName = 'windows-host' }

    $gpuModel = 'unknown'
    try {
        $g = & nvidia-smi --query-gpu=name --format=csv,noheader 2>&1
        if ($g -and -not ($g -match 'failed|error')) { $gpuModel = ($g | Select-Object -First 1).Trim() }
    } catch {}

    $payload = @{
        install_token  = $Token
        hostname       = $hostName
        os             = 'windows'
        gpu_detected   = @(@{ vendor = 'NVIDIA'; model = $gpuModel; vram_mb = 0 })
        daemon_version = 'installer-windows'
    } | ConvertTo-Json -Depth 5

    try {
        $resp = Invoke-RestMethod -Method Post -Uri "$API_BASE/v1/provider/register-node" `
            -ContentType 'application/json' -Body $payload -UseBasicParsing
    } catch {
        $detail = $_.Exception.Message
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $body = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
            if ($body) { $detail = $body }
        } catch {}
        Fail "Install-token exchange failed: $detail"
    }

    $ApiKey = $resp.api_key
    if (-not $ApiKey) {
        Fail "register-node did not return an api_key. Re-copy the command from dcp.sa/setup."
    }
    Write-Host "  API key obtained (provider node $($resp.node_id))." -ForegroundColor Green
} else {
    Write-Step 4 7 "Using provided API key (skipping token exchange)..."
}

# ── Step 5: Download daemon bundle ──────────────────────────────────────
Write-Step 5 7 "Downloading DCP daemon bundle..."
New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null

$daemonUrl = "$API_BASE/api/providers/download/daemon?key=$ApiKey"
$guardUrl = "$API_BASE/api/providers/download/mining-guard?key=$ApiKey"
$daemonPath = "$INSTALL_DIR\dcp_daemon.py"
$guardPath = "$INSTALL_DIR\mining_guard.py"
try {
    Invoke-WebRequest -Uri $daemonUrl -OutFile $daemonPath -UseBasicParsing
} catch {
    # Fallback to the canonical static installer path.
    Invoke-WebRequest -Uri "$API_BASE/installers/daemon?key=$ApiKey" -OutFile $daemonPath -UseBasicParsing
}
Write-Host "  Daemon installed to $daemonPath"

try {
    Invoke-WebRequest -Uri $guardUrl -OutFile $guardPath -UseBasicParsing
} catch {
    Fail "Failed to download mining_guard.py companion from $API_BASE."
}
$guardExpectedSha256 = Get-MiningGuardExpectedSha256 $guardUrl
$guardActualSha256 = Get-Sha256Hex $guardPath
if ($guardActualSha256 -ne $guardExpectedSha256) {
    Fail "Mining guard sha256 mismatch (expected $guardExpectedSha256, got $guardActualSha256)."
}
$guardExpectedSha256 | Out-File "${guardPath}.sha256" -Encoding ascii
Write-Host "  Mining guard installed to $guardPath"

# ── Step 6: Write config ────────────────────────────────────────────────
Write-Step 6 7 "Writing config..."
$config = @{
    api_key         = $ApiKey
    api_url         = $API_BASE
    daemon_version  = '3.3.0'
    run_mode        = 'always-on'
    force_bare_metal = $false
} | ConvertTo-Json
$config | Out-File "$INSTALL_DIR\config.json" -Encoding UTF8

# ── Step 7: Scheduled task ──────────────────────────────────────────────
Write-Step 7 7 "Creating Windows scheduled task..."
$taskName = 'DCP Provider Daemon'
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

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Settings $taskSettings `
    -Description 'DCP GPU compute provider daemon' `
    -RunLevel Limited
Write-Host "  Scheduled task '$taskName' created."

# The daemon sets DCP_API_KEY / DCP_API_URL from config.json at startup; also
# export them for the immediate foreground launch below.
$env:DCP_API_KEY = $ApiKey
$env:DCP_API_URL = $API_BASE

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  DCP Provider Daemon — INSTALLED" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Daemon:  $INSTALL_DIR\dcp_daemon.py"
Write-Host "  Config:  $INSTALL_DIR\config.json"
Write-Host "  Logs:    $LOG_DIR\daemon.log"
$keyPreview = $ApiKey.Substring(0, [Math]::Min(20, $ApiKey.Length))
Write-Host "  Key:     $keyPreview..."
Write-Host ""
Write-Host "  Commands:" -ForegroundColor White
Write-Host "    Status: Get-ScheduledTask -TaskName '$taskName'"
Write-Host "    Logs:   Get-Content $LOG_DIR\daemon.log -Tail 20"
Write-Host "    Stop:   Stop-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "  Keep the /setup page open — it will flip to 'You're Live' once the" -ForegroundColor White
Write-Host "  daemon's first heartbeat lands (typically 30-60 seconds)." -ForegroundColor White
Write-Host "============================================" -ForegroundColor Green
