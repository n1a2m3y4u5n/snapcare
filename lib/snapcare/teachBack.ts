import type { ScanItem } from './types.ts';

/**
 * 되말하기(teach-back) — 설명한 뒤에 **알아들었는지 확인하는 것**.
 *
 * 임상에서는 이렇게 한다: 설명이 끝나면 "집에 가서 어떻게 드실 건지 저에게 말씀해
 * 주세요" 라고 청하고, 돌아온 말에서 빠진 것을 다시 설명한다. 고개를 끄덕이는 것은
 * 이해의 증거가 아니라는 것이 이 기법의 전제다. 2026년 8월 전문가 조사에서 여러
 * 응답자가 이것을 요구했다.
 *
 * 우리 사용자에게는 그대로 옮길 수 없다. 글을 못 읽고, 마이크는 아예 막아 두었다
 * (middleware.ts 의 Permissions-Policy — 쓰지 않는 권한은 닫아 둔다). 그래서 말로
 * 되받는 대신 **그림으로 되짚게** 한다: 물음은 소리로 나가고, 답은 그림을 짚는다.
 *
 * 설계에서 물러서지 않은 것 셋:
 *
 *  · **막지 않는다.** 틀려도 다음으로 간다. 이것은 시험이 아니라 확인이고, 약 정보를
 *    잠그는 앱은 약을 못 먹게 하는 앱이다.
 *  · **처방전이 말한 것만 묻는다.** 없는 것을 물으면 지어낸 답을 가르치게 된다.
 *  · **틀리면 그 자리에서 다시 말해 준다.** 확인의 목적은 점수가 아니라 두 번째 기회다.
 */

export interface TeachQuestion {
  /** 소리로 나가는 물음. 화면에도 같은 말이 적힌다 — 읽을 수 있는 사람도 본다. */
  ask: string;
  /**
   * 맞는 답 — 형태소 이름이다. DSL 한 줄이 아니다.
   *
   * 답지는 **라벨이 아니라 그림 선택지**다. `\\qty_two` 를 라벨로 쓰면 "두 개" 가
   * 무엇의 두 개인지 없는 문장이 되고, 문법도 그것을 막는다(수식어는 홀로 서지
   * 못한다). 여기서 필요한 것은 문장이 아니라 짚을 그림 하나라, `public/glyphs` 의
   * 형태소를 그대로 쓴다.
   */
  correct: string;
  /** 짚을 수 있는 것들. 맞는 답 하나가 반드시 들어 있다. */
  options: string[];
  /** 틀렸을 때 다시 해 주는 말. */
  again: string;
}

/** 답지 개수. 셋이면 찍어서 맞을 확률이 1/3 이고, 넷부터는 화면에서 작아진다. */
const CHOICES = 3;

/**
 * 순서를 섞되 **늘 같게** 섞는다.
 *
 * 볼 때마다 답이 옮겨 다니면, 처음에 짚어 본 자리를 기억한 사람이 두 번째에 헤맨다.
 * 무작위가 필요한 자리가 아니다 — 필요한 것은 "정답이 늘 첫째 칸이 아닌 것" 뿐이다.
 */
function shuffle<T>(items: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 맞는 답과 겹치지 않는 오답을 고른다. */
function distractors(pool: string[], correct: string, exclude: string[]): string[] {
  return pool.filter((p) => p !== correct && !exclude.includes(p));
}

const QTY = ['qty_one', 'qty_two', 'qty_three', 'qty_four', 'qty_five'];
const TIMES = ['time_morning', 'time_noon', 'time_evening', 'time_night'];

const TIME_OF: Record<string, string> = {
  Morning: 'time_morning', Noon: 'time_noon',
  Evening: 'time_evening', Night: 'time_night',
};

const TIME_WORD: Record<string, string> = {
  time_morning: 'in the morning', time_noon: 'at midday',
  time_evening: 'in the evening', time_night: 'at night',
};

/**
 * 이 처방전으로 물을 수 있는 것을 만든다. 물을 것이 없으면 빈 배열이다.
 *
 * 순서에 뜻이 있다. 표 4 에서 전체 오류의 28.4% 가 용량 오류였으므로 개수를 먼저
 * 묻고, 그 다음이 시각이다. 셋째는 식사 맥락인데 이것은 적혀 있을 때만 나온다.
 */
export function buildQuestions(item: ScanItem, limit = 2): TeachQuestion[] {
  const rx = item.rx;
  if (!rx) return [];
  const seed = item.id || item.name;
  const out: TeachQuestion[] = [];

  // 한 번에 몇 개인가.
  if (rx.doseCount && rx.doseCount >= 1 && rx.doseCount <= QTY.length) {
    const correct = QTY[rx.doseCount - 1];
    const wrong = shuffle(distractors(QTY, correct, []), `${seed}q`).slice(0, CHOICES - 1);
    out.push({
      ask: 'How many do you take at a time?',
      correct,
      options: shuffle([correct, ...wrong], `${seed}qo`),
      again: `You take ${rx.doseCount}${rx.doseCount === 1 ? '' : ' of them'} at a time.`,
    });
  }

  /*
    언제 먹는가.

    오답은 **처방에 없는 시각**이라야 한다. 실제 복용 시각을 오답으로 내면 옳게 짚은
    사람에게 틀렸다고 말하게 된다.

    그래서 답지를 채울 만큼 남지 않으면 아예 묻지 않는다. 하루 세 번 먹는 약에서
    이것을 물으면 답지가 둘이 되고, 반반 찍기는 확인이 못 된다 — 그런 물음은 알아들은
    사람과 못 알아들은 사람을 가르지 못하면서 물었다는 사실만 남긴다. 하루 세 번
    먹는 약에는 물어볼 만한 다른 것(개수·식사)이 이미 있다.
  */
  const scheduled = rx.schedule.map((s) => TIME_OF[s.label]).filter(Boolean);
  if (scheduled.length > 0 && TIMES.length - scheduled.length >= CHOICES - 1) {
    const correct = scheduled[0];
    const wrong = shuffle(distractors(TIMES, correct, scheduled), `${seed}t`).slice(0, CHOICES - 1);
    out.push({
      ask: 'When do you take it?',
      correct,
      options: shuffle([correct, ...wrong], `${seed}to`),
      again: `You take it ${TIME_WORD[correct] ?? 'at the time on the label'}.`,
    });
  }

  // 밥과 함께인가, 빈속인가. 처방전에 적혀 있을 때만 묻는다.
  const dosage = rx.dosageText ?? '';
  const withFood = /before\s*meal/i.test(dosage) ? 'food_empty_bowl'
    : /food|with\s*meal/i.test(dosage) ? 'food_bowl'
      : undefined;
  if (withFood) {
    const other = withFood === 'food_bowl' ? 'food_empty_bowl' : 'food_bowl';
    out.push({
      ask: 'Do you take it with food?',
      correct: withFood,
      options: shuffle([withFood, other], `${seed}f`),
      again: withFood === 'food_bowl' ? 'You take it with food.' : 'You take it on an empty stomach.',
    });
  }

  return out.slice(0, limit);
}
