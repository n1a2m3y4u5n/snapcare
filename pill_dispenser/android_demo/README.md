# android_demo — the dispenser, from a phone

A small Android app that pairs with a SnapCare pill dispenser using the ten
characters printed on its label, sends it a schedule, and shows what it does —
live, from anywhere, through the relay.

**The built APK is [`dist/snapcare-dispenser-demo.apk`](dist/) (4.8 MB).**
Sideload it: `adb install -r dist/snapcare-dispenser-demo.apk`, or copy it to a
phone and open it. Android 7 and later.

```bash
make -C .. demo     # a relay and a mock dispenser on this machine, with a code
make apk            # rebuild the APK
make test           # the crypto vectors, on a desktop JVM — no phone needed
```

## What it is for

Two things, and the second is the one that made it worth building.

**A demo.** Pairing a medical device by pointing a camera at a sticker, and
then watching a dose event arrive on a phone about a second after the tray
opens, is the whole product argument in ten seconds. It does that without a
laptop in the room.

**A fourth independent implementation of the pairing crypto.** There are now
four, sharing no code:

| | where |
|---|---|
| Python | `firmware/snapcare_dispenser/{provisioning,envelope}.py` — the device |
| JavaScript | `cloud_relay/snapcare_relay/web/lab.html` — the reference page |
| TypeScript | `../webapp_kit/src/` — for the web app |
| Kotlin | [`Pairing.kt`](app/src/main/java/app/snapcare/dispenserdemo/Pairing.kt) — here |

A disagreement between any two of them is a pairing that **simply never works,
with no error at either end and nothing in any log**: the relay stores whatever
it is given, and a device cannot tell a schedule it fails to open from one that
was meant for somebody else. So this app is also a test, twice over:

- `VectorsTest` runs on a desktop JVM against `webapp_kit/tests/vectors.json`,
  which is generated from the firmware. Twenty cases, including the strongest
  form of the check — *given the firmware's IV, produce the firmware's exact
  ciphertext*, not merely "each can open the other's".
- [`SelfCheck.kt`](app/src/main/java/app/snapcare/dispenserdemo/SelfCheck.kt)
  runs the same comparison **at launch, on the phone**, because Android's crypto
  providers are not the desktop's. If they disagree the app says so and refuses
  to pair.

The vectors are not vendored here. They are copied in at build time from the
one place they live, so this implementation cannot drift and still pass its own
tests. A missing file fails the build.

## Layout

```
app/src/main/java/app/snapcare/dispenserdemo/
  Pairing.kt       the claim code, HKDF, the three keys, AES-GCM envelopes
  Sc1.kt           SC1*W* — the schedule form that carries days and duration
  Relay.kt         publish, long poll, revision conflicts. ~150 lines, no client library
  SelfCheck.kt     the crypto vectors, checked on the phone at launch
  MainActivity.kt  one screen
app/src/test/…     VectorsTest — the crypto, against the firmware's own output
```

`Pairing.kt` deliberately uses neither `android.util.Base64` nor `org.json`:
both are stubs in a JVM unit test and throw the moment they are touched, so
depending on them would mean the crypto could only be tested by installing the
app — which in practice means tested during the demo. Base64url is twenty lines
and is written out.

`Relay.kt` deliberately uses no HTTP client library, for a related reason: this
file is also a statement of what the protocol actually needs, and a dependency
would hide it.

## The two things the screen gets right on purpose

They are the same two the web app has to get right, and both are easy to miss:

1. **`dispensing == false` means nothing will come out**, and the device looks
   completely healthy in every other respect — right clock face, right
   schedule, recent events. It is the loudest thing on the screen, above
   everything else, with `blockedReason` beside it. The two reasons (an
   untrusted clock, or no GPIO library) send somebody to opposite ends of the
   machine.

2. **"Connected" is not observable from a phone.** A dispenser whose power has
   been pulled sends nothing and looks identical to one that simply has nothing
   new to say. So the age of the last report is what gets shown — *"not heard
   from since Tuesday"* is the single most useful thing a carer can be told.

Also: a pairing code that is not exactly ten characters of the printed alphabet
is refused in the field, never padded or shortened. A code with one character
missing derives a perfectly valid key for a mailbox that does not exist, and
the only symptom is a dispenser that appears to have been unplugged.

## Pointing it at something

`make -C .. demo` starts a relay on `localhost:8088` and a dispenser with mock
servos, and prints a pairing code. From an emulator the relay is
`http://10.0.2.2:8088` (which is what the app pre-fills); from a real phone on
the same WiFi it is `http://<your-laptop>:8088`.

Cleartext HTTP is allowed in the manifest for exactly that reason. A deployed
relay is HTTPS and does not need it.

## Building

The toolchain is the one `nutrition_manager/android` already uses — API 36, AGP
8.13.2, Gradle 8.14.3, Kotlin 2.1.21, and Android Studio's bundled JDK 21 as
`JAVA_HOME`. Nothing new to install.

The release build is signed with the **debug key**, on purpose: this is a demo
that has to install by sideloading onto whatever phone is at hand, and an
unsigned release APK will not install at all. It is not a Play Store artefact
and does not pretend to be one.
