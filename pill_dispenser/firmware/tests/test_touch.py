"""The screen is the button, so finding the right input device is load-bearing.

Two failures are worth a test each, and both are silent on a running machine:
picking a phantom device that never reports a press, and rewriting the boot
configuration in a way that costs somebody a card reader.
"""
from __future__ import annotations

import os

import pytest

from snapcare_dispenser import config, touch


# ── which input device gets picked ──────────────────────────────────────────

@pytest.fixture
def inputs(tmp_path, monkeypatch):
    """Stand in for /dev/input and /sys/class/input.

    Returns a function taking {node name: device name}, in the order the
    kernel would have published them.
    """
    dev = tmp_path / "dev"
    sysfs = tmp_path / "sys"
    dev.mkdir()
    sysfs.mkdir()
    monkeypatch.setattr(touch, "_INPUT_DIR", dev)
    monkeypatch.setattr(touch, "_SYS_INPUT", sysfs)

    def publish(devices: dict[str, str],
                drivers: dict[str, str] | None = None) -> None:
        for node, name in devices.items():
            (dev / node).write_bytes(b"")
            holder = sysfs / node / "device"
            holder.mkdir(parents=True)
            (holder / "name").write_text(name, encoding="utf-8")
            # The kernel hangs the bus device one level further down and only
            # that one carries a `driver` symlink. Built here the same way so a
            # test can say "the driver bound" without saying what it called the
            # panel.
            module = (drivers or {}).get(node)
            if module:
                client = holder / "device"
                client.mkdir()
                target = sysfs / "drivers" / module
                target.mkdir(parents=True, exist_ok=True)
                (client / "driver").symlink_to(target)

    return publish


def test_a_capacitive_panel_is_found(inputs):
    inputs({"event0": "generic ft5x06 (79)"})
    assert touch.find_touch_device().name == "event0"


def test_a_goodix_panel_is_found(inputs):
    inputs({"event0": "Goodix Capacitive TouchScreen"})
    assert touch.find_touch_device().name == "event0"


def test_a_keyboard_is_not_a_touch_panel(inputs):
    inputs({"event0": "Dell Dell USB Keyboard"})
    assert touch.find_touch_device() is None


def test_the_phantom_resistive_device_is_never_picked(inputs):
    """The one that matters.

    A `dtoverlay=ads7846` line left in config.txt can bind against an empty SPI
    chip select and publish an input device that opens, reads and never fires.
    Picking it is a machine that reports a touch panel fitted and never releases
    a dose — strictly worse than reporting none.
    """
    inputs({"event0": "ADS7846 Touchscreen"})
    assert touch.find_touch_device() is None


def test_the_real_panel_wins_even_when_the_phantom_sorts_first(inputs):
    """Skipped outright, not ranked below.

    `event0` sorts first and would be taken by any "first match wins" search.
    """
    inputs({"event0": "ADS7846 Touchscreen",
            "event1": "generic ft5x06 (79)"})
    assert touch.find_touch_device().name == "event1"


def test_an_explicit_device_is_taken_at_its_word(inputs, tmp_path):
    inputs({"event0": "generic ft5x06 (79)"})
    named = tmp_path / "dev" / "event0"
    assert touch.find_touch_device(str(named)) == named


def test_an_explicit_device_that_is_not_there_is_not_substituted(inputs, tmp_path):
    """Somebody who named a device wants to be told it is missing.

    The named path is under tmp_path rather than a plausible /dev/input/eventN,
    which exists on a developer's laptop and made this pass for the wrong
    reason.
    """
    inputs({"event0": "generic ft5x06 (79)"})
    assert touch.find_touch_device(str(tmp_path / "dev" / "event9")) is None


def test_a_panel_named_after_its_model_number_is_still_a_panel(inputs):
    """What the fitted screen actually publishes.

    `edt_ft5x06` asks the controller for its model string and names the input
    device with it, so the FT6236 on this build arrives as `1-0038 EP0110M09`.
    Matched on the name alone that is not a touch panel, and the daemon said
    "no touch panel found" about a driver that had bound correctly. There is no
    end to the model numbers a vendor can return; there is an end to the list
    of drivers that can publish one.
    """
    inputs({"event2": "1-0038 EP0110M09"}, drivers={"event2": "edt_ft5x06"})
    assert touch.find_touch_device() == touch._INPUT_DIR / "event2"  # noqa: SLF001


def test_the_resistive_driver_is_skipped_by_driver_too(inputs):
    inputs({"event0": "some helpful name"}, drivers={"event0": "ads7846"})
    assert touch.find_touch_device() is None


# ── asking the bus ──────────────────────────────────────────────────────────

