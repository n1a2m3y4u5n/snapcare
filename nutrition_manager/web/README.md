# Meal nutrition estimation in the browser

Everything the app needs to estimate calories, mass, fat, carbohydrate and
protein from a meal photograph, on the device, with no network call.

```
web/
  mealModel.ts        copy to  lib/nutrition/
  model/web.onnx      copy to  public/models/     (16 MB)
  model/web.json      copy to  public/models/
```

## Integrating it

Three steps, no build changes beyond one dependency.

```bash
npm install onnxruntime-web
cp nutrition_manager/web/mealModel.ts   lib/nutrition/
cp nutrition_manager/web/model/*        public/models/
```

```ts
import { MealModel } from '@/lib/nutrition/mealModel';

const model = await MealModel.load('/models/web.json');
const nutrition = await model.estimate(imageBitmap);
// { calories: 412, mass: 233, fat: 14.2, carb: 51.0, protein: 18.6 }
```

`load()` is worth doing once and keeping — it fetches 16 MB and compiles the
graph. `estimate()` after that is fast enough to call per photograph.

The five numbers come out in **kcal and grams**, already clamped at zero. They
go through `lib/nutrition/`'s existing validation like any other reading; they
are an estimate from a photograph, and should be surfaced with the same
"estimate" framing the app already uses.

## What it is and is not

It does **not** identify the dish or name an ingredient. It regresses five
totals. So it composes with the vision path rather than replacing it: this
first, because it always works, and the network model as a refinement when
there is a network and a key.

| | |
|---|---|
| Backbone | efficientnet_b0, 4.0M parameters |
| Download | 16 MB (float32) |
| Accuracy | 25.7% mean MAE on the Nutrition5k test split |
| Calories | 20.9% MAE |
| Runs on | onnxruntime-web, WASM backend, no GPU needed |

**Assume worse than that number in the field.** The test split is photographed
from directly above the plate; the same model is around twelve points worse on
side-angle frames, which is what a hand-held phone produces. Aiming matters,
and telling the user to shoot from above is the cheapest accuracy improvement
available.

Its outputs do satisfy the Atwater check the app's validator applies (98.8% of
dishes within tolerance, slightly better than the dataset's own labels), so
they will not simply be discarded.

## Two things not to change

**Do not swap in the int8 graph.** It is a quarter of the size and more than
twice as wrong — 52.7% against 25.7% — because this backbone's depthwise
convolutions do not survive quantization. The manifest's `recommended` field
records that, `mealModel.ts` follows it, and the same measurement said the
opposite for a different backbone. If a new model is exported, believe
`export_onnx.py --score`, not the file sizes.

**Do not reimplement the preprocessing.** ImageNet normalization and the output
de-standardization are inside the ONNX graph; the contract is pixels in, grams
out. All `mealModel.ts` does is resize the shorter side to 258 and centre-crop
to 224, and the crop matters because it decides how much of the plate the model
sees — which is how it judges portion size.

## Replacing it with a better one

Don't do this by hand. `promote.py` reads every run that has been trained,
filters to models small enough to ship, ranks them, exports the winner, scores
it, and installs it here:

```bash
cd nutrition_manager
make promote           # show the candidates and what would win
make promote-install   # export it, score it, replace web/model/
```

Then commit `web/model/` and copy it into `public/models/` again.

It ranks by the **mean of the overhead and side-angle scores**, not by the
headline benchmark number, and that choice is load-bearing: the published
protocol scores overhead frames only, and optimising for it produces a model
that is worse at what the app actually does. Training on overhead alone wins
the benchmark by 0.6 points and is 25 points worse off-axis. A chooser that
ranked on the benchmark would reliably pick the wrong model.

It always re-exports rather than trusting whatever is in `export/`, because the
scoring step is what catches a quantized graph that has quietly fallen apart.

`--score` runs the exported graph over the real test split with browser-shaped
preprocessing and writes the numbers into the manifest. It is not optional: it
is what caught the quantization failure above, which had no other symptom.
