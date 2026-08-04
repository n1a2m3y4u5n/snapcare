'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useProfile } from '@/stores/profile';
import { CONDITIONS } from '@/lib/snapcare/conditions';
import { Hear, ask, sayable, Speakable } from '@/components/sc/Say';
import { FACES, freeFaces } from '@/lib/snapcare/accounts';
import { useIsClient, useMyColor } from '@/lib/hooks';
import { usePreferences } from '@/stores/preferences';
import { speak } from '@/lib/voice';
import type { AgeBand } from '@/lib/snapcare/types';
import { ConditionIcon, ClockIcon, FaceIcon, FaceUnwellIcon, NoneIcon, StethoscopeIcon } from '@/components/icons';

/**
 * 내 프로필 — 키보드를 한 번도 쓰지 않는다.
 *
 * 가족 명단을 없애면서 "구성원 목록 → 한 명 고르기 → 편집" 세 화면이 한 화면이 됐다.
 * 등록해야 시작할 수 있는 절차가 사라진 것이 이 변경의 요점이다 — 아무것도 고르지
 * 않아도 성인 기준으로 판정이 나오고, 자기에게 해당하는 것만 눌러 바로잡으면 된다.
 *
 * 나이대가 필요한 이유는 이것이 판정의 입력이기 때문이다. WHO 권고가 에너지 대비
 * 비율이라, 나이대가 정해져야 당·소금·포화지방 상한이 정해진다.
 */

/*
 * 사람을 나타내는 그림(FACES)은 lib/snapcare/accounts.ts 에 있다 — 잠금화면의 사람
 * 고르기와 **같은 목록**이어야 하기 때문이다. 두 벌로 두면 여기서 고른 얼굴이 저기에
 * 없는 경우가 생기고, 그러면 자기 자리를 못 찾는다.
 */

/**
 * 나이대는 이모지 대신 우리 글리프로 보인다.
 *
 * 아바타는 사용자가 고른 얼굴이라 그대로 두지만(그건 신원이다), 나이대는 기준치를
 * 정하는 입력이라 무엇을 고르는지가 정확해야 한다. 이모지는 기기마다 다르게 그려지고
 * 🧑‍🎓(학사모)는 '십대' 가 아니라 '졸업생' 이다 — 학교를 다니지 않는 아이에게는
 * 아무 뜻도 아니다. 네 글리프는 한 계열로 그려져 나란히 놓으면 나이 차가 보인다.
 */
const AGE_BANDS: { band: AgeBand; glyph: string; label: string; role: string }[] = [
  { band: 'child', glyph: 'state_child', label: 'Child', role: 'Child · age 7' },
  { band: 'teen', glyph: 'state_teen', label: 'Teen', role: 'Teen · age 15' },
  { band: 'adult', glyph: 'state_adult', label: 'Adult', role: 'Adult' },
  { band: 'senior', glyph: 'state_elderly', label: 'Older', role: 'Older adult' },
];

/**
 * 화면 묶음 — 진단서가 없어도 답할 수 있는 것부터 묻는다.
 *
 * 머리글에 그림을 붙인 이유: 이 세 줄은 화면에서 **유일하게 그림이 없는 글**이었다.
 * 아래 칸들은 전부 그림 + 한 단어라 못 읽어도 짐작이 되는데, 정작 "이 칸들이 무엇을
 * 묻는 것인가" 를 말하는 줄만 순수한 문장이었다. 묶음의 뜻을 모르면 칸 하나하나는
 * 알아봐도 무엇을 고르라는 것인지 모른다.
 *
 * 그림은 답이 아니라 **질문의 종류**를 가리킨다 — 지금(시계), 먹고 탈 났다(메스꺼움),
 * 의사가 말했다(의사). 셋 다 아래 칸의 어떤 답과도 겹치지 않으므로, 그림을 답으로
 * 오해할 자리가 없다.
 */
const GROUPS: { key: 'now' | 'experience' | 'diagnosis'; title: string; icon: React.ReactNode; say: string }[] = [
  { key: 'now', title: 'RIGHT NOW', icon: <ClockIcon hour={10} minute={10} />, say: 'Right now. Things that are true today.' },
  { key: 'experience', title: 'MADE ME SICK BEFORE', icon: <FaceUnwellIcon />, say: 'Made me sick before. Things that made you feel bad after eating them.' },
  { key: 'diagnosis', title: 'A DOCTOR TOLD ME', icon: <StethoscopeIcon />, say: 'A doctor told me.' },
];

