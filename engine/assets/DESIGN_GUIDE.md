# eicon component design guide

One file per macro:
- heads     → `assets/head/<name>.png`
- modifiers → `assets/modifier/<name>.png`

Filename must exactly match the macro name (lowercase, snake_case).

## Universal rules

- Pure black ink, transparent background, 512×512 PNG.
- Thick uniform stroke, ~3-5 % of canvas width.
- Centred, large in the frame. One clear focal point.
- **No numerals, no letters, no text of any kind.** The target audience
  is functionally illiterate. Quantity is expressed by repeating the
  pictogram (cadence operators) or by the `\half{...}` operator that
  blanks the right half of a pictogram — never by digits.
- No color, no shading, no gradients.
- No decorative borders; the engine adds its own frame.
- Heads have a *slot* — a rectangular region kept visually empty so the
  engine can place the first nested modifier inside it. The slot
  coordinates are given below in relative 0..1 space.

## Modifier placement

The engine composes each head panel like this:

```
+--------------------------------+
|         [mod2] [mod3] ...      |   ← optional top strip for extras
|                                |
|         +--------------+       |
|         |              |       |
|         |  HEAD ART    |       |
|         |     with     |       |
|         |    [mod1]    |       |   ← first modifier inside the head's
|         |   in slot    |       |     slot at 67 % of panel size
|         |              |       |
|         +--------------+       |
+--------------------------------+
```

The **first** modifier in `\head{...}{...}{...}` is drawn inside the
head's slot at `frame.modifier_scale` × panel size (default 0.67). Any
**additional** modifiers go into a horizontal row above the head; the
head's vertical box shrinks to make room. Order matters in `.p`
sources: put the most important modifier first.

---

## Heads (15)  →  assets/head/

### Forms

**pill_bottle** — generic medicine bottle.
Round-shouldered bottle with a screw cap on top. Body empty in the
centre. **Slot:** [0.25, 0.40, 0.75, 0.78].

**tablet_blister** — blister pack of tablets.
Foil pack with 6 oval tablet outlines in 2 rows around the slot.
**Slot:** [0.20, 0.20, 0.80, 0.80].

**capsule_strip** — single two-tone capsule.
Large capsule pill, horizontal, divided by a vertical line: left half
solid black, right half outline only. **Slot:** [0.30, 0.30, 0.70, 0.70].

**liquid_bottle** — oral liquid medicine.
Tall bottle with a long narrow neck and screw cap, beside an empty
measuring cup. **Slot:** [0.25, 0.45, 0.75, 0.85].

**sachet** — single-dose powder packet.
Rectangle with a serrated tear-off edge across the top.
**Slot:** [0.25, 0.35, 0.75, 0.80].

**cream_tube** — topical ointment tube.
Horizontal tube, cap on the right, body crimped flat on the left.
**Slot:** [0.55, 0.30, 0.95, 0.70].

**dropper_bottle** — eye/ear/nose drops.
Small bottle held tip-down with a single drop forming at the dropper
tip. **Slot:** [0.34, 0.58, 0.66, 0.86].

**suppository** — bullet-shaped suppository.
Single vertical bullet, rounded tip on top, slight taper toward the
bottom. **Slot:** [0.30, 0.35, 0.70, 0.75].

### Routes

**syringe** — injection.
Disposable syringe held horizontally: plunger on the left, barrel with
measurement marks, fine needle on the right.
**Slot:** [0.10, 0.30, 0.45, 0.70].

**inhaler** — metered-dose inhaler.
L-shape: vertical canister on the upper-left, horizontal mouthpiece
extending to the lower-right.
**Slot:** [0.32, 0.22, 0.60, 0.52].

### Devices

**glucometer** — blood glucose meter.
Handheld device with a small rectangular screen near the top and a
test-strip slot at the bottom.
**Slot:** [0.25, 0.35, 0.75, 0.75].

**thermometer** — digital thermometer.
Vertical thermometer with a pointed metal tip at the bottom and a
rectangular screen above.
**Slot:** [0.30, 0.30, 0.70, 0.70].

### Actions / States  (no modifier slot — standalone)

**hand_wash** — wash your hands.
Two cupped hands under a tap with water running and soap bubbles.

**state_pregnant** — pregnant person.
Side-profile silhouette of a pregnant woman with hands on the belly.

**state_breastfeeding** — breastfeeding.
Woman cradling an infant to her chest, side view.

---

## Modifiers (12)  →  assets/modifier/

Centre the subject, fill ~60-80 % of the canvas. The engine scales them
to 67 % of the parent panel when placed in a head's slot, and smaller
when arranged in the row above the head.

### Time of day (4)

**time_morning** — sun rising above a horizon line; upper half visible
with rays.

**time_noon** — full sun, 8 rays radiating outward.

**time_evening** — sun setting below a horizon line; lower half
visible.

**time_night** — crescent moon facing right, three small stars around.

### Body part with arrow (4)  — always show on a face/limb

**body_eye** — human face 3/4 view, thick arrow pointing to the right
eye.

**body_ear** — human head in profile, thick arrow pointing to the ear.

**body_mouth** — human face front view, open mouth with tongue, arrow
pointing to the mouth.

**body_skin** — horizontal forearm with a small rectangular patch on
the skin, arrow pointing to the patch.

### Context (3)

**food_bowl** — bowl of cooked food, contents above the rim, a wooden
spoon angled into the bowl.

**food_empty_bowl** — empty round bowl viewed from the side, resting
on a flat surface.

**water_glass** — tall drinking glass three-quarters full of water,
water surface drawn as a clear horizontal line.

### Storage (1)

**storage_fridge** — household refrigerator front view, freezer
compartment on top, main door below.

---

## Operators (no PNG — the engine handles these)

| operator | effect |
|---|---|
| `\twice_daily{X}` | repeats `X` across 2 sub-panels in one frame |
| `\three_times_daily{X}` | 3 sub-panels |
| `\four_times_daily{X}` | 4 sub-panels |
| `\no{X}` | bold black cross over the entire pictogram |
| `\half{X}` | renders only the left half of `X`; right half transparent. Use this for "half a dose" — never a numeral. |

## Expressing quantity without numbers

| meaning | how to express it |
|---|---|
| "one pill" | bare `\pill_bottle` (no operator) |
| "two pills" | repeat: `\pill_bottle \pill_bottle` or `\twice_daily{\pill_bottle}` |
| "half a pill" | `\half{\pill_bottle}` |
| "three times a day" | `\three_times_daily{\pill_bottle{\time_morning}}` etc. |
