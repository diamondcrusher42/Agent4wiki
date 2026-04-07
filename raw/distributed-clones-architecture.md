# Distributed Clones — Multi-Machine Execution Fabric

> Architectural concept: any machine with git access + claude CLI becomes a clone execution node.

## The Core Insight

The existing architecture already contains everything needed for distribution. The dispatcher watches `brain/inbox/`. If that inbox is a shared location (git repo, cloud sync, or network mount) and multiple machines run `dispatcher.py watch`, you have a distributed queue. Each machine picks up tasks it can handle, executes them in a local worktree, and pushes results back via the same channel.

**Zero new protocol needed.** The inter-agent protocol, Keychain JIT injection, and JSON handshake all work the same on any machine. You extend the Task schema with one field: `target_node` or `required_platform`.

---

## How Clones Reach Remote Machines

### Option A — Shared git repo inbox (recommended MVP)

```
Primary (KEVIN)                    Remote node (MIKE/Kali/Mac)
  Brain writes task JSON           dispatcher.py watch
    → git push brain/inbox/          → git pull every 2s
      → remote node picks it up       → git worktree add (local)
                                       → execute clone locally
                                         → git push result
                                           → Primary merges
```

Advantage: git is already the backbone. No new infrastructure. Each node just needs git + claude CLI + Python 3.9.

### Option B — SSH dispatch (for one-shot tasks)

Primary SSHes into the remote node and runs the task directly:
```bash
ssh user@remote "cd ~/agent4 && python dispatcher.py run /path/to/task.json"
```

Fast for urgent or interactive tasks. Requires SSH key setup per node.

### Option C — Telegram as task bus (for machines behind NAT)

For machines without SSH access (behind firewall, mobile, dynamic IP):
- Each node has a dedicated Telegram bot or listens on a bot channel
- Brain sends task as a message/document to the node's bot
- Node executes, replies with result
- Works on Windows, Mac, Android, anywhere Telegram runs

---

## Task Schema Extension

Add two fields to the existing Task dataclass:

```python
@dataclass
class Task:
    # ... existing fields ...
    target_node: str = "any"          # "any" | "kevin" | "mike" | "kali" | specific hostname
    required_platform: str = "any"   # "any" | "windows" | "macos" | "linux" | "kali"
    required_capabilities: list = field(default_factory=list)
    # e.g., ["gpu", "docker", "browser", "nmap", "office", "kali-tools"]
```

Each node's dispatcher filters: skip tasks where `target_node != hostname` and `target_node != "any"`, and where `required_capabilities` contains anything the node doesn't have.

---

## Node Registry

Extends the clone registry pattern. Each machine registers on first boot:

```json
{
  "nodes": [
    {
      "id": "kevin",
      "hostname": "DESKTOP-RBUGS84",
      "platform": "linux",
      "capabilities": ["docker", "browser", "gpu-rtx3090", "whisper", "ollama"],
      "status": "online",
      "last_seen": "2026-04-07T23:00:00Z",
      "active_clones": 2,
      "max_concurrent": 5
    },
    {
      "id": "mike",
      "hostname": "DESKTOP-FJOOULF",
      "platform": "windows",
      "capabilities": ["gui-automation", "office", "powershell", "win32", "browser-ie"],
      "status": "online",
      "last_seen": "2026-04-07T23:00:00Z",
      "active_clones": 1,
      "max_concurrent": 3
    }
  ]
}
```

File: `state/fleet/registry.json` (gitignored — runtime data).

---

## What Each Platform Brings

### Windows (MIKE pattern — already operational)
**Unique capabilities:**
- GUI automation (PyAutoGUI, Playwright-Win32, AutoHotKey via subprocess)
- Office suite automation (Excel macros, Word mail merge, Outlook calendar/email)
- Active Directory + Group Policy management (PowerShell DSC)
- Registry editing, WMI queries, native Win32 API access
- IE/Edge legacy browser testing
- Windows Defender management, Windows Event Log parsing
- COM object automation (anything with a COM interface)

**Clone use cases:**
- `skill=office` — send 200 personalized emails from Outlook, manage contacts
- `skill=windows-admin` — add/remove AD users, reset passwords, apply GPO
- `skill=gui-test` — click through Windows installers, test Win32 apps
- `skill=windows-audit` — parse Event Logs, check installed software, patch status

---

