# The Raspberry Pi firmware, testable without a Raspberry Pi.
#
#     make            the whole suite
#     make run        start it here, with mock servos and no WiFi meddling
#     make cloud      the same, pointed at a relay on this machine
#     make label      print this machine's setup QR and pairing code
#     make lint       compile-check every module
#     make clean
#
# Nothing here needs a board, a servo, a network or a second of real time. That
# is deliberate: the device is usually in a different room from whoever is
# editing it, and a test that needs the hardware is a test nobody runs.

PYTHON ?= python
PORT   ?= 8099
STATE  ?= /tmp/snapcare-dev
RELAY  ?= http://localhost:8088

.PHONY: all test run cloud label lint clean

all: test

test:
	@echo "── raspberry pi firmware ──"
	@$(PYTHON) -m pytest tests -q

# Mock servos, and --no-wifi so it cannot touch the development machine's own
# network. Open http://localhost:8099/ for the test console.
run:
	@mkdir -p $(STATE)
	SNAPCARE_STATE_DIR=$(STATE) $(PYTHON) -m snapcare_dispenser \
		--no-wifi --port $(PORT) --servo-backend mock --verbose

# The same, but talking to a relay. Start one first — `make run` in
# ../cloud_relay — or use `make demo` there, which starts both.
cloud:
	@mkdir -p $(STATE)
	SNAPCARE_STATE_DIR=$(STATE) $(PYTHON) -m snapcare_dispenser \
		--no-wifi --port $(PORT) --servo-backend mock \
		--relay-url $(RELAY) --verbose

label:
	@SNAPCARE_STATE_DIR=$(STATE) $(PYTHON) -m snapcare_dispenser --show-qr

lint:
	@$(PYTHON) -m compileall -q snapcare_dispenser tests && echo "every module compiles"

clean:
	@rm -rf $(STATE) .pytest_cache
	@find . -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
