#!/bin/bash
# start-v4.sh — Launch agent4wiki v4 dispatcher with Smith bot (@pz_planet_super_ai_bot)
# Uses AGENT4WIKI_BOT_TOKEN from vault or workspace .env.

set -e
cd "$(dirname "$0")"

# Load vault first (has AGENT4WIKI_BOT_TOKEN)
VAULT="/home/claudebot/keychain/vault.env"
if [[ -f "$VAULT" ]]; then
    set -a
    source "$VAULT"
    set +a
fi

# Load local .env as fallback
if [[ -f ".env" ]]; then
    set -a
    source ".env"
    set +a
fi

# Wire Smith's dedicated token
export TELEGRAM_BOT_TOKEN="${AGENT4WIKI_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
export TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-564661663}"
export AGENT_BASE_DIR="$(pwd)"

echo "[v4] TELEGRAM_BOT_TOKEN = ${TELEGRAM_BOT_TOKEN:0:20}..."
echo "[v4] TELEGRAM_CHAT_ID   = $TELEGRAM_CHAT_ID"
echo "[v4] AGENT_BASE_DIR     = $AGENT_BASE_DIR"

# Kill any existing dispatcher for this base dir
EXISTING=$(pgrep -f "dispatcher.py watch" || true)
if [[ -n "$EXISTING" ]]; then
    echo "[v4] Stopping existing dispatcher PIDs: $EXISTING"
    kill $EXISTING
    sleep 1
fi

# Start dispatcher in background
nohup /home/claudebot/workspace/venv/bin/python3 brain/dispatcher.py watch \
    >> "$AGENT_BASE_DIR/logs/dispatcher.log" 2>&1 &
DISP_PID=$!
echo "[v4] Dispatcher started — PID $DISP_PID"
echo "$DISP_PID" > /tmp/agent4wiki-dispatcher.pid
echo "[v4] Ready. Smith bot (@pz_planet_super_ai_bot) is now active."
