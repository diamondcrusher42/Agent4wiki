# bootstrap-windows.ps1 — One-command node setup for Windows 10/11
#
# Usage (run as Administrator in PowerShell):
#   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
#   .\scripts\bootstrap-windows.ps1 -NodeType code
#
# Node types: code | gui | office | monitor
#
# What it does:
#   1. Checks/installs: Git, Python, Node.js, claude CLI
#   2. Clones / updates repo
#   3. Sets up Python venv + Node deps
#   4. Creates state/ directory structure
#   5. Generates .env template
#   6. Detects capabilities (COM objects, Office, PowerShell version)
#   7. Registers node in fleet registry
#   8. Installs Task Scheduler watchdog job
#   9. Smoke test

param(
    [ValidateSet("code","gui","office","monitor")]
    [string]$NodeType = "code",
    [string]$AgentDir = "$env:USERPROFILE\agent4",
    [string]$RepoUrl = "https://github.com/diamondcrusher42/Agent4wiki",
    [string]$NodeId = $env:COMPUTERNAME.ToLower()
)

$ErrorActionPreference = "Stop"

function Write-Step { Write-Host "[bootstrap] $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[bootstrap] $args" -ForegroundColor Yellow }
function Write-Fail  { Write-Host "[bootstrap] $args" -ForegroundColor Red; exit 1 }

Write-Step "Starting bootstrap for node: $NodeId ($NodeType)"

# ── Step 1: Check for package manager (Winget or Chocolatey) ─────────────────

$useWinget = $false
$useChoco  = $false

if (Get-Command winget -ErrorAction SilentlyContinue) {
    $useWinget = $true
    Write-Step "Package manager: winget"
} elseif (Get-Command choco -ErrorAction SilentlyContinue) {
    $useChoco = $true
    Write-Step "Package manager: chocolatey"
} else {
    Write-Warn "Neither winget nor chocolatey found."
    Write-Warn "Install manually: Git, Python 3.11+, Node.js 20 LTS"
    Write-Warn "Or install Chocolatey: https://chocolatey.org/install"
}

# ── Step 2: Git ───────────────────────────────────────────────────────────────

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Step "Installing Git..."
    if ($useWinget) { winget install --id Git.Git -e --source winget --silent }
    elseif ($useChoco) { choco install git -y }
    else { Write-Fail "Install Git manually from https://git-scm.com/download/win then re-run" }

    # Reload PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
}
Write-Step "Git: $(git --version)"

# Disable CRLF conversion (avoids line-ending issues with Linux nodes)
git config --global core.autocrlf false
git config --global core.eol lf

# ── Step 3: Python 3.11 ───────────────────────────────────────────────────────

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Step "Installing Python 3.11..."
    if ($useWinget) { winget install --id Python.Python.3.11 -e --source winget --silent }
    elseif ($useChoco) { choco install python311 -y }
    else { Write-Fail "Install Python from https://python.org — check 'Add to PATH' during install" }

    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
}
$pyVersion = python --version
Write-Step "Python: $pyVersion"

# ── Step 4: Node.js 20 LTS ────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Step "Installing Node.js 20 LTS..."
    if ($useWinget) { winget install --id OpenJS.NodeJS.LTS -e --source winget --silent }
    elseif ($useChoco) { choco install nodejs-lts -y }
    else { Write-Fail "Install Node.js from https://nodejs.org" }

    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
}
Write-Step "Node.js: $(node --version)"

# ── Step 5: Claude CLI ────────────────────────────────────────────────────────

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Step "Installing claude CLI..."
    npm install -g @anthropic-ai/claude-code
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
}
Write-Step "claude CLI: installed"

# ── Step 6: Clone / update repo ───────────────────────────────────────────────

Write-Step "Setting up repo at $AgentDir..."
if (Test-Path "$AgentDir\.git") {
    git -C $AgentDir pull --ff-only
    Write-Step "Repo updated."
} else {
    git clone $RepoUrl $AgentDir
    Write-Step "Repo cloned."
}

Set-Location $AgentDir

# ── Step 7: Python venv ───────────────────────────────────────────────────────

Write-Step "Setting up Python venv..."
if (-not (Test-Path "venv")) {
    python -m venv venv
}

& "venv\Scripts\Activate.ps1"
python -m pip install --upgrade pip -q

# Node-type-specific deps
switch ($NodeType) {
    "gui"    { pip install pyautogui playwright pillow psutil -q }
    "office" { pip install pywin32 psutil -q }  # pywin32 for COM objects
    "monitor" { pip install psutil requests -q }
    default  { Write-Step "Core node — no extra Python deps." }
}

# ── Step 8: Node.js deps ──────────────────────────────────────────────────────

Write-Step "Installing Node.js dependencies..."
npm install --silent

# ── Step 9: State directory structure ─────────────────────────────────────────

