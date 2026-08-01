# The demo app.
#
#     make test    the crypto vectors, on a desktop JVM — no device needed
#     make apk     build dist/snapcare-dispenser-demo.apk
#     make install adb install it onto a connected phone
#     make clean
#
# JAVA_HOME must be a JDK 17+. Android Studio ships one; there is no need to
# install another.

JAVA_HOME ?= /opt/android-studio-for-platform/jbr
GRADLE     = JAVA_HOME=$(JAVA_HOME) ./gradlew --console=plain
APK        = dist/snapcare-dispenser-demo.apk

.PHONY: all test apk install clean

all: apk

# These read ../webapp_kit/tests/vectors.json, which is generated from the
# firmware — so they check this app against the Python on the Pi rather than
# against itself.
test:
	@$(GRADLE) :app:testDebugUnitTest

apk: test
	@$(GRADLE) :app:assembleRelease
	@mkdir -p dist && cp app/build/outputs/apk/release/app-release.apk $(APK)
	@echo "$(APK)  ($$(du -h $(APK) | cut -f1))"

install: apk
	@adb install -r $(APK)

clean:
	@$(GRADLE) clean >/dev/null 2>&1 || true
	@rm -rf build app/build .gradle .kotlin
