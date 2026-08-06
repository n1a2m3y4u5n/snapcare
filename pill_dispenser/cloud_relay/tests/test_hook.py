"""The write hook: what leaves the relay when a dispenser reports.

The point of these is less "does the POST go out" and more **what is in it**.
The relay cannot read an envelope, so nothing about a medicine can be in the
notification that eventually reaches somebody's lock screen — and the only way
that stays true is if something checks the payload.
"""
from __future__ import annotations

import json
import threading

import pytest

from conftest import DEVICE, TOKEN

from snapcare_relay import config, hook
from snapcare_relay.mailbox import Mailboxes


def envelope(rev: int) -> dict:
    return {"rev": rev, "alg": "A256GCM", "iv": "AAAA", "ct": "BBBB"}


# ── the callback fires, and only when it should ──────────────────────────────

def test_a_write_calls_the_hook(tmp_path):
    seen = []
    boxes = Mailboxes(tmp_path / "relay-data", on_write=lambda *a: seen.append(a))
    device = boxes.open(DEVICE, TOKEN, create=True)

    boxes.put(device, "reported", envelope(1))

    assert seen == [(DEVICE, "reported", 1, False)]


def test_a_rejected_write_does_not_call_the_hook(tmp_path):
    # A phone that is behind writes revision 3 twice. The second is a 409 and
    # nothing changed, so waking anybody would be a notification about an event
    # that did not happen.
    seen = []
    boxes = Mailboxes(tmp_path / "relay-data", on_write=lambda *a: seen.append(a))
    device = boxes.open(DEVICE, TOKEN, create=True)

    boxes.put(device, "reported", envelope(3))
    with pytest.raises(Exception):
        boxes.put(device, "reported", envelope(3))

    assert len(seen) == 1


def test_a_hook_that_raises_does_not_lose_the_write(tmp_path):
    # The dose event is the thing that matters. A notification that does not go
    # out costs a buzz; an exception here would cost the event.
    def boom(*_args):
        raise RuntimeError("the web app is down")

    boxes = Mailboxes(tmp_path / "relay-data", on_write=boom)
    device = boxes.open(DEVICE, TOKEN, create=True)

    assert boxes.put(device, "reported", envelope(1)) == 1
    assert boxes.get(device, "reported", since=0, hold_s=0).rev == 1


def test_the_hook_runs_outside_the_device_lock(tmp_path):
    # If it ran under the condition, a hook on a slow host would park every poll
    # on that device behind it — including the dispenser's own. This asserts the
    # lock is free by taking it from another thread while the hook is running.
    took_the_lock = threading.Event()

    def during(*_args):
        def other():
            with device.condition:
                took_the_lock.set()
        t = threading.Thread(target=other)
        t.start()
        t.join(timeout=2)

    boxes = Mailboxes(tmp_path / "relay-data", on_write=during)
    device = boxes.open(DEVICE, TOKEN, create=True)
    boxes.put(device, "reported", envelope(1))

    assert took_the_lock.is_set(), "the hook is holding the device's lock"


# ── what actually goes on the wire ───────────────────────────────────────────

@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(config, "HOOK_URL", "https://app.example/api/push/notify")
    monkeypatch.setattr(config, "HOOK_TOKEN", "shared-secret")
    monkeypatch.setattr(config, "HOOK_TIMEOUT_S", 1)


def capture(monkeypatch) -> list:
    sent = []
    monkeypatch.setattr(hook, "_post",
                        lambda url, token, payload, timeout: sent.append((url, token, payload)))
    return sent


def test_only_the_reported_slot_is_sent(monkeypatch, configured):
    # desired and command are written *by the phone*. Waking the phone for those
    # means a carer who saves a schedule gets a notification from their own tap.
    sent = capture(monkeypatch)
    for slot in ("desired", "command"):
        hook.notify("dev1", slot, 1, wake=True)
    assert sent == []

    hook.notify("dev1", "reported", 4, wake=True)
    assert len(sent) == 1


