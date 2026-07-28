# Everything testable in the pill dispenser, in one command.
#
#     make            run all three suites
#     make python     the sheet reader and the schedule builder (needs conda env snapcare)
#     make firmware   the AVR/ESP protocol and scheduler (needs only a C++ compiler)
#     make rpi        the Raspberry Pi firmware (needs only python)
#     make sweep      re-measure where the reader stops working
#     make clean
#
# The three have deliberately different requirements. The C++ tests build with
# nothing but g++ and make; the Raspberry Pi ones need no board, no servo and no
# network. The part of this project that runs on a device with no debugger can
# be checked by anyone, anywhere, in a second.

PYTHON ?= python

.PHONY: all python firmware rpi sweep clean

all: firmware rpi python
	@echo
	@echo "pill dispenser: all tests passed"

firmware:
	@echo "── firmware (protocol + scheduler, host build) ──"
	@$(MAKE) --no-print-directory -C firmware/test

rpi:
	@echo
	@echo "── raspberry pi firmware ──"
	@$(MAKE) --no-print-directory -C rpi_firmware test PYTHON=$(PYTHON)

python:
	@echo
	@echo "── sheet reader + schedule builder ──"
	@$(PYTHON) -m pytest form_sheet_parser/tests -q

# Not part of `all`: it takes a few minutes and its output is a table to read,
# not an assertion. Run it after touching thresholds or the sampling window.
sweep:
	@$(PYTHON) -m form_sheet_parser.synth --sweep --trials 16

clean:
	@$(MAKE) --no-print-directory -C firmware/test clean
	@$(MAKE) --no-print-directory -C rpi_firmware clean
	@rm -rf form_sheet_parser/__pycache__ form_sheet_parser/tests/__pycache__ .pytest_cache
