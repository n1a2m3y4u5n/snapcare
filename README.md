# SnapCare

**One photo in — pictograms, voice, and a colour out.**

The 16th e-ICON World Contest · Global Team **H1** (Korea × Moldova)
SDG 3 — Good Health and Well-being

Live: **https://snapcare.fly.dev**

---

## The problem

773 million adults cannot read (UNESCO, 2022). Every health tool built for them still
assumes they can: a prescription is text, a nutrition label is a table, and every mobile
health app is a wall of words. The information exists — it just never arrives.

SnapCare removes reading from the loop. The user photographs whatever they are about to
put in their body — a prescription, a medicine box, a packaged food, a plate of food — and
the app answers in three channels at once: **a pictogram, a spoken sentence, and one colour**.

## What it does

| | |
|---|---|
| **Photograph a prescription** | Extracts drug, dose, timing and warnings; renders them as composed pictograms and a short spoken script; sets the dose reminders |
| **Photograph a nutrition label** | Reads the table offline, converts it to the person's own daily reference, and answers green / amber / red |
| **Photograph a meal** | Identifies the dish, estimates its composition, and judges it the same way |
| **Per person, not per product** | The same biscuit is safe for an adult and a caution for a seven-year-old, because the limits are computed from *their* energy requirement |
| **Daily view** | Today's intake accumulated against that person's reference — catching what single scans cannot |

Nothing in the flow requires reading or typing, including sign-in (an ordered picture key).

---

## Architecture

```
                 photo
                   │
        ┌──────────┴───────────┐
        │  Tesseract OCR       │  offline, in-browser
        └──────────┬───────────┘
                   │  what kind of text is this?
     ┌─────────────┼──────────────┬──────────────────┐
     │             │              │                  │
 prescription  nutrition label  neither          no text
     │             │              │                  │
     │             │              └────────┬─────────┘
     │             │                       │
     │      label parser              Claude Vision      ← only these need a network
     │      (+ validation)            (+ same validation)
     │             │                       │
     └─────────────┴───────────┬───────────┘
                               │
                    ┌──────────┴──────────┐
                    │  NUTRITION ENGINE   │  reference · scaling · verdict
                    │  SIGIL · VOCA       │  pictograms · voice
                    └──────────┬──────────┘
                               │
                    pictogram + voice + colour
```

The three input paths converge on one internal representation, so every downstream
behaviour — verdicts, daily accumulation, pictograms, speech — is written once.

### The three engines

**SIGIL** — pictogram synthesis (`engine/`)
A LaTeX-influenced DSL (`\three_times_daily{\pill_bottle{\time_morning}}`) is parsed by a
recursive-descent parser into an AST, then composed into a PNG with Python/Pillow. Existing
medical pictogram standards (e.g. the USP set) *select* one of a fixed number of static
images; SIGIL *composes* new ones, so an instruction that has no single symbol still gets a
single picture. Adding a morpheme to the dictionary extends the whole system with no code
change.

**VOCA** — voice script synthesis (`lib/snapcare/say.ts`, `lib/voice.ts`)
Rather than reading OCR output aloud, VOCA keeps only what is needed to act, and rebuilds it
as a short script for the Web Speech API. Pictogram and speech are two renderings of the same
semantic object, so they cannot contradict each other.

**Nutrition engine** — reference, scaling, judgement (`lib/nutrition/`)
WHO expresses its limits as *percentages of energy*, so we compute rather than tabulate: fix
a person's energy requirement and their sugar, saturated-fat and salt ceilings follow. This is
why the same food is judged differently for different people.

```
sugars limit    = energy × 10% ÷ 4 kcal/g     WHO 2015, free sugars
saturated fat   = energy × 10% ÷ 9 kcal/g     WHO 2023
salt            = 5 g × (energy / 2000)       WHO 2012, scaled for children
protein target  = weight × 0.83 g/kg          WHO/FAO/UNU 2007
```

### Reading numbers we are willing to act on

Nutrition data arrives from unreliable readers. Measured on real Tesseract output, `22.4 g`
comes back as `2249` — the decimal point is dropped and the unit `g` is read as a digit.
Believed literally, that is a tenfold error driving a health judgement.

