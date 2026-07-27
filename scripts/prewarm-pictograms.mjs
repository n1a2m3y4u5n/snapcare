/**
 * 표본이 만들어 내는 픽토그램을 빌드 시점에 미리 렌더해 캐시에 넣는다.
 *
 * 왜: 형성 평가 28시행 중 8건이 픽토그램 한 장 없이 판정 화면에 도달했다. 원인은
 * 캐시 미적중이었다 — 처음 보는 라벨은 python 이 렌더할 때까지 화면이 비어 있고,
 * 그 시간이 화면 도달보다 길다. 캐시를 데운 뒤 같은 시행을 돌리면 8장이 나온다.
 *
 * 이게 특히 나쁜 자리인 이유: 심사에서 표본을 눌러보는 순간이 정확히 첫 렌더다.
 * 즉 우리 핵심 기여인 픽토그램이 가장 안 보일 때가 남에게 보여줄 때다.
 *
 * 조합 전체를 미리 그릴 수는 없다(문법이 허용하는 조합은 수백만이다). 표본 7종이
 * 실제로 만들어 내는 라벨만 그린다 — 시연 경로는 그것뿐이고, 나머지는 첫 사용 때
 * 그려져 그 다음부터 캐시에 남는다.
 *
 * 엔진(python + Pillow)이 없으면 조용히 건너뛴다. 배포 이미지에는 있고 개발 기계에는
 * 없을 수 있는데, 그것 때문에 빌드가 깨지면 안 된다.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const ENGINE = join(ROOT, 'engine', 'main.py');
const CACHE = join(ROOT, 'public', 'pictograms');
const TMP = join(ROOT, '.pictogram-prewarm');
const MANIFEST = join(CACHE, 'manifest.json');

/**
 * 표본 7종이 만들어 내는 라벨.
 *
 * itemToDsl 을 직접 부르려면 TS 를 빌드해야 하므로, 표본에서 나오는 것으로 확인된
 * 조합을 여기 적는다. 어긋나면 캐시가 덜 데워질 뿐 동작이 깨지지는 않는다.
 */
const HEADS = ['capsule_strip', 'dropper_bottle', 'tablet_blister', 'liquid_bottle', 'pill_bottle'];
const SLOTS = ['time_morning', 'time_noon', 'time_evening', 'time_night',
  'qty_one', 'qty_two', 'qty_three', 'qty_four', 'qty_five',
  'storage_fridge', 'storage_dry', 'body_eye', 'body_mouth',
  'food_bowl', 'food_empty_bowl'];
const ALLERGENS = ['allergen_peanut', 'allergen_tree_nut', 'allergen_milk', 'allergen_egg',
  'allergen_gluten', 'allergen_soy', 'allergen_shellfish', 'allergen_sesame'];
const PLAIN = ['finish_course', 'hand_wash', 'no_alcohol', 'caffeine', 'warn_bleeding',
  'food_sugar', 'food_salt', 'food_oil'];

function labels() {
  const out = new Set();
  for (const h of HEADS) {
    out.add(`\\${h}`);
    for (const s of SLOTS) out.add(`\\${h}{\\${s}}`);
  }
  for (const a of ALLERGENS) {
    out.add(`\\${a}`);
    out.add(`\\no{\\${a}}`);          // 회피 판정과 대체 제안이 쓰는 형태
  }
  for (const p of PLAIN) {
    out.add(`\\${p}`);
    out.add(`\\no{\\${p}}`);
  }
  out.add('\\no{\\contact_lens}');
  return [...out];
}

/**
 * 캐시 키. lib/snapcare/dsl.ts 의 dslKey 와 반드시 같아야 적중한다 (FNV-1a 32bit).
 * 여기서 다시 구현하는 이유는 이 스크립트가 빌드 전에 도는 순수 .mjs 라서다.
 * 두 구현이 어긋나면 캐시를 데워도 하나도 안 맞으므로 테스트로 묶어 둔다
 * (lib/snapcare/dsl.test.ts).
 */
export function dslKey(line) {
  let h = 0x811c9dc5;
  for (let i = 0; i < line.length; i++) {
    h ^= line.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function cacheName(label) {
  return `${dslKey(label)}.png`;
}

/** 한 묶음을 렌더해 캐시에 넣는다. 개수가 안 맞으면 그 묶음만 버린다. */
async function renderBatch(batch, python) {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, 'in.p'), batch.join('\n'), 'utf8');
  try {
    // --skip-errors: 라벨 하나가 문법에 안 맞아도 나머지는 그린다.
    await execFileAsync(python, [ENGINE, join(TMP, 'in.p'), '--out', TMP, '--no-pdf', '--skip-errors'],
      { timeout: 180_000 });
  } catch {
    return { moved: 0, skipped: batch.length };
  }
  const produced = readdirSync(TMP).filter((f) => f.endsWith('.png')).sort();
  // 엔진은 라벨 1줄당 PNG 1장을 순서대로 낸다. 개수가 어긋나면 짝이 밀려
  // 엉뚱한 그림이 엉뚱한 키로 저장된다 — 조용히 틀리는 쪽이라 아예 버린다.
  if (produced.length !== batch.length) return { moved: 0, skipped: batch.length };
  for (let i = 0; i < batch.length; i++) {
    copyFileSync(join(TMP, produced[i]), join(CACHE, cacheName(batch[i])));
  }
  return { moved: batch.length, skipped: 0 };
}

async function main() {
  if (!existsSync(ENGINE)) {
    console.log('[prewarm] engine 없음 — 건너뜀');
    return;
  }
  mkdirSync(CACHE, { recursive: true });

  const all = labels();
  const missing = all.filter((l) => !existsSync(join(CACHE, cacheName(l))));
  if (missing.length === 0) {
    console.log(`[prewarm] ${all.length}개 전부 캐시에 있음`);
    return;
  }

  const python = process.env.PICTOGRAM_PYTHON || 'python3';
  // 묶음으로 나누는 이유: 한 라벨이 실패해 개수가 어긋나면 그 묶음만 잃는다.
  // 전부 한 번에 돌리면 하나 때문에 전체가 버려진다.
  const SIZE = 25;
  let moved = 0, skipped = 0;
  for (let i = 0; i < missing.length; i += SIZE) {
    const r = await renderBatch(missing.slice(i, i + SIZE), python);
    moved += r.moved; skipped += r.skipped;
  }
  rmSync(TMP, { recursive: true, force: true });

  // 매니페스트도 갱신한다 — API 가 키에서 라벨을 되찾는 데 쓴다.
  if (moved > 0) {
    let manifest = {};
    try { manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch { /* 첫 실행 */ }
    for (const l of missing) {
      if (existsSync(join(CACHE, cacheName(l)))) manifest[dslKey(l)] = l;
    }
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  console.log(`[prewarm] ${moved} 렌더${skipped ? `, ${skipped} 건너뜀` : ''} (전체 ${all.length})`);
}

// import 만 해도 돌면 테스트가 python 을 띄운다. 직접 실행일 때만 돈다.
if (process.argv[1] && process.argv[1].endsWith('prewarm-pictograms.mjs')) {
  main().catch((e) => {
    // 빌드를 막지 않는다 — 캐시는 최적화이지 정확성 요건이 아니다.
    console.log('[prewarm] 건너뜀:', e.message);
  });
}
