# Meal Camera — the estimate, on an Android phone

A camera with one button. Point it at a plate, press the shutter, and the five
numbers the model regresses — energy, mass, fat, carbohydrate, protein — appear
over the live preview for three seconds and then get out of the way.

Everything a camera app usually offers is deliberately absent: no flash toggle,
no zoom, no gallery, no review screen, nothing to dismiss and nothing to
navigate back from. SnapCare's users are the ones least served by a screen that
expects to be read.

The estimate runs on the device. The app declares **no `INTERNET` permission**,
which is what makes that checkable from outside rather than a claim in a README.

## Building it

Needs an Android SDK (Android Studio installs one) and JDK 17+.

```bash
cd nutrition_manager/android
echo "sdk.dir=$HOME/Android/Sdk" > local.properties   # or wherever yours is
./gradlew assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

Install it with `adb install -r app/build/outputs/apk/debug/app-debug.apk`, or
open the directory in Android Studio and press Run.

The build is signed with the standard debug key, so it installs on a normal
phone with "install unknown apps" enabled and does **not** need a rooted device
or a developer account.

## Which model it ships

Not a copy. `app/build.gradle.kts` pulls `web.onnx` and `web.json` out of
`nutrition_manager/web/model/` at build time — the directory `promote.py
--install` writes — and fails the build loudly if they are missing.

That indirection is the point. "Ship the best model" has to survive somebody
training a better one; if the graph were vendored into this module, promoting a
new winner would leave the phone silently running the old one. A rebuild is the
only step.

Today that resolves to **`deploy-warp`, efficientnet_b0, float32, 16 MB**, which
is what `promote.py` ranks first. It is worth knowing *why* that beats the
22.9% `v2-base` convnext:

| | overhead | side | test mean MAE% |
|---|---|---|---|
| `v2-base` (convnext_tiny, 111 MB) | 17.8 | 32.5 | 22.9 |
| `deploy-warp` (efficientnet_b0, 16 MB) | 21.3 | 31.6 | 26.7 |

The published Nutrition5k protocol scores overhead frames only — photographed
from directly above the plate. Nobody holds a phone above their dinner. Ranked
on the mean of both views, which is closer to what this app actually does,
`deploy-warp` wins, and it is seven times smaller. `promote.py` explains the
ranking in more detail.

The graph is float32 because int8 was *measured* and rejected: on this backbone
static quantization took the test error from 26.7% to 52.5%. The manifest's
`recommended` field carries that decision and `MealModel.kt` follows it rather
than a caller's preference.

## Preprocessing, and why there is a test for it

`Preprocess.kt` has to reproduce `build_transforms(train=False)` — resize the
shorter side to 258, centre crop to 224 — because a model is only correct if the
image arrives the way it did during training. ImageNet normalization and the
de-standardization of the outputs are both *inside* the ONNX graph, so no
training constant is duplicated in Kotlin. What is left is geometry, and getting
it wrong does not throw. It returns five plausible numbers that are quietly
worse.

The obvious implementation is wrong. Android's `Canvas.drawBitmap` with
`FILTER_BITMAP_FLAG` is a point-sampled bilinear: fixed 2x2 footprint, so
downscaling past 2x skips source pixels. Pillow — which is what torchvision
calls, and therefore what every score in this repo was measured with — widens
the filter support by the reduction factor. `Resample.kt` implements Pillow's
triangle filter directly, in two separable passes over the crop box.

`tools/parity_check.py` is what established that this matters. It re-implements
the Kotlin path in numpy, step for step and including the 8-bit rounding between
stages, and pushes both tensors through the same ONNX graph on the real test
split:

```
$ python android/tools/parity_check.py
reference (torchvision, what eval.py scores)   26.748%
android   (Preprocess.kt, emulated)            26.762%     delta +0.014 points

$ python android/tools/parity_check.py --phone-scale --limit 120
reference 29.178%   android 29.203%             delta +0.025 points
```

The reference row reproduces the 26.748% recorded in `web/model/web.json`
exactly, which is what makes the harness trustworthy. Using Android's own
scaler instead scored **+0.379 points** — the same order as the gap between two
training runs, which is why it could not be left as an implementation detail.

The check fails above 0.1 points, the same threshold `export_onnx.py` uses for
quantization, so "which change cost us accuracy" stays answerable.

`--tensors` is the sharper instrument. A score can hide a wrong pipeline whose
errors cancel; differencing the tensors asks whether it is the same *function*:

```
$ python android/tools/parity_check.py --tensors
    (640, 480)   max |diff| 0.00392   = 1.00 LSB
    (639, 479)   max |diff| 0.00392   = 1.00 LSB
OK: tensors agree to within one 8-bit level; the geometry is exact.
```

One 8-bit level is the floor — it is the rounding of the intermediate bitmap,
not a difference in the resampling. The odd dimensions are there on purpose:
they are the only case where `CenterCrop`'s tie-breaking rounding is
observable. torchvision uses Python's `round`, which breaks ties toward the
*even* integer; `roundToInt` breaks them upward, and the first version of this
code used it. No camera produces an odd-sized frame, so nothing else here would
ever have caught it.

### What that verifies, and what it does not

It validates the *algorithm* — geometry, rounding, resampling order. It does not
execute the compiled Kotlin, so it cannot catch a typo in the Android source.
That is the difference between "the plan is sound" and "the build is correct";
only running the APK on a phone establishes the second.

## Layout

```
android/
  app/src/main/java/app/snapcare/mealcam/
    MainActivity.kt     CameraX preview, the one button, the 3-second overlay
    MealModel.kt        manifest + ONNX session; the port of web/mealModel.ts
    Preprocess.kt       JPEG -> upright bitmap -> crop geometry
    Resample.kt         Pillow's triangle filter, in Kotlin
  tools/parity_check.py the test above
```
