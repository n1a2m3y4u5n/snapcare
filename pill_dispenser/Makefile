# Everything testable in the pill dispenser, in one command.
#
#     make            run all four suites
#     make python     the sheet reader and the schedule builder (needs conda env snapcare)
#     make firmware   the AVR/ESP protocol and scheduler (needs only a C++ compiler)
#     make rpi        the Raspberry Pi firmware (needs only python)
#     make relay      the cloud relay (needs only python)
#     make demo       a relay and a dispenser on this machine, wired together
#     make sweep      re-measure where the reader stops working
#     make clean
#
# They have deliberately different requirements. The C++ tests build with
# nothing but g++ and make; the Raspberry Pi ones need no board, no servo and no
# network; the relay's need no container and no account. The part of this
# project that runs on a device with no debugger can be checked by anyone,
# anywhere, in a second.

PYTHON ?= python

.PHONY: all python firmware rpi relay demo sweep clean

all: firmware rpi relay python
	@echo
	@echo "pill dispenser: all tests passed"

firmware:
	@echo "── firmware (protocol + scheduler, host build) ──"
	@$(MAKE) --no-print-directory -C firmware/test

rpi:
	@echo
	@echo "── raspberry pi firmware ──"
	@$(MAKE) --no-print-directory -C rpi_firmware test PYTHON=$(PYTHON)

relay:
	@echo
	@$(MAKE) --no-print-directory -C cloud_relay test PYTHON=$(PYTHON)

python:
	@echo
	@echo "── sheet reader + schedule builder ──"
	@$(PYTHON) -m pytest form_sheet_parser/tests -q

# The whole cloud path on one machine: a relay, a dispenser with mock servos
# pointed at it, and the demo app at http://localhost:8088/lab.
demo:
	@$(MAKE) --no-print-directory -C cloud_relay demo PYTHON=$(PYTHON)

# Not part of `all`: it takes a few minutes and its output is a table to read,
# not an assertion. Run it after touching thresholds or the sampling window.
sweep:
	@$(PYTHON) -m form_sheet_parser.synth --sweep --trials 16

clean:
	@$(MAKE) --no-print-directory -C firmware/test clean
	@$(MAKE) --no-print-directory -C rpi_firmware clean
	@$(MAKE) --no-print-directory -C cloud_relay clean
	@rm -rf form_sheet_parser/__pycache__ form_sheet_parser/tests/__pycache__ .pytest_cache
