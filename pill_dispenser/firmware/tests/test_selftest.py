"""Commissioning, exercised without a machine to commission.

The point of these is narrow and worth stating: a self-test whose *own* logic
is wrong is worse than no self-test, because it produces a signed-off report.
So what is checked here is that each check reaches the verdict the hardware
deserves — and, above all, that a machine which cannot move anything fails
rather than passing quietly.
"""
from __future__ import annotations

import json
from pathlib import Path

from snapcare_dispenser import config, selftest
from snapcare_dispenser.selftest import FAIL, PASS, SKIP, WARN, Report
from snapcare_dispenser.servo import MockBackend, TrayServos, make_backend
from snapcare_dispenser.store import Store


def _outcome(report: Report, fragment: str) -> str:
    for result in report.results:
        if fragment in result.name:
            return result.outcome
    raise AssertionError(f"no check named like {fragment!r} in "
                         f"{[r.name for r in report.results]}")


def test_a_machine_that_cannot_move_anything_fails():
    # The whole reason this exists. A mock backend on a real device means every
    # GPIO library is missing, and a commissioning run that passed there would
    # sign off a dispenser that never opens a tray.
    report = Report()
    selftest.check_servo_backend(report, MockBackend())
    assert _outcome(report, "GPIO driver") == FAIL


def test_thread_timed_pulses_pass_rather_than_warn():
    # lgpio is worse than pigpio and is what a current Raspberry Pi OS has.
    # Warning about it every time would train whoever runs this to ignore
    # warnings, which is the thing that makes the real ones useless.
    class Lgpio(MockBackend):
        name, quality, moves_hardware = "lgpio", "threaded", True

    report = Report()
    selftest.check_servo_backend(report, Lgpio())
    assert _outcome(report, "GPIO driver") == PASS


def test_python_timed_pulses_warn_but_do_not_block_a_sign_off():
    class RpiGpio(MockBackend):
        name, quality, moves_hardware = "rpigpio", "python", True

    report = Report()
    selftest.check_servo_backend(report, RpiGpio())
    assert _outcome(report, "GPIO driver") == WARN
    assert not report.failures


def test_a_tray_sharing_a_pin_with_a_peripheral_is_caught():
    # `SNAPCARE_TRAY_GPIO` exists so a bench can move a servo, and moving one
    # onto the screen's DC line is a tray that sweeps whenever a dose changes
    # state.
    servos = TrayServos(backend=MockBackend(),
                        pins={1: 17, 2: config.DISPLAY_DC_GPIO})
    report = Report()
    selftest.check_pin_map(report, servos)
    assert _outcome(report, "shares a pin") == FAIL


def test_a_clean_pin_map_passes():
    servos = TrayServos(backend=MockBackend(), pins={1: 17, 2: 27})
    report = Report()
    selftest.check_pin_map(report, servos)
    assert _outcome(report, "shares a pin") == PASS


def test_leaving_the_tray_count_at_the_default_is_a_warning_not_a_pass():
    # All eight accepted is right for a machine somebody will add to and wrong
    # for one being signed off: an absent servo cannot jam and has no error to
    # raise, so the dose is scheduled, never given, and reported by nothing.
    servos = TrayServos(backend=MockBackend(), pins={1: 17, 2: 27})
    report = Report()
    selftest.check_tray_count(report, servos, fitted=None)
    assert _outcome(report, "how many hoppers") == WARN

    report = Report()
    selftest.check_tray_count(report, servos, fitted=2)
    assert _outcome(report, "how many hoppers") == PASS


def _room(monkeypatch, *, touch_node, button_seen, pin_claimable=True):
    """Run the release-path check with the room's two controls set by hand."""
    monkeypatch.setattr(selftest.touch, "find_touch_device", lambda: touch_node)
    monkeypatch.setattr(selftest, "_button_available", lambda: pin_claimable)
    report = Report()
    selftest.check_release_path(report, TrayServos(backend=MockBackend(),
                                                   pins={1: 17}), button_seen)
    return report


def test_a_claimable_pin_is_not_a_button(monkeypatch):
    # The one this was written for. On 2026-08-04 a machine with an unwired
    # touch panel and no button fitted reported
    #
    #     [  ok  ] the room can release a dose — the button on the machine
    #
    # because the GPIO line could be claimed. An unfitted pin and an unpressed
    # button read identically through an internal pull-up, so nothing short of
    # a press is evidence, and a signed-off report saying otherwise is worse
    # than no report: nobody in that room could have taken a dose.
    report = _room(monkeypatch, touch_node=None, button_seen=None)
    assert _outcome(report, "the room can release") == SKIP

    # And it must not quietly claim the button in the list of ways in either.
    asked = [r for r in report.results if "something can ask" in r.name][0]
    assert "unknown" in asked.detail


def test_a_press_nobody_saw_fails_the_room(monkeypatch):
    report = _room(monkeypatch, touch_node=None, button_seen=False)
    assert _outcome(report, "the room can release") == FAIL


def test_a_press_that_arrived_is_a_control(monkeypatch):
    report = _room(monkeypatch, touch_node=None, button_seen=True)
    assert _outcome(report, "the room can release") == PASS


def test_a_touch_panel_needs_no_press_to_count(monkeypatch):
    # A device node is real evidence: the kernel bound a driver to a controller
    # that answered. That is the one control this build ships with.
    report = _room(monkeypatch, touch_node="/dev/input/event3", button_seen=None)
    assert _outcome(report, "the room can release") == PASS


def test_the_interactive_checks_are_skipped_rather_than_assumed(tmp_path):
    # Never silently passed. A check nobody performed has to read as skipped,
    # or the report says a colour was confirmed that nobody looked at.
    report = Report()
    selftest.check_trays(report, TrayServos(backend=MockBackend(), pins={1: 17}),
                         fitted=1, interactive=False)
    assert _outcome(report, "each tray") == SKIP


def test_the_report_records_what_was_skipped_as_well_as_what_failed(tmp_path):
    report = Report(started="2026-08-01T09:00:00", device="SnapCare-TEST")
    report.add("something checked", PASS)
    report.add("something broken", FAIL, "it is broken")
    report.add("something nobody looked at", SKIP, "not asked")

    written = report.to_json()
    assert written["passed"] is False
    outcomes = {r["name"]: r["outcome"] for r in written["results"]}
    assert outcomes["something nobody looked at"] == SKIP
    assert len(report.failures) == 1
    assert len(report.skipped) == 1


def test_a_run_writes_a_report_that_can_be_read_back(tmp_path):
    status = selftest.run(interactive=False, fitted=2, backend="mock",
                          state_dir=tmp_path)
    # A laptop has no GPIO, so this must be a failing commission — that is the
    # correct verdict and the exit status has to carry it.
    assert status == 1

    written = json.loads((Path(tmp_path) / "commissioning.json").read_text())
    assert written["passed"] is False
    assert written["startedAt"] and written["finishedAt"]
    assert any(r["outcome"] == FAIL for r in written["results"])


def test_the_state_directory_check_notices_one_it_cannot_write(tmp_path, monkeypatch):
    # Running the bench commands with sudo and the service without it is how
    # this breaks in the field: every dose is dispensed and then not recorded.
    monkeypatch.setattr(config, "STATE_DIR", Path("/proc/nowhere/snapcare"))
    report = Report()
    selftest.check_state_dir(report)
    assert _outcome(report, "state directory") == FAIL
