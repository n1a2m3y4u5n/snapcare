# The web app's side of the dispenser sync.
#
#     make vectors    regenerate tests/vectors.json from the firmware
#     make check      fail if the vectors are stale (for CI)
#     make test       run the TypeScript tests — needs node 22+
#     make demo       a relay and a mock dispenser on this machine, no hardware
#
# `make vectors` and `make check` need only Python. `make test` needs node,
# because these tests are the app's tests and the app is where they will live.

PYTHON ?= python
NODE   ?= node

.PHONY: all vectors check test demo clean

all: check

# Generated from the firmware's own modules, never by hand. If somebody changes
# the HKDF salt, the info labels, the claim alphabet or the AAD string, this
# regenerates into something different and the TypeScript tests fail — which is
# the whole reason the file exists.
vectors:
	@$(PYTHON) tools/make_vectors.py

check:
	@$(PYTHON) tools/make_vectors.py --check

# Same runner and same flags as the app's own `npm test`, so these drop into it
# unchanged once the kit is copied into lib/.
test:
	@command -v $(NODE) >/dev/null || { \
	  echo "node is not on PATH — these are the app's tests and run under its runtime:"; \
	  echo "    node --test --experimental-strip-types 'tests/*.test.ts'"; exit 1; }
	@$(NODE) --test --experimental-strip-types 'tests/*.test.ts'

# A relay plus a dispenser with mock servos, wired together on localhost, so the
# app can be developed against a working device with no Raspberry Pi anywhere.
demo:
	@$(MAKE) -C .. demo

clean:
	@rm -rf node_modules
