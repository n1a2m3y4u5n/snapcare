'use client';

import { createJSONStorage } from 'zustand/middleware';
import { isDemo } from './demo.ts';   // 확장자 필수 — 시험이 --experimental-strip-types 로 돈다

/**
 * 이 폰을 쓰는 사람들.
 *
 * 무엇이 문제였나
 * ---------------
 * 앱이 한 사람만 다뤘다. 그런데 우리가 대상으로 삼은 곳에서 스마트폰은 **집에 한 대**
 * 있는 물건이다. 할머니와 손주가 같은 폰을 쓰면, 손주가 스캔한 것이 할머니의 하루
 * 누적에 더해지고, 할머니의 혈액희석제가 손주의 판정에 걸린다. 기록만 섞이는 것이
 * 아니라 **판정이 틀린다** — 이 앱이 하는 일이 그것 하나인데.
 *
 * 어떻게 가르는가
 * ---------------
 * 윈도우 잠금화면과 같은 방식이다. 시작할 때 얼굴을 골라 자기 자리로 들어간다.
 * 자리마다 픽처키가 따로 있고, 프로필·기록·알람·제안이 전부 따로 쌓인다.
 *
 * 가르는 지점은 **저장 열쇠 하나**다. 각 스토어는 그대로 두고, 저장할 때 쓰는 이름
 * 뒤에 그 사람의 표를 붙인다:
 *
 *     snapcare-scans          ← 첫 사람
 *     snapcare-scans#p_7f3a   ← 두 번째 사람
 *
 * 스토어 다섯 개를 "사람별 지도" 로 바꾸는 방법도 있었지만, 그러면 판정·누적·추론까지
 * 전부 사람을 인자로 받게 고쳐야 한다. 저장 자리만 바꾸면 그 위의 코드는 자기가 몇
 * 명을 다루는지 알 필요가 없다.
 *
 * 첫 사람이 이름 없는 열쇠를 그대로 쓰는 이유
 * -------------------------------------------
 * 이미 앱을 쓰고 있는 사람의 자료가 `snapcare-scans` 에 있다. 전부 이름을 붙이면
 * 그 사람들은 앱을 열었을 때 자기 기록이 사라진 것을 본다. 첫 자리를 예전 이름
 * 그대로 두면 이사가 필요 없다 — 혼자 쓰는 사람에게 이 기능은 없는 것과 같다.
 */

/** 첫 사람의 표. 이 값일 때만 저장 열쇠에 표를 붙이지 않는다. */
export const PRIMARY_ID = 'me';

export interface Account {
  id: string;
  /** 이름 대신 얼굴이 신원이다 — 이 앱은 어디서도 타이핑을 요구하지 않는다. */
  emoji: string;
  /** 같은 얼굴을 고른 두 사람을 가르는 두 번째 단서. */
  color: string;
}

/** 고를 수 있는 얼굴. app/profile 의 얼굴 고르기와 같은 목록을 쓴다. */
/*
  고를 수 있는 얼굴들.

  묶은 머리(`👩`)를 뺐다. 머리채를 머리통에서 떨어뜨려 그렸더니 사람 오른쪽에 막대기가
  하나 서 있는 것으로 보였고 — 그림을 두 번 고쳐도 그 인상이 안 없어졌다 — 이 목록은
  잠금화면에서 **서로를 가려내는 유일한 단서**라 어색한 것 하나가 섞이면 그 하나를 쓰는
  사람이 자기 자리를 못 찾는다.

  일곱이면 충분하다. 이 목록이 하는 일은 한 폰을 같이 쓰는 두셋을 가르는 것이고, 그
  일에 여덟 번째가 필요하지 않다.

  `FACE_ICONS` 에서는 안 지운다. 이미 그 얼굴로 저장된 프로필이 있으면 빈칸이 되기
  때문이다 — 고를 수 없게만 하고, 이미 고른 것은 그대로 그린다.
*/
export const FACES = ['🧑', '🧒', '👶', '🧓', '👨', '👦', '👧'];

const COLORS = ['#323E2C', '#E8590C', '#2F9E44', '#9C36B5', '#0B7285', '#C2255C', '#5C7CFA', '#F08C00'];

const ROSTER = 'snapcare-accounts';
const ACTIVE = 'snapcare-active';

const FIRST: Account = { id: PRIMARY_ID, emoji: '🧑', color: COLORS[0] };

/**
 * 시연 모드의 두 사람.
 *
 * 한 명만 두면 심사에서 이 기능이 아예 안 보인다. 그리고 둘을 나이로 갈라 두면
 * **같은 것을 찍어도 판정이 다르다**는 것을 화면 두 개로 보일 수 있다 — 이 앱이
 * 라벨 판독기와 다른 지점이 정확히 거기다.
 *
 * 표가 둘 다 첫 사람(me)이 아닌 것이 요점이다. 그래서 시연 자료는 전부 `#demo_me`,
 * `#demo_kid` 로 붙어 저장되고, 실제 자료가 있는 자리에는 손이 닿지 않는다.
 */