### Mac
**Unique capabilities:**
- Xcode build automation (iOS/macOS app compilation)
- Apple ecosystem APIs (iCloud, Keychain, Contacts, Calendar via AppleScript/JXA)
- Final Cut Pro / Logic Pro automation
- Safari-specific browser testing
- macOS-specific shell (zsh, Homebrew ecosystem)
- Screen recording with native APIs
- iMessage automation (via Messages app AppleScript)

**Clone use cases:**
- `skill=ios-build` — compile and archive an iOS app
- `skill=mac-admin` — manage system preferences, users, FileVault, MDM profiles
- `skill=apple-automation` — create events in Calendar, send iMessages, manage Contacts

---

### Linux (generic — KEVIN is already this)
**Unique capabilities:**
- Docker-native workloads (no Docker Desktop overhead)
- Full POSIX shell environment
- Headless browsers (Chromium, Firefox)
- Server-side development (Node.js, Python, Go, Rust)
- Cron, systemd service management
- SSH server (can BE the remote endpoint for other nodes)

**Clone use cases:**
- Default for all code/devops/research tasks
- `skill=server-admin` — deploy services, manage systemd units, configure nginx

---

### Kali Linux
**Unique capabilities — ONLY run authorized tasks here:**
- Network scanning: nmap, masscan, netdiscover
- Vulnerability scanning: OpenVAS, Nikto, Nuclei
- WiFi analysis: aircrack-ng, Kismet
- Password testing: hashcat, John the Ripper (on authorized systems only)
- Packet capture: Wireshark/tshark
- Web app testing: Burp Suite, sqlmap
- Forensics: Autopsy, Volatility
- Full Metasploit framework

**Clone use cases:**
- `skill=network-scan` — discover all devices on 192.168.x.x, identify OS/services
- `skill=security-audit` — run Nikto + Nuclei against your own web apps
- `skill=wifi-audit` — scan for rogue access points on your network
- `skill=device-inventory` — enumerate all hardware on the network
- `skill=vuln-check` — check your servers against CVE database

**Security isolation rule:** Kali node gets its own isolated Keychain vault (`state/keychain/kali/`). No production API keys ever reach this node. Kali clones are network-isolated from production systems. Results are signed before merge.

---

### GPU Machine
**Unique capabilities:**
- Local AI inference: Ollama (Llama 3, Mistral, CodeLlama), BitNet
- Image generation: Stable Diffusion, ComfyUI
- Speech: Whisper (transcription), TTS (text-to-speech)
- Video processing: ffmpeg with CUDA acceleration
- Data processing: pandas/cuDF, PyTorch training

**Clone use cases:**
- `skill=inference` — run a 70B model locally for sensitive data that can't go to Anthropic
- `skill=image-gen` — generate product images, diagrams, UI mockups
- `skill=transcribe` — bulk transcribe audio/video files with Whisper
- `skill=data-crunch` — process large datasets with GPU-accelerated pandas

---

### Always-On SBC (Raspberry Pi, NUC)
**Role: Persistent droid platform**
- Low power, always on (unlike laptops that sleep)
- Network monitoring droid (ping devices, check service health)
- Sensor data collection (temperature, uptime, network traffic)
- Scheduled tasks that must run 24/7
- Fallback Telegram listener when primary machine is off

**Clone use cases:**
- `skill=monitor` — run as a droid: check every device on the network every 5 min
- `skill=backup` — trigger rsync backups on schedule
- `skill=health-check` — ping all services, report via Telegram if anything goes down

---

## Supervision Architecture

```
Fleet Health Droid (runs on primary machine — KEVIN)
  ↓ reads fleet/registry.json every 60s
  ↓ pings each node's heartbeat endpoint (or git commit timestamp)
  ↓ if node silent for > threshold: Telegram alert
  ↓ updates node status in registry.json

Each Remote Node:
  ├── dispatcher.py watch (task queue)
  ├── watchdog.py (restarts dispatcher if it crashes)
  └── heartbeat.py (writes to fleet/heartbeats/<node>.json every 30s)
```

The heartbeat file is a simple JSON with `{"node": "kali", "ts": "...", "active": 1, "load": 0.4}`. The fleet health droid reads these.

**Telegram alerts from remote nodes** go to the same chat via the same bot token. Format:
```
[NODE: kali] security-scan task-abc completed. 47 devices found. 3 open ports flagged.
```

