import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * 이 파일이 지키는 것은 하나다: **누구의 자료가 누구에게 보이는가.**
 *
 * 저장 열쇠를 잘못 붙이면 화면은 멀쩡하게 뜬다 — 남의 알레르기와 남의 처방을 들고서.
 * 판정이 틀린 채로 조용히 돌아가는 실패라 눈으로 볼 수가 없다. 그래서 열쇠를 만드는
 * 규칙과 사람을 더하고 지우는 규칙만 따로 잡아 둔다.
 *
 * localStorage 를 흉내 내는 이유: 이 모듈은 브라우저 저장소만 쓴다. node 에는 없으므로
 * 최소한만 세운다 (accounts.ts 는 호출할 때마다 전역에서 찾으므로 이걸로 충분하다).
 */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _map: map,
  };
}

const store = fakeStorage();
(globalThis as { localStorage?: unknown }).localStorage = store;
// isDemo() 는 주소의 ?demo 를 먼저 본다. 시험에는 주소가 없으므로 빈 것으로 세워 둔다
// (없으면 그 함수가 "브라우저가 아니다" 로 판단해 시연 갈래를 아예 안 탄다).
(globalThis as { window?: unknown }).window = { location: { search: '' } };

const {
  PRIMARY_ID, activeAccountId, addAccount, freeFaces, leaveDemo, listAccounts,
  mergeRoster, removeAccount, scopedKey, setActiveFace,
} = await import('./accounts.ts');

function reset() {
  store.clear();
}

test('첫 사람은 예전 저장 열쇠를 그대로 쓴다', () => {
  reset();
  // 이것이 깨지면 이미 앱을 쓰고 있는 사람이 앱을 열었을 때 기록이 통째로 사라진다.
  assert.equal(activeAccountId(), PRIMARY_ID);
  assert.equal(scopedKey('snapcare-scans'), 'snapcare-scans');
});

test('두 번째 사람부터 열쇠가 갈린다', () => {
  reset();
  const kid = addAccount('👧');
  assert.notEqual(kid.id, PRIMARY_ID);
  assert.equal(scopedKey('snapcare-scans', kid.id), `snapcare-scans#${kid.id}`);
  // 첫 사람 것은 그대로다 — 사람을 더했다고 기존 자료가 움직이면 안 된다.
  assert.equal(scopedKey('snapcare-scans', PRIMARY_ID), 'snapcare-scans');
});

test('얼굴은 겹치지 않는다', () => {
  reset();
  const before = freeFaces();
  addAccount(before[0]);
  assert.ok(!freeFaces().includes(before[0]),
    '이미 쓰는 얼굴이 다시 나오면 잠금화면에서 서로를 가려낼 방법이 없다');
});

test('사람을 지우면 그 사람의 자료도 같이 지운다', () => {
  reset();
  const kid = addAccount('👧');
  store.setItem(`snapcare-scans#${kid.id}`, '{"state":{"scans":[1]}}');
  store.setItem('snapcare-scans', '{"state":{"scans":[9]}}');

  assert.equal(removeAccount(kid.id), true);
  assert.equal(store.getItem(`snapcare-scans#${kid.id}`), null);
  // 남은 사람 것은 건드리지 않는다.
  assert.equal(store.getItem('snapcare-scans'), '{"state":{"scans":[9]}}');
  assert.equal(listAccounts().length, 1);
});

test('쓰고 있는 사람과 마지막 한 명은 못 지운다', () => {
  reset();
  assert.equal(removeAccount(PRIMARY_ID), false, '마지막 한 명을 지우면 빈 폰이 된다');
  const kid = addAccount('👧');
  store.setItem('snapcare-active', kid.id);
  assert.equal(removeAccount(kid.id), false, '발밑을 팔 수는 없다');
  assert.equal(listAccounts().length, 2);
});

test('명단에 없는 사람이 쓰는 사람으로 남아 있으면 첫 사람으로 돌아간다', () => {
  reset();
  store.setItem('snapcare-active', 'p_gone');
  // 지워진 사람의 표가 남아 있을 때 그대로 믿으면 아무의 것도 아닌 빈 자리에 들어간다.
  assert.equal(activeAccountId(), PRIMARY_ID);
});

test('서버 명단은 모르는 사람만 더한다', () => {
  reset();
  const kid = addAccount('👧');
  mergeRoster([
    { id: PRIMARY_ID, emoji: '🧓', color: '#000' },   // 이미 있다
    { id: kid.id, emoji: '👦', color: '#000' },       // 이미 있다 (얼굴이 달라도)
    { id: 'p_restored', emoji: '👩', color: '#111' }, // 모른다 → 더한다
  ]);
  const ids = listAccounts().map((a) => a.id);
  assert.deepEqual(ids, [PRIMARY_ID, kid.id, 'p_restored']);
  // 이미 있는 사람의 얼굴을 서버 것으로 덮으면, 잠금화면에서 얼굴을 바꾼 직후에
  // 다시 옛 얼굴로 돌아간다.
  assert.equal(listAccounts()[1].emoji, '👧');
});

test('얼굴을 바꾸면 명단에도 반영된다', () => {
  reset();
  setActiveFace('🧓');
  assert.equal(listAccounts()[0].emoji, '🧓');
});

test('시연 모드는 손대지 않은 명단만 두 사람으로 바꾼다', async () => {
  reset();
  assert.equal(listAccounts().length, 1);          // 명단이 만들어진다
  store.setItem('snapcare-demo', '1');
  assert.equal(listAccounts().length, 2, '앱을 한 번 켜 본 뒤에 ?demo=1 을 붙여도 두 사람이어야 한다');

  // 이미 쓰던 사람은 건드리지 않는다.
  reset();
  setActiveFace('🧓');
  store.setItem('snapcare-demo', '1');
  assert.equal(listAccounts().length, 1);
  store.removeItem('snapcare-demo');
});

test('시연을 끄면 시연이 만든 사람만 거둔다', () => {
  reset();
  store.setItem('snapcare-demo', '1');
  assert.equal(listAccounts().length, 2);
  store.setItem('snapcare-scans#kid', '{"state":{"scans":[1]}}');

  leaveDemo();
  assert.equal(listAccounts().length, 1, '거둔 명단이 그 자리에서 다시 만들어지면 안 된다');
  assert.equal(store.getItem('snapcare-scans#kid'), null);
  assert.equal(store.getItem('snapcare-demo'), null);

  // 사용자가 손댄 명단은 건드리지 않는다.
  reset();
  store.setItem('snapcare-demo', '1');
  const extra = addAccount('👦');
  leaveDemo();
  assert.equal(listAccounts().length, 3, `${extra.id} 를 포함해 그대로여야 한다`);
});

test('명단이 깨져 있어도 앱은 열린다', () => {
  reset();
  store.setItem('snapcare-accounts', 'not json');
  // 명단을 못 읽는 것이 앱을 못 여는 이유가 되면 안 된다.
  assert.equal(listAccounts().length, 1);
  assert.equal(activeAccountId(), PRIMARY_ID);
});
