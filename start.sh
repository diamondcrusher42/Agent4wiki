#!/bin/bash
# Agent4wiki V4 — Production Launcher
# Usage: ./start.sh [--effort low|medium|high]
#
# Starts:
#   1. Keychain vault (credentials)
#   2. Dispatcher (watches brain/inbox/ for tasks)
#   3. Status report

set -e

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EFFORT="${2:-medium}"
VAULT="/home/claudebot/keychain/vault.env"
DISPATCHER_PID_FILE="/tmp/agent4wiki-dispatcher.pid"
LOG_DIR="$AGENT_DIR/logs"

echo "[start.sh] Agent4wiki V4 starting..."

# 1. Source vault credentials
if [ -f "$VAULT" ]; then
    set -a
    source "$VAULT"
    set +a
    echo "[start.sh] Vault loaded: $(grep -c '=' "$VAULT") keys"
else
    echo "[start.sh] WARNING: vault not found at $VAULT — credentials may be missing"
fi

# 2. Start dispatcher if not already running
if [ -f "$DISPATCHER_PID_FILE" ] && kill -0 "$(cat "$DISPATCHER_PID_FILE")" 2>/dev/null; then
    echo "[start.sh] Dispatcher already running (PID $(cat "$DISPATCHER_PID_FILE"))"
else
    mkdir -p "$LOG_DIR"
    source /home/claudebot/workspace/venv/bin/activate
    nohup python3 "$AGENT_DIR/brain/dispatcher.py" watch \
        > "$LOG_DIR/dispatcher.log" 2>&1 &
    DISP_PID=$!
    echo "$DISP_PID" > "$DISPATCHER_PID_FILE"
    echo "[start.sh] Dispatcher started (PID $DISP_PID) — watching brain/inbox/"
    sleep 1
    if kill -0 "$DISP_PID" 2>/dev/null; then
        echo "[start.sh] Dispatcher confirmed running"
    else
        echo "[start.sh] ERROR: Dispatcher died immediately — check $LOG_DIR/dispatcher.log"
        exit 1
    fi
fi

# 3. Status
echo ""
echo "=== Agent4wiki V4 Status ==="
echo "Dispatcher PID: $(cat "$DISPATCHER_PID_FILE" 2>/dev/null || echo 'not running')"
echo "Inbox: $(ls "$AGENT_DIR/brain/inbox/" 2>/dev/null | wc -l) tasks queued"
echo "Active: $(ls "$AGENT_DIR/brain/active/" 2>/dev/null | wc -l) tasks running"
echo "Completed: $(ls "$AGENT_DIR/brain/completed/" 2>/dev/null | wc -l) tasks done"
echo ""
echo "[start.sh] V4 is live. Drop task JSON files into brain/inbox/ to dispatch."