---

## Credential Distribution (Security-Critical)

Each node gets the minimal credential set it needs:

```
KEVIN (primary):     full vault — all keys
MIKE (Windows):      TELEGRAM_ADMIN_BOT, ANTHROPIC_API_KEY only
Kali:                no production keys — isolated vault, only network tool configs
Mac:                 APPLE_SCRIPT_KEY, ANTHROPIC_API_KEY
GPU node:            ANTHROPIC_API_KEY (for inference evaluation), HF_TOKEN
Pi/SBC:              TELEGRAM_BOT_TOKEN (for droid alerts), no AI API keys
```

Provisioning flow:
1. Node registered in fleet registry
2. Admin manually provisions node vault via encrypted bootstrap script
3. Node can request additional keys via the Keychain scoping system — must be approved
4. Kali vault is physically separate, never merged with production vault

---

## Load Sharing + Fallback

```
Brain dispatches task
  → ComplexityClassifier: FULL_PIPELINE
    → Fleet Manager: which nodes can run this task?
      → Filter by: required_platform, required_capabilities, max_concurrent
      → Sort by: current_load (ascending)
      → Select: least-loaded capable node
        → Write task to brain/inbox/ with target_node set
          → Winning node picks it up
```

**Fallback chain:**
```
Primary task → KEVIN
  If KEVIN load > 80%: → route to available Linux node
    If no Linux node: → route to Mac (POSIX-compatible)
      If no Mac: → queue task, notify user of delay
```

**GPU fallback for inference:**
```
Task needs Sonnet API ($)
  → Is GPU node available with a capable local model?
    If yes: route to GPU node (Ollama) — free
    If no: use Anthropic API
```

---

## Onboarding a New Node (Bootstrap Script)

```bash
# Run once on any new machine to join the fleet
curl -s https://raw.github.com/.../bootstrap.sh | bash

# What it does:
# 1. Install: git, python3, claude CLI, node (if TypeScript tasks)
# 2. Clone agent4 repo to ~/agent4
# 3. Create state/keychain/ with gitignore
# 4. Register this machine in fleet/registry.json (pull latest, append, push)
# 5. Set up watchdog (systemd service on Linux, launchd plist on Mac, Task Scheduler on Windows)
# 6. Start dispatcher.py watch
# 7. Send Telegram ping: "Node <hostname> online. Platform: <linux/macos/windows>. Ready."
```

---

## New Architecture Elements Required

| Component | Location | Purpose |
|-----------|----------|---------|
| `state/fleet/registry.json` | gitignored | Node registry + capabilities + status |
| `state/fleet/heartbeats/` | gitignored | Per-node heartbeat files |
| `core/fleet/manager.ts` | committed | Fleet routing logic (extends Brain dispatcher) |
| `brain/fleet_health_droid.py` | committed | Monitors all nodes, Telegram alerts |
| `scripts/bootstrap.sh` | committed | One-command node onboarding |
| `core/keychain/config/scopes.yaml` | committed | Extended with per-node scope profiles |
| Task schema `target_node` field | committed | Route tasks to specific nodes |

---

## Use Case Map

| Use Case | Node | Skill | Notes |
|----------|------|-------|-------|
| Computer control / GUI | MIKE (Win) or Mac | `gui-automation` | Screenshots, click automation |
| CPU-heavy compute | Any Linux, GPU node | `compute` | Parallel data processing |
| GPU inference / image gen | GPU node | `inference`, `image-gen` | Local models, no API cost |
| Fallback instance | Any available node | Any | Automatic via load router |
| Load sharing | Fleet router | Any | Least-loaded capable node |
| Backup / rsync | Pi / always-on | `backup` | Scheduled, no sleep risk |
| Tech support (office) | MIKE (Win) | `windows-admin` | AD, GPO, Outlook |
| Office user management | MIKE (Win) | `office-admin` | Create/delete AD users |
| Device scan | Kali | `network-scan` | nmap, netdiscover |
| Network scan / audit | Kali | `security-audit` | Authorized targets only |
| iOS/Mac builds | Mac | `ios-build` | Xcode required |
| Sensitive inference | GPU node | `inference` | Data stays local |

*See also: [[segment-clones]], [[segment-brain]], [[concept-dispatcher]], [[concept-inter-agent-protocol]], [[segment-bridge]]*