So no reading is trusted on sight. Every value — whether it came from OCR or from a language
model — must survive the same gauntlet:

1. **Range** — a macronutrient cannot exceed 100 g per 100 g
2. **Containment** — sugars ≤ carbohydrates, saturated fat ≤ fat
3. **Mass** — the nutrients cannot outweigh the food that contains them
4. **Energy** — `4·carb + 4·protein + 9·fat` must reconcile with the stated calories (Atwater)

Where several readings survive, the one requiring fewest corrections wins; where survivors
disagree materially, the field is **discarded and the user is asked to retake**. Saying
"couldn't read it" is safer than showing a confident wrong number.

The same validator gates the vision model. The model identifies; the engine judges.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Pictogram rendering shells out to Python. In development, point it at an interpreter that
has Pillow:

```
# .env.local
PICTOGRAM_PYTHON=/opt/homebrew/bin/python3
ANTHROPIC_API_KEY=            # optional — meal-photo recognition only
NEXT_PUBLIC_SNAPCARE_RELAY=   # optional — the pill box's mailbox; see below
```

### The pill box

The dispenser sits behind somebody's home router, so the phone cannot reach it directly.
Both sides talk to a **relay** instead — a mailbox that holds three sealed slots and can
read none of them. `NEXT_PUBLIC_SNAPCARE_RELAY` is its address.

Leave it unset and the app still works: the device screen falls back to the same-Wi-Fi
path, and the pairing screen asks for an address. Set it and pairing needs nothing but the
ten characters on the label.

To run one locally, with a mock dispenser and no Raspberry Pi:

```bash
make -C pill_dispenser/cloud_relay demo     # relay on :8088
```

The address is also what the Content-Security-Policy opens (`middleware.ts`). One origin,
no more — an injected script can reach the mailbox, which cannot read what it holds, and
nowhere else.

Everything except meal-photo recognition works with no key and no network: OCR runs in the
browser, pictograms render locally, and looked-up products and rendered pictograms are cached
to disk on first use.

### The two meal-photo sources

A meal photo has no text to read, so it goes to `api/analyze`, which uses two
sources that fill in what the other cannot see:

| | on-device model | Claude Vision |
|---|---|---|
| energy, carbs, protein, fat | trained on weighed dishes | estimated |
| **portion mass** | **predicted** | eyeballed |
| name, food vs. medicine | — | yes |
| allergens | — | yes |
| sugars, saturated fat, fibre, salt | — | yes |
| needs a network | no | yes |

The model runs **in the browser**, through onnxruntime-web on the WASM backend
— no server inference, no round trip, no Python. `scripts/copy-model.mjs`
publishes it from `nutrition_manager/web/model` on every build, so the model
lives in one place and a newly promoted one is picked up automatically.

When both answer, the numbers come from the model and Vision supplies the rest;
when only one is available, the app answers with that one. Either way the
result passes the same physical checks (ranges, subset relations, mass
conservation, the Atwater identity) before the verdict engine sees it — a
regression model drifting outside its training distribution is caught by the
same gauntlet as a hallucinating LLM.

The model cannot abstain. It is a regressor, so it returns five numbers for a
photograph of a wall as readily as for a plate of food, and numbers coming back
is not evidence that anything was recognised. Where nothing identified the
item, the result is marked unidentified and the verdict will not read "safe" —
with no idea what the food is there is nothing to check an allergy against.

```bash
npm run build && npm start    # production build
npm run lint                  # eslint (clean)
npx tsc --noEmit              # types (clean)
```

## Layout

```
app/                    screens (App Router) and API routes
  camera/               capture and routing between the three input paths
  scan/                 verdict, pictograms, voice, per-member breakdown
  nutrition/            today's accumulated intake
  api/pictogram/        SIGIL — DSL → PNG, disk-cached
  api/nutrition/        product lookup, disk-cached
  api/analyze/          meal-photo recognition, validated before use
lib/
  nutrition/            reference · compute · validate · label OCR · adapters
  snapcare/             domain types, verdict engine, DSL bridge, voice
engine/                 SIGIL: parser, compositor, morpheme dictionary, assets
stores/                 client state (zustand, persisted)
pill_dispenser/         hardware companion — form-sheet parser (OpenCV/ArUco)
scripts/                sample generators used to test the label parser
```

