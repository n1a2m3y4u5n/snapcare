# Host-side tests for the parts of the firmware that are worth testing.
#
# The protocol and the scheduler are deliberately free of <Arduino.h>, so the
# two things that are easiest to get wrong — parsing bytes off a camera, and
# deciding when to open a compartment — can be tested with a compiler instead
# of a board, a cable, and someone watching a tray for a week.
#
#     make            build and run everything
#     make sc1        just the protocol contract
#     make scheduler  just the timing logic
#     make clean
#
# -Wall -Wextra -Werror because this code is also compiled for an AVR, where a
# narrowing conversion is not a warning to skim past.

CXX      ?= g++
CXXFLAGS ?= -std=c++14 -Wall -Wextra -Werror -O2 -g
SRC_DIR   = ../libraries/SC1/src
BUILD_DIR = build
LIB_SRC   = $(SRC_DIR)/SC1.cpp $(SRC_DIR)/Scheduler.cpp
LIB_HDR   = $(SRC_DIR)/SC1.h $(SRC_DIR)/Scheduler.h

SHIM_DIR  = arduino_shim
SKETCHES  = ../arduino/snapcare_tray/snapcare_tray.ino \
            ../esp32/snapcare_optical_head/snapcare_optical_head.ino

.PHONY: all test sc1 scheduler sketches tools clean
all: test

$(BUILD_DIR)/test_%: test_%.cpp $(LIB_SRC) $(LIB_HDR)
	@mkdir -p $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -I$(SRC_DIR) $< $(LIB_SRC) -o $@

sc1: $(BUILD_DIR)/test_sc1
	@./$<

scheduler: $(BUILD_DIR)/test_scheduler
	@./$<

# Compile the sketches against a stand-in Arduino API. This is a syntax and
# type check, not a simulation — it proves the sketch is valid C++ that uses
# these libraries correctly, and nothing about timing, interrupts or servos.
# That is still most of what goes wrong in code nobody can compile without the
# board in front of them, and the board is usually in another country.
sketches:
	@for s in $(SKETCHES); do \
	    echo "  checking $$s"; \
	    $(CXX) $(CXXFLAGS) -fsyntax-only -I$(SHIM_DIR) -I$(SRC_DIR) -x c++ $$s || exit 1; \
	done
	@echo "sketches compile"

test: sc1 scheduler sketches
	@echo "all firmware host tests passed"

# Decode payloads on stdin with the firmware's own parser — the end-to-end
# check that a sheet read in Python is understood by the C++ that ships.
$(BUILD_DIR)/sc1_decode: sc1_decode.cpp $(LIB_SRC) $(LIB_HDR)
	@mkdir -p $(BUILD_DIR)
	$(CXX) $(CXXFLAGS) -I$(SRC_DIR) $< $(LIB_SRC) -o $@

tools: $(BUILD_DIR)/sc1_decode
	@echo "built $(BUILD_DIR)/sc1_decode"

clean:
	@rm -rf $(BUILD_DIR)
