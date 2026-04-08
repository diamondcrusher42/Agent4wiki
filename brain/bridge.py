"""
brain/bridge.py — Multi-Channel Bridge Relay

The Bridge is Segment 7: the only way output reaches the user.
This module implements the fallback cascade when the primary channel (Telegram) fails.

Channel priority:
    1. Telegram  — primary (always tried first)
    2. Email     — fallback 1 (AgentMail: happyself332@agentmail.to → PERSONAL_EMAIL)
    3. Discord   — fallback 2 (webhook — also used in parallel for important alerts)
    4. Slack     — fallback 3 (webhook)
    5. SMS       — last resort, critical only (Twilio)

Modes:
    bridge.send(text)        — Telegram first, fallback cascade on failure
    bridge.broadcast(text)   — ALL channels simultaneously (use for: BLOCK, security, crash)
    bridge.ping(text)        — Telegram only (session pings, acknowledgements)

Usage:
    from brain.bridge import Bridge
    bridge = Bridge()
    bridge.send("Clone task-001 completed.")
    bridge.broadcast("SECURITY: credential leak detected in task-007")

Environment variables required:
    TELEGRAM_BOT_TOKEN      — primary channel
    TELEGRAM_CHAT_ID        — primary channel
    AGENTMAIL_API_KEY       — email fallback
    AGENTMAIL_INBOX_ID      — email fallback (happyself332@agentmail.to)
    PERSONAL_EMAIL          — email fallback destination
    DISCORD_WEBHOOK_URL     — optional — Discord fallback
    SLACK_WEBHOOK_URL       — optional — Slack fallback
    TWILIO_ACCOUNT_SID      — optional — SMS last resort
    TWILIO_AUTH_TOKEN       — optional — SMS last resort
    TWILIO_FROM_NUMBER      — optional — SMS last resort (+1234567890)
    TWILIO_TO_NUMBER        — optional — SMS last resort (+0987654321)
"""

import os
import json
import logging
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger("bridge")


class BridgeError(Exception):
    """Raised when ALL channels fail."""
    pass


