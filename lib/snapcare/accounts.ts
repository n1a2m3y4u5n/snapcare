'use client';

import { createJSONStorage } from 'zustand/middleware';
import { isDemo, setDemo } from './demo.ts';   // 확장자 필수 — 시험이 --experimental-strip-types 로 돈다

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
export const FACES = ['🧑', '🧒', '👶', '🧓', '👩', '👨', '👦', '👧'];

const COLORS = ['#2F6BF6', '#E8590C', '#2F9E44', '#9C36B5', '#0B7285', '#C2255C', '#5C7CFA', '#F08C00'];

const ROSTER = 'snapcare-accounts';
const ACTIVE = 'snapcare-active';

const FIRST: Account = { id: PRIMARY_ID, emoji: '🧑', color: COLORS[0] };

/**
 * 시연 모드의 두 사람.
 *
 * 한 명만 두면 심사에서 이 기능이 아예 안 보인다. 그리고 둘을 나이로 갈라 두면
 * **같은 것을 찍어도 판정이 다르다**는 것을 화면 두 개로 보일 수 있다 — 이 앱이
 * 라벨 판독기와 다른 지점이 정확히 거기다.
 */
const DEMO_ROSTER: Account[] = [
  { id: PRIMARY_ID, emoji: '🧓', color: COLORS[0] },
  { id: 'kid', emoji: '👧', color: COLORS[1] },
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

/** 만들어진 그대로인가 — 사람을 더한 적도, 얼굴을 바꾼 적도 없는 명단. */
function pristine(list: Account[]): boolean {
  return list.length === 1 && list[0].id === PRIMARY_ID && list[0].emoji === FIRST.emoji;
}

function save(list: Account[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ROSTER, JSON.stringify(list));
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
  const raw = localStorage.getItem(ROSTER);
  if (raw) {
    try {
      const list = JSON.parse(raw) as unknown;
      if (Array.isArray(list) && list.length > 0 && list.every(ok)) {
        // 시연 모드인데 아직 아무도 손대지 않은 기본 명단이면 시연용 두 사람으로 바꾼다.
        //
        // 없으면 이런 일이 생긴다: 앱을 한 번 그냥 열면 그때 기본 명단이 만들어지고,
        // 그다음에 ?demo=1 을 붙여도 "명단이 이미 있다" 며 한 명인 채로 남는다.
        // 심사장에서 앱을 먼저 켜 보는 것은 당연한 순서인데, 그 순서로는 이 기능이
        // 아예 안 보인다.
        if (isDemo() && pristine(list as Account[])) {
          save(DEMO_ROSTER);
          return DEMO_ROSTER;
        }
        return list as Account[];
      }
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
  const id = localStorage.getItem(ACTIVE);
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
  localStorage.setItem(ACTIVE, id);
  location.href = '/';
}

/**
 * 시연 모드를 끌 때, 시연이 만든 두 번째 사람을 거둔다.
 *
 * 안 하면 깨끗한 상태로 돌아가겠다고 눌렀는데 얼굴 두 개가 그대로 남는다. 현지
 * 평가에서 어르신이 처음 여는 화면에 자기가 모르는 사람이 있으면, 우리가 재려던
 * 것("이 사람이 이 화면을 이해하는가")이 그 순간 성립하지 않는다.
 *
 * **시연이 만든 그대로일 때만** 거둔다. 사람을 더했거나 얼굴을 바꿨다면 그것은
 * 사용자가 한 일이므로 건드리지 않는다.
 */
export function leaveDemo(): void {
  if (typeof localStorage === 'undefined') return;
  // 표시를 **먼저** 끈다. 이 아래 listAccounts 가 시연 모드를 보면 방금 거둔 명단을
  // 그 자리에서 다시 만든다. 부르는 쪽에 "끄고 나서 불러라" 를 맡기면 그 순서가
  // 언젠가 뒤집히고, 뒤집혀도 화면에는 아무 표시가 안 난다.
  setDemo(false);
  const list = listAccounts();
  const same = list.length === DEMO_ROSTER.length
    && list.every((a, i) => a.id === DEMO_ROSTER[i].id && a.emoji === DEMO_ROSTER[i].emoji);
  if (!same) return;
  DEMO_ROSTER.slice(1).forEach((a) => SCOPED.forEach((k) => localStorage.removeItem(scopedKey(k, a.id))));
  localStorage.removeItem(ACTIVE);
  save([FIRST]);
}

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
  const add = remote.filter((a) => ok(a) && !have.has(a.id));
  if (add.length === 0) return;
  save([...list, ...add]);
}