def test_the_payload_carries_no_envelope(monkeypatch, configured):
    # The privacy promise of this feature, as an assertion. The relay cannot
    # read the envelope, so nothing about a medicine can travel this path — and
    # this is what keeps that true when somebody adds a field "for debugging".
    sent = capture(monkeypatch)
    hook.notify("kmPLb2W8Zx1NEc1bdYQgXw", "reported", 7, wake=True)

    url, token, payload = sent[0]
    assert url == "https://app.example/api/push/notify"
    assert token == "shared-secret"
    assert sorted(payload) == ["deviceId", "rev", "slot"]
    assert payload == {"deviceId": "kmPLb2W8Zx1NEc1bdYQgXw", "slot": "reported", "rev": 7}
    # No key anywhere in it that could hold an envelope, a schedule or a name.
    assert "envelope" not in json.dumps(payload)


def test_nothing_is_sent_without_configuration(monkeypatch):
    # A relay somebody else deploys must not call out to our web app. Empty is
    # the default and empty means silent.
    monkeypatch.setattr(config, "HOOK_URL", "")
    monkeypatch.setattr(config, "HOOK_TOKEN", "shared-secret")
    sent = capture(monkeypatch)
    hook.notify("dev1", "reported", 1, wake=True)
    assert sent == []


def test_nothing_is_sent_without_a_token(monkeypatch):
    # Sending unauthenticated would let anybody who can reach the web app claim
    # a dispenser fired, which is a way to make a stranger's phone buzz at 3am.
    monkeypatch.setattr(config, "HOOK_URL", "https://app.example/api/push/notify")
    monkeypatch.setattr(config, "HOOK_TOKEN", "")
    sent = capture(monkeypatch)
    hook.notify("dev1", "reported", 1, wake=True)
    assert sent == []


def test_an_unreachable_web_app_is_swallowed(monkeypatch, configured):
    # Patching urlopen rather than _post on purpose. Replacing _post would skip
    # the very code that is supposed to catch this, and the test would pass by
    # not running the thing it claims to test.
    def boom(*_args, **_kwargs):
        raise OSError("no route to host")

    monkeypatch.setattr(hook.urllib.request, "urlopen", boom)
    hook.notify(DEVICE, "reported", 1, wake=True)
    for t in threading.enumerate():
        if t.name.startswith("push-hook-"):
            t.join(timeout=2)
    # Nothing to assert but the absence of a raised exception, in this thread or
    # the hook's: pytest fails the test if a thread dies with one.


def test_a_refusal_is_swallowed_too(monkeypatch, configured):
    # A 401 here means the two halves hold different tokens. It must be logged
    # and not raised — the write it follows has already succeeded.
    import urllib.error

    def refuse(*_args, **_kwargs):
        raise urllib.error.HTTPError("https://app.example", 401, "no", {}, None)

    monkeypatch.setattr(hook.urllib.request, "urlopen", refuse)
    hook.notify(DEVICE, "reported", 1, wake=True)
    for t in threading.enumerate():
        if t.name.startswith("push-hook-"):
            t.join(timeout=2)


def test_the_heartbeat_does_not_buzz_a_phone(monkeypatch, configured):
    """상자는 오분마다 보고한다 — 아무 일도 없어도.

    그 하트비트가 "약이 준비됐다" 알림이 되면 사람은 밤새 오분마다 그것을 받는다.
    알림에는 내용이 없으므로(약 이름이 구글·애플 서버를 지나가지 않게 한 약속이다)
    받는 사람은 진짜인지 아닌지 가릴 수가 없다. 배우는 것은 무시하는 법이고, 그러면
    정작 중요한 한 번을 놓친다.

    깨울지 말지는 **상자만** 안다. 릴레이는 봉투를 못 읽고, 우리 API 라우트도 밖에서는
    못 읽는다 — 열쇠가 폰에 있다. 그래서 봉투 밖의 한 비트로 온다.
    """
    sent = capture(monkeypatch)

    hook.notify("dev1", "reported", 1, wake=False)
    assert sent == [], "하트비트가 알림을 냈다"

    hook.notify("dev1", "reported", 2, wake=True)
    assert len(sent) == 1, "기다리는 복용이 있는데 알림이 안 갔다"
