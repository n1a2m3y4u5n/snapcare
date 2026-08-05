import test from 'node:test';
import assert from 'node:assert/strict';

/*
  모드가 **세 갈래**인가.

  전에는 두 갈래였다: '1' 이면 시연, 아니면 빔. 그 모양에서는 "빈 상태를 골랐다" 와
  "아무것도 안 골랐다" 가 같은 값이라, 기본을 시연으로 뒤집는 순간 빈 상태를 고를
  방법이 사라진다 — 골라도 새로고침 한 번에 시연으로 돌아간다.

  화면에서는 안 보인다. 고른 직후에는 맞게 동작하기 때문이다.
*/
const FLAG = 'snapcare-demo';

/** `lib/snapcare/demo.ts` 가 브라우저 전역을 읽으므로, 그 둘을 세워 두고 부른다. */
async function withStore(stored: string | null, search: string) {
  const box = new Map<string, string>();
  if (stored !== null) box.set(FLAG, stored);
  const g = globalThis as Record<string, unknown>;
  g.window = { location: { search } };
  g.localStorage = {
    getItem: (k: string) => box.get(k) ?? null,
    setItem: (k: string, v: string) => { box.set(k, v); },
    removeItem: (k: string) => { box.delete(k); },
  };
  // 모듈이 값을 안 가두므로 부를 때마다 새로 읽는다.
  const { isDemo, setDemo } = await import('./demo.ts');
  return { isDemo, setDemo, box };
}

test('아무것도 안 고르면 시연이다', async () => {
  /*
    이 주소를 실제로 여는 사람은 심사위원과 구경하는 사람이다. 그들이 보는 첫 화면이
    텅 빈 앱이면 이 앱이 무엇을 하는지가 아무 데도 안 보인다.
  */
  const { isDemo } = await withStore(null, '');
  assert.equal(isDemo(), true);
});

test('빈 상태를 고르면 그 선택이 남는다', async () => {
  // 지우는 것으로 껐다면 여기서 다시 시연이 된다 — 안 정함이 곧 시연이므로.
  const { isDemo, setDemo, box } = await withStore(null, '');
  setDemo(false);
  assert.equal(box.get(FLAG), '0', '끌 때도 값을 적어야 한다');
  assert.equal(isDemo(), false);
});

test('주소로도 고를 수 있고, 그 선택이 남는다', async () => {
  const off = await withStore(null, '?demo=0');
  assert.equal(off.isDemo(), false);
  assert.equal(off.box.get(FLAG), '0');

  const on = await withStore('0', '?demo=1');
  assert.equal(on.isDemo(), true);
  assert.equal(on.box.get(FLAG), '1');
});
