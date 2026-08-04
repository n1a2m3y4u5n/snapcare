'use client';

import { NUTRIENT_LABEL, NUTRIENT_UNIT, type NutrientAssessment, type NutrientKey } from '@/lib/nutrition/types';
import { Hear, Speakable } from './Say';
import { barSentence, colorFor } from '@/lib/nutrition/barText';
import { gaugeOf } from '@/lib/nutrition/gauge';
import { Gauge } from './Gauge';
import {
  BowlIcon, ButterIcon, CandyIcon, FlameIcon, MuscleIcon, OilIcon, SaltIcon, WheatIcon,
} from '@/components/icons';

// 순수 로직은 lib 에 있다(노드 시험이 .tsx 를 못 읽는다). 부르는 쪽이 바뀌지 않게 다시 내보낸다.
export { barSentence, colorFor };

/**
 * 영양소마다 그림 하나.
 *
 * 🔥🍬🧂🧈🫒💪🌾🍚 였다. 이 여덟은 한 화면에 세로로 줄지어 서기 때문에 **서로 안
 * 겹치는 것이 전부**인데, 이모지로는 그것을 우리가 정할 수 없다 — 어느 기기에서는
 * 버터와 올리브유가 둘 다 노란 덩어리이고, 그 둘이 포화지방과 지방이다.
 *
 * 이름을 `NUTRIENT_EMOJI` 그대로 두지 않는다. 부르는 곳이 두 군데뿐이라 바꾸는
 * 값이 싸고, 이름이 이모지라고 말하면 다음 사람이 이모지를 넣는다.
 */
export const NUTRIENT_ICON: Record<NutrientKey, (p: { size?: number | string }) => React.ReactNode> = {
  energy: FlameIcon,
  sugars: CandyIcon,
  salt: SaltIcon,
  saturatedFat: ButterIcon,
  fat: OilIcon,
  protein: MuscleIcon,
  fiber: WheatIcon,
  carbohydrates: BowlIcon,
};


/**
 * 영양소 막대 한 줄 — 섭취량이 기준치에서 차지하는 비중.
 * 같은 정보를 길이·색·숫자 세 방식으로 겹쳐 준다 (수치를 못 읽어도 길이와 색으로 읽힌다).
 */
export function NutrientBar({ a }: { a: NutrientAssessment }) {
  const color = colorFor(a);
  const unit = NUTRIENT_UNIT[a.key] === 'kcal' ? ' kcal' : ' g';
  const g = gaugeOf(a.pct, a.kind);
  // 목표인데 아직 모자란 줄. 남은 칸을 채워야 할 자리로 그린다.
  const need = a.kind === 'target' && a.level !== 'good';

  // 듣기 표시를 Speakable 에 맡기지 않고 첫 줄에 직접 둔다. 맡기면 내용 끝 — 막대
  // 아래 — 에 붙어서, 무엇에 대한 소리인지가 한 줄 떨어진다. 누르는 것은 여전히
  // 카드 전체다.
  return (
    <Speakable text={barSentence(a)} bare className="block rounded-2xl bg-white px-3 py-2 shadow-sm">
      {/*
        다섯이 한 줄에 있다 — 그림, 이름, 양, 칸 수, 듣기. 글자를 가장 크게 두면
        287px 안에서 이름 몫이 36px 로 줄어 잘렸다. 이름에 최소폭을 주고 접히게 두면
        첫 줄은 "🍬 Sugars", 둘째 줄은 "25.9 g · 5/10 · 🔊" 로 나뉜다. 다섯 다 남는다.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="flex shrink-0 items-center justify-center text-base leading-none"
              style={{ color }}>
          {NUTRIENT_ICON[a.key]({})}
        </span>
        <span className="min-w-[6rem] flex-1 text-xs font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
          {NUTRIENT_LABEL[a.key]}
        </span>
        <span className="text-xs font-bold" style={{ color }}>
          {a.amount}{unit}
        </span>
        {/*
          백분율 대신 **칸 수**를 적는다. 아래 게이지에 보이는 것과 같은 수라, 숫자를
          읽는 사람에게는 정확한 값이 되고 못 읽는 사람에게는 칸을 세면 같은 답이
          나온다. "62%" 는 아래 그림과 대응시킬 수가 없었다.
        */}
        {/*
          방향을 글자 없이. 넘친 줄은 이미 `+N` 이 빨강으로 서 있고, 모자란 줄에는
          아무 표시가 없어서 "잘하고 있다" 와 구별되지 않았다. 위 화살표 하나면
          더 먹으라는 쪽이라는 것이 읽지 않고도 도착한다.
        */}
        <span className="w-11 text-right text-[11px] font-bold tabular-nums"
              style={{ color: need || g.over > 0 ? color : 'var(--color-sc-muted)' }}>
          {g.over > 0 ? `+${g.over}` : need ? `↑ ${g.filled}/${g.segments}` : `${g.filled}/${g.segments}`}
        </span>
        <Hear text={barSentence(a)} className="sc-hear" />
      </div>
      <Gauge pct={a.pct} kind={a.kind} color={color} need={need} />
    </Speakable>
  );
}

