import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 판정 색이 **글자로 읽히는가**.
 *
 * 이 색들은 장식이 아니다. 표 17 에서 색은 하나의 판정이 나가는 다섯 갈래 중 하나이고,
 * 같은 색이 그 판정을 말하는 문장의 색이기도 하다. 대비가 모자라면 갈래 하나가 사라지는
 * 것이 아니라 **문장이 안 읽힌다.**
 *
 * 한 번 고쳐 두면 다시 무너지는 종류의 값이라 시험으로 잠근다. 색을 예쁘게 다듬는 것은
 * 눈으로 하는 일이고, 눈은 4.5:1 을 재지 못한다. 실제로 이 파일을 쓰기 전 값들은
 * 초록 3.30, 주황 2.81 이었다 — 화면에서는 멀쩡해 보였다.
 *
 * 기준은 WCAG 2.2 SC 1.4.3 (본문 4.5:1). 굵고 큰 글자에만 3:1 이 허용되는데, 판정
 * 문장이 언제나 크고 굵다는 보장이 없으므로 4.5 로 잰다.
 */

const CSS = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(CSS);
  assert.ok(m, `globals.css 에서 --color-${name} 을 찾지 못했다`);
  return m![1];
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** 화면을 그리는 파일 전부. 색은 한 곳만 새어도 그 화면에서 문장이 안 읽힌다. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name) && !e.name.includes('.test.')) out.push(full);
  }
  return out;
}

const WHITE = '#FFFFFF';
const MIN = 4.5;

test('판정 색이 흰 카드 위에서 읽힌다', () => {
  for (const name of ['safe', 'caution', 'avoid', 'sc-primary', 'sc-muted']) {
    const c = token(name);
    assert.ok(ratio(c, WHITE) >= MIN, `${name} (${c}) 가 흰 바탕에서 ${ratio(c, WHITE).toFixed(2)}:1`);
  }
});

test('판정 색이 오프화이트 배경에서도 읽힌다', () => {
  // 화면 대부분이 카드가 아니라 이 배경이다. 흰 바탕만 재면 여기서 미끄러진다.
  const bg = token('sc-bg');
  for (const name of ['safe', 'caution', 'avoid', 'sc-primary', 'sc-muted']) {
    const c = token(name);
    assert.ok(ratio(c, bg) >= MIN, `${name} (${c}) 가 ${bg} 위에서 ${ratio(c, bg).toFixed(2)}:1`);
  }
});

test('판정 색이 자기 연한 배경 위에서 읽힌다', () => {
  // 초록 문장은 연초록 띠 위에 앉는다. 그 조합이 실제로 화면에 나오는 조합이다.
  for (const name of ['safe', 'caution', 'avoid']) {
    const fg = token(name);
    const bg = token(`${name}-bg`);
    assert.ok(ratio(fg, bg) >= MIN, `${name} (${fg}) 가 ${bg} 위에서 ${ratio(fg, bg).toFixed(2)}:1`);
  }
});

test('색 위의 흰 글자도 읽힌다', () => {
  // 주요 버튼은 색 바탕에 흰 글자다.
  for (const name of ['safe', 'caution', 'avoid', 'sc-primary']) {
    const c = token(name);
    assert.ok(ratio(WHITE, c) >= MIN, `${name} (${c}) 위의 흰 글자가 ${ratio(WHITE, c).toFixed(2)}:1`);
  }
});

test('판정 셋이 서로 구별되는 색상으로 남아 있다', () => {
  // 대비를 맞추다 보면 전부 어두운 회색으로 수렴할 수 있다. 그러면 4.5:1 은 넘기고
  // 색이라는 갈래를 잃는다 — 시험을 통과하면서 목적을 잃는 가장 흔한 방법이다.
  const hue = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return -1;
    const d = max - min;
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return Math.round(h * 60);
  };
  const [safe, caution, avoid] = ['safe', 'caution', 'avoid'].map(token);
  assert.ok(hue(safe) >= 90 && hue(safe) <= 170, `safe 가 초록이 아니다: ${safe} (${hue(safe)}°)`);
  assert.ok(hue(caution) >= 20 && hue(caution) <= 55, `caution 이 주황이 아니다: ${caution} (${hue(caution)}°)`);
  assert.ok(hue(avoid) <= 15 || hue(avoid) >= 345, `avoid 가 빨강이 아니다: ${avoid} (${hue(avoid)}°)`);
});

/*
  강조 초록은 **글자가 아니다.**

  로고에서 가져온 두 색 중 밝은 쪽(#34A853)은 흰 카드에서 3.06:1 이다. 테두리와
  그림에는 쓸 수 있고(WCAG 1.4.11 의 3:1) 글자에는 못 쓴다(1.4.3 의 4.5:1).

  이 차이는 화면에서 안 보인다. 흰 바탕 위의 초록 글자는 멀쩡해 보이고, 못 읽는
  사람은 우리가 아니다. 그래서 잰다.
*/
test('강조 초록은 흰 바탕에서 테두리로는 되고 글자로는 안 된다', () => {
  const accent = token('sc-accent');
  const r = ratio(accent, WHITE);
  assert.ok(r >= 3, `테두리로도 못 쓴다 (${accent} 가 흰 바탕에서 ${r.toFixed(2)}:1)`);
  assert.ok(r < MIN, `4.5:1 을 넘었다 (${r.toFixed(2)}:1) — 넘었으면 글자로도 쓸 수 있으니 이 시험과 위 주석을 고쳐라`);
});

test('강조 초록을 글자 색으로 쓴 곳이 없다', () => {
  /*
    `color:` 로 쓰면 글자다. `borderColor`·`background`·`outline` 은 아니다.
    한 곳만 새어도 그 화면의 문장이 안 읽히는데, 화면에서는 티가 안 난다.
  */
  const files = walk(join(process.cwd(), 'app')).concat(walk(join(process.cwd(), 'components')));
  const bad: string[] = [];
  for (const f of files) {
    for (const [i, line] of readFileSync(f, 'utf8').split('\n').entries()) {
      if (/(^|[^-\w])color:\s*'?var\(--color-sc-accent\)/.test(line)) {
        bad.push(`${f.replace(process.cwd() + '/', '')}:${i + 1}`);
      }
    }
  }
  assert.deepEqual(bad, [], `강조 초록이 글자 색으로 쓰였다:\n  ${bad.join('\n  ')}`);
});

test('판정 색은 로고 초록으로 안 바뀌었다', () => {
  /*
    강조 초록과 판정 초록(#0E7A38)은 1.78:1 밖에 안 갈린다. 판정이 나가는 자리에
    강조 초록이 들어가면 "안전" 과 "그냥 단추" 가 같은 색이 된다.
  */
  assert.notEqual(token('safe').toUpperCase(), token('sc-accent').toUpperCase());
  assert.notEqual(token('safe').toUpperCase(), token('sc-primary').toUpperCase());
});
