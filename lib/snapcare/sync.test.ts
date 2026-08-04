import test from 'node:test';
import assert from 'node:assert/strict';
import { SYNC_VERSION, isUsable, withPerson, withoutPerson, type SyncBlob } from './sync.ts';
import type { Account } from './accounts.ts';

/**
 * 이 파일이 지키는 것: **올리는 순간에 남의 자료가 지워지지 않는가.**
 *
 * 서버 파일은 기기당 하나이고 그 안이 사람별로 나뉜다. 그런데 화면은 늘 지금 사람
 * 것밖에 모른다. 그래서 받아 둔 것을 읽지 않고 그대로 올리면 올릴 때마다 나머지
 * 사람이 지워진다 — 그리고 그 실패는 **화면에 아무 표시도 내지 않는다.** 지워진
 * 사람이 다음에 앱을 열어야 알고, 그때는 서버에도 없다.
 *
 * 되돌릴 수 없는 실패를 눈으로 볼 수 없다는 것이 여기 시험을 두는 이유다.
 */

const ROSTER: Account[] = [
  { id: 'me', emoji: '🧓', color: '#000' },
  { id: 'p_kid', emoji: '👧', color: '#111' },
];

const member = (id: string) => ({
  id, name: 'You', role: 'Adult', ageBand: 'adult' as const,
  emoji: '🧑', color: '#000', conditionIds: [],
});

const seen: SyncBlob = {
  version: SYNC_VERSION,
  roster: ROSTER,
  people: {
    me: { profile: member('me'), scans: [] },
    p_kid: { profile: member('kid'), scans: [], reminders: [] },
  },
};

test('내 자리만 갈아 끼우고 남의 몫은 그대로 둔다', () => {
  const out = withPerson(seen, ROSTER, 'me', { profile: member('me'), scans: [] });
  assert.deepEqual(Object.keys(out.people!).sort(), ['me', 'p_kid']);
  assert.deepEqual(out.people!.p_kid, seen.people!.p_kid,
    '남의 몫이 조금이라도 달라지면 그 사람 기록이 사라지는 길이 열린다');
});

test('서버에 아무것도 없어도 올릴 것을 만든다', () => {
  // 첫 실행이다. 받아 둔 것이 없다고 올리지 못하면 자료가 영영 서버에 안 간다.
  const out = withPerson(null, ROSTER, 'me', { scans: [] });
  assert.deepEqual(Object.keys(out.people!), ['me']);
  assert.equal(out.version, SYNC_VERSION);
});

test('명단은 서버 것이 아니라 지금 이 기기 것을 올린다', () => {
  // 서버 것을 되올리면 방금 지운 사람이 다시 붙는다.
  const stale: SyncBlob = { ...seen, roster: [...ROSTER, { id: 'p_gone', emoji: '👦', color: '#222' }] };
  const out = withPerson(stale, ROSTER, 'me', { scans: [] });
  assert.deepEqual(out.roster!.map((a) => a.id), ['me', 'p_kid']);
});

test('사람을 빼도 나머지는 손대지 않는다', () => {
  const out = withoutPerson(seen, [ROSTER[0]], 'p_kid');
  assert.deepEqual(Object.keys(out.people!), ['me']);
  assert.deepEqual(out.people!.me, seen.people!.me);
});

test('받아 둔 것을 고치지 않는다', () => {
  // 같은 객체를 제자리에서 고치면, 다음 올리기가 이미 바뀐 것을 바탕으로 삼는다.
  const before = JSON.stringify(seen);
  withPerson(seen, ROSTER, 'me', { scans: [] });
  withoutPerson(seen, ROSTER, 'p_kid');
  assert.equal(JSON.stringify(seen), before);
});

/*
 * 아래는 서버에서 받은 것을 믿어도 되는가.
 *
 * localStorage 는 zustand 의 migrate 가 지켜주지만 서버에서 온 것은 그 경로를 타지
 * 않고 곧장 화면 상태가 된다. 그래서 이 관문이 헐거우면 옛 모양이 조용히 되살아난다.
 */

test('버전이 다른 서버 자료는 쓰지 않는다', () => {
  assert.equal(isUsable({ ...seen, version: SYNC_VERSION - 1 }), false);
  assert.equal(isUsable({ people: {} }), false, '버전이 아예 없는 것도 옛 모양이다');
  assert.equal(isUsable(null), false);
});

test('모양이 깨진 사람 몫이 하나라도 있으면 통째로 거절한다', () => {
  // 반만 받아들이면 어느 화면이 옛 자료인지 알 수 없게 된다.
  const noName = {
    version: SYNC_VERSION, people: { me: { profile: { id: 'me' } } },
  } as unknown as SyncBlob;
  assert.equal(isUsable(noName), false);

  const badReminder = {
    version: SYNC_VERSION,
    people: { me: { reminders: [{ id: 'r1', memberId: 'me', time: '08:00' }] } },
  } as unknown as SyncBlob;
  assert.equal(isUsable(badReminder), false, 'item 없는 알람은 화면에서 열 수 없다');
});

test('멀쩡한 것은 통과한다', () => {
  assert.equal(isUsable(seen), true);
  assert.equal(isUsable({ version: SYNC_VERSION }), true, '빈 것도 형태로는 멀쩡하다');
});

test('시연 상자를 되올릴 때 잃지 않는다', () => {
  /*
    시연 블롭에는 사람 몫 말고 약통 짝짓기 코드가 하나 더 들어 있다. 사람 몫을 갈아
    끼울 때 이것을 안 챙기면 **다음에 여는 폰이 상자를 못 찾는다** — 사람 자료는
    멀쩡히 보이는데 `/present` 만 다시 짝지으라고 하고, 어느 쪽에서도 오류가 안 난다.
    나머지 사람을 되올려야 하는 것과 정확히 같은 이유다.
  */
  const seen: SyncBlob = {
    version: SYNC_VERSION,
    people: { me: { scans: [] } },
    demoBox: { claim: 'ABCDEFGHJK', relayUrl: 'https://relay.example' },
  };
  assert.deepEqual(withPerson(seen, ROSTER, 'me', { scans: [] }).demoBox, seen.demoBox);
  assert.deepEqual(withoutPerson(seen, ROSTER, 'p_kid').demoBox, seen.demoBox);
});

test('실제 블롭에는 상자 칸이 아예 없다', () => {
  // 있으면 안 되는 것이 `undefined` 로라도 있으면, 언젠가 누가 그 칸을 채운다.
  const out = withPerson(null, ROSTER, 'me', { scans: [] });
  assert.equal('demoBox' in out, false);
});
