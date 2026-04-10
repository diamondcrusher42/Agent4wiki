#!/bin/bash
# Agent4wiki V4 — Health Status Check
# Usage: ./status.sh
# Prints green/red per component — one command to verify V4 is healthy.

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCHER_PID_FILE="/tmp/agent4wiki-dispatcher.pid"
VAULT="/home/claudebot/keychain/vault.env"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; }

echo "=== Agent4wiki V4 Status ($(date '+%Y-%m-%d %H:%M:%S')) ==="
echo ""

# 1. Dispatcher process
echo "[Dispatcher]"
if [ -f "$DISPATCHER_PID_FILE" ]; then
    PID=$(cat "$DISPATCHER_PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        pass "Running (PID $PID)"
    else
        fail "PID file exists but process $PID is dead — run ./start.sh to restart"
    fi
else
    fail "Not running — no PID file at $DISPATCHER_PID_FILE"
fi

# 2. Dispatcher log (last error)
DISP_LOG="$AGENT_DIR/logs/dispatcher.log"
if [ -f "$DISP_LOG" ]; then
    LAST_ERROR=$(grep -i "error\|exception\|traceback" "$DISP_LOG" 2>/dev/null | tail -1)
    if [ -n "$LAST_ERROR" ]; then
        fail "Last error in log: ${LAST_ERROR:0:120}"
    else
        pass "Log clean (no recent errors)"
    fi
else
    fail "No dispatcher log at $DISP_LOG"
fi

echo ""

# 3. Bridge token
echo "[Bridge]"
if [ -f "$VAULT" ]; then
    # shellcheck disable=SC1090
    source "$VAULT" 2>/dev/null
fi
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    pass "Telegram token configured (chat_id: $TELEGRAM_CHAT_ID)"
else
    fail "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing — bridge will fail loud on start"
fi

echo ""

# 4. Task queue state
echo "[Task Queue]"
INBOX_COUNT=$(ls "$AGENT_DIR/brain/inbox/" 2>/dev/null | grep -c '\.json$' || echo 0)
ACTIVE_COUNT=$(ls "$AGENT_DIR/brain/active/" 2>/dev/null | grep -c '\.json$' || echo 0)
COMPLETED_COUNT=$(ls "$AGENT_DIR/brain/completed/" 2>/dev/null | grep -c '\.json$' || echo 0)
FAILED_COUNT=$(ls "$AGENT_DIR/brain/failed/" 2>/dev/null | grep -c '\.json$' || echo 0)
pass "Inbox:     $INBOX_COUNT waiting"
pass "Active:    $ACTIVE_COUNT running"
pass "Completed: $COMPLETED_COUNT done"
if [ "$FAILED_COUNT" -gt 0 ]; then
    fail "Failed:    $FAILED_COUNT tasks — check brain/failed/"
else
    pass "Failed:    0"
fi

echo ""

# 5. Worktrees
echo "[Worktrees]"
WT_COUNT=$(git -C "$AGENT_DIR" worktree list 2>/dev/null | grep -c 'clone-' || echo 0)
if [ "$WT_COUNT" -gt 0 ]; then
    pass "$WT_COUNT clone worktree(s) active"
    git -C "$AGENT_DIR" worktree list 2>/dev/null | grep 'clone-' | while read -r line; do
        echo "    $line"
    done
else
    pass "No active clone worktrees (clean)"
fi

echo ""

# 6. Last completed task
echo "[Last Activity]"
LAST_TASK=$(ls -t "$AGENT_DIR/brain/completed/" 2>/dev/null | head -1)
if [ -n "$LAST_TASK" ]; then
    LAST_TIME=$(stat -c '%y' "$AGENT_DIR/brain/completed/$LAST_TASK" 2>/dev/null | cut -d'.' -f1)
    pass "Last completed: $LAST_TASK ($LAST_TIME)"
else
    echo "  — No completed tasks yet"
fi

LAST_EVENT=$(tail -1 "$AGENT_DIR/events/dispatcher.jsonl" 2>/dev/null)
if [ -n "$LAST_EVENT" ]; then
    LAST_TS=$(echo "$LAST_EVENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('timestamp','?')[:19])" 2>/dev/null)
    LAST_EV=$(echo "$LAST_EVENT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('event','?'))" 2>/dev/null)
    pass "Last event: $LAST_EV at $LAST_TS"
fi

echo ""
echo "=== Done ==="
