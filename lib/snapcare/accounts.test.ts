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
  PRIMARY_ID, DEMO_PRIMARY, DEMO_KID, activeAccountId, addAccount, freeFaces,
  listAccounts, mergeRoster, removeAccount, scopedKey, setActiveFace,
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

/*
 * 여기부터는 시연 모드와 실제 자료가 서로에게 닿지 않는지를 본다.
 *
 * 이것이 깨졌을 때의 증상은 "처음부터 시작을 눌렀는데 남의 기록이 있다" 다. 현지
 * 평가에서 어르신이 처음 여는 화면에 자기가 하지도 않은 스캔이 있으면, 우리가 재려던
 * 것("이 사람이 이 화면을 이해하는가")이 그 순간 성립하지 않는다.
 */
const demoOn = () => store.setItem('snapcare-demo', '1');
const demoOff = () => store.removeItem('snapcare-demo');

/**
 * 자국 치우기를 다시 돌린다.
 *
 * 그 코드는 모듈을 읽을 때 한 번 돈다 (스토어가 저장소를 읽기 전이어야 하므로 다른
 * 자리가 없다). 시험에서 다시 돌리려면 모듈을 새로 읽게 해야 하고, 그러려면 주소가
 * 달라야 한다. 경로를 변수로 두는 것은 타입 검사가 `?residue=…` 를 진짜 파일 이름으로
 * 보고 없다고 하기 때문이다.
 */
function reload(tag: string): Promise<unknown> {
  const path = `./accounts.ts?residue=${tag}`;
  return import(path);
}

test('시연 모드는 사람도 저장 자리도 따로 쓴다', () => {
  reset();
  demoOn();
  const list = listAccounts();
  assert.deepEqual(list.map((a) => a.id), [DEMO_PRIMARY, DEMO_KID]);
  // 표가 둘 다 첫 사람이 아니므로, 실제 자리(이름 없는 열쇠)에는 손이 닿지 않는다.
  assert.equal(scopedKey('snapcare-scans'), `snapcare-scans#${DEMO_PRIMARY}`);
  demoOff();
});

test('시연을 끄면 시연 자료가 통째로 보이지 않는다', () => {
  reset();
  // 실제로 쓰던 사람이 있다.
  store.setItem('snapcare-scans', '{"state":{"scans":[9]}}');

  demoOn();
  listAccounts();
  store.setItem(scopedKey('snapcare-scans'), '{"state":{"scans":[1]}}');  // 시연 중 쌓인 것

  demoOff();
  assert.equal(listAccounts().length, 1, '시연 명단이 실제 모드로 넘어오면 안 된다');
  assert.equal(activeAccountId(), PRIMARY_ID);
  assert.equal(scopedKey('snapcare-scans'), 'snapcare-scans');
  assert.equal(store.getItem('snapcare-scans'), '{"state":{"scans":[9]}}',
    '시연이 실제 자료를 건드리면 안 된다');
});

test('시연을 다시 켜면 시연 상태가 그대로 있다', () => {
  reset();
  demoOn();
  listAccounts();
  const kidKey = scopedKey('snapcare-scans', DEMO_KID);
  store.setItem(kidKey, '{"state":{"scans":[1]}}');
  demoOff();
  listAccounts();
  demoOn();
  // 자리를 갈라 두면 끄는 것이 지우는 것이 아니다 — 껐다 켜도 그대로여야 한다.
  assert.equal(store.getItem(kidKey), '{"state":{"scans":[1]}}');
  assert.deepEqual(listAccounts().map((a) => a.id), [DEMO_PRIMARY, DEMO_KID]);
  demoOff();
});

test('앞선 판이 실제 자리에 남긴 시연 자국을 치운다', async () => {
  reset();
  // 짧게 배포됐던 판이 만들던 모양 그대로.
  store.setItem('snapcare-accounts',
    '[{"id":"me","emoji":"🧓","color":"#2F6BF6"},{"id":"kid","emoji":"👧","color":"#E8590C"}]');
  store.setItem('snapcare-scans', '{"state":{"scans":[{"id":"s1"},{"id":"s4"}]}}');
  store.setItem('snapcare-profile', '{"state":{"confirmed":true}}');
  store.setItem('snapcare-scans#kid', '{"state":{"scans":[{"id":"k1"}]}}');

  // 자국 치우기는 모듈을 읽을 때 한 번 돈다 (스토어가 저장소를 읽기 전이어야 한다).
  await reload('1');

  assert.equal(store.getItem('snapcare-scans'), null);
  assert.equal(store.getItem('snapcare-profile'), null,
    '프로필을 남기면 처음부터 시작해도 당뇨에 혈액희석제를 쓰는 사람으로 판정된다');
  assert.equal(store.getItem('snapcare-scans#kid'), null);
  assert.equal(store.getItem('snapcare-accounts'), null);
});

test('실제 명단에 붙은 시연 표를 떼어낸다', async () => {
  reset();
  store.setItem('snapcare-accounts',
    '[{"id":"me","emoji":"🧑","color":"#2F6BF6"},{"id":"demo_me","emoji":"🧓","color":"#2F6BF6"}]');
  await reload('3');
  assert.deepEqual(JSON.parse(store.getItem('snapcare-accounts')!).map((a: {id: string}) => a.id),
    ['me'], '시연 두 사람이 실제 잠금화면에 뜨면 자기 얼굴을 못 찾는다');
});

test('서버 명단으로도 시연 표는 들어오지 않는다', () => {
  reset();
  mergeRoster([{ id: 'demo_kid', emoji: '👧', color: '#000' }]);
  assert.deepEqual(listAccounts().map((a) => a.id), [PRIMARY_ID]);
});

test('사람이 만든 기록은 자국으로 보지 않는다', async () => {
  reset();
  // 시드 표(s1..s4)가 아닌 것이 하나라도 있으면 사람이 찍은 것이 섞여 있다는 뜻이다.
  store.setItem('snapcare-scans', '{"state":{"scans":[{"id":"s1"},{"id":"a3f9c2"}]}}');
  await reload('2');
  assert.notEqual(store.getItem('snapcare-scans'), null);
});

test('명단이 깨져 있어도 앱은 열린다', () => {
  reset();
  store.setItem('snapcare-accounts', 'not json');
  // 명단을 못 읽는 것이 앱을 못 여는 이유가 되면 안 된다.
  assert.equal(listAccounts().length, 1);
  assert.equal(activeAccountId(), PRIMARY_ID);
});
