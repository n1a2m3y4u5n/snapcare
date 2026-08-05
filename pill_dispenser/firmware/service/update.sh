#!/usr/bin/env bash
#
# Update the firmware on a Pi that already has it.
#
#     sudo ./service/update.sh
#
# Run this ON THE PI, from a checkout of the repository — the same place
# `install.sh` is run from, and the same as it in every way except that it does
# none of the once-only work.
#
# Why this exists beside install.sh
# ---------------------------------
# `install.sh` is safe to re-run and it is the wrong tool for a code change. It
# takes the apt lock, waits out `unattended-upgrades`, reinstalls six packages,
# rewrites config.txt, sets the hostname and restarts avahi — a minute or two
# on a good day, several on a fresh card, and every one of those steps is a way
# for a one-line fix to break something that was working. This one copies the
# package and restarts the service, which is a second and a half.
#
# So the division is: **install.sh owns the machine, update.sh owns the code.**
# Anything that touches apt, the boot config, the hostname, the portal DNS rule
# or the clock chip belongs in install.sh and is not repeated here. If one of
# those has to change, this script tells you to run install.sh rather than
# quietly doing half of it.
#
# What it does
# ------------
#   1. checks the firmware is actually installed, and that this checkout
#      compiles, before it touches the running device
#   2. swaps in the new package directory, keeping the old one for rollback
#   3. refreshes the unit file and the `snapcare-dispenser` command, but only
#      if they have changed — a `daemon-reload` on every deploy is noise
#   4. restarts the service and waits for it to answer on its own port
#   5. rolls back and says so if it does not
#
# What it deliberately does not touch: /var/lib/snapcare. The schedule, the
# dose ledger and the device's permanent identity live there, and a deploy that
# resets any of them is a deploy that loses somebody's prescription — or, worse,
# changes the setup network's name and password so that the printed label on the
# side of the case is now a lie.
#
#     sudo ./service/update.sh --rollback     put the previous version back
#     sudo ./service/update.sh --dry-run      say what would change, change nothing
#     sudo ./service/update.sh --force        deploy even if nothing looks different
#     sudo ./service/update.sh --no-restart   stage it; the next restart picks it up
#
set -euo pipefail

INSTALL_DIR="${SNAPCARE_INSTALL_DIR:-/opt/snapcare}"
UNIT="${SNAPCARE_UNIT:-snapcare-dispenser.service}"
PACKAGE=snapcare_dispenser
#: The two system paths this writes outside $INSTALL_DIR. Overridable only so
#: that this script can be exercised against a scratch directory on a machine
#: that is not a Pi — there is no reason to set either on a device.
SYSTEMD_DIR="${SNAPCARE_SYSTEMD_DIR:-/etc/systemd/system}"
BIN_DIR="${SNAPCARE_BIN_DIR:-/usr/local/bin}"
#: Where the previous version waits. One deep, not a dated archive: the useful
#: rollback is always to the thing that was working ten seconds ago, and a
#: directory of six old copies on a 16 GB card is a way to fill it.
BACKUP_SUFFIX=.previous
#: How long to wait for the service to answer after a restart. The firmware
#: opens its GPIO, probes the clock chip and paints a frame before it binds, and
#: on a Pi 3B that is a few seconds. Too short here and a perfectly good deploy
#: rolls itself back.
HEALTH_TIMEOUT_S="${SNAPCARE_HEALTH_TIMEOUT_S:-25}"
HTTP_PORT="${SNAPCARE_HTTP_PORT:-80}"

DRY_RUN=
FORCE=
ROLLBACK=
RESTART=1

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --force)      FORCE=1 ;;
    --rollback)   ROLLBACK=1 ;;
    --no-restart) RESTART= ;;
    -h|--help)    sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)
      echo "unknown option: $arg" >&2
      echo "try: $0 --help" >&2
      exit 2 ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }
run()  { if [[ -n $DRY_RUN ]]; then printf '    would: %s\n' "$*"; else "$@"; fi; }

