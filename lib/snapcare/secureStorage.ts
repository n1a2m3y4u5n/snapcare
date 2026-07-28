/**
 * zustand persist 가 쓰는 저장소를, 열쇠가 있으면 암호화하는 것으로 감싼다.
 *
 * 세 가지를 지켜야 한다.
 *
 * 1. **열쇠가 없어도 앱이 돌아야 한다.** 화면 잠금을 안 걸어둔 폰은 패스키를 만들 수
 *    없고, 그런 기기가 우리 대상층에 가장 많다. 그때는 지금까지처럼 평문으로 쓴다.
 *    보호 수준이 낮아지는 것이지 앱이 멈추는 것이 아니다.
 *
 * 2. **이미 쓰던 사람의 자료를 지우면 안 된다.** 지금 저장돼 있는 것은 전부 평문이다.
 *    암호화를 켠 뒤 복호화에 실패하면 "손상됐다" 가 아니라 "아직 평문이다" 로 읽고
 *    그대로 돌려준다. 다음에 저장될 때 암호문이 된다.
 *
 * 3. **암호문을 평문으로 착각하면 안 된다.** 그래서 앞에 표시를 붙인다. 표시가 있는데
 *    복호화에 실패하면 그것은 진짜 실패다(열쇠가 다르거나 변조됐다) — 이때 평문으로
 *    되돌리면 쓰레기를 자료로 넘기게 된다.
 */
// 확장자를 적는 이유: 시험이 `node --experimental-strip-types` 로 도는데, 값 import 는
// 확장자가 없으면 모듈을 못 찾는다.
import { open, seal } from './vault.ts';

/** 암호문 앞에 붙는 표시. 이게 있으면 평문으로 오해하지 않는다. */
const TAG = 'scv1:';

let key: CryptoKey | null = null;

/** 잠금을 연 뒤 열쇠를 건넨다. 이후 저장분은 암호화된다. */
export function useKey(k: CryptoKey | null): void {
  key = k;
}

export function hasKey(): boolean {
  return key !== null;
}

export const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    const raw = localStorage.getItem(name);
    if (raw === null) return null;

    if (!raw.startsWith(TAG)) {
      // 아직 암호화되지 않은 저장분. 예전에 쓰던 자료이거나, 열쇠 없이 쓰던 기기다.
      return raw;
    }
    if (!key) {
      // 암호문인데 열쇠가 없다 — 잠긴 상태다. 없는 것으로 취급해야 앱이 빈 화면으로
      // 시작한다. 여기서 raw 를 돌려주면 zustand 가 암호문을 파싱하려다 터진다.
      return null;
    }
    return await open(key, raw.slice(TAG.length));
  },

  async setItem(name: string, value: string): Promise<void> {
    if (!key) {
      localStorage.setItem(name, value);
      return;
    }
    localStorage.setItem(name, TAG + (await seal(key, value)));
  },

  async removeItem(name: string): Promise<void> {
    localStorage.removeItem(name);
  },
};

/**
 * 평문으로 남아 있던 저장분을 암호문으로 옮긴다.
 *
 * 잠금을 처음 만든 직후에 부른다. 이걸 안 하면 이미 있던 자료는 영영 평문으로 남는다 —
 * 정작 지켜야 할 것이 옛 자료인데.
 */
export async function sealExisting(names: string[]): Promise<number> {
  if (!key) return 0;
  let moved = 0;
  for (const name of names) {
    const raw = localStorage.getItem(name);
    if (raw === null || raw.startsWith(TAG)) continue;
    localStorage.setItem(name, TAG + (await seal(key, raw)));
    moved += 1;
  }
  return moved;
}