export const DEMO_PRIMARY = 'demo_me';
export const DEMO_KID = 'demo_kid';

const DEMO_ROSTER: Account[] = [
  { id: DEMO_PRIMARY, emoji: '🧓', color: COLORS[0] },
  { id: DEMO_KID, emoji: '👧', color: COLORS[1] },
];

/** 사람마다 따로 쌓이는 저장 열쇠. 사람을 지울 때 같이 지운다. */
const SCOPED = [
  'snapcare-profile',
  'snapcare-scans',
  'snapcare-reminders',
  'snapcare-session',
  'snapcare-suggestions',
];

function ok(a: unknown): a is Account {
  const v = a as Account | null;
  return Boolean(v && typeof v.id === 'string' && typeof v.emoji === 'string');
}

/**
 * 명단도 모드마다 따로 둔다.
 *
 * 전에는 한 자리를 같이 썼다. 그래서 시연 모드를 끄고 "처음부터 시작" 을 눌러도
 * 시연 명단과 시연 기록이 그대로 남았다 — 끈 것은 **앞으로 채우지 않겠다**는 표시일
 * 뿐이고, 이미 들어간 것을 치우지는 않았기 때문이다. 모드를 나눠도 저장 자리가
 * 하나면 나눈 것이 아니다.
 *
 * 자리를 갈라 두면 지울 것이 없어진다. 표시만 바꾸면 그 모드의 자료가 통째로
 * 보이고 안 보인다. 시연을 껐다 켜도 시연 상태가 그대로 남아 있고, 실제 자료는
 * 시연이 무엇을 하든 손이 닿지 않는다.
 */
function rosterKey(): string {
  return isDemo() ? `${ROSTER}~demo` : ROSTER;
}

function activeKey(): string {
  return isDemo() ? `${ACTIVE}~demo` : ACTIVE;
}

function save(list: Account[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(rosterKey(), JSON.stringify(list));
}

/**
 * 이 폰을 쓰는 사람들. 없으면 만들어 둔다.
 *
 * 읽을 때 만든다 — "먼저 초기화 함수를 불러라" 로 두면 스토어가 저장소를 읽는 시점과
 * 그 함수가 도는 시점 중 어느 쪽이 먼저인지에 결과가 달라진다. 그런 순서 의존은
 * 조용히 틀리고 재현도 잘 안 된다 (isDemo 가 같은 이유로 같은 모양이다).
 */
export function listAccounts(): Account[] {
  if (typeof localStorage === 'undefined') return [FIRST];
  const raw = localStorage.getItem(rosterKey());
  if (raw) {
    try {
      const list = JSON.parse(raw) as unknown;
      if (Array.isArray(list) && list.length > 0 && list.every(ok)) return list as Account[];
    } catch {
      // 깨졌으면 아래에서 새로 만든다. 명단을 못 읽는 것이 앱을 못 여는 이유가 되면 안 된다.
      console.warn('[accounts] 명단을 읽지 못해 새로 만든다');
    }
  }
  const seeded = isDemo() ? DEMO_ROSTER : [FIRST];
  save(seeded);
  return seeded;
}

/** 지금 쓰고 있는 사람. 명단에 없는 표가 남아 있으면 첫 사람으로 돌아간다. */
export function activeAccountId(): string {
  if (typeof localStorage === 'undefined') return PRIMARY_ID;
  const list = listAccounts();
  const id = localStorage.getItem(activeKey());
  if (id && list.some((a) => a.id === id)) return id;
  return list[0].id;
}

export function activeAccount(): Account {
  const id = activeAccountId();
  return listAccounts().find((a) => a.id === id) ?? FIRST;
}

/** 저장 열쇠에 사람 표를 붙인다. 첫 사람은 붙이지 않는다 (위 설명 참고). */
export function scopedKey(base: string, id: string = activeAccountId()): string {
  return id === PRIMARY_ID ? base : `${base}#${id}`;
}

/**
 * 사람별 저장소. persist 의 `storage` 로 넘긴다.
 *
 * 서버에서 그릴 때는 아무것도 하지 않는다 — 그쪽엔 저장소가 없다. 여기서 던지면
 * 스토어를 만드는 것 자체가 실패한다.
 */
export const accountStorage = createJSONStorage(() => ({
  getItem: (k: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(scopedKey(k))),
  setItem: (k: string, v: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(scopedKey(k), v);
  },
  removeItem: (k: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(scopedKey(k));
  },
}));

function newId(): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `p_${rand}`;
}