# Writability rather than uid, so the message is about the thing that will
# actually fail. On a device these are the same question — $INSTALL_DIR is
# root-owned — and the answer is the same sudo line.
if [[ -z $DRY_RUN && -d $INSTALL_DIR && ! -w $INSTALL_DIR ]]; then
  echo "$INSTALL_DIR is not writable by $(id -un). Try: sudo $0 $*" >&2
  exit 1
fi

# ── is there anything here to update? ───────────────────────────────────────
#
# Asked before anything else, because the failure it prevents is the expensive
# one. `cp -r` onto a machine with no install produces a half-installed device
# — the package in place, no unit, no command, no state directory — which looks
# like a working install to anybody reading the directory listing and is a
# device that never starts. Better to send them to the installer that does the
# whole job.
if [[ ! -d "$INSTALL_DIR/$PACKAGE" ]]; then
  cat >&2 <<EOF
No firmware at $INSTALL_DIR/$PACKAGE.

This script updates an existing install; it does not create one. The first
install also needs packages, SPI and I2C turned on in config.txt, the hostname,
the captive-portal DNS rule and the systemd unit:

    sudo ./service/install.sh

EOF
  exit 1
fi

# ── --rollback, which is the whole reason the backup is kept ────────────────

if [[ -n $ROLLBACK ]]; then
  if [[ ! -d "$INSTALL_DIR/$PACKAGE$BACKUP_SUFFIX" ]]; then
    echo "No previous version at $INSTALL_DIR/$PACKAGE$BACKUP_SUFFIX — nothing to roll back to." >&2
    exit 1
  fi
  say "Rolling back to the previous version"
  # The current one becomes the backup, so a rollback can itself be rolled
  # back. Somebody who deploys, rolls back, and then decides the new version was
  # right after all should not have to go and find the checkout again.
  run rm -rf "$INSTALL_DIR/$PACKAGE.rollback-tmp"
  run mv "$INSTALL_DIR/$PACKAGE" "$INSTALL_DIR/$PACKAGE.rollback-tmp"
  run mv "$INSTALL_DIR/$PACKAGE$BACKUP_SUFFIX" "$INSTALL_DIR/$PACKAGE"
  run mv "$INSTALL_DIR/$PACKAGE.rollback-tmp" "$INSTALL_DIR/$PACKAGE$BACKUP_SUFFIX"
  note "restored $INSTALL_DIR/$PACKAGE"
  if [[ -n $RESTART ]]; then
    run systemctl restart "$UNIT"
    note "restarted $UNIT"
  fi
  say "Done"
  exit 0
fi

# ── does this checkout even compile? ────────────────────────────────────────
#
# Before the running device is touched, and this is the single most valuable
# thing in the file. The service has Restart=always, so a package with a syntax
# error in it does not fail once — it restarts every five seconds for ever, and
# the machine sits there with a dark screen dropping no doses while systemd
# patiently tries again. A `compileall` on the source costs about a second and
# turns that into a message on the terminal of the person deploying.
#
# It is not the test suite. pytest is not on a Pi, the suite takes fifteen
# seconds, and a deploy is not the place to find out — `make test` on the
# development machine is. This is the floor: it will not deploy something that
# cannot be imported.
say "Checking the firmware compiles"
if ! python3 -m compileall -q "$here/$PACKAGE" >/dev/null; then
  echo "  !! this checkout does not compile — nothing has been changed" >&2
  python3 -m compileall -q "$here/$PACKAGE" || true
  exit 1
fi
note "every module compiles"

# ── is there anything to deploy? ────────────────────────────────────────────
#
# A checksum of the source rather than a version string, because there is no
# version string and inventing one would mean somebody has to remember to bump
# it. `__pycache__` is excluded on both sides: it is a build product, it differs
# between a laptop and a Pi over nothing, and comparing it would make every
# deploy look like a change.
tree_sum() {
  local root="$1"
  [[ -d $root ]] || { echo "absent"; return; }
  find "$root" -type f -name '*.py' -not -path '*/__pycache__/*' -print0 \
    | sort -z \
    | xargs -0 sha256sum 2>/dev/null \
    | sed "s| $root/| |" \
    | sha256sum
  # Templates and the stylesheet are firmware too. The setup page and the
  # console are served straight off disk out of the package's `web/`, so a
  # change to one of them is a change to what the device does and must not be
  # reported as "nothing to deploy".
}
assets_sum() {
  local root="$1"
  [[ -d $root/web ]] || { echo "none"; return; }
  find "$root/web" -type f -print0 | sort -z | xargs -0 sha256sum 2>/dev/null \
    | sed "s| $root/| |" | sha256sum
}

