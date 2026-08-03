/**
 * 처방전 **한 장**을 주면 앱이 무엇을 내놓는가 — 공개 자료로 잰다.
 *
 * 낱말 조각 평가(`handwriting-eval.mjs`)와 무엇이 다른가
 * -----------------------------------------------------
 * 그쪽은 누군가 이미 오려낸 약 이름 한 낱말을 주고 글자만 읽게 한다. 읽는 단계 하나의
 * 성적이다.
 *
 * 이쪽은 사용자가 실제로 찍는 것을 준다 — 병원 양식, 인쇄된 칸, 접힌 자국, 빨간 펜,
 * 벵골어와 영어가 섞인 손글씨, 그리고 그 사이 어딘가에 있는 약 이름들. 그래서 앞뒤가
 * 전부 들어온다: 처방전인지 알아보는가, 인쇄된 양식과 손글씨를 갈라내는가, 약을 **몇
 * 개나 찾아내는가**.
 *
 * 라고스 처방전 한 장에서 실패한 것이 정확히 이 뒷부분이었다 — 약 이름 셋은 다 맞게
 * 읽고서 "8hrly" 를 "8mg" 으로 붙이고 없는 시각을 지어냈다. 낱말만 재는 방식으로는
 * 그런 오류가 아예 안 잡힌다.
 *
 * **앱의 실제 경로를 부른다.** 모델을 직접 부르지 않고 `/api/analyze` 로 보낸다 —
 * 우리가 배포하는 프롬프트와 뒤처리를 그대로 지나야 잰 값이 이 앱의 값이 된다.
 *
 * 무엇을 정답으로 삼는가
 * ----------------------
 * 이 자료에는 약 이름의 **글자**가 없다. 대신 장마다 약 이름 영역이 몇 개인지 세어
 * 둔 표가 있다(`prescription_box_counts.csv`). 그래서 재는 것은 글자가 아니라 **개수**다.
 *
 * 개수가 왜 중요한가: 다섯 가지가 적힌 처방전에서 셋만 읽으면 두 가지가 조용히
 * 사라진다. 사용자는 화면에 나온 셋을 전부라고 믿고, 없어진 둘은 아무 표시도 남기지
 * 않는다. 글자를 틀리는 것보다 이쪽이 알아채기 어렵다.
 *
 * 자료
 * ----
 * Mendeley k62rfd23kz (CC BY 4.0). 방글라데시 처방전 전장 200장, 손글씨·인쇄 혼합,
 * 신원 삭제됨. 방글라데시는 조사 응답자(icddr,b Aliya Naheed)의 나라다.
 *
 *   npm run dev                     # 앱이 떠 있어야 한다
 *   node scripts/prescription-page-eval.mjs <데이터셋경로/Dataset> [표본수] [주소]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
const SAMPLE = Number(process.argv[3] ?? 60);
const APP = process.argv[4] ?? 'http://localhost:3000';

if (!ROOT) { console.error('데이터셋 경로가 필요하다 (Dataset 폴더)'); process.exit(1); }

/** 고정 간격. 무작위면 다시 돌렸을 때 다른 수가 나온다. */
function pick(rows, n) {
  const step = Math.max(1, Math.floor(rows.length / n));
  const out = [];
  for (let i = 0; i < rows.length && out.length < n; i += step) out.push(rows[i]);
  return out;
}

const truth = readFileSync(join(ROOT, 'prescription_box_counts.csv'), 'utf8')
  .split('\n').slice(1).filter(Boolean)
  .map((l) => {
    const [n, boxes] = l.split(',');
    // 대부분 .jpeg 인데 일곱 장이 .jpg, 다섯 장이 .png 다. 확장자를 가정하면
    // 그 열두 장이 조용히 빠지고, 빠진 것은 성적에 나타나지 않는다.
    const stem = n.trim();
    const img = ['jpeg', 'jpg', 'png', 'JPG'].map((e) => `${stem}.${e}`)
      .find((f) => existsSync(join(ROOT, 'images', f)));
    return { img, boxes: Number(boxes) };
  })
  .filter((r) => r.img && Number.isFinite(r.boxes));

const chosen = pick(truth, SAMPLE);
console.log(`${chosen.length}장을 ${APP}/api/analyze 로 보낸다 (전체 ${truth.length}장 중 고정 간격)`);

/*
  앱이 살아 있는지 먼저 본다.

  한 번은 개발 서버가 도중에 죽은 채로 끝까지 돌았다. 173장이 `fetch failed` 로 빠졌고
  요약에는 "재현율 94.3%" 라고 찍혔다 — 스물일곱 장만 읽고 낸 값이다. 요약만 보면 앱의
  성적처럼 보인다는 것이 문제다. 재는 도구가 조용히 다른 것을 재고 있으면, 그 수는
  없는 것보다 나쁘다.
*/
try {
  const ping = await fetch(`${APP}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  // 400 이 정상이다 — 이미지 없이 불렀으니. 붙었다는 것만 확인하면 된다.
  if (ping.status >= 500) throw new Error(`앱이 ${ping.status} 를 돌려준다`);
} catch (err) {
  console.error(`${APP} 에 닿지 못한다 — \`npm run dev\` 가 떠 있는지 보라.\n  ${err}`);
  process.exit(1);
}

/*
  밀리면 한 번 다시 보낸다 — 앱이 하는 것과 같다(app/camera/page.tsx).

  200장을 한 번에 재던 첫 판에서 아홉 장이 503 으로 실패했는데, 한 장씩 다시 보내니
  아홉 장 전부 정상으로 읽혔다. 그것을 실패로 세면 재는 것이 앱이 아니라 그 순간의
  대기열이 된다. 다시 보낸 횟수는 따로 세어 결과에 남긴다 — 숨기면 안 되는 값이다.
*/
let retried = 0;

