# Node Setup Guide — Bare Machine to Running Node

> How to turn any machine into a clone execution node in the fleet.

---

## Prerequisites by Node Type

| Requirement | Core | GUI | Office | Security | GPU | Monitor |
|-------------|------|-----|--------|----------|-----|---------|
| Git | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Python 3.9+ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Node.js 20 LTS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| claude CLI | ✓ | ✓ | ✓ | ✓ | ✓ | optional |
| ANTHROPIC_API_KEY | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| TELEGRAM_BOT_TOKEN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| nmap (system) | ✗ | ✗ | ✗ | ✓ | ✗ | optional |
| NVIDIA GPU + CUDA | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Microsoft Office | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |

---

## Linux Setup (bare Debian/Ubuntu/Kali)

```bash
# 1. One command — handles everything
bash <(curl -s https://raw.githubusercontent.com/diamondcrusher42/Agent4wiki/main/scripts/bootstrap-linux.sh) --node-type code

# Or clone first then run locally:
git clone https://github.com/diamondcrusher42/Agent4wiki ~/agent4
bash ~/agent4/scripts/bootstrap-linux.sh --node-type code
```

**What it installs:**
- git, python3, python3-venv, nodejs via apt
- claude CLI via npm
- Python venv at `~/agent4/venv/`
- systemd service: `agent4-dispatcher` (auto-restarts on crash, starts at login)

**For Kali / security node:**
```bash
bash ~/agent4/scripts/bootstrap-linux.sh --node-type security
# Also installs: nmap, masscan, nikto, aircrack-ng, wireshark-cli
```

---

## Windows Setup (bare Windows 10/11)

```powershell
# 1. Open PowerShell as Administrator
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

# 2. Run bootstrap (installs git, python, node via winget, then sets up repo)
irm https://raw.githubusercontent.com/diamondcrusher42/Agent4wiki/main/scripts/bootstrap-windows.ps1 | iex

# Or clone first:
git clone https://github.com/diamondcrusher42/Agent4wiki $env:USERPROFILE\agent4
cd $env:USERPROFILE\agent4
.\scripts\bootstrap-windows.ps1 -NodeType office
```

**What it installs:**
- Git (with `core.autocrlf=false` — critical for cross-platform compatibility)
- Python 3.11 via winget
- Node.js 20 LTS via winget
- claude CLI via npm
- Python venv at `%USERPROFILE%\agent4\venv\`
- Task Scheduler job: `Agent4-Dispatcher-<hostname>` (restarts on crash, runs at logon)

---

## Manual Setup (any platform, step by step)

### 1. Install base dependencies

**Linux:**
```bash
sudo apt install -y git python3 python3-pip python3-venv curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**Mac:**
```bash
xcode-select --install  # or: brew install git python node
brew install git node python@3.11
```

**Windows:**
```powershell
winget install Git.Git Python.Python.3.11 OpenJS.NodeJS.LTS
# Restart PowerShell after to pick up PATH changes
```

### 2. Install claude CLI

```bash
npm install -g @anthropic-ai/claude-code
claude auth  # Opens browser for authentication
```

**Windows PATH issue:** If `claude` isn't found after install, find the npm global bin dir:
```powershell
npm config get prefix
# e.g. C:\Users\you\AppData\Roaming\npm
# Add that to your PATH in System Environment Variables
```

### 3. Clone repo

```bash
git clone https://github.com/diamondcrusher42/Agent4wiki ~/agent4
cd ~/agent4

# Required git settings for cross-platform consistency
git config core.autocrlf false
git config core.eol lf
```

### 4. Python venv

```bash
# Linux / Mac
python3 -m venv venv
source venv/bin/activate

# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install deps (none required for core dispatcher)
pip install --upgrade pip
# Security node: pip install python-nmap scapy
# GPU node: see pytorch.org for CUDA-specific install command
# GUI node: pip install pyautogui playwright && playwright install
# Office node (Windows): pip install pywin32
```

### 5. Node.js deps

```bash
npm install
```

### 6. Configure .env

```bash
cp .env.example .env
# Edit with your values:
nano .env        # Linux/Mac
notepad .env     # Windows
```

**Critical .env values for any node:**
```env
AGENT_BASE_DIR=/home/you/agent4   # absolute path to repo root
AGENT_NODE_ID=my-node-name        # unique ID for this machine
TELEGRAM_BOT_TOKEN=123456:ABC...  # same bot as primary machine
TELEGRAM_CHAT_ID=564661663        # same chat ID
ANTHROPIC_API_KEY=sk-ant-...      # omit on Kali/monitor nodes
```

### 7. Create state directories

```bash
mkdir -p state/keychain/kids state/memory state/user_agent \
         state/worktrees state/fleet/heartbeats \
         brain/inbox brain/active brain/completed brain/failed \
         events forge
```

### 8. Register node

```bash
python scripts/register_node.py  # or let bootstrap do this
```

### 9. Start dispatcher

```bash
# Linux: systemd service (from bootstrap)
sudo systemctl start agent4-dispatcher
sudo systemctl status agent4-dispatcher
journalctl -u agent4-dispatcher -f   # follow logs

# Linux: manual
source venv/bin/activate
python brain/dispatcher.py watch

# Windows: Task Scheduler (from bootstrap)
Start-ScheduledTask -TaskName "Agent4-Dispatcher-$(hostname)"

# Windows: manual
.\venv\Scripts\Activate.ps1
python brain\dispatcher.py watch
```

---

## Known Path Issues

### 1. `AGENT_BASE_DIR` must be set