new_sum="$(tree_sum "$here/$PACKAGE")$(assets_sum "$here/$PACKAGE")"
old_sum="$(tree_sum "$INSTALL_DIR/$PACKAGE")$(assets_sum "$INSTALL_DIR/$PACKAGE")"

if [[ "$new_sum" == "$old_sum" && -z $FORCE ]]; then
  say "The installed firmware is already this one"
  note "nothing copied, nothing restarted."
  note "use --force to deploy anyway, or --rollback to go back one version."
  exit 0
fi

# What actually differs, so the person deploying sees the change land rather
# than trusting that it did. `diff -rq` is on every Pi OS image and needs no
# rsync.
say "Changing"
if [[ -d "$INSTALL_DIR/$PACKAGE" ]]; then
  diff -rq --exclude=__pycache__ "$INSTALL_DIR/$PACKAGE" "$here/$PACKAGE" 2>/dev/null \
    | sed 's/^/    /' | head -40 || true
fi

# ── the swap ────────────────────────────────────────────────────────────────
#
# Built beside the live directory and moved into place, rather than copied over
# the top. Two reasons, and the second is the one that bites:
#
#   * a copy over the top is a window, several hundred milliseconds long, in
#     which the package on disk is half of one version and half of another. The
#     service has Restart=always and a crash inside that window reimports it.
#   * a copy over the top **never deletes anything**. A module removed upstream
#     stays on the device for ever, still importable, still shadowing nothing —
#     and the day somebody re-adds a name that used to live there, the device is
#     running a file that is not in the repository and cannot be found by
#     reading it. `install.sh` has this shape today; here the whole directory is
#     replaced, so a deletion deploys like any other change.
#
# `mv` within one filesystem is a rename: atomic, instant, and it cannot half
# happen. Both directories are under $INSTALL_DIR precisely so that stays true.
STAGING="$INSTALL_DIR/$PACKAGE.incoming"

say "Staging the new firmware"
run rm -rf "$STAGING"
run cp -r "$here/$PACKAGE" "$STAGING"
# The pyc files from the development machine are wrong for this board and are a
# build product besides. Left behind, they are a stale cache keyed on a
# timestamp that the copy has just changed.
run find "$STAGING" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
note "staged at $STAGING"

say "Swapping it in"
run rm -rf "$INSTALL_DIR/$PACKAGE$BACKUP_SUFFIX"
run mv "$INSTALL_DIR/$PACKAGE" "$INSTALL_DIR/$PACKAGE$BACKUP_SUFFIX"
run mv "$STAGING" "$INSTALL_DIR/$PACKAGE"
note "previous version kept at $INSTALL_DIR/$PACKAGE$BACKUP_SUFFIX"

# The README is what the unit's Documentation= line points at, and it is the
# only other thing install.sh puts here.
if [[ -f "$here/README.md" ]]; then
  run cp "$here/README.md" "$INSTALL_DIR/"
fi

# ── the two things outside the package ──────────────────────────────────────
#
# Both are install.sh's work and both are rewritten here only when they differ,
# because both are cheap to check and expensive to get wrong. A unit file that
# gained an Environment= line in the repository and never reached the device is
# the kind of difference that is invisible until somebody spends an afternoon on
# why cloud sync is off on one machine.

if [[ -f "$here/service/$UNIT" ]] && ! cmp -s "$here/service/$UNIT" "$SYSTEMD_DIR/$UNIT"; then
  say "The unit file has changed"
  run cp "$here/service/$UNIT" "$SYSTEMD_DIR/$UNIT"
  # Soft, and on purpose. The package is already swapped in by this point, so
  # dying here would leave a device running new code under an old unit with
  # nothing said about it — the worst of both. A reload that fails is worth a
  # line and a restart is still worth attempting.
  if run systemctl daemon-reload; then
    note "installed and reloaded"
  else
    note "!! systemctl daemon-reload failed — the new unit is on disk and systemd"
    note "!! is still running the old one. Reload it by hand when you can:"
    note "!!     sudo systemctl daemon-reload && sudo systemctl restart $UNIT"
  fi
