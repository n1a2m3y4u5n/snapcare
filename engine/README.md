# eicon pictogram engine

A small head-modifier compiler that turns a `.p` source file of macro
labels into pictogram PNGs and a combined PDF, intended for medicine
and medical-device instructions for functionally illiterate patients.

```
engine/
├── main.py                     compiler: python main.py <source.p>
├── engine.py                   parser + compositor + renderer
├── dictionary.json             vocabulary (heads, modifiers, operators)
├── assets/
│   ├── DESIGN_GUIDE.md         drawing spec for every PNG
│   ├── head/                   your head PNGs (512×512 transparent)
│   └── modifier/               your modifier PNGs
└── examples/sample.p           example source
```

Requires Pillow (`pip install Pillow`). Python 3.10+.

## Compiling a source file

```bash
python main.py examples/sample.p
```

For a source file at `path/to/test1.p` the compiler creates a folder
`path/to/test1/` containing one PNG per label (numbered) plus a
combined `test1.pdf` with all labels as pages, in order.

Options:
- `--out DIR` choose a different output directory
- `--no-pdf` skip the combined PDF
- `--size N` panel size in pixels (default 512)
- `--list` print every available macro and exit
- `--info` print manifest summary and exit

## Source file format

Each non-blank line is one **label**: a sequence of top-level pictograms
separated by whitespace. `%` or `#` starts a comment that runs to the
end of the line.

```
% Antibiotic course: wash hands, then a pill twice a day with food
\hand_wash \twice_daily{\pill_bottle{\food_bowl}}

% Half a tablet three times a day with water
\three_times_daily{\half{\pill_bottle{\water_glass}}}

% Eye drops twice daily; do not use if pregnant
\hand_wash \twice_daily{\dropper_bottle{\body_eye}} \no{\state_pregnant}
```

## Grammar

```
\head                                  bare head
\head{\modifier}                       head with one modifier inside its slot
\head{\modifier}{\modifier}            first inside, second above the head
\head{\modifier}{\modifier}{\modifier} first inside, rest in a row above
\twice_daily{X}                        repeat X across 2 sub-panels
\three_times_daily{X}                  ... across 3
\four_times_daily{X}                   ... across 4
\no{X}                                 bold cross over the whole pictogram
\half{X}                               render only the left half of X
```

**No numerals, ever.** Quantity is expressed by repetition (`\twice_daily`,
`\three_times_daily`, `\four_times_daily`) or by `\half{...}`. The
target audience cannot read digits.

**Modifier layout:** the first modifier of a head is drawn inside the
head's slot at `frame.modifier_scale` × panel size (default 0.67). Any
additional modifiers form a horizontal row above the head, with the
head shrinking vertically to make room. Order matters — put the most
important modifier first.

The engine adds a rounded square frame around every pictogram. Step
order in a multi-step label is conveyed purely by left-to-right
placement — no numerals or text appear in the output, because the
target audience is illiterate.

## Adding components

Add an entry under `heads` or `modifiers` in `dictionary.json` and
draw the matching 512×512 transparent PNG into `assets/head/` or
`assets/modifier/`. Heads need a `slot` rect `[x0, y0, x1, y1]` in
relative 0..1 coordinates marking the area kept empty for the first
nested modifier. See `assets/DESIGN_GUIDE.md` for what to draw and
where.
