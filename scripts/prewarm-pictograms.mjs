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
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, readdirSync, statSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
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
  'food_bowl', 'food_empty_bowl',
  /*
    Notes 칸에서만 나오는 슬롯 둘. **이 목록에 없어서 화면에서 통째로 사라지고 있었다.**

    약사가 종이에 적은 주의를 읽는 기능(`lib/formulary/notes.ts`)을 붙이면서 그 결과가
    만들어 내는 그림을 여기 안 넣었다. 매니페스트에 한 줄이라도 빠지면 화면은 엔진
    합성으로 넘어가고, 그것이 실패하면 **캐시에 있는 줄만** 남는다(PictogramStrip 의
    3번 폴백). 그래서 다른 그림은 다 뜨는데 주의사항만 안 뜬다 — 빈 화면이 아니라서
    눈으로는 "원래 그런 것" 처럼 보인다.
  */
  'water_glass', 'storage_dark'];
const ALLERGENS = ['allergen_peanut', 'allergen_tree_nut', 'allergen_milk', 'allergen_egg',
  'allergen_gluten', 'allergen_soy', 'allergen_shellfish', 'allergen_sesame'];
/**
 * 혼자 서는 그림.
 *
 * 시각 넷이 여기 있는 이유: 이제 약 그림 안이 아니라 **자기 칸**에 그려진다. 안에
 * 넣으면 88px 에서 아침과 밤이 구별되지 않았다(lib/snapcare/sigil.ts 에 적어 두었다).
 * 처방을 찍으면 거의 반드시 나오는 그림이라, 여기 없으면 데우는 의미가 없다.
 * 머리 안에 든 형태(SLOTS)도 그대로 둔다 — 저장된 옛 판정이 그 라벨을 들고 있다.
 */
const PLAIN = ['finish_course', 'hand_wash', 'no_alcohol', 'caffeine', 'warn_bleeding',
  'food_sugar', 'food_salt', 'food_oil',
  'time_morning', 'time_noon', 'time_evening', 'time_night',
  // 흔들어 쓰는 약 (현탁액·시럽). 손 씻기와 같은 줄에 서는데 그것만 목록에 있었다.
  'shake_bottle',
  // Notes 에서 나오는 증상 그림 둘.
  'symptom_dizzy', 'symptom_gut'];

/**
 * 사선을 두른 것들. **주의사항이 만드는 그림의 절반이 이 모양이다.**
 *
 * `itemToDsl` 은 금지를 `\no{...}` 로 내보낸다 — 운전 금지, 어린이 금지, 렌즈 금지.
 * 위 `PLAIN` 에 맨 이름을 넣어도 이 형태는 안 만들어지므로 따로 세운다.
 */
const NEGATED = ['vehicle', 'state_child', 'contact_lens'];
/**
 * 금기 상태. **이 둘은 목록에 아예 없었다.**
 *
 * 임신·수유 금기는 이 앱이 내보내는 것 중 틀렸을 때 가장 위험한 그림인데, 그것만
 * 캐시가 비어 있어서 늘 서버를 타고 있었다 — 오프라인에서는 나오지 않는다는 뜻이다.
 *
 * itemToDsl 은 언제나 `\no{}` 로 감싸 내보낸다(lib/snapcare/sigil.ts). 맨 그림은
 * 임신부 한 장이라 "임신부용" 으로 읽히기 때문이다. 그래도 맨 형태까지 함께 데우는
 * 것은 설문 데모(lib/survey/demo.ts)가 응답자들이 실제로 본 화면을 그대로 들고 있어서다.
 */
const STATES = ['state_pregnant', 'state_breastfeeding'];

/**
 * 복용 횟수로 감싼 형태. **이 종류가 통째로 빠져 있었다.**
 *
 * `itemToDsl` 은 하루 두 번 이상이면 머리를 횟수로 감싼다 —
 * `\three_times_daily{\capsule_strip{\food_bowl}}` (lib/snapcare/sigil.ts 의 CADENCE).
 * 그런데 아래 labels() 는 `\머리` 와 `\머리{\슬롯}` 만 만들고 있었다. 그래서
 * **하루 두 번 이상 먹는 처방은 전부 캐시에 없는 그림**이 되고, 오프라인에서는
 * 그 칸이 빈다. 이 앱에서 하루 한 번짜리 처방이 오히려 드물다.
 *
 * 알아낸 경위를 적어 둔다: 빌드가 자산 지문이 바뀌었다고 캐시를 비우면서 다섯 장을
 * 지웠는데, 그 다섯이 전부 이 종류였다. 실행 중에 /api/pictogram 이 만들어 둔
 * 것들이었고 — 즉 **앱이 실제로 그 그림을 요청하고 있었다는 증거**였다.
 */
