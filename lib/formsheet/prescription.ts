// 상대 경로 — 시험에서 @/ 별칭이 안 통한다 (lib/snapcare/course.ts 와 같은 이유).
import type { Drug } from '../formulary/who.ts';
import { matchDrug } from '../formulary/match.ts';
import { toSchedule, type FormSheetValues } from '../hardware/formSheet.ts';
import type { ItemFlag, ScanItem } from '../snapcare/types.ts';

/**
 * 폼시트 한 장 → 앱이 아는 처방 하나.
 *
 * 종이가 답하는 여섯 가지
 * -----------------------
 *   약 이름        손으로 쓴 칸 → OCR → 약품표에서 맞추기
 *   그림           약품표의 제형과 경고에서 (`sigil.ts` 가 그린다)
 *   몇 번째 층     LAYER 버블
 *   무슨 요일      DAYS OF WEEK 버블
 *   며칠치         DURATION 버블
 *   몇 시          DROP TIME 버블
 *
 * 뒤의 넷은 버블이라 확실하다. 앞의 둘이 이 파일의 일이고, 둘은 하나다 — 그림은
 * 이름 문자열에서 못 나오고 **표를 거쳐야만** 나온다.
 *
 * 못 읽으면 만들지 않는다
 * -----------------------
 * 이름을 못 맞히면 `drug` 가 `null` 이고, 그때 이 파일은 이름을 지어내지 않는다.
 * 화면이 물어야 할 말이 둘로 갈리고 그 둘은 사람이 할 일이 다르다.
 *
 *   글자를 못 읽었다      → 다시 찍는다
 *   목록에 없는 약이다    → 손으로 고른다
 *
 * 그 둘을 가르는 것이 `unread` 다. OCR 이 아무 글자도 못 냈으면 앞쪽, 글자는
 * 냈는데 표에서 못 찾았으면 뒤쪽이다.
 */

export interface SheetPrescription {
  /** 표에서 찾은 약. 못 찾았으면 `null`. */
  drug: Drug | null;
  /** OCR 이 실제로 읽은 글자. 화면이 "이렇게 읽었다" 를 보여줄 수 있어야 한다. */
  read: string;
  /** 글자 자체가 안 나왔나. `true` 면 다시 찍는 문제, `false` 면 목록에 없는 문제. */
  unread: boolean;
  /** 1회 개수 — 개수칸에서 숫자 하나만 뽑는다. 못 읽으면 `undefined`. */
  count?: number;
  /** 버블에서 나온 일정. 비어 있으면 칸을 안 채운 것이다. */
  schedule: ReturnType<typeof toSchedule>;
}

/** OCR 이 낸 글자에서 숫자 하나. `"2 tablets"` → 2. */
export function readCount(text: string): number | undefined {
  const m = String(text ?? '').match(/\d+/);
  if (!m) return undefined;
  const n = Number(m[0]);
  // 한 번에 열 알을 먹는 처방은 없다. 그보다 큰 수가 나왔다는 것은 함량을 읽은
  // 것이고(500), 그것을 개수로 쓰면 그림이 점 500개를 그리려 든다.
  return n >= 1 && n <= 9 ? n : undefined;
}

/**
 * 읽은 것들을 하나로 묶는다.
 *
 * 순수 함수다 — OCR 은 부르는 쪽이 돌리고 여기는 그 결과만 받는다. 그래야 시험이
 * tesseract 없이 이 판단들을 다 확인할 수 있고, 실제로 확인해야 할 것은 인식이
 * 아니라 **인식이 실패했을 때 무엇을 말하는가**다.
 */
export function readPrescription(
  values: FormSheetValues,
  nameText: string,
  countText = '',
): SheetPrescription {
  const read = String(nameText ?? '').replace(/\s+/g, ' ').trim();
  const match = matchDrug(read);
  return {
    drug: match?.drug ?? null,
    read,
    // 글자가 세 자도 안 나왔으면 읽은 것이 아니다. 두 글자짜리 잡음은 어떤
    // 약 이름도 아니고, 그것을 "목록에 없다" 로 말하면 사람이 종이를 다시 보는
    // 대신 약을 손으로 찾으러 간다.
    unread: read.replace(/[^A-Za-z]/g, '').length < 3,
    count: readCount(countText),
    schedule: toSchedule(values),
  };
}

/** 시각 라벨 — 시간에서 아침·점심·저녁·밤. `clock.ts` 의 `dayPart` 와 같은 경계다. */
function labelFor(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Morning';
  if (hour >= 11 && hour < 16) return 'Noon';
  if (hour >= 16 && hour < 20) return 'Evening';
  return 'Night';
}

const DAY_WORD: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
};

/**
 * 처방 하나를 앱의 `ScanItem` 으로.
 *
 * 이 자리를 지나야 나머지가 다 붙는다 — 판정 엔진, 픽토그램(`itemToDsl`), 알람,
 * 그리고 상자로 가는 일정. 종이에서 읽은 것을 **찍어서 읽은 것과 같은 물건**으로
 * 만드는 것이 요점이고, 그래야 아래쪽 전부가 종이를 따로 알 필요가 없다.
 */
export function toScanItem(rx: SheetPrescription): ScanItem | null {
  if (!rx.drug || rx.schedule.schedule.length === 0) return null;

  const slot = rx.schedule.schedule[0];
  const hour = Number(slot.times[0].slice(0, 2));
  const time = `${String(hour).padStart(2, '0')}:00`;
  const label = labelFor(hour);

  const days = Object.keys(DAY_WORD).filter((d) => slot.days & (1 << Object.keys(DAY_WORD).indexOf(d)));
  const everyDay = days.length === 7;

  const flags: ItemFlag[] = [...(rx.drug.flags ?? [])];

  return {
    id: `sheet_${rx.drug.inn.replace(/[^a-z]/g, '')}_${slot.slot}_${hour}`,
    name: rx.drug.name,
    kind: 'prescription',
    // 그림은 아이콘이 아니라 픽토그램이 맡는다. 이 자리는 옛 호출부가 아직 읽는
    // 값이라 비워 두지 않을 뿐이다.
    emoji: '',
    detectedVia: 'paper form sheet',
    flags,
    rx: {
      dosageText: rx.count
        ? `${rx.count} ${rx.drug.form === 'syrup' ? 'spoon' : 'to take'} at ${time}`
        : `take at ${time}`,
      durationText: slot.durationDays > 0 ? `for ${slot.durationDays} days` : 'ongoing',
      schedule: [{ time, label, emoji: '' }],
      form: rx.drug.form,
      doseCount: rx.count,
      doseText: rx.count ? `${rx.count}` : undefined,
      // 안약·연고는 쓰기 전에 손을 씻어야 한다. 표가 제형을 아니까 여기서 나온다 —
      // OCR 이 그 문장을 못 읽어도 그림에는 뜬다.
      handwash: rx.drug.form === 'eyedrop' || rx.drug.form === 'cream',
      // 현탁액은 흔들어야 한다. 가라앉은 채로 따르면 앞쪽 몇 회분은 묽고 바닥은
      // 진하다 — 같은 5mL 를 재도 들어가는 약의 양이 다르다.
      shake: rx.drug.form === 'syrup',
    },
    chips: [
      { emoji: '', label: `Tray ${slot.slot}` },
      { emoji: '', label: everyDay ? 'Every day' : days.map((d) => DAY_WORD[d].slice(0, 3)).join(' ') },
      { emoji: '', label: slot.durationDays > 0 ? `${slot.durationDays} days` : 'Ongoing' },
    ],
  };
}
