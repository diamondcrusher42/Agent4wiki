#!/bin/bash
# start-v4.sh — Launch agent4wiki v4 dispatcher with Planet AI bot (pz_planet_ai_bot)
# Uses SWITCHBOARD_BOT_TOKEN so Planet AI bot handles all v4 notifications.

set -e
cd "$(dirname "$0")"

# Load workspace .env for SWITCHBOARD_BOT_TOKEN
WORKSPACE_ENV="/home/claudebot/workspace/.env"
if [[ -f "$WORKSPACE_ENV" ]]; then
    set -a
    source "$WORKSPACE_ENV"
    set +a
fi

# Wire Planet AI token as the active Telegram channel
export TELEGRAM_BOT_TOKEN="$SWITCHBOARD_BOT_TOKEN"
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

# Start dispatcher in background, log to /tmp/agent4wiki-dispatcher.log
nohup /home/claudebot/workspace/venv/bin/python3 brain/dispatcher.py watch \
    >> /tmp/agent4wiki-dispatcher.log 2>&1 &
DISP_PID=$!
echo "[v4] Dispatcher started — PID $DISP_PID"
echo "$DISP_PID" > /tmp/agent4wiki-dispatcher.pid
echo "[v4] Ready. Planet AI bot (@pz_planet_ai_bot) is now active."
