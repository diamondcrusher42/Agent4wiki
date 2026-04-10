#!/usr/bin/env bash
# watchdog.sh — Smith (Agent4wiki V4) process manager
# Runs Claude Code inside a tmux session with Telegram channel.
# Handles quota errors and auto-restart.
# Bot: @pz_planet_super_ai_bot (AGENT4WIKI_BOT_TOKEN)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PRIVATE_DIR="${HOME}/.claude/private"
LOG_DIR="$REPO_DIR/logs"
LOG_FILE="$LOG_DIR/watchdog.log"
PID_FILE="/tmp/smith_watchdog.pid"
TMUX_SESSION="agent4wiki-v4"
RESTART_DELAY=5
MAX_RESTARTS=10
RESTART_WINDOW=3600
POLL_INTERVAL=60

mkdir -p "$LOG_DIR"
echo $$ > "$PID_FILE"

# Load vault first (has AGENT4WIKI_BOT_TOKEN)
VAULT="${HOME}/keychain/vault.env"
if [[ -f "$VAULT" ]]; then
    set -a; source "$VAULT"; set +a
fi

# Load local .env (has TELEGRAM_CHAT_ID, AGENT_BASE_DIR)
if [[ -f "$REPO_DIR/.env" ]]; then
    set -a; source "$REPO_DIR/.env"; set +a
fi

# Smith uses AGENT4WIKI_BOT_TOKEN — override TELEGRAM_BOT_TOKEN
export TELEGRAM_BOT_TOKEN="${AGENT4WIKI_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}"
TELEGRAM_TOKEN="$TELEGRAM_BOT_TOKEN"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-564661663}"
PYTHON="$HOME/workspace/venv/bin/python3"

log()           { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
send_telegram() {
    local text="$1"
    [[ -z "$TELEGRAM_TOKEN" || -z "$TELEGRAM_CHAT_ID" ]] && { log "$text"; return; }
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
        -d chat_id="$TELEGRAM_CHAT_ID" \
        --data-urlencode text="$text" -o /dev/null || true
}

session_alive() { tmux has-session -t "$TMUX_SESSION" 2>/dev/null; }
kill_session()  { tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true; }

check_tmux_for_quota() {
    local output
    output=$(tmux capture-pane -t "$TMUX_SESSION" -p -S -50 2>/dev/null | tr '[:upper:]' '[:lower:]')
    if echo "$output" | grep -qE "usage limit reached|rate limit exceeded|quota exceeded|you've reached your usage limit|too many requests"; then
        log "Quota error in tmux — recording."
        return 0
    fi
    return 1
}

restart_times=()
too_many_restarts() {
    local now cutoff recent=()
    now=$(date +%s)
    cutoff=$(( now - RESTART_WINDOW ))
    for t in "${restart_times[@]+"${restart_times[@]}"}"; do
        [[ "$t" -gt "$cutoff" ]] && recent+=("$t")
    done
    restart_times=("${recent[@]+"${recent[@]}"}")
    [[ "${#restart_times[@]}" -ge "$MAX_RESTARTS" ]]
}

on_exit() { log "Smith watchdog exiting."; }
trap on_exit EXIT

log "Smith (Agent4wiki V4) watchdog started (PID $$)"
send_telegram "Smith agent starting."

while true; do
    if too_many_restarts; then
        msg="Smith crashed ${MAX_RESTARTS}+ times in 1h. Pausing 1h."
        log "$msg"; send_telegram "$msg"
        sleep 3600; restart_times=(); continue
    fi

    if session_alive; then
        log "Session '$TMUX_SESSION' running — monitoring."
    else
        restart_times+=("$(date +%s)")

        if ! command -v claude &>/dev/null; then
            log "claude not in PATH"
            send_telegram "ERROR: claude binary not found."
            sleep 60; continue
        fi

        MODEL="${CLAUDE_MODEL:-sonnet}"
        EFFORT="${CLAUDE_EFFORT:-medium}"

        # Extended thinking env vars for agent4wiki tasks
        export MAX_THINKING_TOKENS="${MAX_THINKING_TOKENS:-63999}"

        log "Starting Smith in tmux '$TMUX_SESSION' (model=$MODEL, effort=$EFFORT)..."
        # TELEGRAM_STATE_DIR isolates queue state from Kevin's bot
        # TELEGRAM_BOT_TOKEN is set to AGENT4WIKI_BOT_TOKEN above
        tmux new-session -d -s "$TMUX_SESSION" -x 220 -y 50 \
            "cd $REPO_DIR && bash -l -c 'TELEGRAM_STATE_DIR=$HOME/.claude/channels/smith TELEGRAM_BOT_TOKEN=$TELEGRAM_TOKEN claude --model $MODEL --effort $EFFORT --permission-mode auto --channels plugin:telegram@claude-plugins-official'"
    fi

    log "Smith running. Monitoring (poll every ${POLL_INTERVAL}s)..."

    while session_alive; do
        sleep "$POLL_INTERVAL"
        check_tmux_for_quota || true
    done

    if ! session_alive; then
        check_tmux_for_quota || true
        log "tmux session ended. Restarting in ${RESTART_DELAY}s."
        send_telegram "Smith session ended. Restarting..."
        sleep "$RESTART_DELAY"
    fi
done
