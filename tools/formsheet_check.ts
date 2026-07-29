/**
 * TypeScript 판독기를 파이썬 파서와 맞춰 본다.
 *
 * `tools/formsheet_fixtures.py` 가 만든 회색조 원본을 읽어 `lib/formsheet` 로 판독하고,
 * 정답 및 파이썬의 답과 대조한다. 이식이 "되는 것 같다" 에서 "같은 답을 낸다" 로
 * 넘어가는 자리다.
 *
 *   .venv-cv/bin/python tools/formsheet_fixtures.py /tmp/fx --n 12
 *   node --experimental-strip-types tools/formsheet_check.ts /tmp/fx
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFormSheet } from '../lib/formsheet/sheet.ts';
import type { Gray } from '../lib/formsheet/image.ts';

interface Fixture {
  camera: string;
  w: number;
  h: number;
  answers: { layer: string; days: string[]; duration: string; hour: string };
  python: {
    values: Record<string, unknown>;
    problems: string[];
    quality: Record<string, number>;
    scores: Record<string, Record<string, number>>;
  };
}

const dir = process.argv[2];
if (!dir) throw new Error('사용법: formsheet_check.ts <픽스처 디렉터리>');

const stems = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
let agree = 0;
let disagree = 0;
let readTruth = 0;

for (const stem of stems) {
  const meta = JSON.parse(readFileSync(join(dir, `${stem}.json`), 'utf8')) as Fixture;
  const bytes = readFileSync(join(dir, `${stem}.gray`));
  const gray: Gray = { w: meta.w, h: meta.h, d: new Uint8ClampedArray(bytes) };

  const t0 = performance.now();
  const got = parseFormSheet(gray);
  const ms = Math.round(performance.now() - t0);

  // 두 가지를 따로 본다.
  //  - 파이썬과 같은 답을 냈는가 → **이식이 맞는가.** 여기서 갈리면 내 잘못이다.
  //  - 정답을 읽었는가 → 판독기 자체의 한계. 파이썬도 못 읽는 장이면 이식과 무관하다.
  const want = meta.answers;
  const truth = got.values.layer === want.layer
    && got.values.duration === want.duration
    && got.values.hour === want.hour
    && JSON.stringify(got.values.days) === JSON.stringify(want.days);
  const py = meta.python.values;
  const same = JSON.stringify(got.values.layer ?? null) === JSON.stringify(py.layer ?? null)
    && JSON.stringify(got.values.duration ?? null) === JSON.stringify(py.duration ?? null)
    && JSON.stringify(got.values.hour ?? null) === JSON.stringify(py.hour ?? null)
    && JSON.stringify(got.values.days) === JSON.stringify(py.days);

  // 답이 같아도 점수가 크게 다르면 여유가 얇아진 것이다 — 다음 사진에서 갈린다.
  let maxDev = 0;
  for (const [g, s] of Object.entries(got.scores)) {
    const ps = (meta.python.scores ?? {})[g] ?? {};
    for (const [k, v] of Object.entries(s)) {
      if (typeof ps[k] === 'number') maxDev = Math.max(maxDev, Math.abs(v - ps[k]));
    }
  }

  const q = got.quality;
  const mark = same ? (truth ? 'ok  ' : '둘다못읽음') : 'FAIL';
  console.log(
    `${mark.padEnd(6)}${stem.padEnd(14)} ${String(ms).padStart(5)}ms  `
    + `markers=${q?.markers ?? '-'} residual=${q?.residualPx.toFixed(2) ?? '-'} `
    + `baseline=${got.baseline.toFixed(3)} Δscore≤${maxDev.toFixed(3)}`,
  );
  if (same) agree++;
  else disagree++;
  if (truth) readTruth++;
  if (!same) {
    console.log(`      정답   ${JSON.stringify(want)}`);
    console.log(`      TS     ${JSON.stringify(got.values)}`);
    console.log(`      파이썬 ${JSON.stringify(meta.python.values)}`);
    console.log(`      문제   ${JSON.stringify(got.problems)}`);
  } else if (!truth) {
    console.log(`      둘 다 거절: ${JSON.stringify(got.problems)}`);
  }
}

console.log(`\n파이썬과 일치 ${agree}/${agree + disagree} · 정답 판독 ${readTruth}/${agree + disagree}`);
process.exit(disagree === 0 ? 0 : 1);
