; =============================================================================
; DCP Provider Daemon — Windows NSIS Installer v2.3
; =============================================================================
; Installs to %LOCALAPPDATA%\dcp-provider (NO admin required)
; GUI pages: Welcome → GPU Check → API Key → Run Mode → Schedule → Install → Finish
; Bundles: dcp_daemon.py (v4.0.0-alpha.2), dcp-setup-helper.ps1, dcp-uninstall-helper.ps1
; Build:   makensis dcp-provider-Windows.nsi
; =============================================================================

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"
!include "TextFunc.nsh"

; --------------- Product Info ---------------
!define PRODUCT_NAME "DCP Provider Daemon"
!define PRODUCT_PUBLISHER "DCP"
!define PRODUCT_VERSION "4.0.0"
!define PRODUCT_WEB_SITE "https://dcp.sa"
!define DCP_API_BASE "https://api.dcp.sa"
!define DASHBOARD_URL "https://dcp.sa/provider"

; --------------- General Settings ---------------
Name "${PRODUCT_NAME} v${PRODUCT_VERSION}"
OutFile "dcp-provider-setup-Windows.exe"
InstallDir "$LOCALAPPDATA\dcp-provider"
RequestExecutionLevel user
Unicode True

; --------------- Version Info (shows in .exe Properties → Details) ---------------
VIProductVersion "${PRODUCT_VERSION}.0"
VIFileVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "DCP Provider Daemon Installer — Earn with your GPU"
VIAddVersionKey "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey "LegalCopyright" "© 2026 DCP. All rights reserved."

; --------------- Brand ---------------
!define MUI_ICON "dcp-icon.ico"
!define MUI_UNICON "dcp-icon.ico"
!define MUI_ABORTWARNING

; --------------- Variables ---------------
Var API_KEY
Var RUN_MODE          ; "always-on" | "scheduled" | "manual"
Var SCHED_START
Var SCHED_END
Var GPU_NAME
Var GPU_VRAM

; Dialog handles
Var hApiKeyDlg
Var hApiKeyInput
Var hGpuCheckDlg
Var hGpuStatusLabel
Var hGpuDetailLabel
Var hRunModeDlg
Var hRadioAlways
Var hRadioScheduled
Var hRadioManual
Var hSchedDlg
Var hStartTimeInput
Var hEndTimeInput

; --------------- Pages ---------------
; 1. Welcome
!define MUI_WELCOMEPAGE_TITLE "DCP Provider Daemon v${PRODUCT_VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Welcome to the DCP Provider setup.$\r$\n$\r$\nThis will install the DCP daemon so your GPU starts earning credits automatically.$\r$\n$\r$\nWhat's new in v${PRODUCT_VERSION}:$\r$\n  • Auto-recovery: daemon restarts on crashes$\r$\n  • Auto-updates: stays current automatically$\r$\n  • Smart GPU guard: only accepts jobs your GPU can handle$\r$\n  • Connection monitoring: tracks bandwidth quality$\r$\n$\r$\nRequirements:$\r$\n  • NVIDIA GPU with 4 GB+ VRAM$\r$\n  • Internet connection$\r$\n  • No admin privileges needed$\r$\n$\r$\nClick Next to check your GPU."
!insertmacro MUI_PAGE_WELCOME

; 2. GPU Check (custom)
Page custom GpuCheckPageCreate GpuCheckPageLeave

; 3. API Key (custom)
Page custom ApiKeyPageCreate ApiKeyPageLeave

; 4. Run Mode (custom)
Page custom RunModePageCreate RunModePageLeave

; 5. Schedule (custom — conditional)
Page custom SchedulePageCreate SchedulePageLeave

; 6. Install
!insertmacro MUI_PAGE_INSTFILES