/** 아직 아무도 안 고른 얼굴. 명단에서 서로를 가려내는 것이 얼굴뿐이라 겹치면 안 된다. */
export function freeFaces(): string[] {
  const taken = new Set(listAccounts().map((a) => a.emoji));
  return FACES.filter((f) => !taken.has(f));
}

/** 사람을 더한다. 얼굴을 안 주면 남은 것 중 첫 번째를 준다. */
export function addAccount(emoji?: string): Account {
  const list = listAccounts();
  const face = emoji ?? freeFaces()[0] ?? FACES[list.length % FACES.length];
  const acc: Account = { id: newId(), emoji: face, color: COLORS[list.length % COLORS.length] };
  save([...list, acc]);
  return acc;
}

/**
 * 사람을 지운다. 그 사람의 자료도 같이 지운다.
 *
 * 쓰고 있는 사람과 마지막 한 명은 지우지 않는다. 앞은 발밑을 파는 것이고, 뒤는
 * 아무도 없는 폰이 되어 다음에 열었을 때 무엇을 보여줘야 할지가 없어진다.
 */
export function removeAccount(id: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  const list = listAccounts();
  if (list.length <= 1) return false;
  if (id === activeAccountId()) return false;
  if (!list.some((a) => a.id === id)) return false;
  save(list.filter((a) => a.id !== id));
  SCOPED.forEach((k) => localStorage.removeItem(scopedKey(k, id)));
  return true;
}

/** 지금 쓰는 사람의 얼굴을 바꾼다 (프로필 화면에서 얼굴을 고를 때 같이 불린다). */
export function setActiveFace(emoji: string): void {
  const id = activeAccountId();
  save(listAccounts().map((a) => (a.id === id ? { ...a, emoji } : a)));
}

/**
 * 다른 사람으로 넘어간다.
 *
 * 스토어를 제자리에서 다시 읽는 방법도 있다. 하지만 새 자리에 저장된 것이 **없는**
 * 스토어는 그대로 앞사람의 내용을 들고 있게 된다 — 남의 알레르기와 남의 처방이 내
 * 화면에 남는 실패고, 화면에는 아무 표시도 나지 않는다. 통째로 다시 읽으면 그런
 * 경우가 생길 자리가 없다.
 *
 * 첫 화면(/)으로 보내는 이유: 그 화면이 이미 온보딩·로그인·홈을 가른다. 새로 더한
 * 사람은 안내부터 보고, 쓰던 사람은 자기 픽처키 화면으로 간다.
 */
export function switchTo(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(activeKey(), id);
  location.href = '/';
}

/**
 * 시연 기록의 표. 사람이 찍은 기록은 이 값이 될 수 없다 — 저 넷은 시드에 박아 둔
 * 문자열이고 실제 기록의 표는 그때그때 만들어진다. 그래서 이 표만 들어 있는
 * 저장분은 사람이 만든 것이 아니라고 단정할 수 있다.
 */
const SEED_IDS = new Set(['s1', 's2', 's3', 's4', 'k1', 'k2']);

function onlySeedScans(raw: string): boolean {
  try {
    const list = (JSON.parse(raw) as { state?: { scans?: { id?: string }[] } }).state?.scans;
    return Array.isArray(list) && list.length > 0 && list.every((s) => SEED_IDS.has(s?.id ?? ''));
  } catch {
    return false;
  }
}

/**
 * 앞선 판이 실제 자리에 남긴 시연 자국을 한 번 치운다.
 *
 * 짧게 배포됐던 판에서는 시연 자료가 실제 자료와 같은 자리에 저장됐다. 그 상태로
 * "처음부터 시작" 을 눌러도 시연 기록이 그대로 남는데, 바로 그것을 고치는 변경이므로
 * 자국도 같이 거둬야 고쳐진 것이 된다.
 *
 * 두 가지를 알아본다. 어느 쪽도 사람이 만들 수 없는 모양이라, 실제 자료를 지울 일은
 * 없다:
 *
 *   - 표가 `kid` 인 사람 — 그 판의 시연 시드 말고는 만들어지지 않는다 (지금은 얼굴을
 *     고르면 `p_…` 가 붙는다).
 *   - 시드 기록만 들어 있는 저장분 — 표가 s1..s4 인 기록은 사람이 만들 수 없다.
 *     프로필도 같이 거둔다. 시연 프로필은 "아직 아무 조건도 없을 때" 만 들어가므로,
 *     시드 기록이 있다는 것은 그 프로필도 시연이 넣은 것이라는 뜻이다. 안 거두면
 *     처음부터 시작해도 당뇨에 혈액희석제를 쓰는 사람으로 판정된다.
 *
 * 서버 사본은 SYNC_VERSION 을 올려 버린다 — 지우지 않으면 다음에 받아올 때 시연
 * 자료가 실제 자리로 되돌아온다.
 */