def test_the_probe_releases_the_reset_before_it_asks(monkeypatch, tmp_path):
    """The one that cost a day.

    A controller in reset does not acknowledge its address, so probing before
    releasing CTP_RST makes a fully wired panel read exactly like an absent one.
    That is what happened on 2026-08-04: `--touch-setup` said "Nothing
    answered", both I2C buses scanned empty, and CTP_INT never moved under
    fifteen seconds of pressing. All three agreed, all three were the same
    fact, and the panel was fine — nothing had ever driven GPIO 12.

    So the order is the thing being pinned here, not the answer.
    """
    order = []

    class _Released:
        def __enter__(self):
            order.append("reset released")
            return True

        def __exit__(self, *exc):
            order.append("reset let go")
            return False

    monkeypatch.setattr(touch, "_reset_released", _Released)

    bus = tmp_path / "i2c-fake"
    bus.write_bytes(b"")

    def _open(path, *args, **kwargs):
        order.append("bus opened")
        raise OSError("no such bus")

    monkeypatch.setattr(touch.os, "open", _open)

    assert touch.probe_bus(str(bus)) == []
    assert order == ["reset released", "bus opened", "reset let go"]


# ── the device-tree line ────────────────────────────────────────────────────

def test_the_ft6236_gets_its_reset_held_by_the_bootloader():
    """`edt-ft5406` has no reset parameter, so CTP_RST has to be held elsewhere.

    Left floating it is a chip that comes out of reset on some boots and not
    others, which reads as a panel that works intermittently.
    """
    lines = touch._overlay_lines(0x38)  # noqa: SLF001
    assert "dtoverlay=edt-ft5406,i2c1" in lines
    assert f"gpio={config.TOUCH_RESET_GPIO}=op,dh" in lines


def test_the_ft6236_line_names_the_bus_it_was_found_on(monkeypatch):
    """`edt-ft5406` defaults to the camera connector's bus, not this one.

    It exists for the official 7-inch DSI screen. Loaded without a bus it binds
    to `i2c_csi_dsi`, probes a bus this panel is not on and fails:

        edt_ft5x06 10-0038: probe with driver edt_ft5x06 failed with error -5

    which reads as a dead panel and is a line that named the wrong wires.
    """
    monkeypatch.setattr(config, "TOUCH_I2C_BUS", "/dev/i2c-3")
    assert "dtoverlay=edt-ft5406,i2c3" in touch._overlay_lines(0x38)  # noqa: SLF001


def test_the_gt911_takes_both_pins_as_parameters():
    lines = touch._overlay_lines(0x5D)  # noqa: SLF001
    assert lines == (f"dtoverlay=goodix,interrupt={config.TOUCH_INT_GPIO}"
                     f",reset={config.TOUCH_RESET_GPIO}",)


def test_a_part_with_no_stock_overlay_says_so_rather_than_guessing():
    assert touch._overlay_lines(0x48) == ()  # noqa: SLF001


# ── rewriting config.txt ────────────────────────────────────────────────────

def _fake_bus(tmp_path):
    """A stand-in for /dev/i2c-1 that can actually be opened.

    `setup` opens the bus itself before probing, so that "not allowed to open
    it" and "nothing acknowledged" stop being the same message. A directory
    would fail that open.
    """
    bus = tmp_path / "i2c-1"
    bus.write_bytes(b"")
    return bus

def test_the_resistive_line_is_stripped_with_its_own_comment():
    kept, dropped = touch._strip_resistive([  # noqa: SLF001
        "dtparam=spi=on",
        "",
        "# SnapCare: the LCD touch panel, read as the take-dose button",
        "dtoverlay=ads7846,cs=1,penirq=4",
        "dtparam=i2c_arm=on",
    ])
    assert dropped == 1
    assert kept == ["dtparam=spi=on", "dtparam=i2c_arm=on"]


def test_somebody_elses_comment_is_left_alone():
    """Only this project's own comment goes with the line."""
    kept, dropped = touch._strip_resistive([  # noqa: SLF001
        "# my notes about the display",
        "dtoverlay=ads7846",
    ])
    assert dropped == 1
    assert kept == ["# my notes about the display"]


def test_nothing_else_that_looks_like_it_is_touched():
    lines = ["dtoverlay=ads7846-nonsense-suffix", "dtoverlay=goodix"]
    kept, dropped = touch._strip_resistive(lines)  # noqa: SLF001
    assert dropped == 1, "the prefix match is deliberate — one directive, one name"
    assert kept == ["dtoverlay=goodix"]


def test_setup_keeps_a_copy_of_the_file_it_edits(tmp_path, monkeypatch):
    """A config.txt that will not boot is a card reader and a second machine."""
    cfg = tmp_path / "config.txt"
    cfg.write_text("dtparam=spi=on\ndtoverlay=ads7846\n", encoding="utf-8")

    monkeypatch.setattr(touch, "find_touch_device", lambda *a, **k: None)
    monkeypatch.setattr(touch, "probe_bus", lambda *a, **k: [0x38])
    monkeypatch.setattr(config, "TOUCH_I2C_BUS", str(_fake_bus(tmp_path)))

    assert touch.setup(str(cfg)) == 0

    backup = tmp_path / "config.txt.snapcare-bak"
    assert backup.read_text(encoding="utf-8") == "dtparam=spi=on\ndtoverlay=ads7846\n"

    written = cfg.read_text(encoding="utf-8")
    assert "ads7846" not in written
    assert "dtoverlay=edt-ft5406" in written
    assert "dtparam=spi=on" in written