; 7. Finish
!define MUI_FINISHPAGE_TITLE "You're All Set!"
!define MUI_FINISHPAGE_TEXT "DCP Provider Daemon v${PRODUCT_VERSION} is installed.$\r$\n$\r$\nGPU: $GPU_NAME ($GPU_VRAM MB VRAM)$\r$\nMode: $RUN_MODE$\r$\nDaemon: v4.0.0-alpha.2 (auto-updating)$\r$\n$\r$\nYour GPU is now earning DCP credits.$\r$\nThe daemon will auto-recover from crashes and update itself.$\r$\nClick 'Open My Dashboard' to track your earnings."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Open My Dashboard"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenDashboard
!define MUI_FINISHPAGE_NOREBOOTSUPPORT
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; --------------- Init: Parse /KEY= from command line ---------------
Function .onInit
    StrCpy $RUN_MODE "always-on"
    StrCpy $SCHED_START "23:00"
    StrCpy $SCHED_END "07:00"
    StrCpy $API_KEY ""
    StrCpy $GPU_NAME "Not detected"
    StrCpy $GPU_VRAM "0"

    ; Parse /KEY=xxx from command line
    ${GetParameters} $0
    ${GetOptions} $0 "/KEY=" $1
    ${IfNot} ${Errors}
        StrCpy $API_KEY $1
    ${EndIf}
FunctionEnd

; --------------- Page: GPU Check ---------------
Function GpuCheckPageCreate
    !insertmacro MUI_HEADER_TEXT "GPU Detection" "Checking your NVIDIA GPU"
    nsDialogs::Create 1018
    Pop $hGpuCheckDlg
    ${If} $hGpuCheckDlg == error
        Abort
    ${EndIf}

    ; ── GPU DETECTION WATERFALL ──────────────────────────────────────────────
    ; Three methods in order of reliability. If ANY succeeds, we have the GPU.
    ;
    ; Method 1: WMI via PowerShell (works 99% of the time, no PATH dependency)
    ; Method 2: nvidia-smi via registry path (NVIDIA stores install path in registry)
    ; Method 3: nvidia-smi via known filesystem paths + PATH
    ;
    ; WMI returns ALL GPUs; we filter for NVIDIA in the PowerShell script.
    ; ──────────────────────────────────────────────────────────────────────────

    ; Method 1: WMI query (most reliable — no PATH, no nvidia-smi needed)
    nsExec::ExecToStack 'powershell -NoProfile -Command "$$g = Get-CimInstance Win32_VideoController | Where-Object { $$_.Name -match ''NVIDIA'' } | Select-Object -First 1; if ($$g) { $$vram = [math]::Floor($$g.AdapterRAM / 1048576); Write-Output \"$$($g.Name), $$vram\" } else { exit 1 }"'
    Pop $0
    Pop $1

    ${If} $0 != 0
    ${OrIf} $1 == ""
        ; Method 2: nvidia-smi via registry path
        ReadRegStr $2 HKLM "SOFTWARE\NVIDIA Corporation\Global\NvSmi" "NvSmiPath"
        ${If} $2 != ""
            nsExec::ExecToStack '"$2\nvidia-smi.exe" --query-gpu=name,memory.total --format=csv,noheader,nounits'
            Pop $0
            Pop $1
        ${EndIf}
    ${EndIf}

    ${If} $0 != 0
    ${OrIf} $1 == ""
        ; Method 3: nvidia-smi via known paths + PATH fallback
        nsExec::ExecToStack 'cmd /c (nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>nul) || ("C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe" --query-gpu=name,memory.total --format=csv,noheader,nounits 2>nul) || ("C:\Windows\System32\nvidia-smi.exe" --query-gpu=name,memory.total --format=csv,noheader,nounits 2>nul)'
        Pop $0
        Pop $1
    ${EndIf}

    ${If} $0 == 0
    ${AndIf} $1 != ""
        ; Parse "NVIDIA GeForce RTX 3060 Ti, 8192"
        ; Find the comma to split name and VRAM
        StrLen $2 $1
        ; Store full output for parsing
        StrCpy $GPU_NAME $1
        ; Try to extract just the name (before comma)
        ${WordFind} $1 "," "+1" $3
        ${If} $3 != $1
            StrCpy $GPU_NAME $3
            ${WordFind} $1 "," "+2" $4
            ; Trim whitespace from VRAM
            ${TrimNewLines} $4 $GPU_VRAM
            StrCpy $GPU_VRAM $4
        ${EndIf}

        ${NSD_CreateLabel} 0 0 100% 24u "NVIDIA GPU detected:"
        Pop $hGpuStatusLabel
        CreateFont $2 "$(^Font)" "12" "700"
        SendMessage $hGpuStatusLabel ${WM_SETFONT} $2 0
        SetCtlColors $hGpuStatusLabel 0x008800 transparent

        ${NSD_CreateLabel} 0 30u 100% 20u "GPU:   $GPU_NAME"
        Pop $0
        CreateFont $2 "$(^Font)" "10" "700"
        SendMessage $0 ${WM_SETFONT} $2 0

        ${NSD_CreateLabel} 0 50u 100% 16u "VRAM:  $GPU_VRAM MB"
        Pop $0

        ${NSD_CreateLabel} 0 76u 100% 28u "Your GPU is compatible with DCP. Click Next to continue."
        Pop $hGpuDetailLabel
        SetCtlColors $hGpuDetailLabel 0x666666 transparent
    ${Else}
        StrCpy $GPU_NAME "Not detected"
        StrCpy $GPU_VRAM "0"

        ${NSD_CreateLabel} 0 0 100% 24u "No NVIDIA GPU detected"
        Pop $hGpuStatusLabel
        CreateFont $2 "$(^Font)" "12" "700"
        SendMessage $hGpuStatusLabel ${WM_SETFONT} $2 0
        SetCtlColors $hGpuStatusLabel 0xCC0000 transparent

        ${NSD_CreateLabel} 0 30u 100% 48u "DCP requires an NVIDIA GPU with 4 GB+ VRAM.$\r$\n$\r$\nPossible causes:$\r$\n  • No NVIDIA GPU installed$\r$\n  • NVIDIA drivers not installed (download from nvidia.com/drivers)$\r$\n  • GPU is disabled in Device Manager"
        Pop $0

        ${NSD_CreateLabel} 0 90u 100% 24u "You can still continue, but the daemon may not function correctly."
        Pop $hGpuDetailLabel
        SetCtlColors $hGpuDetailLabel 0x996600 transparent
    ${EndIf}

    nsDialogs::Show
