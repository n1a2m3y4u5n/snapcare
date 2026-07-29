# The cloud relay, testable without deploying it.
#
#     make            the suite
#     make run        start it here on port 8088, with the demo app at /lab
#     make demo       relay + a dispenser on this machine, wired together
#     make lint       compile-check every module
#     make clean
#
# Nothing here needs a container, a fly.io account or a network beyond
# localhost.

PYTHON ?= python
PORT   ?= 8088
DATA   ?= /tmp/snapcare-relay
STATE  ?= /tmp/snapcare-dev

.PHONY: all test run demo lint clean

all: test

test:
	@echo "── cloud relay ──"
	@$(PYTHON) -m pytest tests -q

run:
	@mkdir -p $(DATA)
	SNAPCARE_RELAY_DATA=$(DATA) $(PYTHON) -m snapcare_relay --port $(PORT) --verbose

# The whole path on one machine: a relay, and a dispenser with mock servos
# pointed at it. Open http://localhost:$(PORT)/lab, pair with the code the
# firmware prints, and edit the schedule — the dispenser picks it up.
#
# Backgrounds the relay and stops it on the way out, so Ctrl-C leaves nothing
# listening on $(PORT) to confuse the next run.
demo:
	@mkdir -p $(DATA) $(STATE)
	@echo "── relay on :$(PORT), dispenser on :8099 ──"
	@SNAPCARE_RELAY_DATA=$(DATA) $(PYTHON) -m snapcare_relay --port $(PORT) & \
	 RELAY=$$!; \
	 trap "kill $$RELAY 2>/dev/null" EXIT INT TERM; \
	 sleep 1; \
	 echo; echo "pairing code:"; \
	 SNAPCARE_STATE_DIR=$(STATE) $(PYTHON) -c \
	   "import sys; sys.path.insert(0,'../rpi_firmware'); \
	    from snapcare_dispenser import provisioning as p, store as s; \
	    print('   ', p.load_identity(s.Store('$(STATE)')).claim)"; \
	 echo; echo "open http://localhost:$(PORT)/lab and pair with it"; echo; \
	 cd ../rpi_firmware && SNAPCARE_STATE_DIR=$(STATE) $(PYTHON) -m snapcare_dispenser \
	   --no-wifi --port 8099 --servo-backend mock \
	   --relay-url http://localhost:$(PORT) --verbose

lint:
	@$(PYTHON) -m compileall -q snapcare_relay tests && echo "every module compiles"

clean:
	@rm -rf $(DATA) .pytest_cache
	@find . -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
