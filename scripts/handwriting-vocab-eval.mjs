/**
 * 어휘를 닫아 주면 손글씨를 얼마나 더 읽는가 — 같은 표본, 세 조건.
 *
 * 왜 이걸 재는가
 * --------------
 * `handwriting-eval.mjs` 는 모델 하나를 목록 없이 재서 45.2% 를 얻었다. 그 숫자가
 * 낮다는 것은 알았지만 **무엇을 바꾸면 오르는지**는 안 쟀다. 합성 견본(글꼴로 그린
 * 필기체)으로는 못 가른다 — 전 조건이 6/6 이었다. 글자 모양이 일정해서 진짜 손글씨
 * 보다 훨씬 쉽다.
 *
 * 그래서 같은 공개 자료에서 60장을 고정 간격으로 뽑아 세 조건을 나란히 돌린다.
 * 표본이 작으니 한 조건 안의 소수점은 믿지 않는다 — 조건 사이의 **차이**를 본다.
 *
 * 자료
 * ----
 * RxHandBD (Zenodo 18478741, MIT). Test_Labels.csv 에 1,115장과 정답이 있고 고유
 * 이름이 496개다. 그 496개를 목록으로 준다 — 우리 약품표에 그 약이 있는 경우를
 * 흉내 내는 것이다. 실제로는 94종이라 없을 때가 더 많고, 그때를 위해 라우트는
 * "목록에 없으면 고르지 마라" 를 프롬프트와 코드 양쪽에서 막는다.
 *
 *   node scripts/handwriting-vocab-eval.mjs
 *
 * 결과 (2026-08-05)
 * -----------------
 *   sonnet-5 · 목록 없음   그대로 40.0%   다른 약으로 붙음 9
 *   opus-5   · 목록 없음   그대로 49.2%   다른 약으로 붙음 5
 *   opus-5   · 목록 줌     그대로 63.3%   최종 66.7%   다른 약으로 붙음 7
 *
 * 모델을 올려 9%p, 어휘를 닫아 다시 14%p. 두 번째가 더 크다 — 이 저장소가 tesseract
 * 에 대해 이미 편 논지였고(`lib/formulary/match.ts`), 그것을 Vision 에는 안 쓰고
 * 있었다.
 *
 * 문턱을 훑은 결과 (같은 60장, opus-5 + 목록)
 * -------------------------------------------
 *   0.70   최종 66.7%   다른 약으로 붙음 15.0%
 *   0.80   최종 66.7%   다른 약으로 붙음  5.0%
 *   0.90   최종 66.7%   다른 약으로 붙음  0.0%
 *   안 씀  최종 66.7%   다른 약으로 붙음  0.0%
 *
 * 정확도가 평평하다. 즉 **고르게 한 것이 아니라 보게 한 것이 일했다** — 목록을
 * 프롬프트에 준 것이 읽기 자체를 올렸고, 목록에서 고른 값은 정확도에 기여가 없이
 * 위험만 얹었다. 그래서 앱은 문턱을 0.9 로 둔다(`lib/formsheet/readName.ts`).
 *
 * ANTHROPIC_API_KEY 를 환경에서 읽는다. 이 스크립트는 열쇠를 출력하지 않는다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.argv[2] || process.env.RXHANDBD;
if (!ROOT) { console.error('쓰는 법: node scripts/handwriting-vocab-eval.mjs <RxHandBD 경로>'); process.exit(1); }
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('ANTHROPIC_API_KEY 가 환경에 없다'); process.exit(1); }
const rows = readFileSync(join(ROOT,'Test_Labels.csv'),'utf8').trim().split('\n').slice(1)
  .map(l => l.split(',')).filter(r => r.length>1).map(r => ({img:r[0].trim(), truth:r[1].trim()}));
const step = Math.floor(rows.length/60);
const sample = []; for (let i=0;i<rows.length && sample.length<60;i+=step) sample.push(rows[i]);
const VOCAB = [...new Set(rows.map(r=>r.truth))];  // 496개 — 우리 약품표에 해당
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');

function sys(cands) {
  const list = cands.length ? `\n\nThe app's medicine list is below. The name is often — but NOT always — one of these:\n${cands.join(', ')}\n\nIf the strokes match one of them, put that entry in "match" and how sure you are in "matchConfidence" (0-1). Judge by the SHAPE OF THE STROKES, not by which name is common. If nothing on the list fits the strokes, leave "match" empty.` : '';
  return `You read one handwritten word from a medical prescription: the medicine name.
Return STRICT JSON only: {"name": string, "match": string, "matchConfidence": number}
- "name" is exactly as written, letter for letter. Do NOT correct spelling.${list}`;
}
async function one(file, model, cands) {
  const data = readFileSync(file).toString('base64');
  for (let t=0;t<4;t++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
        headers:{'content-type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model,max_tokens:400,system:sys(cands),
          messages:[{role:'user',content:[{type:'image',source:{type:'base64',media_type:'image/jpeg',data}},{type:'text',text:'Read it.'}]}]})});
      const j = await r.json();
      if (!j.content) { await new Promise(s=>setTimeout(s,2500*(t+1))); continue; }
      return JSON.parse(j.content.find(c=>c.type==='text').text.replace(/^```json\s*|\s*```$/g,''));
    } catch { await new Promise(s=>setTimeout(s,2500*(t+1))); }
  }
  return null;
}
async function run(label, model, cands) {
  let raw=0, final=0, wrongPick=0, err=0;
  const B=6;
  for (let i=0;i<sample.length;i+=B) {
    const out = await Promise.all(sample.slice(i,i+B).map(s => one(join(ROOT,'Test_Set',s.img), model, cands)));
    out.forEach((o,k) => {
      const s = sample[i+k];
      if (!o) { err++; return; }
      if (norm(o.name||'') === norm(s.truth)) raw++;
      const picked = o.match && o.matchConfidence >= 0.7 ? o.match : '';
      const f = picked || o.name || '';
      if (norm(f) === norm(s.truth)) final++;
      else if (picked) wrongPick++;
    });
  }
  const n = sample.length - err;
  console.log(`${label.padEnd(34)} 그대로 ${raw}/${n} (${(100*raw/n).toFixed(1)}%) | 최종 ${final}/${n} (${(100*final/n).toFixed(1)}%) | 다른 약으로 붙음 ${wrongPick} | 실패 ${err}`);
}
console.log(`표본 ${sample.length}장 · 목록 ${VOCAB.length}개\n`);
await run('sonnet-5 · 목록 없음 (지금)', 'claude-sonnet-5', []);
await run('opus-5 · 목록 없음', 'claude-opus-5', []);
await run('opus-5 · 목록 줌 (새 설정)', 'claude-opus-5', VOCAB);
