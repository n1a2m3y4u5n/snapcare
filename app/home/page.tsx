'use client';

import { useMemo } from 'react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { DoseRelease } from '@/components/sc/DoseRelease';
import { useDispenser } from '@/lib/dispenser/useDispenser';
import { useAutoSend } from '@/lib/dispenser/useAutoSend';
import { useProfile } from '@/stores/profile';
import { useDoseLog } from '@/lib/dispenser/useDoseLog';
import { useDoseAlert } from '@/lib/dispenser/useDoseAlert';
import { planTrays, FITTED_TRAYS } from '@/lib/hardware/dispenser';
import { useReminders } from '@/stores/reminders';
import { WhoSheet } from './who-sheet';
import { BigCamera, Dock, type Satellite } from './dock';
import { BoxIcon, FoodIcon, GearIcon, PillIcon } from '@/components/icons';
import { ask, sayable } from '@/components/sc/Say';
import { homeIntro } from '@/lib/snapcare/homeIntro';
import { usePreferences } from '@/stores/preferences';

export default function HomePage() {
  // 약통이 짝지어져 있으면 걸린 약을 여기서 보여준다. 짝이 없으면 훅이 조용히
  // 아무것도 안 하고, DoseRelease 는 걸린 약이 없으면 그리지 않는다.
  const box = useDispenser();
  /*
    알람을 만들면 상자가 저절로 안다.

    예전에는 기기 화면까지 가서 전송 버튼을 눌러야 했고, 안 누르면 앱에는 알람이
    있고 상자에는 아무 일정도 없었다 — 그리고 그 어긋남이 화면 어디에도 없었다.
    보냈다고 믿은 사람이 그것을 알게 되는 자리는 약이 안 나오는 아침이다.
  */
  const autoSend = useAutoSend(box.report?.status.trayCount ?? FITTED_TRAYS);
  const confirmed = useProfile((s) => s.confirmed);
  const sayLang = usePreferences((s) => s.sayLang);
  const reminders = useReminders((s) => s.reminders);

  // 상자가 약을 내보내거나 놓친 것을 기록에 남긴다. 홈에서도 도는 이유는, 기기 화면을
  // 한 번도 열지 않는 사람이 대부분이기 때문이다 — 짝은 한 번 짓고 나면 끝이다.
  const trayNames = useMemo(
    () => Object.fromEntries(
      planTrays(reminders, box.report?.status.trayCount ?? FITTED_TRAYS).plan.map((t) => [t.tray, t.name]),
    ),
    [reminders, box.report?.status.trayCount],
  );
  // 그 칸의 1회 복용량. 이름과 같은 자리에서 온다 — 상자는 둘 다 모른다.
  const trayDoses = useMemo(
    () => Object.fromEntries(
      planTrays(reminders, box.report?.status.trayCount ?? FITTED_TRAYS).plan
        .flatMap((t) => (t.source?.item?.rx?.doseText ? [[t.tray, t.source.item.rx.doseText]] : [])),
    ),
    [reminders, box.report?.status.trayCount],
  );
  useDoseLog(box.report, trayNames, trayDoses);
  // 앱을 보고 있지 않을 때는 알림이 부른다 — 배출 버튼은 화면을 봐야 보인다.
  useDoseAlert(box.report);

  // 처방을 스캔해 알람을 만들었을 때만 뜬다.
  // 예전에는 존재하지도 않는 Metformin 알람이 항상 박혀 있었다 —
  // 눌러도 실제 알람과 무관했고, 데모에서 눌러보면 어긋나는 자리였다.
  //
  // 그리고 `reminders[0]` 을 쓰고 있었다. 그 배열은 **최근에 더한 순**이지 시각순이
  // 아니라, 약을 셋 먹는 사람에게 홈은 아무거나 하나를 "다음 복용" 이라고 보여줬다.
  //
  // 날짜·시각은 그릴 때 읽으면 안 된다 — 서버가 그린 화면과 어긋난다. 붙은 뒤에 읽는다.
  //
  // 붙은 뒤에 이펙트에서 setState 하던 것을 바꿨다. 결과는 같은데 두 가지가 낫다:
  // 그리자마자 한 번 더 그리지 않고, 화면이 다시 그려질 때마다 시각을 새로 읽는다.
  // 뒤쪽이 실제로 중요하다 — 예전에는 마운트 때 읽은 날짜를 계속 들고 있어서, 자정을
  // 넘겨 앱을 켜 둔 사람에게 '오늘' 이 어제로 남았다.
  /*
    아래 줄에 놓을 것들 — 홈에서 갈 수 있는 곳 전부.

    중복을 없애는 방법을 두 번 바꿨다. 처음에는 '오늘' 을 위성에서 빼서 아래 탭에
    맡겼는데, 그러면 홈이 두 가지 언어로 말한다 — 가운데는 둥근 궤도, 아래는 네모난
    탭. 어느 쪽이 이 앱의 길인지가 화면에서 안 정해진다.

    이제 반대로 한다. **홈에서는 이 줄이 유일한 길**이고 아래 탭의 이동 링크는 감춘다.
    영양과 설정이 이 줄로 올라오고, 다른 화면에서는 탭이 그대로 남아 돌아오는 길이 된다.

    낭독 버튼만은 자리를 지킨다. 읽지 못하는 사람이 그 버튼을 찾는 방법은 '늘 거기
    있다' 뿐이고, 하필 홈이 앱을 여는 첫 화면이다 — 여기서 자리가 바뀌면 그 규칙이
    처음부터 깨진다. HomeBar 가 홈에서는 왼쪽을 비우고 낭독 버튼만 남긴다.

    순서는 DOM 순서이자 스캐닝 순서다. 자주 쓰는 것부터 놓는다.

    배지는 답을 기다리는 것에만 붙인다. 숫자를 못 읽어도 **점이 붙었다**는 것은
    보이고, 그것만으로 "여기 뭔가 있다" 는 뜻이 선다.
  */
  const satellites: Satellite[] = [
    {
      icon: FoodIcon, label: 'Food', href: '/nutrition',
      say: 'Food. What you have eaten today, and the last four weeks day by day.',
    },
    {
      icon: PillIcon, label: 'Medicine', href: '/history',
      say: 'Medicine. What is set right now, and how the last four weeks went.',
    },
    {
      icon: BoxIcon, label: 'Dispenser', href: '/device',
      say: 'The dispenser. Send the schedule, and see what it has done.',
    },
    {
      icon: GearIcon, label: 'Settings', href: '/settings',
      say: 'Settings. Who we check for, the voice, and the dispenser.',
    },
  ];


  return (
    <MobileScreen bar="home" fit>
      {/*
        세로 공간을 실제로 쓴다.

        `main` 이 이미 `flex-1` 인데 홈은 그 안에서 위에만 붙어 있었다. 그래서
        궤도가 화면 위쪽에 몰리고 아래 절반이 비었다 — 카메라를 크게 만들어 놓고
        정작 화면은 안 채운 셈이다.

        `flex-1` 로 받아서 카메라를 남는 자리 가운데에 앉힌다. 위아래 카드가 뜨는
        날에는 그만큼 자리가 줄고 카메라가 알아서 작아진다 — 카드가 카메라를 화면
        밖으로 밀어내던 것을 이 구조가 대신 막는다.
      */}
      {/*
        `sc-quiet-reading` — 이 화면에서는 "지금 읽는 자리" 표시를 안 낸다. 이유는
        `globals.css` 의 그 규칙 옆에 적었다.
      */}
      <div className="sc-quiet-reading flex min-h-0 flex-1 flex-col px-5 pt-14">
        {/*
          로고를 **가로 가운데**에 놓는다.

          왼쪽 위에 두고 얼굴 단추를 오른쪽에 놓고 있었다. 그 줄이 사라진 이유는
          얼굴이 아래 줄로 내려갔기 때문이고, 혼자 남은 로고를 왼쪽에 두면 오른쪽이
          이유 없이 빈다. 가운데에 놓으면 아래의 카메라·줄과 같은 축에 선다.

          세로로는 그대로 위쪽이다. 이 그림은 "여기가 어디인가" 를 말하는 표찰이라
          먼저 보이는 자리에 있어야 하고, 그 자리는 맨 위다.
        */}
        <div className="flex justify-center">
          <h1 className="w-full min-w-0" {...ask(homeIntro(sayLang))}>
            {/*
              높이를 px 로 못박는다 — 이 앱의 다른 틀들과 같은 이유다. 글자를 키운
              사람이 원하는 것은 글자이지 표찰이 아니고, 홈은 한 화면에 담기로 해서
              여기서 커진 만큼이 그대로 카메라에서 빠진다.

              둘레의 넷이 아래로 내려가면서 위쪽에 자리가 생겼다. 그만큼 키운다 —
              손으로 그린 획이라 클수록 잘 읽히고, 이 화면의 첫인상이기도 하다.
            */}
            {/*
              **폭을 채운다.**

              높이를 못박고 폭이 따라오게 하고 있었다(176px). 그러면 글자가 화면
              한가운데에 작게 앉고 좌우가 넓게 빈다 — 이 화면의 첫인상인데 그 자리를
              안 쓰는 셈이다. 폭을 기준으로 두면 글자가 화면을 가로지르고, 높이는
              그림의 비율이 정한다.

              `translateX` 로 조금 민다. 무게중심은 이 그림의 광학 중심이 상자 중심보다
              왼쪽이라고 말하고(사진기와 반짝임이 오른쪽 끝을 밀어낸다), 눈으로도 그렇게
              보인다. 자리를 안 먹는 방법으로 미는 것이 요점이다 — 파일에 여백을 채워
              밀면 그만큼 상자가 넓어져 방금 채운 폭이 다시 줄어든다.

              4% 는 좌우 여백(20px) 안에서 움직일 수 있는 만큼이다. 이보다 밀면 오른쪽
              사진기가 화면 밖으로 나간다.

              높이에 상한(26vh)을 두는 이유: 폭을 채우면 높이는 그림의 비율이 정하는데,
              키 낮은 폰에서는 그 높이가 카메라 몫을 가져간다. 640px 짜리 화면에서
              로고가 211px 을 먹고 카메라가 134px 로 줄었다 — 이 화면에서 가장 커야
              하는 것이 로고 다음이 되면 안 된다.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="SnapCare" width={486} height={320}
                 className="h-auto w-full"
                 style={{ transform: 'translateX(4%)', maxHeight: '26vh', objectFit: 'contain' }} />
          </h1>
        </div>

        {/*
          지금 꺼내야 하는 약. 기기는 시간이 됐다고 내보내지 않으므로 이것이 화면에
          뜨는 순간이 곧 사람이 움직여야 하는 순간이고, 그래서 홈의 맨 위다.

          한 번 아래에 두어 봤다가 되돌렸다. "TRY IT" 예시 카드 밑으로 내려가 있었는데,
          화면에서 **유예가 있는 것은 이것뿐**이다 — 한 시간이 지나면 트레이는 열리지
          않고 '놓침' 이 기록된다. 글을 못 읽는 사람에게 스크롤을 시켜서 찾게 할 것이
          아니다. 걸린 약이 없으면 아무것도 그리지 않으므로 평소에는 자리를 먹지 않는다.
        */}
        <div className="mt-4 empty:mt-0">
          <DoseRelease report={box.report} onRelease={box.release} />
        </div>

        {/*
          프로필 안내 카드가 여기 있었다. 걷어낸 이유는 **얼굴 단추의 배지가 같은
          말을 하기 때문**이다. 한 화면에서 같은 것을 두 번 말하면 읽는 쪽은 둘이
          다른 것을 말한다고 생각한다. 배지가 카드보다 약한 신호인 것은 맞지만
          대신 늘 보인다.
        */}

        {/*
          "다 먹었다" 와 "다음 복용" 은 `Past days` 로 옮겼다. 둘 다 **복약 루틴에
          대한 것**이고, 그 화면에 이미 지금 정해져 있는 것과 지난 넉 주가 있다 —
          같은 물음에 답하는 것들이 한 자리에 모이는 편이 낫다.

          홈에 남는 복약은 배출 카드뿐이다. 그것만 유예가 있다: 한 시간이 지나면
          트레이는 열리지 않고 '놓침' 이 기록된다. 나머지는 오늘 안에만 답하면 된다.
        */}

        {/*
          일정이 상자에 못 닿았을 때만 뜬다.

          성공하면 아무것도 안 나온다. 잘 된 일을 알리는 줄은 화면을 늘리기만 하고,
          이 앱에서 사람이 확인해야 하는 것은 **안 된 것**뿐이다. 반대로 못 닿은
          것을 조용히 두면 앱에는 알람이 있고 상자에는 없는 상태가 그대로 굳는다.
        */}
        {autoSend.error && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl px-4 py-3"
               style={{ background: 'var(--color-med-bg)' }}>
            <span aria-hidden className="flex items-center text-xl"><BoxIcon /></span>
            <span className="flex-1 text-sm font-semibold"
                  style={{ color: 'var(--color-sc-ink)' }}
                  {...sayable('The schedule has not reached the dispenser yet.')}>
              Not sent to the dispenser yet
            </span>
          </div>
        )}

        {/*
          가운데에 카메라, 둘레에 나머지.

          왜 이 모양인지는 lib/home/orbit.ts 에 적었다. 요약하면 홈이 세로로 긴
          목록이었고, 그 안에서 카메라가 여덟 칸 중 하나로 보였다 — 이 앱에서 사람이
          하는 일은 사진을 찍는 것 하나인데.

          통계는 걷어내 자기 화면으로 보냈다. 오늘 누적은 `/nutrition`, 최근 목록은
          `/history` 에 이미 있었고, 홈에 있던 것은 그 화면들의 **미리보기**였다.
          미리보기가 본체 옆에 계속 떠 있으면 눈이 그쪽으로 새고, 정작 그 미리보기로는
          아무 판단도 못 한다(넉 줄로는 추세가 안 보인다).

          위쪽 알림 카드들은 그대로 뒀다. 저것들은 통계가 아니라 **지금 해야 하는
          일**이고, 특히 배출 카드는 유예가 지나면 트레이가 닫힌다.
        */}
        {/*
          좌우 여백까지 궤도에 준다(`-mx-5`). 이 화면에서 그 여백은 지키는 것이
          아무 뜻도 없다 — 옆에 나란히 놓일 글이 없기 때문이다. 폰에서 40px 을
          되찾으면 위성 지름이 그만큼 커지고, 그것이 이 화면에서 제일 겨누기 어려운
          표적이다.
        */}
        {/*
          궤도가 제 한 변을 이 칸의 **짧은 쪽**에서 뽑는다(`orbit.tsx` 의 `cqmin`).
          그러려면 이 칸이 크기를 아는 컨테이너여야 한다.
        */}
        {/*
          가운데는 카메라 하나다. 남는 자리를 다 준다.

          `containerType: 'size'` 는 남았다 — 카메라가 제 지름을 이 칸의 짧은 쪽에서
          뽑는다. 칸이 낮으면 낮은 쪽이, 좁으면 좁은 쪽이 정한다.
        */}
        <div className="flex min-h-0 flex-1 items-center justify-center py-3"
             style={{ containerType: 'size' }}>
          <BigCamera />
        </div>

        {/*
          되짚는 곳들과 지금 누구인지 — **낭독 줄 바로 위 한 줄에.**

          둘레의 원이었다. 원은 자리를 비싸게 쓴다: 넷을 놓으려면 카메라 지름의 두 배쯤
          되는 정사각형이 필요하고 네 귀퉁이는 늘 빈다. 홈이 스크롤 없이 한 화면에
          담기로 하면서 그 빈 귀퉁이가 곧 카메라가 못 쓴 자리가 됐다.

          아래로 내리면 그 자리가 카메라로 가고, 누르는 것들이 화면 아래에 모인다 —
          낭독 줄과 같은 높이대라 "누를 것은 여기" 가 규칙 하나로 선다.
        */}
        <div className="pb-2">
          <Dock satellites={satellites} extra={<WhoSheet needsProfile={!confirmed} />} />
        </div>

        {/*
          "TRY IT" 표본 석 장이 여기 있었다.

          처음 연 사람에게 이 앱이 무엇을 하는지 보여주려던 것인데, 홈을 한 화면에
          담기로 하면서 셈이 뒤집혔다. 그 석 장은 **궤도가 쓸 자리를 가져가고**,
          정작 이 앱에서 사람이 하는 일 하나(사진을 찍는 것)를 작게 만든다.
          그리고 같은 표본은 카메라 화면의 `Can't take a photo?` 뒤에 그대로 있다 —
          없앤 것이 아니라 홈에서 뺀 것이다.
        */}

        {/*
          묻는 것들은 `Today` 로 옮겼다 — 몸이 어땠는지도, 의심되는 것도 **음식에
          대한 물음**이고, 그 화면에 이미 오늘 먹은 것과 몸의 반응이 모여 있다.
          여기서 물으면 답을 적어 넣을 맥락이 화면 밖에 있다.
        */}

      </div>
    </MobileScreen>
  );
}