fi

if [[ ! -x "$BIN_DIR/snapcare-dispenser" ]]; then
  # Not a nicety: every command in the README and the assembly guide is
  # `snapcare-dispenser ...`, and without this they all answer "No module named
  # snapcare_dispenser" — including `--show-qr`, which is the only way onto the
  # no-keyboard WiFi join path.
  say "Restoring the snapcare-dispenser command"
  if [[ -z $DRY_RUN ]]; then
    cat > "$BIN_DIR/snapcare-dispenser" <<EOF
#!/bin/sh
# Written by the SnapCare dispenser updater. The firmware is not pip-installed
# and $INSTALL_DIR is not on Python's default path, so this supplies it.
exec env PYTHONPATH="$INSTALL_DIR" /usr/bin/python3 -m snapcare_dispenser "\$@"
EOF
    chmod 755 "$BIN_DIR/snapcare-dispenser"
  else
    note "would write $BIN_DIR/snapcare-dispenser"
  fi
fi

if [[ -z $RESTART ]]; then
  say "Staged, not restarted"
  note "the running process is still on the previous version."
  note "    sudo systemctl restart $UNIT"
  exit 0
fi

if [[ -n $DRY_RUN ]]; then
  say "Dry run — nothing was changed"
  exit 0
fi

# ── restart, and prove it came back ─────────────────────────────────────────
#
# A restart is safe at any moment and that is a property of the firmware rather
# than an assumption here: every dose it has given is on the card before the
# tray moves, so the worst a restart during a dispense can do is lose the
# animation. The one thing it does cost is a waiting dose's *offer* — the
# machine re-reads the schedule and works out again what is owed.
#
# `is-active` alone is not proof. Restart=always means systemd reports the unit
# active while it is crash-looping, so a package that raises on import passes
# that check for ever. The device's own status endpoint answering is the first
# moment anything has actually run.
say "Restarting $UNIT"
systemctl restart "$UNIT"

# Probed with python3 rather than curl. python3 is a hard dependency of this
# firmware and curl is not on the Lite image's guaranteed list, and a health
# check that is silently skipped because a tool is missing is worse than no
# health check — it would report every failed deploy as a good one.
answers() {
  python3 - "$HTTP_PORT" <<'PY' >/dev/null 2>&1
import sys, urllib.request
with urllib.request.urlopen(f"http://127.0.0.1:{sys.argv[1]}/api/status", timeout=2) as r:
    sys.exit(0 if r.status == 200 else 1)
PY
}

healthy=
deadline=$(( SECONDS + HEALTH_TIMEOUT_S ))
while (( SECONDS < deadline )); do
  if answers; then
    healthy=1
    break
  fi
  # A unit that has given up entirely will not start answering, so stop waiting
  # for it rather than burning the whole timeout.
  if ! systemctl is-active --quiet "$UNIT"; then
    break
  fi
  sleep 1
done

if [[ -z $healthy ]]; then
  say "IT DID NOT COME BACK — rolling back"
  journalctl -u "$UNIT" -n 25 --no-pager 2>/dev/null | sed 's/^/    /' || true
  rm -rf "$INSTALL_DIR/$PACKAGE.failed"
  mv "$INSTALL_DIR/$PACKAGE" "$INSTALL_DIR/$PACKAGE.failed"
  mv "$INSTALL_DIR/$PACKAGE$BACKUP_SUFFIX" "$INSTALL_DIR/$PACKAGE"
  systemctl restart "$UNIT"
  echo
  note "the previous version is running again."
  note "the version that failed is at $INSTALL_DIR/$PACKAGE.failed — the log above is why."
  exit 1
fi

say "Done"
note "$UNIT is up and answering on port ${HTTP_PORT}."
note ""
note "    systemctl status $UNIT"
note "    journalctl -u $UNIT -f"
note "    sudo ./service/update.sh --rollback     # if it misbehaves"