FunctionEnd

Function GpuCheckPageLeave
    ; Allow user to continue even without GPU (they may install drivers later)
    ${If} $GPU_NAME == "Not detected"
        MessageBox MB_YESNO|MB_ICONEXCLAMATION "No NVIDIA GPU was detected. The DCP daemon requires an NVIDIA GPU to earn credits.$\r$\n$\r$\nContinue anyway?" IDYES +2
        Abort
    ${EndIf}
FunctionEnd

; --------------- Page: API Key ---------------
Function ApiKeyPageCreate
    !insertmacro MUI_HEADER_TEXT "Provider API Key" "Enter your DCP Provider API Key"
    nsDialogs::Create 1018
    Pop $hApiKeyDlg
    ${If} $hApiKeyDlg == error
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Your Provider API Key:"
    Pop $0

    ${NSD_CreateText} 0 28u 100% 14u "$API_KEY"
    Pop $hApiKeyInput

    ${NSD_CreateLabel} 0 50u 100% 16u "Found in your onboarding email or provider dashboard."
    Pop $0
    SetCtlColors $0 0x666666 transparent

    ${NSD_CreateLabel} 0 72u 100% 16u "Format: dcp-provider-XXXXXXXXXX..."
    Pop $0
    SetCtlColors $0 0x999999 transparent

    nsDialogs::Show
FunctionEnd

Function ApiKeyPageLeave
    ${NSD_GetText} $hApiKeyInput $API_KEY
    ${If} $API_KEY == ""
        MessageBox MB_ICONEXCLAMATION|MB_OK "Please enter your Provider API Key."
        Abort
    ${EndIf}

    ; Basic format validation
    StrCpy $0 $API_KEY 13
    ${If} $0 != "dcp-provider-"
        MessageBox MB_YESNO|MB_ICONQUESTION "The API key doesn't start with 'dcp-provider-'. This may not be a valid provider key.$\r$\n$\r$\nContinue anyway?" IDYES +2
        Abort
    ${EndIf}
FunctionEnd

