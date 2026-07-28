<# 
DCP Provider Daemon - Windows Installer v2.0.0
===============================================
This is a THIN INSTALLER only. It:
  1. Finds or installs Python 3.12+
  2. Downloads the universal dcp_daemon.py from the DC1 backend
  3. Registers with the backend
  4. Launches dcp_daemon.py

The actual daemon logic lives in dcp_daemon.py (shared across all platforms).
All features (GPU logs, auto-update, event reporting, etc.) come from dcp_daemon.py.

Usage:
  .\daemon.ps1 -ApiKey "YOUR_KEY" -ApiUrl "https://api.dcp.sa"
  .\daemon.ps1 -ApiKey "YOUR_KEY" -ApiUrl "https://api.dcp.sa" -RunMode "manual"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ApiKey,
    
    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "https://api.dcp.sa",
    
    [Parameter(Mandatory=$false)]
    [string]$RunMode = "always-on",

    [Parameter(Mandatory=$false)]
    [string]$TaskName = ""
)

$INSTALLER_VERSION = "2.0.0"
$INSTALL_DIR = "$env:USERPROFILE\dc1-provider"

function Fail-Install($Message) {
    Write-Host "  ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Get-Sha256Hex($Path) {
    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Get-MiningGuardExpectedSha256($GuardUrl) {
    $guardManifestUrl = "$GuardUrl&check_only=true"
    try {
        $manifest = Invoke-RestMethod -Uri $guardManifestUrl -UseBasicParsing -TimeoutSec 30
    } catch {
        Fail-Install "Failed to read mining_guard.py sha256 manifest."
    }
    if (-not $manifest.sha256 -or $manifest.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
        Fail-Install "Mining guard manifest did not include a valid sha256."
    }
    return $manifest.sha256.ToLowerInvariant()
}

Write-Host "`n================================================" -ForegroundColor Cyan
Write-Host "  DCP Provider Daemon - Windows Installer v$INSTALLER_VERSION" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan

# --- Step 1: Find or install Python ---
Write-Host "[1/5] Checking Python..." -ForegroundColor Yellow

function Find-RealPython {
    $candidates = @(
        "python", "python3",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:ProgramFiles\Python312\python.exe",
        "$env:ProgramFiles\Python311\python.exe",
        "C:\Python312\python.exe", "C:\Python311\python.exe"
    )
    foreach ($c in $candidates) {
        try {
            $v = & $c --version 2>&1
            if ($v -match "Python 3\.(\d+)") {
                $minor = [int]$Matches[1]
                if ($minor -ge 8) { return $c }
            }
        } catch {}
    }
    return $null
}

$pythonExe = Find-RealPython

if (-not $pythonExe) {
    Write-Host "  Python not found. Installing Python 3.12..." -ForegroundColor Yellow
    $installerUrl = "https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe"
    $installerPath = "$env:TEMP\python-3.12.4-amd64.exe"
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    Start-Process -FilePath $installerPath -ArgumentList '/quiet', 'InstallAllUsers=0', 'PrependPath=1' -Wait
    Remove-Item $installerPath -ErrorAction SilentlyContinue
    $pythonExe = Find-RealPython
    if (-not $pythonExe) {
        Write-Host "  ERROR: Python installation failed." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Python installed: $pythonExe" -ForegroundColor Green
} else {
    Write-Host "  Found Python: $pythonExe" -ForegroundColor Green
}

# --- Step 2: Install Python dependencies ---
Write-Host "[2/5] Installing dependencies..." -ForegroundColor Yellow
& $pythonExe -m pip install --upgrade pip --quiet 2>$null
& $pythonExe -m pip install requests --quiet 2>$null
Write-Host "  Dependencies ready." -ForegroundColor Green

# --- Step 3: Create install directory ---
Write-Host "[3/5] Setting up install directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $INSTALL_DIR | Out-Null
Write-Host "  Install dir: $INSTALL_DIR" -ForegroundColor Green

# --- Step 4: Download dcp_daemon.py + mining_guard.py from backend ---
Write-Host "[4/5] Downloading daemon bundle from DCP backend..." -ForegroundColor Yellow
$daemonUrl = "$ApiUrl/api/providers/download/daemon?key=$ApiKey"
$guardUrl = "$ApiUrl/api/providers/download/mining-guard?key=$ApiKey"
$daemonPath = "$INSTALL_DIR\dcp_daemon.py"
$guardPath = "$INSTALL_DIR\mining_guard.py"

try {
    $response = Invoke-WebRequest -Uri $daemonUrl -OutFile $daemonPath -UseBasicParsing -TimeoutSec 30
    Write-Host "  Daemon downloaded to: $daemonPath" -ForegroundColor Green
    
    # Verify it looks like a valid daemon file
    $content = Get-Content $daemonPath -Head 5 -Raw
    if ($content -notmatch "DC1 Provider Daemon") {
        Write-Host "  WARNING: Downloaded file may not be valid." -ForegroundColor Yellow
        Write-Host "  First line: $($content.Split("`n")[0])" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ERROR: Failed to download daemon." -ForegroundColor Red
    Write-Host "  URL: $daemonUrl" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    Write-Host "`n  Troubleshooting:" -ForegroundColor Yellow
    Write-Host "    1. Check internet connectivity" -ForegroundColor Yellow
    Write-Host "    2. Verify API key is correct" -ForegroundColor Yellow
    Write-Host "    3. Try: Invoke-WebRequest $ApiUrl/health" -ForegroundColor Yellow
    exit 1
}

try {
    $response = Invoke-WebRequest -Uri $guardUrl -OutFile $guardPath -UseBasicParsing -TimeoutSec 30
    Write-Host "  Mining guard downloaded to: $guardPath" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Failed to download mining_guard.py companion." -ForegroundColor Red
    Write-Host "  URL: $guardUrl" -ForegroundColor Red
    Write-Host "  Error: $_" -ForegroundColor Red
    exit 1
}
$guardExpectedSha256 = Get-MiningGuardExpectedSha256 $guardUrl
$guardActualSha256 = Get-Sha256Hex $guardPath
if ($guardActualSha256 -ne $guardExpectedSha256) {
    Fail-Install "Mining guard sha256 mismatch (expected $guardExpectedSha256, got $guardActualSha256)."
}
$guardExpectedSha256 | Out-File "${guardPath}.sha256" -Encoding ascii

# --- Step 5: Register and launch ---
Write-Host "[5/5] Launching daemon..." -ForegroundColor Yellow

# Create a launcher batch file for easy restart
$launcherBat = @"
@echo off
echo Starting DCP Provider Daemon...
echo Press Ctrl+C to stop.
"$pythonExe" "$daemonPath" --key "$ApiKey" --url "$ApiUrl"
pause
"@
Set-Content -Path "$INSTALL_DIR\start-dc1.bat" -Value $launcherBat

# Create dashboard URL
$dashUrl = "$ApiUrl/provider?key=$ApiKey"

Write-Host "`n================================================" -ForegroundColor Green
Write-Host "  DCP Provider Daemon installed successfully!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "  Installer:    v$INSTALLER_VERSION"
Write-Host "  Daemon:       dcp_daemon.py (auto-updating)"
Write-Host "  Install dir:  $INSTALL_DIR"
Write-Host "  Python:       $pythonExe"
Write-Host "  Dashboard:    $dashUrl"
if ($RunMode -eq 'manual') {
    Write-Host "`n  To start earning: double-click 'DCP - My Earnings' on your Desktop" -ForegroundColor Cyan
    Write-Host "  Or run: $INSTALL_DIR\start-dc1.bat`n"
}
Write-Host ""
Write-Host "  FEATURES (from dcp_daemon.py):" -ForegroundColor Cyan
Write-Host "    - Auto-updating (new versions download automatically)"
Write-Host "    - GPU execution logs (sent to backend)"
Write-Host "    - Real-time job progress reporting"
Write-Host "    - Crash recovery with watchdog"
Write-Host "    - Docker support (if available)"
Write-Host "    - Structured logging to ~/dc1-provider/logs/"
Write-Host ""

# Launch the daemon
Write-Host "Starting daemon now...`n" -ForegroundColor Green
& $pythonExe $daemonPath --key $ApiKey --url $ApiUrl