## Deployment

Docker multi-stage build on **fly.io** (Tokyo). A mounted volume holds the household store
and the pictogram/product caches, so the app keeps answering when the network does not.

```bash
fly deploy
fly secrets set ANTHROPIC_API_KEY=… -a snapcare   # meal-photo recognition in production
```

The relay lives at **https://snapcare-relay.fly.dev** as its own fly app, deployed from
`pill_dispenser/cloud_relay` (`fly deploy -a snapcare-relay` from that directory). It holds
a 1 GB volume for the mailboxes and one always-on machine, because a dispenser holding a
long poll is by design a connection that never goes idle.

Its address reaches the browser as a **build argument**, recorded in `fly.toml` under
`[build.args]` so a plain `fly deploy` carries it. It is not a secret and it cannot go in
`fly.toml`'s `[env]`: anything named `NEXT_PUBLIC_` is baked into the bundle when Next
builds it, so a value supplied at run time never reaches the phone. Getting this wrong
fails in a confusing way — the server knows the address and opens the CSP for it, while the
page tries `localhost` and pairing fails as though the code on the label were wrong. The
pairing screen says so when the build has no address at all.

## Handwritten prescriptions: what we measured

A reviewer told us this would not work on handwriting, and we had only ever tested printed
samples. So we measured it, on a public dataset of handwritten drug names cut from real
Bangladeshi prescriptions ([RxHandBD](https://zenodo.org/records/18478741), MIT).

```bash
node scripts/handwriting-eval.mjs <path-to-RxHandBD> 500
```

Over 460 words read: **44% exactly right, 29% off by one or two letters, 27% wrong.** The
middle band is the dangerous one — `Escilex` → `Eslilex`, `clavutil` → `Clavuxil` — because
one letter away there is often another real drug. This dataset alone contains both
`Inderen` and `Indever`.

We also asked whether the model's own confidence could pick out the readings worth trusting.
It cannot. Raising the bar throws away most readings without buying accuracy: at 0.4, 45%
survive and 68% of those are right; at 0.6, 9% survive and 80% are right. There is no
threshold that is both safe and useful.

**One number moved when we enlarged the sample, and it moved the wrong way.** At 200 words,
nothing carrying a confidence of 0.8 or higher was wrong, and we wrote that down as
reassuring. At 460, one was:

```
paper: Folzin (folic acid)   app: Naprosyn (naproxen)   confidence 0.85
```

Not a near-miss — a different drug, asserted. It is rare (0.2%) but it exists, so confidence
cannot be used as a safety catch. Had we stopped at 200 we would have built on that comfort.

So the app does not try to be clever. A prescription it judges handwritten never gets a
confident verdict — it says so, keeps the pictograms, and points at the clinic's paper form
sheet, which is marks rather than handwriting and reads exactly.

Full per-image results: `scripts/handwriting-eval.json`. Whole prescription pages are
measured separately — see `MEASUREMENTS.md`.

## Data sources

Nutrition references from WHO/FAO guidance, cited inline in `lib/nutrition/reference.ts`.
Packaged-product data from **OpenFoodFacts**, which is community-edited and can be incomplete —
the app says so on screen and tells the user to check the package for allergens.
All nutrition output is an estimate and is labelled as such. It is not medical advice.

## Use of AI

Disclosed in full:

- **Claude Vision** identifies a dish from a photo and proposes its composition. It never
  decides anything: its output passes through the same validator as OCR, and is discarded if
  it fails. Verdicts, references, scaling and accumulation are ours.
- **Claude Code** was used as a development tool while building this repository.

The engines — SIGIL, VOCA, and the nutrition reference/validation logic — are the team's own
design and implementation.

## Team H1

| | |
|---|---|
| **Yunsu Nam** (KR) | Development & prototype lead — web app, engines, deployment |
| **Dohun Kim** (KR) | Coordination & uploads — hardware form-sheet parser |
| **Daniel Stanchevici** (MD) | Design & wireframe lead — user flow, UI, pictogram design |
| **Cristian Rudico** (MD) | Research & content lead — problem research, poster and presentation |