; --------------- Page: Run Mode ---------------
Function RunModePageCreate
    !insertmacro MUI_HEADER_TEXT "Run Mode" "Choose when your GPU should earn"
    nsDialogs::Create 1018
    Pop $hRunModeDlg
    ${If} $hRunModeDlg == error
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 16u "Select how you want the daemon to run:"
    Pop $0

    ${NSD_CreateRadioButton} 10u 24u 95% 12u "Always On (Recommended) — Runs whenever your PC is on"
    Pop $hRadioAlways

    ${NSD_CreateRadioButton} 10u 44u 95% 12u "Scheduled — Runs during specific hours (e.g. overnight)"
    Pop $hRadioScheduled

    ${NSD_CreateRadioButton} 10u 64u 95% 12u "Manual — You control when it runs"
    Pop $hRadioManual

    ; Default selection
    ${If} $RUN_MODE == "scheduled"
        ${NSD_Check} $hRadioScheduled
    ${ElseIf} $RUN_MODE == "manual"
        ${NSD_Check} $hRadioManual
    ${Else}
        ${NSD_Check} $hRadioAlways
    ${EndIf}

    ${NSD_CreateLabel} 10u 88u 95% 24u "Tip: 'Always On' maximizes your earnings. You can change this later in config.json."
    Pop $0
    SetCtlColors $0 0x666666 transparent

    nsDialogs::Show
FunctionEnd

Function RunModePageLeave
    ${NSD_GetState} $hRadioAlways $0
    ${If} $0 == ${BST_CHECKED}
        StrCpy $RUN_MODE "always-on"
    ${EndIf}

    ${NSD_GetState} $hRadioScheduled $0
    ${If} $0 == ${BST_CHECKED}
        StrCpy $RUN_MODE "scheduled"
    ${EndIf}

    ${NSD_GetState} $hRadioManual $0
    ${If} $0 == ${BST_CHECKED}
        StrCpy $RUN_MODE "manual"
    ${EndIf}
FunctionEnd

; --------------- Page: Schedule (conditional) ---------------
Function SchedulePageCreate
    ; Only show if scheduled mode
    ${If} $RUN_MODE != "scheduled"
        Abort  ; Skip this page
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "Schedule" "Set your earning hours"
    nsDialogs::Create 1018
    Pop $hSchedDlg
    ${If} $hSchedDlg == error
        Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 16u "Set the hours when your GPU should earn (24-hour format):"
    Pop $0

    ${NSD_CreateLabel} 0 26u 40% 12u "Start Time (HH:MM):"
    Pop $0
    ${NSD_CreateText} 42% 24u 25% 14u "$SCHED_START"
    Pop $hStartTimeInput

    ${NSD_CreateLabel} 0 50u 40% 12u "End Time (HH:MM):"
    Pop $0
    ${NSD_CreateText} 42% 48u 25% 14u "$SCHED_END"
    Pop $hEndTimeInput

    ${NSD_CreateLabel} 0 76u 100% 20u "Example: Start 23:00, End 07:00 = daemon runs overnight."
    Pop $0
    SetCtlColors $0 0x666666 transparent

    nsDialogs::Show
FunctionEnd

Function SchedulePageLeave
    ${NSD_GetText} $hStartTimeInput $SCHED_START
    ${NSD_GetText} $hEndTimeInput $SCHED_END
FunctionEnd

; --------------- Dashboard launcher ---------------
Function OpenDashboard
    ExecShell "open" "${DASHBOARD_URL}?key=$API_KEY"
FunctionEnd

