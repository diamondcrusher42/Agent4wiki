"""Tests for brain/bridge.py — multi-channel relay."""

import sys
import json
import logging
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent / "brain"))
from bridge import Bridge, BridgeError, get_bridge


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_bridge(**env_overrides):
    """Create a Bridge with controlled env vars (no real credentials needed)."""
    defaults = {
        "TELEGRAM_BOT_TOKEN": "fake-bot-token",
        "TELEGRAM_CHAT_ID": "12345",
        "AGENTMAIL_API_KEY": "",
        "AGENTMAIL_INBOX_ID": "",
        "PERSONAL_EMAIL": "",
        "DISCORD_WEBHOOK_URL": "",
        "SLACK_WEBHOOK_URL": "",
        "TWILIO_ACCOUNT_SID": "",
    }
    defaults.update(env_overrides)
    with patch.dict("os.environ", defaults, clear=True):
        return Bridge()


# ---------------------------------------------------------------------------
# Configuration / init
# ---------------------------------------------------------------------------

def test_bridge_init_no_channels_logs_warning(caplog):
    with patch.dict("os.environ", {}, clear=True):
        with caplog.at_level(logging.WARNING, logger="bridge"):
            b = Bridge()
    assert "No channels configured" in caplog.text


def test_bridge_init_telegram_configured():
    b = make_bridge()
    assert b.tg_token == "fake-bot-token"
    assert b.tg_chat_id == "12345"


# ---------------------------------------------------------------------------
# send() — cascade behaviour
# ---------------------------------------------------------------------------

def test_send_succeeds_via_telegram():
    b = make_bridge()
    mock_resp = MagicMock()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.read.return_value = json.dumps({"ok": True}).encode()

    with patch("urllib.request.urlopen", return_value=mock_resp):
        channel = b.send("hello")

    assert channel == "telegram"


def test_send_falls_back_to_discord_when_telegram_fails():
    b = make_bridge(DISCORD_WEBHOOK_URL="https://discord.example.com/webhook")

    discord_resp = MagicMock()
    discord_resp.__enter__ = lambda s: s
    discord_resp.__exit__ = MagicMock(return_value=False)
    discord_resp.status = 204
    discord_resp.read.return_value = b""

    def urlopen_side_effect(req, timeout=10):
        if "telegram" in str(getattr(req, 'full_url', req)):
            raise Exception("Telegram down")
        return discord_resp

    with patch("urllib.request.urlopen", side_effect=urlopen_side_effect):
        # Email not configured so skips straight to Discord
        with patch.object(b, "_send_email", side_effect=Exception("no email")):
            channel = b.send("fallback test")

    assert channel == "discord"


def test_send_raises_bridge_error_when_all_channels_fail():
    b = make_bridge()  # only Telegram configured

    with patch.object(b, "_send_telegram", side_effect=Exception("tg down")):
        with patch.object(b, "_send_email", side_effect=Exception("no email")):
            try:
                b.send("should fail")
                assert False, "Expected BridgeError"
            except BridgeError:
                pass


# ---------------------------------------------------------------------------
# broadcast() — all channels simultaneously
# ---------------------------------------------------------------------------

def test_broadcast_returns_results_dict():
    b = make_bridge(DISCORD_WEBHOOK_URL="https://discord.example.com/webhook")

    mock_resp = MagicMock()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.read.return_value = json.dumps({"ok": True}).encode()
    mock_resp.status = 204

    with patch("urllib.request.urlopen", return_value=mock_resp):
        results = b.broadcast("critical alert")

    assert "telegram" in results
    assert results["telegram"] == "ok"
    assert "discord" in results
    assert results["discord"] == "ok"


def test_broadcast_records_failed_channels():
    b = make_bridge()

    with patch.object(b, "_send_telegram", side_effect=Exception("tg down")):
        results = b.broadcast("test")

    assert "failed" in results.get("telegram", "")


# ---------------------------------------------------------------------------
# ping() — Telegram only, no cascade
# ---------------------------------------------------------------------------

def test_ping_returns_true_on_success():
    b = make_bridge()
    with patch.object(b, "_send_telegram"):
        assert b.ping("ping") is True


def test_ping_returns_false_on_failure():
    b = make_bridge()
    with patch.object(b, "_send_telegram", side_effect=Exception("down")):
        assert b.ping("ping") is False


# ---------------------------------------------------------------------------
# _send_telegram() internals
# ---------------------------------------------------------------------------

def test_send_telegram_raises_when_not_configured():
    b = make_bridge(TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="")
    try:
        b._send_telegram("test")
        assert False, "Expected RuntimeError"
    except RuntimeError as e:
        assert "not configured" in str(e)


def test_send_telegram_chunks_long_messages():
    """Messages > 4000 chars should be split into chunks."""
    b = make_bridge()
    sent_payloads = []

    mock_resp = MagicMock()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.read.return_value = json.dumps({"ok": True}).encode()

    def capture_urlopen(req, timeout=10):
        sent_payloads.append(json.loads(req.data))
        return mock_resp

    with patch("urllib.request.urlopen", side_effect=capture_urlopen):
        b._send_telegram("x" * 8500)  # should produce 3 chunks

    assert len(sent_payloads) == 3
    for p in sent_payloads:
        assert len(p["text"]) <= 4000


def test_send_telegram_raises_on_api_error():
    b = make_bridge()
    mock_resp = MagicMock()
    mock_resp.__enter__ = lambda s: s
    mock_resp.__exit__ = MagicMock(return_value=False)
    mock_resp.read.return_value = json.dumps({"ok": False, "description": "Bad Request"}).encode()

    with patch("urllib.request.urlopen", return_value=mock_resp):
        try:
            b._send_telegram("test")
            assert False, "Expected RuntimeError"
        except RuntimeError as e:
            assert "Telegram API error" in str(e)


# ---------------------------------------------------------------------------
# get_bridge() — singleton
# ---------------------------------------------------------------------------

def test_get_bridge_returns_singleton():
    import bridge as bridge_module
    bridge_module._bridge = None  # reset singleton

    with patch.dict("os.environ", {"TELEGRAM_BOT_TOKEN": "t", "TELEGRAM_CHAT_ID": "1"}):
        b1 = get_bridge()
        b2 = get_bridge()

    assert b1 is b2
    bridge_module._bridge = None  # cleanup
