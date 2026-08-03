# Everything testable in the pill dispenser, in one command.
#
#     make            run every suite that needs nothing installed
#     make python     the sheet reader and the schedule builder (needs conda env snapcare)
#     make firmware   the Raspberry Pi firmware (needs only python)
#     make relay      the cloud relay (needs only python)
#     make vectors    regenerate the crypto vectors the other implementations pin to
#     make kit        the web app's dispenser client (needs node 22+)
#     make apk        the demo app (needs the Android SDK)
#     make demo       a relay and a dispenser on this machine, wired together
#     make sweep      re-measure where the reader stops working
#     make clean
#
# They have deliberately different requirements. The firmware's tests need no
# board, no servo and no network; the relay's need no container and no account.
# The part of this project that runs on a device with no debugger can be checked
# by anyone, anywhere, in a second.
#
# What `make all` needs, all of it, in one interpreter:
#
#     pip install pytest opencv-python cryptography     # plus node 22+ for `kit`
#
# Worth spelling out because the failures do not name themselves. Without
# opencv the sheet reader raises ModuleNotFoundError and, separately, three
# firmware tests go red because the QR endpoints answer 503. Without
# cryptography the vector check stops with a line about apt. Neither points at
# the interpreter, and this repo had two virtualenvs where each was missing
# whichever the other had — so `make all` could not pass from either one.

PYTHON ?= python

.PHONY: all python firmware relay vectors kit apk demo sweep clean

all: firmware relay python vectors kit
	@echo
	@echo "pill dispenser: all tests passed"

firmware:
	@echo "── raspberry pi firmware ──"
	@$(MAKE) --no-print-directory -C firmware test PYTHON=$(PYTHON)

relay:
	@echo
	@$(MAKE) --no-print-directory -C cloud_relay test PYTHON=$(PYTHON)

python:
	@echo
	@echo "── sheet reader + schedule builder ──"
	@$(PYTHON) -m pytest form_sheet_parser/tests -q

# The pairing crypto now has four implementations sharing no code — the
# firmware, the relay's lab page, webapp_kit/ and android_demo/ — and this file
# is the only thing keeping them speaking the same language. It is generated
# from the firmware, so `--check` failing means somebody changed the derivation
# and the other three are now wrong.
vectors:
	@echo
	@echo "── crypto vectors (shared by four implementations) ──"
	@$(MAKE) --no-print-directory -C webapp_kit check PYTHON=$(PYTHON)

# `vectors` above only checks that the numbers still match the firmware. It says
# nothing about the TypeScript that consumes them, and for a while that mattered
# more than it sounds: relay.ts used a constructor parameter property, which the
# app's test runner cannot load, so `make test` in webapp_kit threw at import
# and ran **zero** of its 30 tests. Nothing here called that target, so the
# suite was dead and green at the same time. It hid a real one: a staleness
# check asserting on timestamps with no UTC offset.
#
# Skipped rather than failed when node is missing — the rest of this Makefile
# needs only Python and should stay runnable on a machine with no node.
kit:
	@echo
	@echo "── web app's dispenser kit ──"
	@command -v node >/dev/null \
	  && $(MAKE) --no-print-directory -C webapp_kit test \
	  || echo "   node is not on PATH — skipped"

# Not part of `all`: it needs the Android SDK, which most people running the
# tests will not have. Its own unit tests read the vectors above.
apk:
	@$(MAKE) --no-print-directory -C android_demo apk

# The whole cloud path on one machine: a relay, a dispenser with mock servos
# pointed at it, and the demo app at http://localhost:8088/lab.
demo:
	@$(MAKE) --no-print-directory -C cloud_relay demo PYTHON=$(PYTHON)

# Not part of `all`: it takes a few minutes and its output is a table to read,
# not an assertion. Run it after touching thresholds or the sampling window.
sweep:
	@$(PYTHON) -m form_sheet_parser.synth --sweep --trials 16

clean:
	@$(MAKE) --no-print-directory -C firmware clean
	@$(MAKE) --no-print-directory -C cloud_relay clean
	@rm -rf form_sheet_parser/__pycache__ form_sheet_parser/tests/__pycache__ .pytest_cache
