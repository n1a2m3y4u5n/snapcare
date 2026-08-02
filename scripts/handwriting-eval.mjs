/**
 * 손글씨 약 이름을 얼마나 읽어내는가 — 공개 데이터셋으로 잰다.
 *
 * 왜 이것을 재는가
 * ----------------
 * 프리토리아 대학교 Celia 교수가 2026년 8월 조사에서 "손글씨 처방전에서는 동작하지
 * 않을 것" 이라고 적었다. 우리는 인쇄 표본으로만 시험했었다. 그 뒤 라고스 처방전
 * 한 장으로 재 봤지만, 한 장은 사례이지 측정이 아니다.
 *
 * 무엇을 재는가 — 그리고 무엇을 못 재는가
 * ----------------------------------------
 * 이 데이터셋은 처방전 **한 장**이 아니라 낱말 조각이다. 그래서 앱의 전체 흐름
 * (사진 → 판정 → 그림 → 알람)은 이것으로 잴 수 없다.
 *
 * 대신 **가장 위험한 한 자리**를 잰다: 약 이름을 옳게 읽는가. 용량을 잘못 읽으면
 * 양이 틀리지만, 이름을 잘못 읽으면 **다른 약**이 된다. 이 데이터셋에 `Inderen` 과
 * `Indever` 가 나란히 있는데, 필기체로 한 글자 차이이고 서로 다른 약이다.
 *
 * 함께 재는 것이 하나 더 있다: **모델이 자기가 틀린 것을 아는가.** 안다면 앱은 손글씨
 * 전부가 아니라 위태로운 것만 사람에게 넘길 수 있다. 모른다면 지금처럼 손글씨 전체를
 * 확신 없이 다루는 것이 유일하게 정직한 길이다. 이 질문의 답이 설계를 가른다.
 *
 * 자료
 * ----
 * RxHandBD (Zenodo 18478741, MIT). 방글라데시 실제 처방전에서 잘라낸 손글씨 낱말
 * 5,578장, 1,559개 표제어. 방글라데시는 조사 응답자(icddr,b Aliya Naheed)의 나라다.
 *
 *   node scripts/handwriting-eval.mjs <데이터셋경로> [표본수]
 *
 * ANTHROPIC_API_KEY 를 환경에서 읽는다. 이 스크립트는 열쇠를 출력하지 않는다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const SAMPLE = Number(process.argv[3] ?? 120);
const MODEL = process.env.SNAPCARE_VISION_MODEL || 'claude-sonnet-5';
const KEY = process.env.ANTHROPIC_API_KEY;

if (!ROOT) { console.error('데이터셋 경로가 필요하다'); process.exit(1); }
if (!KEY) { console.error('ANTHROPIC_API_KEY 가 환경에 없다'); process.exit(1); }

/** 표본은 **고정 간격**으로 뽑는다 — 무작위면 다시 돌렸을 때 다른 수가 나온다. */
function pick(rows, n) {
  const step = Math.max(1, Math.floor(rows.length / n));
  const out = [];
  for (let i = 0; i < rows.length && out.length < n; i += step) out.push(rows[i]);
  return out;
}

/** 글자 하나 차이인지 재는 표준 거리. `Inderen`/`Indever` 가 2 다. */
function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const SYSTEM = `You read one handwritten word from a medical prescription.

Return STRICT JSON only, no prose:
{"reading": string, "confidence": number}

- reading: the medicine name exactly as written, nothing else.
- confidence: 0-1. How sure are you that a pharmacist would agree with your reading?
  Handwritten drug names differ by one letter and mean different drugs, so be honest:
  if two readings are equally plausible, say so with a low number.`;

async function read(file) {
  const data = readFileSync(file).toString('base64');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 120,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: 'Read it.' },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = await res.json();
  const text = (body.content ?? []).map((c) => c.text ?? '').join('').trim();
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
}

const rows = readFileSync(join(ROOT, 'Test_Labels.csv'), 'utf8')
  .split('\n').slice(1).filter(Boolean)
  .map((line) => { const [img, ...rest] = line.split(','); return { img: img.trim(), text: rest.join(',').trim() }; });

const chosen = pick(rows, SAMPLE);
console.log(`${chosen.length}장을 ${MODEL} 로 읽는다 (전체 ${rows.length}장 중 고정 간격)`);

const results = [];
const CONCURRENCY = 6;
for (let i = 0; i < chosen.length; i += CONCURRENCY) {
  const batch = chosen.slice(i, i + CONCURRENCY);
  const done = await Promise.all(batch.map(async (r) => {
    try {
      const got = await read(join(ROOT, 'Test_Set', r.img));
      const a = norm(got.reading ?? ''), b = norm(r.text);
      const d = distance(a, b);
      return {
        img: r.img, truth: r.text, reading: got.reading, confidence: got.confidence,
        exact: a === b, distance: d,
      };
    } catch (err) {
      return { img: r.img, truth: r.text, error: String(err).slice(0, 80) };
    }
  }));
  results.push(...done);
  process.stdout.write(`\r  ${results.length}/${chosen.length}`);
}
console.log();

const ok = results.filter((r) => !r.error);
const exact = ok.filter((r) => r.exact);
const near = ok.filter((r) => !r.exact && r.distance <= 2);
const wrong = ok.filter((r) => !r.exact && r.distance > 2);

/** 틀렸는데 스스로 맞다고 믿은 것. 이 앱이 막으려는 실패의 정의다. */
const CONFIDENT = 0.8;
const confidentlyWrong = ok.filter((r) => !r.exact && (r.confidence ?? 0) >= CONFIDENT);
const mean = (xs) => (xs.length ? xs.reduce((s, r) => s + (r.confidence ?? 0), 0) / xs.length : 0);

const summary = {
  model: MODEL,
  dataset: 'RxHandBD (Zenodo 18478741, MIT)',
  sampled: results.length,
  read: ok.length,
  failed: results.length - ok.length,
  exact: exact.length,
  nearMiss: near.length,
  wrong: wrong.length,
  exactPct: +(100 * exact.length / ok.length).toFixed(1),
  confidentlyWrong: confidentlyWrong.length,
  confidentlyWrongPct: +(100 * confidentlyWrong.length / ok.length).toFixed(1),
  meanConfidenceWhenRight: +mean(exact).toFixed(3),
  meanConfidenceWhenWrong: +mean(ok.filter((r) => !r.exact)).toFixed(3),
};

console.log(JSON.stringify(summary, null, 2));
writeFileSync('handwriting-eval.json', JSON.stringify({ summary, results }, null, 1));
console.log('자세한 것 → handwriting-eval.json');
