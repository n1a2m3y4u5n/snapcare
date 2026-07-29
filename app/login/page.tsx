'use client';

import { sayable } from '@/components/sc/Say';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { useSession } from '@/stores/session';
import { useProfile } from '@/stores/profile';
import { seedDemoIfEmpty } from '@/stores/scans';
import { setDemo, useIsDemo } from '@/lib/snapcare/demo';

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
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col items-center px-6 pt-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: 'color-mix(in srgb, var(--color-sc-primary) 12%, white)' }}>🔒</div>
        <h1 className="mt-4 text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}
            {...sayable(setup ? 'Create your picture key.' : 'Enter your picture key.')}>
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