; ===================== INSTALL SECTION =====================
Section "Install"
    ; ── Stop any already-running daemon FIRST ────────────────────────────────
    ; The daemon runs as python.exe with WorkingDirectory = $INSTDIR, which locks
    ; the install folder. Without this, re-running the installer over a live
    ; daemon fails with "file/folder in use" (and the user can't hand-delete the
    ; folder either). Mirrors the Uninstall section so re-install works in-place.
    DetailPrint "Stopping any existing DCP daemon before install..."
    nsExec::ExecToLog 'schtasks /End /TN "DCPProviderDaemon"'
    nsExec::ExecToLog 'schtasks /End /TN "DC1ProviderDaemon"'
    ; Kill the daemon by command line (catches python.exe / pythonw.exe running dcp_daemon.py)
    nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.CommandLine -match ''dcp_daemon'' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
    ; Belt-and-suspenders: kill by window title (matches the setup-helper stop script)
    nsExec::ExecToLog 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq DCP*" 2>nul'
    ; Let the OS release the folder/file handles before we write to $INSTDIR
    Sleep 1500

    SetOutPath "$INSTDIR"

    ; Bundle files
    File "dcp_daemon.py"
    File "dcp-setup-helper.ps1"
    File "dcp-uninstall-helper.ps1"

    ; Show progress
    DetailPrint "====================================="
    DetailPrint "DCP Provider Setup v${PRODUCT_VERSION}"
    DetailPrint "====================================="
    DetailPrint "GPU:      $GPU_NAME ($GPU_VRAM MB)"
    DetailPrint "Run mode: $RUN_MODE"
    DetailPrint ""
    DetailPrint "Running setup (detecting Python, installing dependencies, configuring daemon)..."
    DetailPrint "This may take 1-3 minutes depending on your internet speed."
    DetailPrint ""

    ; Run the setup helper with user selections
    nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -File "$INSTDIR\dcp-setup-helper.ps1" -ApiKey "$API_KEY" -RunMode "$RUN_MODE" -ScheduledStart "$SCHED_START" -ScheduledEnd "$SCHED_END" -InstallDir "$INSTDIR" -GpuName "$GPU_NAME" -GpuVram "$GPU_VRAM"'
    Pop $0
    DetailPrint ""
    DetailPrint "Setup helper exit code: $0"

    ; Abort installer on setup failure — prevents broken installed state
    IntCmp $0 0 setup_ok setup_failed setup_failed
    setup_failed:
        ; Try to read last lines of install.log for diagnostics
        DetailPrint "ERROR: Setup failed. Check install.log for details."
        MessageBox MB_OK|MB_ICONSTOP "Installation failed (exit code $0).$\n$\nCheck the log at:$\n$INSTDIR\install.log$\n$\nCommon causes:$\n  • Python download failed$\n  • pip install error$\n  • No internet connection$\n  • Antivirus blocking downloads$\n$\nTry disabling antivirus temporarily and re-running the installer."
        RMDir /r "$INSTDIR"
        Quit
    setup_ok:

    ; Write uninstaller
    WriteUninstaller "$INSTDIR\uninstall.exe"

    ; Registry (HKCU — no admin needed)
    WriteRegStr HKCU "Software\DCPProvider" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\DCPProvider" "ApiKey" "$API_KEY"
    WriteRegStr HKCU "Software\DCPProvider" "RunMode" "$RUN_MODE"
    WriteRegStr HKCU "Software\DCPProvider" "Version" "${PRODUCT_VERSION}"
    WriteRegStr HKCU "Software\DCPProvider" "GpuName" "$GPU_NAME"

    ; Add/Remove Programs entry (HKCU)
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider" "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider" "Publisher" "${PRODUCT_PUBLISHER}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider" "DisplayVersion" "${PRODUCT_VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider" "NoRepair" 1

    DetailPrint ""
    DetailPrint "====================================="
    DetailPrint "Installation complete!"
    DetailPrint "====================================="
SectionEnd

; ===================== UNINSTALL SECTION =====================
Section "Uninstall"
    ; Kill any running daemon processes first
    nsExec::ExecToLog 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq dcp*" 2>nul'
    nsExec::ExecToLog 'powershell -Command "Get-Process python -ErrorAction SilentlyContinue | Where-Object { $$_.MainModule.FileName -match ''dcp_daemon'' -or $$_.MainModule.FileName -match ''dc1'' } | Stop-Process -Force -ErrorAction SilentlyContinue"'

    ; Stop and remove scheduled task
    nsExec::ExecToLog 'schtasks /End /TN "DCPProviderDaemon"'
    nsExec::ExecToLog 'schtasks /Delete /TN "DCPProviderDaemon" /F'
    nsExec::ExecToLog 'schtasks /End /TN "DC1ProviderDaemon"'
    nsExec::ExecToLog 'schtasks /Delete /TN "DC1ProviderDaemon" /F'

    ; Run uninstall helper if present
    IfFileExists "$INSTDIR\dcp-uninstall-helper.ps1" 0 +2
        nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -File "$INSTDIR\dcp-uninstall-helper.ps1"'

    ; Remove desktop shortcut
    Delete "$DESKTOP\DCP - My Earnings.bat"
    Delete "$DESKTOP\DC1 - My Earnings.bat"

    ; Remove install directory (includes logs, config, daemon)
    RMDir /r "$INSTDIR"

    ; Remove registry keys
    DeleteRegKey HKCU "Software\DCPProvider"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DCPProvider"

    ; Confirmation
    MessageBox MB_OK "DCP Provider Daemon has been uninstalled.$\n$\nThank you for being a DCP provider!"
SectionEnd
