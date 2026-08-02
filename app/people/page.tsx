'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { sayable, ask, Speakable } from '@/components/sc/Say';
import { useProfile } from '@/stores/profile';
import { useIsClient } from '@/lib/hooks';
import { forget } from '@/lib/snapcare/sync';
import {
  activeAccountId, addAccount, freeFaces, listAccounts, removeAccount, switchTo,
  type Account,
} from '@/lib/snapcare/accounts';

/**
 * 이 폰을 쓰는 사람들.
 *
 * 왜 얼굴만 보이는가
 * ------------------
 * 남의 나이와 조건은 여기서 읽을 수 없다 — 사람마다 저장 자리가 갈려 있고, 그것이
 * 이 기능의 요점이다. 그래서 목록은 얼굴과 색만 보여준다. 이 화면에서 서로를
 * 가려내는 단서가 얼굴 하나뿐이므로, 사람을 더할 때 **이미 쓰는 얼굴은 안 보인다.**
 *
 * 왜 지우기가 두 번 누르기인가
 * ----------------------------
 * 지우면 그 사람의 알레르기와 처방 기록이 같이 사라진다. 되돌릴 수 없는 일인데 이
 * 앱의 사용자는 "정말 지울까요?" 를 읽을 수 없다. 그래서 묻지 않고 **보인다** —
 * 한 번 누르면 그 줄이 빨갛게 서고, 그 상태에서 다시 눌러야 지워진다. 다른 곳을
 * 건드리면 풀린다.
 */
export default function PeoplePage() {
  const router = useRouter();
  const profile = useProfile((s) => s.profile);
  const [adding, setAdding] = useState(false);
  /** 지우기 직전인 사람. 한 번 더 눌러야 실제로 지워진다. */
  const [armed, setArmed] = useState<string | null>(null);

  /*
    명단은 브라우저에만 있다. 그릴 때 읽으면 서버가 그린 화면과 어긋나므로 붙은
    뒤에만 읽는다 — 예전에는 이펙트에서 setState 로 했는데, 그리자마자 한 번 더
    그리게 되고 React 19 규칙에도 걸린다.

    지운 뒤에 다시 읽는 장치는 따로 두지 않는다. 그릴 때마다 읽고, 지우기가 끝나면
    아래 `setArmed(null)` 이 이미 다시 그리게 한다. localStorage 를 몇 줄 읽는 일이라
    캐시할 것도 없다.
  */
  const isClient = useIsClient();
  const people: Account[] = isClient ? listAccounts() : [];
  const meId = isClient ? activeAccountId() : '';

  function add(emoji: string) {
    const acc = addAccount(emoji);
    // 더한 사람으로 바로 넘어간다. 더한 사람은 대개 그 자리에서 설정까지 해 주려는
    // 것인데, 목록으로 돌아오면 "이제 저 얼굴을 눌러라" 를 한 번 더 안내해야 한다.
    switchTo(acc.id);
  }

  function drop(id: string) {
    if (armed !== id) {
      setArmed(id);
      return;
    }
    if (removeAccount(id)) {
      // 서버 사본에서도 지운다. 안 그러면 다음에 받아올 때 명단이 되살아난다 —
      // 지웠는데 다시 나타나는 것은 안 지워진 것보다 나쁘다.
      void forget(id);
    }
    setArmed(null);
  }

  const free = freeFaces();

  return (
    <MobileScreen tab="settings">
      <div className="px-5 pt-14 pb-8" onClickCapture={(e) => {
        // 다른 곳을 건드리면 지우기 상태가 풀린다.
        if (armed && !(e.target as Element).closest('[data-arm]')) setArmed(null);
      }}>
        <button onClick={() => router.push('/settings')} className="text-sm font-semibold"
                style={{ color: 'var(--color-sc-primary)' }}>
          ‹ Back
        </button>

        <h1 className="mt-3 text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask('Who uses this phone. Each person has their own picture key and their own history.')}>
          Who uses this phone
        </h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          Each person has their own key, their own conditions, their own history
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {people.map((p) => {
            const on = p.id === meId;
            const danger = armed === p.id;
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"
                style={{ outline: danger ? '2px solid var(--color-avoid)'
                       : on ? '2px solid var(--color-sc-primary)' : '2px solid transparent' }}
              >
                <button
                  onClick={() => { if (!on) switchTo(p.id); }}
                  className="flex flex-1 items-center gap-3 text-left"
                  aria-label={on ? `You, ${p.emoji}` : `Switch to ${p.emoji}`}
                  {...sayable(on ? 'This is you.' : 'Tap to switch to this person.')}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                        style={{ background: p.color, opacity: on ? 1 : 0.55 }}>
                    {p.emoji}
                  </span>
                  <span className="flex-1">
                    {/* 지금 사람만 나이와 조건을 보여줄 수 있다 — 남의 자료는 이 자리에서
                        읽히지 않는 것이 맞다. */}
                    <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                      {on ? 'You' : 'Another person'}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                      {on
                        ? `${profile.role}${profile.conditionIds.length > 0 ? ` · ${profile.conditionIds.length}` : ''}`
                        : 'Tap to switch'}
                    </span>
                  </span>
                </button>

                {/* 쓰고 있는 사람과 마지막 한 명은 지울 수 없다 — 버튼 자체를 안 보인다. */}
                {!on && people.length > 1 && (
                  <button
                    data-arm
                    onClick={() => drop(p.id)}
                    aria-label={danger ? 'Tap again to delete' : 'Delete this person'}
                    {...sayable(danger
                      ? 'Tap again to delete this person and everything they saved.'
                      : 'Delete this person.')}
                    className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-lg"
                    style={{
                      background: danger ? 'var(--color-avoid)' : 'var(--color-sc-bg)',
                      color: danger ? '#fff' : 'var(--color-sc-muted)',
                    }}
                  >
                    <span>🗑</span>
                    {danger && <span className="text-sm font-bold">✓</span>}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/*
          더하기.

          얼굴 고르기를 바로 펼친다. "이름을 입력하세요" 가 없는 앱이라 사람을 만드는
          일 전체가 얼굴 하나 고르는 것이고, 그러면 단계를 나눌 이유가 없다.
        */}
        {free.length > 0 && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left"
            style={{ border: '2px dashed var(--color-sc-line)' }}
            {...sayable('Add a person who shares this phone.')}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                  style={{ background: 'var(--color-sc-line)' }}>＋</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
              Add a person
            </span>
          </button>
        )}

        {adding && (
          <div className="mt-4">
            <Speakable text={'Pick a picture for the new person.'} className="text-[11px] font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">PICK A PICTURE</span>
        </Speakable>
            <div className="mt-2 flex flex-wrap gap-2">
              {free.map((f) => (
                <button
                  key={f}
                  onClick={() => add(f)}
                  aria-label={`New person ${f}`}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm
                             active:scale-95 transition-transform"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileScreen>
  );
}