`brain/dispatcher.py` defaults to `~/agent-v4` if unset. If your repo is at `~/agent4`, set:
```env
AGENT_BASE_DIR=/home/you/agent4
```

### 2. dispatcher.py has stale internal paths (audit issue #12)

Current dispatcher.py expects:
- `user-agent/profile/soul.md` → actual: `wiki/Soul.md`
- `user-agent/state/state.json` → actual: `state/user_agent/state.json`
- `brain/templates/` → actual: `core/clones/templates/` or `templates/`

**Workaround until fixed:** Set these env vars in `.env`:
```env
SOUL_MD_PATH=wiki/Soul.md
USER_STATE_PATH=state/user_agent/state.json
TEMPLATES_PATH=core/clones/templates
```

### 3. Windows PATH reload required after installs

After winget/npm installs, open a new PowerShell window. Or force reload:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
```

### 4. Git worktrees on Windows

`state/worktrees/` path must use forward slashes in git commands even on Windows. Python's `pathlib.Path` handles this automatically — never hardcode backslashes.

### 5. Python venv activation differs by platform

| Platform | Activate command |
|----------|-----------------|
| Linux/Mac bash | `source venv/bin/activate` |
| Mac zsh | `source venv/bin/activate` |
| Windows PowerShell | `.\venv\Scripts\Activate.ps1` |
| Windows cmd | `venv\Scripts\activate.bat` |

The systemd/Task Scheduler watchdog calls the venv Python directly (`venv/bin/python` or `venv\Scripts\python.exe`) so activation isn't needed in the service.

### 6. claude CLI on Windows — execution policy

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
# Required before running any .ps1 script or npm global tools
```

### 7. Kali — nmap requires root OR capabilities

```bash
# Option A: run nmap with sudo (simpler)
sudo nmap ...

# Option B: give nmap raw socket capability (no sudo needed)
sudo setcap cap_net_raw,cap_net_admin+eip $(which nmap)
```

---

## Smoke Tests (verify everything works)

```bash
# Run from repo root with venv activated

# 1. Python stdlib (dispatcher core)
python -c "import json, pathlib, subprocess, logging, dataclasses; print('Python OK')"

# 2. Node.js
node -e "console.log('Node OK:', process.version)"

# 3. TypeScript compile check
npx tsc --noEmit && echo "TypeScript OK" || echo "TypeScript errors (stubs throw — expected)"

# 4. Claude CLI
claude --version

# 5. Dispatcher dry run
python brain/dispatcher.py status

# 6. Git worktrees (will fail until Phase 5 is implemented)
git worktree list

# 7. Telegram ping (requires .env filled in)
python -c "
import os, urllib.request, json
token = os.getenv('TELEGRAM_BOT_TOKEN')
chat  = os.getenv('TELEGRAM_CHAT_ID')
if token and chat:
    url = f'https://api.telegram.org/bot{token}/sendMessage'
    data = json.dumps({'chat_id': chat, 'text': 'Node smoke test OK'}).encode()
    urllib.request.urlopen(url, data)
    print('Telegram ping sent')
else:
    print('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env first')
"
```

---

## Node-Specific Setup Notes

### Kali — Security isolation (mandatory)

```bash
# 1. Create isolated keychain vault (separate from production)
mkdir -p state/keychain/kali
# 2. Do NOT copy ANTHROPIC_API_KEY or GITHUB_TOKEN to this .env
# 3. Kali vault contains only: network tool configs, scan target lists
# 4. Network isolation recommended: Kali on separate VLAN from production
```

### GPU node — PyTorch

```bash
# Find the right command for your CUDA version at: https://pytorch.org/get-started/locally/
# Example for CUDA 12.1:
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Verify GPU is visible:
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"

# Install Whisper:
pip install openai-whisper

# Install Ollama (separate installer):
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3        # download a model
ollama run llama3         # test
```

### Windows — Office COM automation

```powershell
# pywin32 must be installed in the venv
pip install pywin32
python -m win32api  # verify install

# Test COM access:
python -c "
import win32com.client
excel = win32com.client.Dispatch('Excel.Application')
print('Excel version:', excel.Version)
excel.Quit()
"
```

### Mac — AppleScript

```bash
# AppleScript access requires System Preferences → Security → Accessibility
# Grant permission to Terminal (or iTerm2)

# Test:
osascript -e 'tell app "Finder" to display dialog "Agent4 node running"'
```

---

## Fleet Registration Format

`state/fleet/registry.json` — pulled and pushed by all nodes via git:

```json
{
  "nodes": [
    {
      "id": "kevin",
      "hostname": "DESKTOP-RBUGS84",
      "platform": "linux",
      "node_type": "code",
      "capabilities": ["linux", "code", "docker", "gpu", "cuda", "ollama", "browser"],
      "agent_dir": "/home/claudebot/agent4",
      "status": "online",
      "registered_at": "2026-04-07T23:00:00Z",
      "last_seen": "2026-04-07T23:35:00Z",
      "active_clones": 2,
      "max_concurrent": 5
    },
    {
      "id": "mike",
      "hostname": "DESKTOP-FJOOULF",
      "platform": "windows",
      "node_type": "office",
      "capabilities": ["windows", "office", "word", "excel", "outlook", "gui-automation"],
      "agent_dir": "C:\\Users\\jure\\agent4",
      "status": "online",
      "registered_at": "2026-04-07T23:00:00Z",
      "last_seen": "2026-04-07T23:35:00Z",
      "active_clones": 0,
      "max_concurrent": 3
    }
  ]
}
```

*See also: [[concept-distributed-clones]], [[segment-clones]], [[concept-dispatcher]]*