const CADENCES = ['twice_daily', 'three_times_daily', 'four_times_daily'];

/**
 * 횟수 안에 들어갈 수 있는 슬롯.
 *
 * `itemToDsl` 이 `site ?? meal` 로 고르는 것들이다 — 부위(눈·피부·입)가 있으면
 * 부위가, 없으면 식사 맥락이 그 자리를 쓴다.
 */
const CORE_SLOTS = ['body_eye', 'body_skin', 'body_mouth', 'food_bowl', 'food_empty_bowl'];

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
  for (const s of STATES) {
    out.add(`\\no{\\${s}}`);   // 엔진이 실제로 내보내는 형태
    out.add(`\\${s}`);         // 설문 데모가 들고 있는 형태
  }
  // 사선 두른 것들. 주의사항이 만드는 그림의 절반이 이 모양이다.
  for (const n of NEGATED) out.add(`\\no{\\${n}}`);

  /*
    횟수로 감싼 형태와 회피 형태. 위 주석(CADENCES)에 적은 이유로 둘 다 빠져 있었다.

    회피는 머리만 감싼다 — `if (avoid) labels.push(`\\no{\\${head}}`)` 라
    슬롯이 붙지 않는다(lib/snapcare/sigil.ts).
  */
  for (const h of HEADS) {
    out.add(`\\no{\\${h}}`);
    for (const c of CADENCES) {
      out.add(`\\${c}{\\${h}}`);
      for (const s of CORE_SLOTS) out.add(`\\${c}{\\${h}{\\${s}}}`);
    }
    // 부위 슬롯 중 body_skin 은 위 SLOTS 에 없었다 — 연고가 그 자리를 쓴다.
    out.add(`\\${h}{\\body_skin}`);
  }

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

/**
 * 지금 자산의 지문. 캐시가 어느 그림으로 그려졌는지를 이 값으로 기억한다.
 *
 * 캐시 키(dslKey)는 DSL 문자열만 쓴다. 그런데 렌더 결과는 DSL 뿐 아니라 **자산**에도
 * 달려 있어서, 글리프를 새로 뽑아 넣어도 키는 그대로다 — 옛 그림이 영원히 적중한다.
 * 실제로 78개 중 74개를 갈아끼운 날 prewarm 은 "전부 캐시에 있음" 이라고 답했다.
 *
 * 키에 자산 판을 섞는 방법도 있지만, 그러면 브라우저 쪽 dsl.ts 까지 같은 값을 알아야
 * 한다. 여기서는 캐시 전체를 한 덩어리로 보고, 지문이 다르면 통째로 버린다.
 */
function assetsFingerprint() {
  const dir = join(ROOT, 'engine', 'assets');
  if (!existsSync(dir)) return '';
  const h = createHash('sha1');
  // 사전도 함께 센다. 합성 결과는 그림뿐 아니라 **슬롯 좌표**에도 달려 있고, 그
  // 좌표는 dictionary.json 에 있다. 그림만 세면 슬롯을 고친 날 캐시가 그대로 남는다.
  const dict = join(ROOT, 'engine', 'dictionary.json');
  if (existsSync(dict)) h.update(readFileSync(dict));
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.png')) { h.update(name); h.update(readFileSync(p)); }
    }
  };
  walk(dir);
  return h.digest('hex').slice(0, 16);
}

async function main() {
  if (!existsSync(ENGINE)) {
    console.log('[prewarm] engine 없음 — 건너뜀');
    return;
  }
  mkdirSync(CACHE, { recursive: true });

  const fp = assetsFingerprint();
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch { /* 첫 실행 */ }
  if (manifest.__assets && manifest.__assets !== fp) {
    const stale = readdirSync(CACHE).filter((f) => f.endsWith('.png'));
    for (const f of stale) rmSync(join(CACHE, f), { force: true });
    console.log(`[prewarm] 자산이 바뀌었다 (${manifest.__assets} → ${fp}) — 캐시 ${stale.length}개 버림`);
    manifest = {};
  }

  const all = labels();
  const missing = all.filter((l) => !existsSync(join(CACHE, cacheName(l))));
  if (missing.length === 0) {
    if (manifest.__assets !== fp) {
      manifest.__assets = fp;
      writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
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
    for (const l of missing) {
      if (existsSync(join(CACHE, cacheName(l)))) manifest[dslKey(l)] = l;
    }
    manifest.__assets = fp;
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
