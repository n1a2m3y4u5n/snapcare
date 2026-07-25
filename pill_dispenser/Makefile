# Everything testable in the pill dispenser, in one command.
#
#     make            run both suites
#     make python     the sheet reader and the schedule builder (needs conda env snapcare)
#     make firmware   the protocol and the scheduler (needs only a C++ compiler)
#     make sweep      re-measure where the reader stops working
#     make clean
#
# The two halves have deliberately different requirements. The firmware tests
# build with nothing but g++ and make, so the part of this project that runs on
# a device with no debugger can be checked by anyone, anywhere, in a second.

PYTHON ?= python

.PHONY: all python firmware sweep clean

all: firmware python
	@echo
	@echo "pill dispenser: all tests passed"

firmware:
	@echo "── firmware (protocol + scheduler, host build) ──"
	@$(MAKE) --no-print-directory -C firmware/test

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
	@rm -rf form_sheet_parser/__pycache__ form_sheet_parser/tests/__pycache__ .pytest_cache