def test_setup_does_not_write_the_same_line_twice(tmp_path, monkeypatch):
    """It is run twice by design: once to fix, once to check."""
    cfg = tmp_path / "config.txt"
    cfg.write_text("dtoverlay=edt-ft5406,i2c1\ngpio=12=op,dh\n", encoding="utf-8")

    monkeypatch.setattr(touch, "find_touch_device", lambda *a, **k: None)
    monkeypatch.setattr(touch, "probe_bus", lambda *a, **k: [0x38])
    monkeypatch.setattr(touch, "_input_devices", lambda: [])
    monkeypatch.setattr(config, "TOUCH_I2C_BUS", str(_fake_bus(tmp_path)))

    assert touch.setup(str(cfg)) == 1  # nothing bound yet — not a pass
    assert cfg.read_text(encoding="utf-8").count("edt-ft5406") == 1


def test_an_earlier_line_for_the_same_overlay_is_replaced(tmp_path, monkeypatch):
    """Not appended beside. The kernel loads every `dtoverlay` line it finds.

    A line this command wrote before the bus parameter existed does not get
    superseded by the corrected one, it gets loaded as well — and the load that
    fails is the one whose message reaches `dmesg`, so the file looks fixed and
    the log says the panel is broken.
    """
    cfg = tmp_path / "config.txt"
    cfg.write_text("dtparam=i2c_arm=on\ndtoverlay=edt-ft5406\n", encoding="utf-8")

    monkeypatch.setattr(touch, "find_touch_device", lambda *a, **k: None)
    monkeypatch.setattr(touch, "probe_bus", lambda *a, **k: [0x38])
    monkeypatch.setattr(config, "TOUCH_I2C_BUS", str(_fake_bus(tmp_path)))

    assert touch.setup(str(cfg)) == 0
    written = cfg.read_text(encoding="utf-8")
    assert written.count("edt-ft5406") == 1
    assert "dtoverlay=edt-ft5406,i2c1" in written
    assert "dtparam=i2c_arm=on" in written  # somebody else's line, left alone


def test_replacing_a_line_does_not_leave_its_heading_behind(tmp_path, monkeypatch):
    """Or the file grows a stack of them, one per parameter ever corrected."""
    cfg = tmp_path / "config.txt"
    cfg.write_text("# SnapCare: the screen's touch controller, which is the "
                   "take-dose button\ndtoverlay=edt-ft5406\n", encoding="utf-8")

    monkeypatch.setattr(touch, "find_touch_device", lambda *a, **k: None)
    monkeypatch.setattr(touch, "probe_bus", lambda *a, **k: [0x38])
    monkeypatch.setattr(config, "TOUCH_I2C_BUS", str(_fake_bus(tmp_path)))

    assert touch.setup(str(cfg)) == 0
    assert cfg.read_text(encoding="utf-8").count("# SnapCare") == 1


def test_setup_says_nothing_to_do_when_the_panel_is_already_live(tmp_path,
                                                                monkeypatch):
    cfg = tmp_path / "config.txt"
    cfg.write_text("dtoverlay=edt-ft5406\n", encoding="utf-8")
    monkeypatch.setattr(touch, "find_touch_device",
                        lambda *a, **k: tmp_path / "event0")

    assert touch.setup(str(cfg)) == 0
    assert cfg.read_text(encoding="utf-8") == "dtoverlay=edt-ft5406\n"


def test_a_bus_that_is_not_there_is_not_reported_as_a_wiring_fault(tmp_path,
                                                                  monkeypatch):
    """No /dev/i2c-1 and nothing answering need opposite fixes."""
    cfg = tmp_path / "config.txt"
    cfg.write_text("", encoding="utf-8")
    monkeypatch.setattr(touch, "find_touch_device", lambda *a, **k: None)
    monkeypatch.setattr(config, "TOUCH_I2C_BUS", str(tmp_path / "no-such-bus"))

    assert touch.setup(str(cfg)) == 1
    assert cfg.read_text(encoding="utf-8") == ""


@pytest.mark.skipif(os.geteuid() == 0, reason="root can open a 0o000 file")
def test_a_bus_that_cannot_be_opened_is_not_a_wiring_fault_either(tmp_path,
                                                                  monkeypatch):
    """Forgetting sudo must not read as "check your wiring"."""
    cfg = tmp_path / "config.txt"
    cfg.write_text("", encoding="utf-8")
    bus = _fake_bus(tmp_path)
    bus.chmod(0o000)
    monkeypatch.setattr(touch, "find_touch_device", lambda *a, **k: None)
    monkeypatch.setattr(config, "TOUCH_I2C_BUS", str(bus))

    def not_reached(*a, **k):
        raise AssertionError("the bus was probed after the open failed")

    monkeypatch.setattr(touch, "probe_bus", not_reached)
    assert touch.setup(str(cfg)) == 1