/**
 * useSearchParams 는 미리 그려둘 수 없다 — 주소는 요청이 와야 정해진다. Suspense 로
 * 감싸지 않으면 빌드가 이 페이지에서 멈춘다.
 *
 * 타입 검사와 시험만으로는 안 걸린다. 처음 넣었을 때 `npm run build` 를 돌리지 않아
 * 그대로 커밋됐고, 배포에서 터질 뻔했다.
 */
export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: 'var(--color-sc-bg)' }} />}>
      <ProfileBody />
    </Suspense>
  );
}

function ProfileBody() {
  const router = useRouter();
  // 첫 실행에 로그인이 여기로 보낸다. 그때는 설정 탭으로 돌아갈 자리가 없고,
  // 대신 다 골랐다고 말할 자리가 있어야 한다.
  const setup = useSearchParams().get('setup') === '1';
  const { profile, toggleCondition, setFace, setAgeBand, confirm } = useProfile();
  const myColor = useMyColor(profile.color);
  const autoTts = usePreferences((s) => s.autoTts);

  /*
   * 고른 순간 무엇을 골랐는지 말한다.
   *
   * 지금 이 화면이 고른 것을 알리는 방법은 테두리 색 하나뿐이다. 그것은 화면을 볼 수
   * 있는 사람의 신호이고, 이 앱이 대상으로 삼은 사람에게는 아무 일도 일어나지 않은
   * 것과 같다. 무엇보다 이 칸들은 **판정을 바꾸는 입력**이라, 잘못 눌렀다는 것을
   * 그 자리에서 알아야 한다 — 다음에 알 방법은 틀린 판정을 받는 것뿐이다.
   *
   * 미리 듣는 것과 다른 일이다. 미리 듣기는 머리글(묶음 전체)과 꾹 누르기(칸 하나)가
   * 하고, 이것은 누른 뒤의 확인이다.
   *
   * 음성을 끈 사람에게는 말하지 않는다. 끈 것은 뜻이 있는 선택이다.
   */
  function say(text: string) {
    if (autoTts) void speak(text);
  }

  /*
   * 남이 쓰는 얼굴은 안 보인다.
   *
   * 잠금화면에서 서로를 가려내는 단서가 얼굴뿐이라, 둘이 같은 얼굴을 고르면 자기
   * 자리를 찾을 방법이 없어진다. 지금 내 얼굴은 남겨 둔다 — 안 그러면 내가 쓰는
   * 것이 목록에서 빠져 무엇이 선택돼 있는지가 안 보인다.
   *
   * 혼자 쓰면 여덟 개가 전부 보인다.
   */
  // 명단은 브라우저에만 있으므로 붙은 뒤에만 걸러낸다. 서버에서는 여덟 개 전부를
  // 그려 두고, 붙는 순간 남이 쓰는 얼굴이 빠진다.
  const isClient = useIsClient();
  const faces = isClient
    ? FACES.filter((f) => f === profile.emoji || freeFaces().includes(f))
    : FACES;

  function done() {
    confirm();
    router.replace('/home');
  }

  const currentBand: AgeBand = profile.ageBand ?? 'adult';

  return (
    <MobileScreen bar="inner">
      <div className="px-5 pt-14 pb-8">
        {setup ? (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--color-sc-ink)' }}
                  {...ask('Who are we checking for? Tap how old you are, and anything you must stay away from.')}>
              Who are we checking for?
              {/*
                처음 여는 사람이 만나는 첫 질문이다. 읽지 못하면 여기서 멈추고,
                멈추면 앱 전체가 기본값('어른, 조건 없음')으로 굴러간다 — 판정이
                전부 이 값에서 나오는데.
              */}
              <Hear text="Who are we checking for? Tap how old you are, and anything you must stay away from."
                    className="sc-hear" />
            </span>
            {/* 건너뛰기를 남겨 둔다 — 첫 화면에서 막히면 앱을 아예 못 쓴다.
                건너뛰면 홈이 계속 누구 기준인지 보여준다. */}
            <button onClick={() => router.replace('/home')} className="text-sm font-semibold"
                    style={{ color: 'var(--color-sc-muted)' }}>
              Skip
            </button>
          </div>
        ) : (
          // 뒤로가기를 걷어냈다. 이 화면은 홈의 위성이라 들어온 길이 홈인데 나가는
          // 길만 설정으로 갔다. 아래 줄의 Home 버튼이 들어온 길로 돌려보낸다.
          // (첫 설정 중일 때는 위의 Skip 이 그대로 남는다 — 그때는 홈이 아직 없다.)
          null
        )}

        {/*
          얼굴 고르기는 첫 실행에서 빼고 설정에서만 보여준다.
          
          판정에 아무 영향이 없는데(꾸밈이다) 첫 화면에서 가장 먼저 여덟 개를 고르라고
          했다. 처음 여는 사람이 만나는 첫 요구가 아무 값도 없는 선택이면, 그다음의
          진짜 질문 — 나이와 조건 — 까지 같은 무게로 보인다.
          
          기본 얼굴은 그대로 쓰이고, 바꾸고 싶은 사람은 설정에서 바꾼다.
        */}
        {!setup && (
        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-3xl"
                style={{ background: myColor }}>
            <FaceIcon face={profile.emoji} />
          </span>
          <span className="flex-1 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}
                {...sayable('Tap a picture. No typing needed.')}>
            TAP A PICTURE — NO TYPING
          </span>
          {/*
            낭독 버튼. 이 화면에만 없었다.

            제목을 누르면 읽어 주기는 했지만, **눌러도 되는 것인지 보이지 않았다** —
            글자는 그냥 글자처럼 생겼다. 다른 화면들은 제목 옆에 이 버튼이 서 있어서
            "여기 소리가 있다" 가 눈에 걸리고, 그 규칙이 이 화면에서만 깨져 있었다.

            읽지 못하는 사람에게 이 화면은 특히 중요하다. 여기서 고르는 값이 앱의
            모든 판정을 정하는데, 무엇을 묻는지가 글자로만 있었다.
          */}
          <Hear text="Tap a picture. No typing needed." className="sc-hear" />
        </div>
        )}

        {/* 신원 = 그림 */}
        {!setup && (
        <div className="mt-4 flex flex-wrap gap-2">
          {faces.map((f) => (
            <button
              key={f}
              onClick={() => setFace(f)}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm"
              style={{ outline: profile.emoji === f ? '2px solid var(--color-sc-primary)' : '2px solid transparent' }}
              aria-label={`Face ${f}`}
              aria-pressed={profile.emoji === f}
            >
              <FaceIcon face={f} />
            </button>
          ))}
        </div>
        )}

        {/* 나이대 = 기준치를 정하는 값 */}
        {/*
          여기만 그림이 없다. 아래 네 칸이 곧 그 그림이기 때문이다 — 작은 사람에서
          지팡이 짚은 사람까지 한 줄로 놓이면 무엇을 묻는지가 보인다. 머리글에 또
          그림을 얹으면 답과 겹쳐서, 그중 하나를 고르라는 뜻으로 읽힐 수 있다.
        */}
        <div className="mt-6 flex items-center gap-2">
          <Speakable
            text={`How old. This decides how much is too much. ${AGE_BANDS.map((b) => b.label).join(', ')}.`}
            className="flex flex-1 items-center gap-2 text-[11px] font-bold tracking-wide"
            style={{ color: 'var(--color-sc-muted)' }}>
            <span className="flex-1">HOW OLD</span>
          </Speakable>
          <Hear text={`How old. This decides how much is too much. ${AGE_BANDS.map((b) => b.label).join(', ')}.`}
                className="sc-hear" />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {AGE_BANDS.map((b) => {
            const on = currentBand === b.band;
            return (
              <button
                key={b.band}
                onClick={() => { setAgeBand(b.band, b.role); say(`${b.label}. Selected.`); }}
                className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 shadow-sm"
                style={{ outline: on ? '2px solid var(--color-sc-primary)' : '2px solid transparent' }}
                aria-pressed={on}
                aria-label={b.label}
                {...sayable(`${b.label}.${on ? ' Selected.' : ''}`)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/glyphs/${b.glyph}.png`} alt="" aria-hidden className="h-8 w-8" />
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{b.label}</span>
              </button>
            );
          })}
        </div>

        {/*
          조건은 "진단명" 이 아니라 "당신이 알 수 있는 것" 순서로 묻는다.
          대상 지역엔 알레르기 검사 인프라가 없어서, 진단을 전제하면 프로필이 빈 채로 남는다.
        */}
        {GROUPS.map((g) => {
          const items = CONDITIONS.filter((c) => c.knownBy === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key}>
              {/*
                머리글이 **고를 것들까지 읽는다.**
                묶음의 뜻만 들려주면 "뭘 고르라는 건지" 는 알아도 "무엇 중에" 는 모른다.
                피 한 방울이 당뇨이고 밀 이삭이 글루텐이라는 것은 그림만으로는 알 수 없어서,
                이 목록이 없으면 진단 묶음은 통째로 닿지 않는다.
              */}
              <div className="mt-6 flex items-center gap-2">
                <Speakable text={`${g.say} ${items.map((c) => c.label).join(', ')}.`}
                           className="flex flex-1 items-center gap-2 text-[11px] font-bold tracking-wide"
                           style={{ color: 'var(--color-sc-muted)' }}>
                  <span className="flex items-center text-xl" aria-hidden>{g.icon}</span>
                  <span className="flex-1">{g.title}</span>
                </Speakable>
                <Hear text={`${g.say} ${items.map((c) => c.label).join(', ')}.`} className="sc-hear" />
              </div>
              {/*
                **해당 없음**을 고를 수 있게 한다.

                전에는 없었다. 임신도 수유도 아닌 사람에게 이 묶음은 누를 것이 없는 칸
                둘이고, 화면은 "고르라" 고만 한다. 그러면 사람은 자기가 무언가를 놓쳤다고
                여기거나, 아무 데나 하나 누른다 — 둘 다 나쁘고, 뒤쪽은 프로필에 없는
                조건을 심는다.

                고른 표시는 **따로 저장하지 않는다.** "이 묶음에 켜진 것이 없다" 가 곧
                해당 없음이고, 그 둘은 같은 사실이다. 값을 하나 더 두면 둘이 어긋날 수
                있고(켜 놓고 해당 없음도 눌린 상태), 어긋난 프로필은 판정을 틀리게 한다.

                그래서 처음 열면 이 칸이 이미 켜져 있다. 그것은 거짓이 아니라 **지금
                저장된 답**이고, 화면이 그것을 보여 주는 편이 빈 격자보다 정직하다.
              */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {items.map((c) => {
                  const on = profile.conditionIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => { toggleCondition(c.id); say(`${c.label}. ${on ? 'Off.' : 'On.'}`); }}
                      className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-2 py-4 shadow-sm"
                      style={{ outline: on ? '2px solid var(--color-caution)' : '2px solid transparent' }}
                      aria-pressed={on}
                      aria-label={c.label}
                      {...sayable(`${c.label}. ${on ? 'On.' : 'Off.'}`)}
                    >
                      <span className="flex items-center text-2xl" aria-hidden><ConditionIcon id={c.id} /></span>
                      <span className="text-center text-[11px] font-semibold leading-tight"
                            style={{ color: on ? 'var(--color-caution)' : 'var(--color-sc-muted)' }}>
                        {c.label}
                      </span>
                    </button>
                  );
                })}
                {(() => {
                  const none = items.every((c) => !profile.conditionIds.includes(c.id));
                  return (
                    <button
                      onClick={() => {
                        for (const c of items) {
                          if (profile.conditionIds.includes(c.id)) toggleCondition(c.id);
                        }
                        say('None of these. Selected.');
                      }}
                      className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-2 py-4 shadow-sm"
                      style={{ outline: none ? '2px solid var(--color-safe)' : '2px solid transparent' }}
                      aria-pressed={none}
                      aria-label="None of these"
                      {...sayable(`None of these. ${none ? 'Selected.' : ''}`)}
                    >
                      <span className="flex items-center text-2xl" aria-hidden><NoneIcon /></span>
                      <span className="text-center text-[11px] font-semibold leading-tight"
                            style={{ color: none ? 'var(--color-safe)' : 'var(--color-sc-muted)' }}>
                        None of these
                      </span>
                    </button>
                  );
                })()}
              </div>
            </div>
          );
        })}
        {setup && (
          <button onClick={done}
                  className="mt-8 w-full rounded-2xl py-4 text-base font-bold text-white active:scale-[0.98] transition-transform"
                  style={{ background: 'var(--color-sc-primary)' }}
                  {...sayable('Done. Start using SnapCare.')}>
            Done
          </button>
        )}
      </div>
    </MobileScreen>
  );
}
