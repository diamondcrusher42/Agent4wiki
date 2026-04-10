#!/bin/bash
# Smith — Agent4wiki V4 User Agent Launcher
# Starts the user-facing Claude session for Smith, connected to @pz_planet_super_ai_bot.
# Run this AFTER ./start.sh (which starts the dispatcher).
#
# Smith = Agent4wiki V4 agent. Separate from KEVIN (claude-agent-template / @planetzabave_bot).
# Separate tmux session: "claude-v4"

set -e

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT="/home/claudebot/keychain/vault.env"
LOCAL_ENV="$AGENT_DIR/.env"
TMUX_SESSION="claude-v4"
PID_FILE="/tmp/agent4wiki-useragent.pid"
EFFORT="${CLAUDE_EFFORT:-medium}"

echo "[start-user-agent.sh] Agent4wiki V4 User Agent starting..."

# 1. Load credentials
if [ -f "$VAULT" ]; then
    set -a; source "$VAULT"; set +a
fi
if [ -f "$LOCAL_ENV" ]; then
    set -a; source "$LOCAL_ENV"; set +a
fi

# 2. Override TELEGRAM_BOT_TOKEN with dedicated V4 bot token
if [ -z "${AGENT4WIKI_BOT_TOKEN:-}" ]; then
    echo "[start-user-agent.sh] ERROR: AGENT4WIKI_BOT_TOKEN not set in vault — cannot start"
    exit 1
fi
export TELEGRAM_BOT_TOKEN="$AGENT4WIKI_BOT_TOKEN"
echo "[start-user-agent.sh] Bot token: AGENT4WIKI_BOT_TOKEN (@pz_planet_super_ai_bot)"

# 3. Extended thinking vars
export MAX_THINKING_TOKENS="${MAX_THINKING_TOKENS:-63999}"
export CLAUDE_CODE_ALWAYS_ENABLE_EFFORT="${CLAUDE_CODE_ALWAYS_ENABLE_EFFORT:-1}"
export CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING="${CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING:-1}"
export CLAUDE_CODE_EFFORT_LEVEL="${CLAUDE_CODE_EFFORT_LEVEL:-max}"

# 4. Check if already running
if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "[start-user-agent.sh] Session '$TMUX_SESSION' already running — skipping"
    tmux list-sessions | grep "$TMUX_SESSION"
    exit 0
fi

# 5. Launch claude in tmux from agent4wiki directory
# bash -l = login shell so nvm/bun/claude are in PATH
# --channels is MANDATORY — Telegram dies without it
# CLAUDE.md in agent4wiki/ is loaded automatically by claude on startup
tmux new-session -d -s "$TMUX_SESSION" -x 220 -y 50 \
    -c "$AGENT_DIR" \
    "bash -l -c 'export TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN MAX_THINKING_TOKENS=$MAX_THINKING_TOKENS CLAUDE_CODE_ALWAYS_ENABLE_EFFORT=$CLAUDE_CODE_ALWAYS_ENABLE_EFFORT CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=$CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING CLAUDE_CODE_EFFORT_LEVEL=$CLAUDE_CODE_EFFORT_LEVEL; claude --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official'"

sleep 2
if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "[start-user-agent.sh] V4 user agent running in tmux session: $TMUX_SESSION"
    echo "[start-user-agent.sh] Attach: tmux attach -t $TMUX_SESSION"
    echo "$TMUX_SESSION" > "$PID_FILE"
else
    echo "[start-user-agent.sh] ERROR: tmux session died immediately"
    exit 1
fi