Write-Step "Creating state/ directory structure..."
$dirs = @(
    "state\keychain\kids", "state\memory", "state\user_agent",
    "state\worktrees", "state\fleet\heartbeats",
    "brain\inbox", "brain\active", "brain\completed", "brain\failed",
    "events", "forge"
)
foreach ($d in $dirs) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# ── Step 10: .env setup ───────────────────────────────────────────────────────

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    # Inject detected values
    (Get-Content ".env") -replace "AGENT_BASE_DIR=.*", "AGENT_BASE_DIR=$AgentDir" |
        Set-Content ".env"
    Add-Content ".env" "`nAGENT_NODE_ID=$NodeId"
    Write-Warn "⚠️  .env created. Fill in your API keys: notepad $AgentDir\.env"
} else {
    Write-Step ".env already exists — not overwritten."
}

# ── Step 11: Detect capabilities ─────────────────────────────────────────────

Write-Step "Detecting node capabilities..."
$caps = @("windows", $NodeType)

if (Get-Command docker -ErrorAction SilentlyContinue)    { $caps += "docker" }
if (Get-Command ollama -ErrorAction SilentlyContinue)    { $caps += "ollama" }
if (Get-Command ffmpeg -ErrorAction SilentlyContinue)    { $caps += "ffmpeg" }

# Check for GPU (nvidia-smi)
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { $caps += "gpu"; $caps += "cuda" }

# Check for Office COM objects
try {
    $word = New-Object -ComObject Word.Application -ErrorAction Stop
    $word.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    $caps += "office"; $caps += "word"
} catch {}

try {
    $excel = New-Object -ComObject Excel.Application -ErrorAction Stop
    $excel.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    $caps += "excel"
} catch {}

try {
    $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null
    $caps += "outlook"
} catch {}

$capsJson = ($caps | ForEach-Object { "`"$_`"" }) -join ", "
Write-Step "Detected capabilities: [$capsJson]"

# Register node
$registryPath = "state\fleet\registry.json"
$registry = if (Test-Path $registryPath) {
    Get-Content $registryPath | ConvertFrom-Json
} else {
    [PSCustomObject]@{ nodes = @() }
}

$nodeEntry = [PSCustomObject]@{
    id             = $NodeId
    hostname       = $env:COMPUTERNAME
    platform       = "windows"
    node_type      = $NodeType
    capabilities   = $caps
    agent_dir      = $AgentDir
    status         = "online"
    registered_at  = (Get-Date).ToUniversalTime().ToString("o")
    last_seen      = (Get-Date).ToUniversalTime().ToString("o")
    active_clones  = 0
    max_concurrent = 3
}

$registry.nodes = @($registry.nodes | Where-Object { $_.id -ne $NodeId }) + $nodeEntry
$registry | ConvertTo-Json -Depth 5 | Set-Content $registryPath
Write-Step "Node registered in fleet registry."

# ── Step 12: Task Scheduler watchdog ─────────────────────────────────────────

Write-Step "Installing Task Scheduler watchdog..."
$taskName = "Agent4-Dispatcher-$NodeId"
$venvPython = "$AgentDir\venv\Scripts\python.exe"
$dispatcherScript = "$AgentDir\brain\dispatcher.py"

$action  = New-ScheduledTaskAction -Execute $venvPython -Argument "brain\dispatcher.py watch" -WorkingDirectory $AgentDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -RestartCount 99 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest | Out-Null
    Write-Step "Task Scheduler job installed: $taskName"
    Write-Step "Start now: Start-ScheduledTask -TaskName '$taskName'"
} catch {
    Write-Warn "Task Scheduler install failed (need admin?). Start manually:"
    Write-Warn "  cd $AgentDir && venv\Scripts\activate && python brain\dispatcher.py watch"
}

# ── Step 13: Smoke test ───────────────────────────────────────────────────────

Write-Step "Running smoke tests..."
& "venv\Scripts\python.exe" -c "import json, pathlib, subprocess, logging; print('[ok] Python stdlib')"
node --version | ForEach-Object { Write-Step "[ok] Node.js $_" }

$claudeOk = (Get-Command claude -ErrorAction SilentlyContinue) -ne $null
if ($claudeOk) { Write-Step "[ok] claude CLI found" }
else { Write-Warn "[!] claude CLI not on PATH. Close and reopen PowerShell, then try again." }

# ── Done ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Step "Bootstrap complete for node: $NodeId ($NodeType)"
Write-Host ""
Write-Host "  Next steps:"
Write-Host "  1. Fill in .env:  notepad $AgentDir\.env"
Write-Host "  2. Authenticate:  claude auth"
Write-Host "  3. Start:         Start-ScheduledTask -TaskName '$taskName'"
Write-Host "     OR manually:   cd $AgentDir; .\venv\Scripts\activate; python brain\dispatcher.py watch"
Write-Host "  4. Dry run test:  python brain\dispatcher.py dry brain\inbox\example.json"
Write-Host ""
