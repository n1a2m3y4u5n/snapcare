'use client';

import { useEffect, useRef, useState } from 'react';

import {
  activeAccountId, addAccount, freeFaces, listAccounts, switchTo, type Account,
} from '@/lib/snapcare/accounts';
import { FaceIcon, PersonIcon } from '@/components/icons';
import { sayable } from '@/components/sc/Say';
import { useIsClient } from '@/lib/hooks';

/**
 * 홈 오른쪽 위의 얼굴, 그리고 누르면 열리는 명단.
 *
 * 왜 홈에 있어야 하는가
 * ---------------------
 * 사람을 바꾸는 길이 설정 안의 버튼 하나뿐이었다. 이 폰을 어머니와 딸이 같이 쓰는
 * 것이 이 기능의 전제인데, 그 둘이 하루에도 몇 번 오갈 길을 **두 단계 안쪽**에
 * 두었다. 그리고 그것보다 나쁜 것이 있었다 — 지금 누구 화면인지가 홈에 안 적혀
 * 있어서, 어머니 계정으로 딸의 과자를 찍고 어머니 기준의 판정을 받아도 아무도 모른다.
 *
 * 그래서 얼굴이 늘 보인다. 누르기 전에도 그 자리가 답하는 물음이 "지금 누구인가"다.
 *
 * 왜 페이지가 아니라 시트인가
 * ---------------------------
 * 사람을 바꾸는 것은 목적지가 아니라 **중간 동작**이다. 화면을 넘기면 돌아올 길이
 * 필요해지고, 돌아올 길이 필요해지면 그 길을 못 찾는 사람이 생긴다. 시트는 바깥을
 * 누르면 닫히고, 바깥은 화면 전부다.
 *
 * 바꿀 때 열쇠를 묻는 것은 **여기서 하지 않는다**
 * -----------------------------------------------
 * `switchTo` 가 활성 계정을 바꾸고 `/` 로 되돌리는데, 세션은 사람마다 갈려 있고
 * `authed` 는 저장되지 않는다(`stores/session.ts`). 그래서 바뀐 사람의 그림열쇠
 * 화면이 그대로 뜬다 — 이 파일이 따로 물을 필요가 없고, 물으면 두 곳이 같은 것을
 * 지키게 되어 언젠가 한쪽만 고쳐진다.
 *
 * 여기서 확인해 둘 것은 그 성질이 **유지되는지**이고, 그것은 시험이 본다
 * (`lib/snapcare/accounts.test.ts`).
 */
export function WhoSheet() {
  const [open, setOpen] = useState(false);
  const isClient = useIsClient();
  const people: Account[] = isClient ? listAccounts() : [];
  const meId = isClient ? activeAccountId() : '';
  const me = people.find((p) => p.id === meId);
  const panel = useRef<HTMLDivElement | null>(null);

  // 바깥을 누르면 닫힌다. 닫는 버튼을 따로 두지 않는 이유는, 이 시트에서 사람이
  // 할 수 있는 일이 셋뿐이라 네 번째 버튼이 그 셋을 가리기 때문이다.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  function add() {
    const free = freeFaces();
    if (free.length === 0) return;
    const acc = addAccount(free[0]);
    switchTo(acc.id);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Switch person"
        aria-expanded={open}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl shadow-sm active:scale-95 transition-transform"
        style={{ background: me?.color ?? 'var(--color-sc-bg)' }}
        {...sayable('This is who the app is answering for. Tap to switch to another person.')}
      >
        {me ? <FaceIcon face={me.emoji} /> : <PersonIcon />}
      </button>

      {open && (
        <div
          ref={panel}
          role="menu"
          className="absolute right-0 top-[52px] z-30 w-56 rounded-2xl bg-white p-2 shadow-lg"
          style={{ outline: '1px solid var(--color-sc-bg)' }}
        >
          {people.map((p) => {
            const on = p.id === meId;
            return (
              <button
                key={p.id}
                role="menuitem"
                onClick={() => { if (on) setOpen(false); else switchTo(p.id); }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:scale-[0.98] transition-transform"
                style={{ background: on ? 'var(--color-sc-bg)' : 'transparent' }}
                {...sayable(on ? 'This is you.' : 'Switch to this person. You will be asked for their picture key.')}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                      style={{ background: p.color, opacity: on ? 1 : 0.55 }}>
                  <FaceIcon face={p.emoji} />
                </span>
                {/*
                  남의 나이도 조건도 여기 안 쓴다. 사람마다 저장 자리가 갈려 있는
                  것이 이 기능의 요점이고, 그 벽을 이 목록이 넘으면 벽이 없는 것이다.
                  그래서 서로를 가려내는 단서는 얼굴 하나뿐이고, 그래서 사람을 더할
                  때 이미 쓰는 얼굴은 안 나온다(`freeFaces`).
                */}
                <span className="flex-1 text-sm font-semibold"
                      style={{ color: on ? 'var(--color-sc-ink)' : 'var(--color-sc-muted)' }}>
                  {on ? 'You' : 'Switch'}
                </span>
              </button>
            );
          })}

          <button
            role="menuitem"
            onClick={add}
            disabled={freeFaces().length === 0}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left disabled:opacity-40"
            {...sayable('Add another person to this phone. They get their own picture key and their own history.')}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                  style={{ background: 'var(--color-sc-bg)', color: 'var(--color-sc-primary)' }}>
              +
            </span>
            <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-primary)' }}>
              Add a person
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
