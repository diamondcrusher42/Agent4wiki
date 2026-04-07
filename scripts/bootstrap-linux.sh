#!/usr/bin/env bash
# bootstrap-linux.sh — One-command node setup for Debian/Ubuntu/Kali Linux
#
# Usage:
#   bash bootstrap-linux.sh [--node-type code|security|gpu|monitor]
#
# What it does:
#   1. Installs system dependencies
#   2. Installs claude CLI
#   3. Clones / updates the agent4 repo
#   4. Sets up Python venv + Node deps
#   5. Creates state/ directory structure
#   6. Generates .env template
#   7. Auto-detects node capabilities
#   8. Registers node in fleet/registry.json
#   9. Installs systemd watchdog service
#  10. Sends Telegram ping if TELEGRAM_BOT_TOKEN is set

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────

REPO_URL="${AGENT_REPO_URL:-https://github.com/diamondcrusher42/Agent4wiki}"
AGENT_DIR="${AGENT_BASE_DIR:-$HOME/agent4}"
NODE_TYPE="${1:-code}"  # code | security | gpu | monitor
NODE_ID="${AGENT_NODE_ID:-$(hostname -s)}"
PYTHON="${PYTHON:-python3}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[bootstrap]${NC} $*"; }
warn()  { echo -e "${YELLOW}[bootstrap]${NC} $*"; }
error() { echo -e "${RED}[bootstrap]${NC} $*"; exit 1; }

# ── Step 1: System dependencies ──────────────────────────────────────────────

info "Installing system dependencies..."

if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends \
        git curl wget \
        python3 python3-pip python3-venv \
        build-essential \
        ca-certificates

    # Node.js 20 LTS via NodeSource
    if ! command -v node &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

elif command -v dnf &>/dev/null; then
    sudo dnf install -y git curl python3 python3-pip nodejs npm
elif command -v pacman &>/dev/null; then
    sudo pacman -Sy --noconfirm git curl python python-pip nodejs npm
else
    warn "Unknown package manager. Install git, python3, python3-pip, nodejs manually."
fi

# Security node extras (Kali)
if [[ "$NODE_TYPE" == "security" ]]; then
    info "Installing security tools..."
    sudo apt-get install -y nmap masscan nikto dirb \
        aircrack-ng wireshark-cli netdiscover 2>/dev/null || true
fi

# GPU node extras
if [[ "$NODE_TYPE" == "gpu" ]]; then
    info "GPU node detected. PyTorch must be installed manually with correct CUDA version."
    info "See: https://pytorch.org/get-started/locally/"
fi

# ── Step 2: Claude CLI ────────────────────────────────────────────────────────

info "Installing claude CLI..."
if ! command -v claude &>/dev/null; then
    npm install -g @anthropic-ai/claude-code
else
    info "claude CLI already installed: $(claude --version 2>/dev/null || echo 'version unknown')"
fi

# ── Step 3: Clone / update repo ───────────────────────────────────────────────

info "Setting up repo at $AGENT_DIR..."
if [ -d "$AGENT_DIR/.git" ]; then
    git -C "$AGENT_DIR" pull --ff-only
    info "Repo updated."
else
    git clone "$REPO_URL" "$AGENT_DIR"
    info "Repo cloned."
fi

cd "$AGENT_DIR"

# Git identity (required for worktree commits)
if [ -z "$(git config user.email)" ]; then
    warn "Git identity not set. Configure before running clones:"
    warn "  git config --global user.email 'you@example.com'"
    warn "  git config --global user.name 'Your Name'"
fi

# ── Step 4: Python venv ───────────────────────────────────────────────────────

info "Setting up Python venv..."
$PYTHON -m venv venv
source venv/bin/activate

pip install --upgrade pip -q

# Install node-type-specific Python deps
case "$NODE_TYPE" in
    security) pip install python-nmap scapy requests psutil -q ;;
    gpu)      pip install openai-whisper psutil -q || warn "Install torch separately with correct CUDA version" ;;
    monitor)  pip install psutil requests -q ;;
    *)        info "Core node — no extra Python deps." ;;
esac

# ── Step 5: Node.js deps ──────────────────────────────────────────────────────

info "Installing Node.js dependencies..."
npm install --silent

# ── Step 6: State directory structure ─────────────────────────────────────────

info "Creating state/ directory structure..."
mkdir -p \
    state/keychain/kids \
    state/memory \
    state/user_agent \
    state/worktrees \
    state/fleet/heartbeats \
    brain/inbox \
    brain/active \
    brain/completed \
    brain/failed \
    events \
    forge

# Ensure .gitkeep sentinels exist (directories are committed, files are not)
for dir in state state/keychain state/keychain/kids state/memory state/user_agent state/worktrees; do
    touch "$dir/.gitkeep"
done

# ── Step 7: .env setup ────────────────────────────────────────────────────────