function clearOldDemoResidue(): void {
  if (typeof localStorage === 'undefined') return;

  const roster = localStorage.getItem(ROSTER);
  if (roster?.includes('"id":"kid"')) {
    SCOPED.forEach((k) => localStorage.removeItem(`${k}#kid`));
    localStorage.removeItem(ROSTER);
    localStorage.removeItem(ACTIVE);
  } else if (roster?.includes('"id":"demo_')) {
    // 시연 명단이 서버 동기화를 타고 실제 명단에 붙었던 판이 있다. 그 자리들은
    // 시연 쪽(`snapcare-accounts~demo`)에 그대로 있으므로 여기서는 떼어내기만 한다.
    try {
      const list = (JSON.parse(roster) as Account[]).filter((a) => !a.id.startsWith('demo_'));
      if (list.length > 0) localStorage.setItem(ROSTER, JSON.stringify(list));
      else localStorage.removeItem(ROSTER);
    } catch {
      localStorage.removeItem(ROSTER);
    }
  }

  const scans = localStorage.getItem('snapcare-scans');
  if (scans && onlySeedScans(scans)) {
    localStorage.removeItem('snapcare-scans');
    localStorage.removeItem('snapcare-profile');
  }
}

/**
 * 시연 명단에 쌓인 **시험용 사람들을 한 번 쓸어낸다.**
 *
 * 시연 자료를 정리할 때 서버 사본과 실제 명단은 치웠는데, 시연 명단(`~demo`)은 기기
 * 안에만 있어서 손이 닿지 않았다. 그래서 이미 만져 본 기기에서는 얼굴 목록에 이름
 * 없는 사람이 아홉까지 늘어난 채로 남았다 — 심사장에서 얼굴을 고르는 화면이 그렇게
 * 보이면 이 기능이 뜻하는 바가 안 보인다.
 *
 * **한 번만 한다.** 시연 중에 사람을 더해 보이는 것은 정상적인 사용이고, 그것을 열
 * 때마다 지우면 방금 한 일이 조용히 취소된다. 표시를 남겨 두 번째부터는 손대지 않는다.
 */
const DEMO_SWEPT = 'snapcare-demo-swept';

export function sweepDemoStrays(): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(DEMO_SWEPT)) return;
  // 쓸 것이 없어도 표시부터 남긴다 — 이 함수가 두 번 도는 일이 없어야 한다.
  localStorage.setItem(DEMO_SWEPT, '1');

  const raw = localStorage.getItem(`${ROSTER}~demo`);
  if (!raw) return;
  try {
    const list = JSON.parse(raw) as Account[];
    const keep = new Set<string>([DEMO_PRIMARY, DEMO_KID]);
    const strays = list.filter((a) => ok(a) && !keep.has(a.id));
    if (strays.length === 0) return;
    // 사람만 지우고 자료를 남기면 그 자료는 아무도 못 여는 채로 남는다.
    strays.forEach((a) => SCOPED.forEach((k) => localStorage.removeItem(`${k}#${a.id}`)));
    localStorage.setItem(`${ROSTER}~demo`, JSON.stringify(DEMO_ROSTER));
  } catch {
    localStorage.removeItem(`${ROSTER}~demo`);
  }
}

// 스토어가 저장소를 읽기 전에 끝나야 한다. 이 파일은 스토어들이 먼저 불러들이므로
// 여기(모듈이 읽히는 시점)가 그 조건을 만족하는 유일하게 확실한 자리다.
clearOldDemoResidue();
sweepDemoStrays();

/**
 * 서버에 있던 명단을 되살린다 (모르는 사람만 더한다).
 *
 * 브라우저 저장소만 지워지고 기기 열쇠는 남는 경우가 있다. 그때 서버의 자료는 그대로
 * 있는데 **누가 있었는지**를 모르면 꺼낼 방법이 없다. 지운 사람이 되살아나지 않게,
 * 사람을 지울 때는 서버 사본에서도 같이 지운다 (lib/snapcare/sync.ts 의 forget).
 */
export function mergeRoster(remote: Account[]): void {
  if (typeof localStorage === 'undefined') return;
  const list = listAccounts();
  const have = new Set(list.map((a) => a.id));
  // 시연 표는 실제 명단에 들어오지 않는다. 지금은 시연이 서버에 오가지 않으므로
  // 올 일이 없지만, 한 번 샜을 때의 증상이 나빴다 — 실제 모드로 돌아와도 받아올
  // 때마다 시연 두 사람이 명단에 다시 붙었고, 지워도 다음 열기에 또 나타났다.
  const add = remote.filter((a) => ok(a) && !have.has(a.id) && !a.id.startsWith('demo_'));
  if (add.length === 0) return;
  save([...list, ...add]);
}
