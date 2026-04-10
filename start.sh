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

# 1b. Source local .env (non-secret config: TELEGRAM_CHAT_ID, etc.)
#     Sourced after vault so vault values take precedence.
LOCAL_ENV="$AGENT_DIR/.env"
if [ -f "$LOCAL_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$LOCAL_ENV"
    set +a
    echo "[start.sh] Local .env loaded"
fi

# 1c. Extended thinking env vars — required because alwaysThinkingEnabled in settings.json
#     has been silently ignored since Claude Code v2.0.64 (issue #13532, no patch).
#     MAX_THINKING_TOKENS is the actual switch read from process.env in cli.js.
#     These are NOT secrets — build_clone_env() passes them through to clone subprocesses.
export MAX_THINKING_TOKENS="${MAX_THINKING_TOKENS:-63999}"
export CLAUDE_CODE_ALWAYS_ENABLE_EFFORT="${CLAUDE_CODE_ALWAYS_ENABLE_EFFORT:-1}"
export CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING="${CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING:-1}"
export CLAUDE_CODE_EFFORT_LEVEL="${CLAUDE_CODE_EFFORT_LEVEL:-max}"
echo "[start.sh] Thinking vars set: MAX_THINKING_TOKENS=$MAX_THINKING_TOKENS, EFFORT=$CLAUDE_CODE_EFFORT_LEVEL"

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
