# SnapCare — nutrition estimation model

Photograph a plate, get five numbers: **calories, mass, fat, carbohydrate,
protein**. Trained on [Nutrition5k](https://github.com/google-research-datasets/Nutrition5k)
and scored by its official protocol.

This is the on-device half of SnapCare's meal path. The existing path sends the
photograph to a vision model, which means the one part of the app that most
needs to work without infrastructure is the part that requires a network and a
key. This runs in the browser instead: no request, no key, and nothing about
the photograph leaves the phone.

It answers a narrower question than the vision model — it does not identify the
dish or name an ingredient, it regresses five totals — so the two compose:
this first, the network model as a refinement when there is a network.

## Where it stands

Official RGB test split, 507 dishes, one overhead frame each.

| | calories | mass | fat | carb | protein | mean |
|---|---|---|---|---|---|---|
| v1 | 22.8% | 20.5% | 31.8% | 31.0% | 30.6% | **27.3%** |
| v2 | 19.0% | 16.5% | 27.2% | 24.2% | 27.8% | **22.9%** |
| v2 + flip TTA | 18.7% | 16.5% | 26.7% | 24.1% | 27.6% | **22.7%** |

Same backbone and resolution in both rows; the difference is the training
recipe. The metric is the upstream one — `mean|err| / mean(gt)` per field — and
`eval.py` agrees with `nutrition5k_dataset/scripts/compute_eval_statistics.py`
to within 1e-7, so these are comparable to published numbers.

Note what that metric is *not*: it is not the mean of per-dish percentage
errors. Its denominator is a constant, which makes it absolute error in
rescaled units, and means a gram of error on a 900 kcal dish counts exactly as
much as a gram on a 30 kcal one. That is why the targets are regressed in
physical units by default rather than in log space — see `targets.py`.

### The benchmark number is not the product number

The table above, and every published Nutrition5k figure, is measured on
**overhead** frames — one photograph taken from directly above the plate. The
same v2 model scores about **32%** on the side-angle validation frames, which
sweep the plate at roughly 45°.

Nobody holds a phone perfectly above their dinner. So the honest reading is
that 22.9% is the comparable-to-others number and something nearer the
side-angle figure is what a user experiences, with the truth depending on how
carefully they aim.

And the two views are in tension, not merely different. The sampler ablation
shows it clearly:

| run | sampling | overhead | side |
|---|---|---|---|
| `v2-base` | 50% overhead | **17.82** | 32.54 |
| `v2-asis` | as the data lies (97% side) | 19.66 | **29.66** |

Feeding the model more side frames makes it better at side frames and worse at
the benchmark, and vice versa. So the view-balanced sampler is not a free win —
it buys 1.8 points on the scored view by giving up 2.9 on the unscored one. It
is the right trade for a number that has to be comparable, and the wrong one
for a phone held at an angle.

That makes checkpoint selection a real decision rather than a detail:

```bash
python train.py                                  # select_view=overhead, the benchmark
python train.py --set train.select_view=both     # for a model that ships
```

Both numbers are printed every epoch either way, because a widening gap means
the model is specialising to one camera geometry.

Closing that gap is the most valuable thing left to do here, and worth more to
the app than another point on the leaderboard metric. `train.perspective` is
the first attempt: a random off-axis warp turns an overhead photo into a
plausible angled one *without* changing what is on the plate, which is exactly
the invariance that is missing. It is off by default — turning it on is an
experiment, not the baseline.

```bash
python train.py --set train.perspective=0.35 train.select_view=both
```

### What actually moved the number

**The model was being selected on the view it is not scored on.** `build_dataset.py`
extracts up to 24 side-angle frames per dish but only one overhead frame, so the
manifest is 97% side — 79,770 against 2,755. The official test split is overhead
only. Training sampled that mix as it lay, and the validation set had the same
composition, so side frames outvoted overhead ones 29 to 1 in choosing the
checkpoint. Selection is now overhead-only and sampling is view-balanced.

The ablation confirms it. Sampling the dataset as it lies scores 19.66 on
overhead validation against 17.82 balanced — and that is with **2.9x more
compute**, a full pass over 77k rows per epoch against 24k draws (19.6 minutes
against 56.5). What it buys and what it costs is in the table above.

**A few labels were setting the scale for every dish.** Carbohydrate reaches
845 g against a 99th percentile of 68 g. Standardization statistics are now
fitted below the 99.5th percentile — the statistics only. Clipping the targets
a sample trains against would teach the model to under-predict large dishes.

Plus warmup, cosine decay, gradient clipping, and an EMA of the weights.

## Layout

```
nutrition_manager/
  nutrition5k_dataset/     third-party dataset (read-only, gitignored)
  configs/config.yaml      paths + hyperparameters
  common.py                config loading, project-relative paths
  targets.py               the transform between grams and what the net regresses
  metrics.py               the scoring metric, defined once
  inference.py             checkpoint loading + TTA, shared by every caller
  data/build_labels.py     metadata + overhead imagery -> data/labels.csv
  build_dataset.py         + side-angle frames -> dataset_processed/manifest.csv
  data/dataset.py          torch Dataset + transforms
  models/model.py          backbone + regression head (timm)
  train.py                 training -> checkpoints/<tag>.pt
  eval.py                  test-split scoring -> predictions.csv
  predict.py               single-image inference
  export_onnx.py           -> export/*.onnx for the browser
  web/mealModel.ts         the browser side of that export
  runs/                    ablation script, summary, history.jsonl
```

## Setup

```bash
conda env create -f environment.yml
conda activate snapcare
```

## Usage

Run everything from this directory.

```bash
python data/build_labels.py    # -> data/labels.csv
python build_dataset.py        # -> dataset_processed/manifest.csv (needs ffmpeg)
python train.py                # -> checkpoints/best.pt
python eval.py                 # -> predictions.csv, eval_stats.json
python predict.py meal.jpg
```

Any config key can be overridden without editing the file, so an ablation never
needs a second copy of `config.yaml`:

```bash
python train.py --tag b0 --set model.backbone=efficientnet_b0 train.epochs=10
python train.py --tag log --set train.target_space=log1p
python eval.py --compare checkpoints/*.pt
python runs/summarize.py
```

Each run appends one row to `runs/history.jsonl`. `runs/ablation_v2.sh` is the
set of runs behind the table above; `runs/queue.sh` runs everything still
outstanding, in one shell, deployment model first.

`runs/summarize.py` ranks by the **overhead** score whatever each run was
selected on, and prints the side score beside it. Those columns are not
interchangeable — sorting a mixed table by each run's own selection metric
would compare a model against a different measurement and call it better.

## Deploying to the app

```bash
python export_onnx.py --checkpoint checkpoints/best.pt --quantize --score
```

Writes `export/<name>.onnx`, an int8 variant, and `<name>.json` describing how
to call it. Then copy `web/mealModel.ts` into the app's `lib/nutrition/` and
serve the two files from `public/models/`:

```ts
const model = await MealModel.load('/models/web.json');
const nutrition = await model.estimate(imageBitmap);   // { calories, mass, fat, carb, protein }
```

**ImageNet normalization and target de-standardization are inside the graph.**
The contract is pixels in, grams out. Those constants would otherwise have to
be duplicated in TypeScript and kept in step by hand, and getting one wrong
does not throw — it returns plausible numbers that are quietly wrong on a
screen telling someone whether a meal fits their day. All the caller owes the
model is the resize and centre crop, which the JSON spells out.

`--score` runs the exported graph over the real test split, decoding and
cropping the images the way the browser will rather than through the torch
DataLoader. Measured on `v2-base`:

| | size | mean MAE% |
|---|---|---|
| PyTorch checkpoint | — | 22.92% |
| ONNX float32 | 111 MB | 22.92% |
| ONNX int8 | 28 MB | 23.03% |

Two things follow. The float32 graph reproduces the checkpoint exactly, which
is what says the preprocessing in `web/mealModel.ts` matches training — that
path is written twice, in Python and in TypeScript, and this is the check that
they agree. And quantization costs about a tenth of a point for a quarter of
the size, so **ship the int8 graph**; the accuracy difference is far inside the
model's own error bars, and the download is the thing a user on a bad
connection actually experiences.

Parity against PyTorch is also checked on random inputs at every export — real
photographs occupy a narrow, well-behaved part of the input space where an
export bug could hide — and the exporter refuses to write metadata if it fails.

## The processed multi-view dataset

`build_dataset.py` creates `dataset_processed/` and never modifies the original:

```
dataset_processed/
  frames/<dish_id>/cam<A-D>_s<NN>.jpg   sampled side-angle frames (480p)
  manifest.csv                          one row per image
```

Overhead frames keep the official split. Side-angle frames — four cameras
sweeping the plate at ~45° — are sampled at about four per camera and added to
the **train** split only, so the test set stays overhead-only and comparable.
Validation is held out **by dish**, so a dish's side frames never train against
its own overhead frame; a plate photographed 25 times is one dish, and
splitting by row would measure memorisation.

Side-angle quirks are recorded in `notes` rather than filtered out. Per DH's
inspection: cafe1 videos tend to be mounted **upside-down** and pause before the
camera starts rotating, and the whole `rgb_train` split is cafe1, so every side
frame carries that note. A few dishes are off-centre and one or two are shot
nearly dark. None of it is corrected — training augmentation includes vertical
flips and wide rotation, because nutrition totals do not depend on which way up
the camera was, and the rest is realistic noise.

## Notes

- **Split fidelity.** Uses the official `rgb_train_ids` / `rgb_test_ids`. About a
  third of those ids are side-angle-only and are dropped by `build_labels.py`,
  leaving ~2.6k train / ~507 test overhead images.
- **Test-time augmentation** averages over flips in *physical* units, not in the
  network's output space. Under a log target those differ, and averaging in log
  space is a geometric mean, which would bias every prediction downward.
- The dataset directory is treated as read-only.

## Roadmap

- v3: add the `depth_raw` channel (RGB-D 4-channel input) — the published
  Nutrition5k results put most of their gain there.
- A per-ingredient auxiliary head; the metadata carries the breakdown.
- Calibrated uncertainty, so the app can say "about 400" versus "somewhere
  between 250 and 600" instead of always sounding equally sure.