async function analyse(file) {
  const b64 = readFileSync(join(ROOT, 'images', file)).toString('base64');
  const mediaType = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const send = () => fetch(`${APP}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: `data:${mediaType};base64,${b64}` }),
  });
  let res = await send();
  if (res.status === 503) {
    retried += 1;
    await new Promise((r) => setTimeout(r, 1500));
    res = await send();
  }
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/**
 * 앱이 이 장에서 약을 몇 가지로 봤는가.
 *
 * 우리 스키마는 한 장을 아이템 하나로 담고, 여러 약은 `dosageText` 안에 세미콜론으로
 * 늘어선다. 그래서 세미콜론과 줄바꿈만 센다.
 *
 * `+` 로도 나눠 봤다가 되돌렸다. 방글라데시 처방전은 하루 용법을 `1+0+1`(아침·점심·
 * 저녁)로 적는데, 그것을 약 구분자로 세면 약 셋짜리 장이 아홉으로 잡힌다 — 처음 재고
 * 나온 152% 가 그것이었다. 앱이 아니라 자가 틀렸던 것이다.
 */
function countMedicines(item) {
  if (!item) return 0;
  const text = item.rx?.dosageText ?? '';
  if (!text.trim()) return item.name ? 1 : 0;
  return text.split(/[;\n]/).map((s) => s.trim()).filter(Boolean).length;
}

/** 못 읽었다고 스스로 말한 자리. 지어내는 것보다 나은 행동이라 따로 센다. */
function admitsIllegible(item) {
  return /illegible|unclear|unreadable|can ?not read/i.test(
    `${item?.name ?? ''} ${item?.rx?.dosageText ?? ''}`,
  );
}

const results = [];
/*
  셋씩 보낸다.

  처음에 넷으로 재다가 열 장이 실패하자 "동시 요청 때문" 이라 보고 하나로 줄였는데,
  하나로 줄여도 **같은 장이 같은 수만큼** 실패했다. 원인은 대기열이 아니라 답이
  잘리는 것이었다(max_tokens). 원인을 바로 짚었으면 여기를 건드릴 이유가 없었다.
  잘못 짚은 진단이 코드에 남지 않게 되돌린다.
*/
const CONCURRENCY = 3;
for (let i = 0; i < chosen.length; i += CONCURRENCY) {
  const batch = chosen.slice(i, i + CONCURRENCY);
  const done = await Promise.all(batch.map(async (r) => {
    try {
      const { status, body } = await analyse(r.img);
      const item = body.item;
      return {
        img: r.img,
        boxes: r.boxes,
        status,
        intent: body.intent ?? body.error ?? null,
        isRx: body.intent === 'prescription' || body.intent === 'medicine',
        handwritten: item?.handwritten ?? null,
        found: item ? countMedicines(item) : 0,
        admitsIllegible: item ? admitsIllegible(item) : false,
        name: item?.name ?? null,
        dosageText: item?.rx?.dosageText ?? null,
        scheduleCount: (item?.rx?.schedule ?? []).length,
      };
    } catch (err) {
      return { img: r.img, boxes: r.boxes, error: String(err).slice(0, 90) };
    }
  }));
  results.push(...done);
  process.stdout.write(`\r  ${results.length}/${chosen.length}`);
}
console.log();

const ok = results.filter((r) => !r.error);
const rx = ok.filter((r) => r.isRx);
const flagged = rx.filter((r) => r.handwritten === true);
const totalBoxes = rx.reduce((s, r) => s + r.boxes, 0);
const totalFound = rx.reduce((s, r) => s + r.found, 0);
const withSchedule = rx.filter((r) => r.scheduleCount > 0);
const admits = rx.filter((r) => r.admitsIllegible);
const short = rx.filter((r) => r.found < r.boxes);
const over = rx.filter((r) => r.found > r.boxes);

const summary = {
  dataset: 'Mendeley k62rfd23kz (CC BY 4.0) — 200 full-page Bangladeshi prescriptions',
  through: `${APP}/api/analyze`,
  sampled: results.length,
  retriedOnce: retried,
  failed: results.length - ok.length,
  seenAsPrescription: rx.length,
  seenAsPrescriptionPct: +(100 * rx.length / ok.length).toFixed(1),
  flaggedHandwritten: flagged.length,
  flaggedHandwrittenPct: rx.length ? +(100 * flagged.length / rx.length).toFixed(1) : 0,
  medicinesAnnotated: totalBoxes,
  medicinesFound: totalFound,
  recallPct: totalBoxes ? +(100 * totalFound / totalBoxes).toFixed(1) : 0,
  /*
    일정이 붙은 장 수. 처음에는 `pagesWithInventedSchedule` 이라 불렀는데 이름이
    틀렸다 — 붙은 것을 열어 보니 지어낸 것이 아니라 **읽은 것**이었다. 방글라데시
    처방전은 하루 용법을 `1+0+0`(아침만), `0+0+1`(밤만) 로 적고, 한 장에는 아예
    "Morning:0, Afternoon:0, Night:2.5" 라고 쓰여 있었다. 종이에 있는 내용이다.
    (라고스 처방전에서 지어냈던 것과는 다른 경우다. 그쪽은 종이에 시각이 없었다.)
  */
  pagesWithSchedule: withSchedule.length,
  pagesWhereItSaidIllegible: admits.length,
  pagesFoundFewerThanAnnotated: short.length,
  pagesFoundMoreThanAnnotated: over.length,
};

console.log(JSON.stringify(summary, null, 2));
writeFileSync('scripts/prescription-page-eval.json', JSON.stringify({ summary, results }, null, 1));
console.log('자세한 것 → scripts/prescription-page-eval.json');