class Bridge:
    def __init__(self):
        # Telegram
        self.tg_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self.tg_chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")

        # Email (AgentMail)
        self.agentmail_key = os.environ.get("AGENTMAIL_API_KEY", "")
        self.agentmail_inbox = os.environ.get("AGENTMAIL_INBOX_ID", "")
        self.personal_email = os.environ.get("PERSONAL_EMAIL", "")

        # Discord
        self.discord_webhook = os.environ.get("DISCORD_WEBHOOK_URL", "")

        # Slack
        self.slack_webhook = os.environ.get("SLACK_WEBHOOK_URL", "")

        # SMS (Twilio)
        self.twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "")
        self.twilio_token = os.environ.get("TWILIO_AUTH_TOKEN", "")
        self.twilio_from = os.environ.get("TWILIO_FROM_NUMBER", "")
        self.twilio_to = os.environ.get("TWILIO_TO_NUMBER", "")

        self._check_config()

    def _check_config(self):
        channels = []
        if self.tg_token and self.tg_chat_id:
            channels.append("Telegram")
        if self.agentmail_key and self.agentmail_inbox and self.personal_email:
            channels.append("Email")
        if self.discord_webhook:
            channels.append("Discord")
        if self.slack_webhook:
            channels.append("Slack")
        if self.twilio_sid and self.twilio_token and self.twilio_from and self.twilio_to:
            channels.append("SMS")

        log.info(f"[BRIDGE] Channels available: {', '.join(channels) if channels else 'NONE'}")
        if not channels:
            log.warning("[BRIDGE] No channels configured — all output will be lost")

    # ──────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ──────────────────────────────────────────────────────────────────────────

    def send(self, text: str, subject: str = "Agent V4 Notification", retry: bool = True) -> str:
        """
        Send via Telegram first. On failure, cascade through fallbacks.
        Returns the channel that succeeded, or raises BridgeError if all fail.
        """
        # 1. Try Telegram
        try:
            self._send_telegram(text)
            return "telegram"
        except Exception as e:
            log.warning(f"[BRIDGE] Telegram failed ({e}) — falling back to email")

        # 2. Try Email
        try:
            self._send_email(subject, text)
            return "email"
        except Exception as e:
            log.warning(f"[BRIDGE] Email failed ({e}) — falling back to Discord")

        # 3. Try Discord
        if self.discord_webhook:
            try:
                self._send_discord(text)
                return "discord"
            except Exception as e:
                log.warning(f"[BRIDGE] Discord failed ({e}) — falling back to Slack")

        # 4. Try Slack
        if self.slack_webhook:
            try:
                self._send_slack(text)
                return "slack"
            except Exception as e:
                log.warning(f"[BRIDGE] Slack failed ({e}) — falling back to SMS")

        # 5. Try SMS (critical only — Twilio costs money per message)
        if self.twilio_sid:
            try:
                # Truncate to 160 chars for SMS
                self._send_sms(text[:160])
                return "sms"
            except Exception as e:
                log.error(f"[BRIDGE] SMS failed ({e}) — ALL channels exhausted")

        raise BridgeError("All Bridge channels failed — output lost")

    def broadcast(self, text: str, subject: str = "Agent V4 — Critical Alert") -> dict:
        """
        Send to ALL configured channels simultaneously.
        Use for: BLOCK directives, security alerts, system crashes.
        Returns dict of {channel: "ok"|"failed"} for each channel.
        """
        results = {}

        if self.tg_token and self.tg_chat_id:
            try:
                self._send_telegram(text)
                results["telegram"] = "ok"
            except Exception as e:
                results["telegram"] = f"failed: {e}"

        if self.agentmail_key:
            try:
                self._send_email(subject, text)
                results["email"] = "ok"
            except Exception as e:
                results["email"] = f"failed: {e}"

        if self.discord_webhook:
            try:
                self._send_discord(f"🚨 {text}")
                results["discord"] = "ok"
            except Exception as e:
                results["discord"] = f"failed: {e}"

        if self.slack_webhook:
            try:
                self._send_slack(f":rotating_light: {text}")
                results["slack"] = "ok"
            except Exception as e:
                results["slack"] = f"failed: {e}"

        if self.twilio_sid:
            try:
                self._send_sms(f"CRITICAL: {text[:140]}")
                results["sms"] = "ok"
            except Exception as e:
                results["sms"] = f"failed: {e}"

        successful = [ch for ch, r in results.items() if r == "ok"]
        log.info(f"[BRIDGE] Broadcast complete — delivered via: {', '.join(successful) or 'none'}")
        return results

    def ping(self, text: str) -> bool:
        """Telegram-only ping. Returns False on failure (does not cascade)."""
        try:
            self._send_telegram(text)
            return True
        except Exception as e:
            log.warning(f"[BRIDGE] Telegram ping failed: {e}")
            return False

    # ──────────────────────────────────────────────────────────────────────────
    # CHANNEL IMPLEMENTATIONS
    # ──────────────────────────────────────────────────────────────────────────

    def _send_telegram(self, text: str):
        """Send via Telegram Bot API. Raises on 4xx/5xx."""
        if not self.tg_token or not self.tg_chat_id:
            raise RuntimeError("Telegram not configured")

        # Chunk long messages (Telegram limit: 4096 chars)
        chunks = [text[i:i+4000] for i in range(0, len(text), 4000)]
        for chunk in chunks:
            payload = json.dumps({
                "chat_id": self.tg_chat_id,
                "text": chunk,
            }).encode()

            req = urllib.request.Request(
                f"https://api.telegram.org/bot{self.tg_token}/sendMessage",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read())
                if not result.get("ok"):
                    raise RuntimeError(f"Telegram API error: {result}")

    def _send_email(self, subject: str, body: str):
        """Send via AgentMail SDK. Raises on failure."""
        if not self.agentmail_key or not self.agentmail_inbox or not self.personal_email:
            raise RuntimeError("Email not configured — missing AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID, or PERSONAL_EMAIL")

        # Import lazily — agentmail SDK may not be installed on all nodes
        try:
            from agentmail import AgentMail
        except ImportError:
            raise RuntimeError("agentmail package not installed — run: pip install agentmail")

        client = AgentMail(api_key=self.agentmail_key)
        client.inboxes.messages.send(
            self.agentmail_inbox,
            to=self.personal_email,
            subject=subject,
            text=body,
        )

    def _send_discord(self, text: str):
        """Send to Discord channel via incoming webhook. Raises on failure."""
        if not self.discord_webhook:
            raise RuntimeError("Discord not configured — missing DISCORD_WEBHOOK_URL")

        payload = json.dumps({
            "content": text[:2000],  # Discord limit
            "username": "Agent V4",
        }).encode()

        req = urllib.request.Request(
            self.discord_webhook,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status not in (200, 204):
                raise RuntimeError(f"Discord webhook returned {resp.status}")

    def _send_slack(self, text: str):
        """Send to Slack channel via incoming webhook. Raises on failure."""
        if not self.slack_webhook:
            raise RuntimeError("Slack not configured — missing SLACK_WEBHOOK_URL")

        payload = json.dumps({
            "text": text[:40000],  # Slack limit
        }).encode()

        req = urllib.request.Request(
            self.slack_webhook,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            response_text = resp.read().decode()
            if response_text != "ok":
                raise RuntimeError(f"Slack webhook returned: {response_text}")

    def _send_sms(self, text: str):
        """Send SMS via Twilio REST API. Raises on failure. Costs money."""
        if not all([self.twilio_sid, self.twilio_token, self.twilio_from, self.twilio_to]):
            raise RuntimeError("SMS not configured — missing Twilio credentials")

        import base64
        credentials = base64.b64encode(f"{self.twilio_sid}:{self.twilio_token}".encode()).decode()
        payload = urllib.parse.urlencode({
            "From": self.twilio_from,
            "To": self.twilio_to,
            "Body": text,
        }).encode()

        req = urllib.request.Request(
            f"https://api.twilio.com/2010-04-01/Accounts/{self.twilio_sid}/Messages.json",
            data=payload,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": f"Basic {credentials}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            if result.get("status") in ("failed", "undelivered"):
                raise RuntimeError(f"Twilio delivery failed: {result.get('error_message')}")


# ──────────────────────────────────────────────────────────────────────────────
# Module-level singleton — dispatcher.py imports this directly
# ──────────────────────────────────────────────────────────────────────────────
import urllib.parse  # needed by _send_sms

_bridge: Optional[Bridge] = None

def get_bridge() -> Bridge:
    global _bridge
    if _bridge is None:
        _bridge = Bridge()
    return _bridge


# ──────────────────────────────────────────────────────────────────────────────
# CLI smoke test
# ──────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    from pathlib import Path

    # Load .env from repo root
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"\''))

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    bridge = Bridge()

    mode = sys.argv[1] if len(sys.argv) > 1 else "send"
    msg = sys.argv[2] if len(sys.argv) > 2 else f"Bridge smoke test — {datetime.now().isoformat()}"

    if mode == "send":
        try:
            channel = bridge.send(msg)
            print(f"✓ Delivered via {channel}")
        except BridgeError as e:
            print(f"✗ Failed: {e}")

    elif mode == "broadcast":
        results = bridge.broadcast(msg, subject="Bridge broadcast test")
        for ch, r in results.items():
            mark = "✓" if r == "ok" else "✗"
            print(f"{mark} {ch}: {r}")

    elif mode == "email":
        try:
            bridge._send_email("Bridge email test", msg)
            print("✓ Email sent")
        except Exception as e:
            print(f"✗ Email failed: {e}")

    elif mode == "discord":
        try:
            bridge._send_discord(msg)
            print("✓ Discord sent")
        except Exception as e:
            print(f"✗ Discord failed: {e}")
