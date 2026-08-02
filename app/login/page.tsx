'use client';

import { sayable, ask, Speakable } from '@/components/sc/Say';
import { ReadScreen } from '@/components/sc/ReadScreen';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { useSession } from '@/stores/session';
import { useProfile } from '@/stores/profile';
import { seedDemoIfEmpty } from '@/stores/scans';
import { setDemo } from '@/lib/snapcare/demo';
import { useIsClient, useIsDemo } from '@/lib/hooks';
import { activeAccountId, listAccounts, switchTo, type Account } from '@/lib/snapcare/accounts';

/** 픽처키 로그인 — 텍스트/숫자 없이 픽토그램 4개 순서 (bcrypt로 실제 설정·검증). */
const TILES = ['☀️', '🌙', '💧', '🔥', '🌸', '🐦', '🏠', '⛰️', '🛣️', '🚪', '🔔', '🔑'];
const KEY_LEN = 4;
/** 시연용 픽처키와 그 해시. 시연 모드에서만 쓴다. */
const DEMO_KEY = [0, 1, 2, 3];
const DEMO_HASH = '$2b$10$0Xrx5jWlNoZS/sYknOwOn.BF1ASI3ZzR..RmGPCWMHFvpO08ATBJm';

export default function LoginPage() {
  const router = useRouter();
  const { pinHash, setPinHash, setAuthed } = useSession();
  const demo = useIsDemo();
  // 시연 모드면 알려진 키를 미리 넣어 둔다. 그래야 심사 중에 그림을 새로 정하는
  // 단계 없이 바로 들어갈 수 있다. 실제 사용자에게는 넣지 않는다 — 정한 적 없는
  // 그림을 맞히라는 화면이 되기 때문이다.
  useEffect(() => {
    if (!demo) return;
    if (!pinHash) setPinHash(DEMO_HASH);
    // 시연 자료도 여기서 확정한다. 원래는 서버 응답을 받은 뒤에 넣었는데 두 가지가
    // 어긋났다:
    //
    //  - 아래 next 가 그보다 먼저 계산되어, 시연 모드인데도 프로필 설정 화면으로
    //    보내졌다 — 그 화면을 건너뛰려고 만든 것이 정작 작동하지 않았다.
    //  - 일반 모드로 한 번 들어갔다 나오면 서버에 빈 자료가 올라가고, 그다음부터는
    //    "서버에 자료가 있다" 로 판단해 시연 기록이 영영 안 들어왔다.
    //
    // 로그인은 두 모드 모두 반드시 지나는 자리라 여기서 정하는 것이 확실하다.
    seedDemoIfEmpty();
  }, [demo, pinHash, setPinHash]);

  const setup = !pinHash; // 최초면 설정 모드
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  // 프로필을 한 번도 확인하지 않았으면 홈이 아니라 프로필로 보낸다.
  //
  // 여기가 아니면 물어볼 자리가 없다: /profile 로 가는 링크는 설정 탭 안의 버튼
  // 하나뿐이라, 찾아 들어가지 않은 사람은 '어른, 조건 없음' 이라는 기본값으로
  // 계속 쓰게 된다. 그런데 온보딩은 나이에서 기준이 나온다고 약속한다.
  const confirmed = useProfile((s) => s.confirmed);
  const next = confirmed ? '/home' : '/profile?setup=1';

  /*
   * 이 폰을 쓰는 사람들.
   *
   * 잠금화면에 둔 이유: 따로 "누구세요" 화면을 만들면 화면이 하나 더 늘고, 잘못 골랐을
   * 때 되돌아갈 길이 필요해진다. 윈도우 잠금화면이 사람 목록과 비밀번호를 한 화면에
   * 두는 것과 같은 이유다 — 얼굴이 계속 보이므로 "내가 아니다" 를 언제든 고칠 수 있다.
   *
   * 혼자 쓰면 아무것도 안 보인다. 사람이 한 명일 때 고르라고 하는 것은 없는 선택을
   * 시키는 것이고, 지금까지 쓰던 사람에게는 화면이 그대로여야 한다.
   *
   * 그릴 때 읽지 않고 붙은 뒤에 읽는다 — 명단은 브라우저에만 있어서, 서버가 그린
   * 화면과 어긋난다.
   */
  // 붙은 뒤에만 읽는다. 이펙트에서 setState 로 하던 것을 바꿨다 — 결과는 같고,
  // 그리자마자 한 번 더 그리지 않는다.
  const isClient = useIsClient();
  const people: Account[] = isClient ? listAccounts() : [];
  const meId = isClient ? activeAccountId() : '';

  async function complete(seq: number[]) {
    setBusy(true);
    const keyStr = seq.join(',');
    if (setup) {
      const hash = await bcrypt.hash(keyStr, 10);
      setPinHash(hash);
      setAuthed(true);
      router.replace(next);
    } else {
      const ok = await bcrypt.compare(keyStr, pinHash!);
      if (ok) {
        setAuthed(true);
        router.replace(next);
      } else {
        setError(true);
        setPicked([]);
        setBusy(false);
      }
    }
  }

  function tap(idx: number) {
    if (busy) return;
    setError(false);
    const next = [...picked, idx];
    setPicked(next);
    if (next.length >= KEY_LEN) complete(next);
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: 'var(--color-sc-bg)' }}>
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col items-center px-6 pt-10">
        {people.length > 1 && (
          <>
            <Speakable text="Who are you? Tap your picture."
                       className="flex items-center gap-2 text-[11px] font-bold tracking-wide"
                       style={{ color: 'var(--color-sc-muted)' }}>
              <span>WHO ARE YOU?</span>
            </Speakable>
            <div className="mt-3 mb-6 flex flex-wrap justify-center gap-4">
              {people.map((p) => {
                const on = p.id === meId;
                return (
                  <button
                    key={p.id}
                    onClick={() => { if (!on) switchTo(p.id); }}
                    aria-pressed={on}
                    aria-label={`Person ${p.emoji}`}
                    className="flex h-16 w-16 items-center justify-center rounded-full text-3xl
                               transition-transform active:scale-95"
                    style={{
                      background: p.color,
                      // 고른 사람만 또렷하다. 테두리만으로 가르면 무엇이 지금 것인지가
                      // 색 하나에 걸리는데, 이 앱은 시력이 떨어지는 사람이 쓴다.
                      opacity: on ? 1 : 0.4,
                      outline: on ? '3px solid var(--color-sc-primary)' : '3px solid transparent',
                      outlineOffset: '3px',
                    }}
                  >
                    {p.emoji}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <div className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: 'color-mix(in srgb, var(--color-sc-primary) 12%, white)' }}>🔒</div>
        <h1 className="mt-4 text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask(setup ? 'Create your picture key. Tap four pictures in an order you will remember.' : 'Enter your picture key. Tap your four pictures, in the order you chose.')}>
          {setup ? 'Create your picture key' : 'Enter your picture key'}
        </h1>
        <p className="mt-1 text-xs" style={{ color: error ? 'var(--color-avoid)' : 'var(--color-sc-muted)' }}>
          {/* 로그인은 앱에 들어오는 유일한 문이다. 여기서 막히면 그 뒤가 전부 없는 것과 같다. */}
          <span {...sayable(error ? 'Wrong key. Try again.'
            : setup ? 'Choose four pictures in an order you will remember. Tap them one by one.'
            : 'Tap your four pictures, in the order you chose.')}>
            {error ? 'Wrong key — try again' : setup ? 'Tap 4 pictures in an order you’ll remember' : 'Tap your 4 pictures in order'}
          </span>
        </p>

        {/*
          채워진 슬롯에 고른 그림을 그대로 보여준다.
          익명의 점이면 "무엇을 눌렀는지", "지우면 무엇이 사라지는지"를 알 수 없다 —
          삭제 버튼이 직관적이지 않다는 지적의 실제 원인이 여기였다.
          마지막 칸은 다음에 지워질 대상이라 테두리로 강조한다.
        */}
        <div className="mt-5 flex gap-3">
          {Array.from({ length: KEY_LEN }).map((_, k) => {
            const filled = k < picked.length;
            const isLast = filled && k === picked.length - 1;
            return (
              <span
                key={k}
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl transition-transform"
                style={{
                  background: filled ? 'white' : 'transparent',
                  border: `2px ${filled ? 'solid' : 'dashed'} ${
                    error ? 'var(--color-avoid)' : isLast ? 'var(--color-sc-primary)' : 'var(--color-sc-line)'
                  }`,
                  transform: isLast ? 'scale(1.06)' : 'none',
                }}
              >
                {filled ? TILES[picked[k]] : ''}
              </span>
            );
          })}
        </div>

        {/* 시연용 힌트. 시연 모드에서만 — 실제 사용자에게 잠금 답이 보이면 잠금이 아니다. */}
        {!setup && demo && (
          <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--color-caution-bg)' }}>
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--color-caution)', color: '#fff' }}>DEMO</span>
            <span className="text-sm" style={{ color: 'var(--color-sc-ink)' }}>Tap in order:</span>
            <span className="text-lg tracking-wide">{DEMO_KEY.map((i) => TILES[i]).join(' ')}</span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-4 gap-3">
          {TILES.map((t, idx) => (
            <button
              key={idx}
              onClick={() => tap(idx)}
              disabled={busy}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm active:scale-95 transition-transform disabled:opacity-50"
              aria-label={`picture ${idx + 1}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/*
          지울 게 없으면 아예 숨긴다 — 비활성 상태의 흐린 글씨보다
          "지금 누를 수 있는 것만 보인다"가 문해력에 덜 기댄다.
          아이콘 + 라벨 + 테두리로 탭 대상임을 분명히 한다.
        */}
        {picked.length > 0 && !busy && (
          <button
            onClick={() => { setError(false); setPicked(picked.slice(0, -1)); }}
            className="mt-5 flex items-center gap-2 rounded-full bg-white px-5 py-2.5 shadow-sm active:scale-95 transition-transform"
            style={{ border: '1.5px solid var(--color-sc-line)' }}
            aria-label="Undo last picture"
          >
            <span className="text-lg leading-none">⌫</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>Undo</span>
          </button>
        )}

        {/*
          모드 선택.
          
          주소에 ?demo=1 을 붙이는 방식만 있었는데, 심사장에서 그것을 불러주기가
          어렵다. 그렇다고 첫 화면에 크게 물으면 안 된다 — 몰도바 어르신에게
          "시연용인가 실사용인가" 는 앱을 시작하기도 전에 만나는 벽이다.
          
          그래서 로그인 화면 **아래쪽에 작게** 둔다. 처음 여는 사람은 그냥 지나가고,
          아는 사람만 누른다. 누르면 그 브라우저에 기억되므로 한 번이면 끝난다.
        */}
        {/* 낭독 버튼은 모든 화면의 같은 자리에 있어야 한다 — 읽지 못하는 사람이
            버튼을 찾는 방법은 '늘 거기 있다' 뿐인데, 이 화면과 온보딩에만 없었다.
            정작 처음으로 무언가를 해야 하는 화면이 여기다. */}
        <ReadScreen />

        <div className="mt-auto pt-8 flex items-center gap-2 text-[11px]"
             style={{ color: 'var(--color-sc-muted)' }}>
          <button
            onClick={() => { setDemo(false); location.href = '/'; }}
            className="rounded-full px-3 py-1.5"
            style={{
              background: demo ? 'transparent' : 'var(--color-sc-line)',
              fontWeight: demo ? 400 : 700,
              color: demo ? 'var(--color-sc-muted)' : 'var(--color-sc-ink)',
            }}>
            Start empty
          </button>
          <button
            onClick={() => { setDemo(true); location.href = '/'; }}
            className="rounded-full px-3 py-1.5"
            style={{
              background: demo ? 'var(--color-sc-line)' : 'transparent',
              fontWeight: demo ? 700 : 400,
              color: demo ? 'var(--color-sc-ink)' : 'var(--color-sc-muted)',
            }}>
            Demo data
          </button>
        </div>
      </div>
    </div>
  );
}