if [ ! -f .env ]; then
    cp .env.example .env
    # Inject detected values
    sed -i "s|AGENT_BASE_DIR=.*|AGENT_BASE_DIR=$AGENT_DIR|" .env 2>/dev/null || true
    sed -i "s|AGENT_NODE_ID=.*|AGENT_NODE_ID=$NODE_ID|" .env 2>/dev/null || true
    echo "" >> .env
    echo "# Auto-generated by bootstrap-linux.sh" >> .env
    echo "AGENT_BASE_DIR=$AGENT_DIR" >> .env
    echo "AGENT_NODE_ID=$NODE_ID" >> .env
    warn "⚠️  .env created from template. Fill in your API keys before running:"
    warn "    nano $AGENT_DIR/.env"
else
    info ".env already exists — not overwritten."
fi

# ── Step 8: Detect and register node capabilities ─────────────────────────────

info "Detecting node capabilities..."

CAPABILITIES="[]"
cap_list=""

add_cap() {
    cap_list="${cap_list}\"$1\","
}

# Platform
add_cap "linux"
add_cap "$NODE_TYPE"

# Tools
command -v docker     &>/dev/null && add_cap "docker"
command -v nmap       &>/dev/null && add_cap "nmap"
command -v ollama     &>/dev/null && add_cap "ollama"
command -v ffmpeg     &>/dev/null && add_cap "ffmpeg"
command -v playwright &>/dev/null && add_cap "browser"
nvidia-smi            &>/dev/null && add_cap "gpu" && add_cap "cuda"

# Clean up trailing comma
cap_list="${cap_list%,}"
CAPABILITIES="[$cap_list]"

info "Detected capabilities: $CAPABILITIES"

# Register in fleet registry
$PYTHON - << PYEOF
import json, os, socket
from pathlib import Path
from datetime import datetime, timezone

registry_path = Path("state/fleet/registry.json")
registry_path.parent.mkdir(parents=True, exist_ok=True)

registry = {"nodes": []}
if registry_path.exists():
    try:
        registry = json.loads(registry_path.read_text())
    except:
        pass

node_id = "$NODE_ID"
node = {
    "id": node_id,
    "hostname": socket.gethostname(),
    "platform": "linux",
    "node_type": "$NODE_TYPE",
    "capabilities": $CAPABILITIES,
    "agent_dir": "$AGENT_DIR",
    "status": "online",
    "registered_at": datetime.now(timezone.utc).isoformat(),
    "last_seen": datetime.now(timezone.utc).isoformat(),
    "active_clones": 0,
    "max_concurrent": 3
}

# Replace existing or add new
registry["nodes"] = [n for n in registry["nodes"] if n["id"] != node_id]
registry["nodes"].append(node)

registry_path.write_text(json.dumps(registry, indent=2))
print(f"[bootstrap] Registered node '{node_id}' in fleet registry.")
PYEOF

# ── Step 9: Systemd watchdog service ─────────────────────────────────────────

SERVICE_NAME="agent4-dispatcher"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if command -v systemctl &>/dev/null && [ -w /etc/systemd/system ]; then
    info "Installing systemd service: $SERVICE_NAME"
    VENV_PYTHON="$AGENT_DIR/venv/bin/python"

    sudo tee "$SERVICE_FILE" > /dev/null << SVCEOF
[Unit]
Description=Agent4 Dispatcher — ${NODE_ID}
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=${AGENT_DIR}
EnvironmentFile=${AGENT_DIR}/.env
ExecStart=${VENV_PYTHON} brain/dispatcher.py watch
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=agent4-dispatcher

[Install]
WantedBy=multi-user.target
SVCEOF

    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    info "Service installed. Start with: sudo systemctl start $SERVICE_NAME"
    info "Logs: journalctl -u $SERVICE_NAME -f"
else
    warn "systemd not available or no write access to /etc/systemd/system."
    warn "Start manually: cd $AGENT_DIR && source venv/bin/activate && python brain/dispatcher.py watch"
fi

# ── Step 10: Test ─────────────────────────────────────────────────────────────

info "Running smoke test..."
source venv/bin/activate
$PYTHON -c "
import json, pathlib
print('[✓] Python stdlib OK')
" && info "[✓] Python OK"

node --version > /dev/null && info "[✓] Node.js OK"
claude --version > /dev/null 2>&1 && info "[✓] claude CLI OK" || warn "[!] claude CLI not found on PATH — check npm global bin"
git --version > /dev/null && info "[✓] git OK"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
info "Bootstrap complete for node: $NODE_ID ($NODE_TYPE)"
echo ""
echo "  Next steps:"
echo "  1. Fill in .env: nano $AGENT_DIR/.env"
echo "  2. Verify claude login: claude auth"
echo "  3. Start dispatcher: sudo systemctl start $SERVICE_NAME"
echo "     OR: cd $AGENT_DIR && source venv/bin/activate && python brain/dispatcher.py watch"
echo "  4. Test with dry run: python brain/dispatcher.py dry brain/inbox/example.json"
echo ""
