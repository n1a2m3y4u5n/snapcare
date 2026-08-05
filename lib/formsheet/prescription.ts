// 상대 경로 — 시험에서 @/ 별칭이 안 통한다 (lib/snapcare/course.ts 와 같은 이유).
import type { Drug } from '../formulary/who.ts';
import { matchDrug } from '../formulary/match.ts';
import { cleanDrugName, plausibleName } from '../formulary/name.ts';
import { readNotes, type NotesReading } from '../formulary/notes.ts';
import { toSchedule, type FormSheetValues } from '../hardware/formSheet.ts';
import type { ItemFlag, ScanItem } from '../snapcare/types.ts';
import type { DrugLookup } from './lookupTypes.ts';

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
  /**
   * Notes 칸에서 읽은 주의.
   *
   * 종이는 이미 다 인쇄되어 있어서 칸을 새로 팔 수 없다. 그런데 이 종이에는 폭
   * 전체를 쓰는 빈 줄이 이미 있고 아무도 읽지 않고 있었다 — 약사가 봉투에 손으로
   * 적던 것을 거기 적으면 된다. 종이를 안 고치고 자리를 얻는 유일한 길이다.
   */
  notes: NotesReading;
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
  notesText = '',
): SheetPrescription {
  const raw = String(nameText ?? '').replace(/\s+/g, ' ').trim();
  /*
    종이에 인쇄된 말을 먼저 뗀다.

    "Acetaminophen Pill Dispenser Schedule" 이 화면에 떴었다 — 맨 위 제목이 이름칸
    크롭에 걸린 것이다. 그 뒤 절반은 잡음이 아니라 **우리가 인쇄한 글자**라, 버릴
    것이 아니라 떼어내면 이름이 남는다.
  */
  const read = cleanDrugName(raw) || raw;
  const match = matchDrug(read);
  return {
    drug: match?.drug ?? null,
    read,
    /*
      읽은 것으로 칠 수 없는 글자.

      전에는 "글자 세 자 이상" 하나였다. 표에 없는 약도 화면에 띄우기로 하면서 그
      문턱만으로 통과시켰더니 `Sr" 77 eam TR v Spent ee —— eee errr error ——` 가
      약 이름 자리에 앉았고, 문장이 그 위에 지어졌고, 소리로도 나갔다.

      이제 **모양**을 본다(`plausibleName`). 뜻으로 묻지 않는 이유는 이 자리가
      정확히 목록에 없는 약을 받으려고 있기 때문이다.
    */
    unread: !plausibleName(read),
    count: readCount(countText),
    schedule: toSchedule(values),
    notes: readNotes(notesText),
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
 *
 * 표에 없는 약이어도 만든다
 * -------------------------
 * 전에는 `!rx.drug` 이면 `null` 을 냈다. 그래서 이름을 또박또박 쓴 종이가 통째로
 * 거부됐다 — 표는 WHO 필수의약품 94종이고, 세상의 처방은 그보다 많다.
 *
 * 그때 버려지는 것이 이름 하나가 아니라는 게 문제다. 일정 버블, 개수, 주의 문구는
 * 다 읽혔는데 그 전부가 같이 사라졌다. 그리고 이 앱을 쓰는 사람은 **그 종이를 스스로
 * 읽지 못해서** 여기 온 사람이라, 아무것도 안 주는 것이 가장 나쁜 답이다.
 *
 * 대신 확신을 지운다. `unidentified` 를 세우면 판정 엔진이 초록을 안 켜고 "무엇인지
 * 모르겠으니 포장을 확인하라" 를 붙인다 — 이 저장소가 손글씨 처방전에 이미 쓰는
 * 방법이고(`verdict.ts`), 이유도 같다. 지우는 것이 아니라 확신을 지우는 것이다.
 *
 * 표에서 오던 것들(제형·손씻기·흔들기)은 종이가 적은 것만 남는다. 모르는 약의
 * 제형을 지어내면 안약을 알약통으로 그리는 쪽이 아니라 **그 반대**가 나올 수 있다.
 */
export function toScanItem(rx: SheetPrescription, lookup?: DrugLookup | null): ScanItem | null {
  // 일정이 없으면 만들 것이 없다 — 알람도 상자 일정도 여기서 나온다.
  if (rx.schedule.schedule.length === 0) return null;
  // 이름 글자조차 안 나온 것은 다르다. 부를 이름이 없으면 화면에 띄울 물건이 없고,
  // 그 경우 사람이 할 일은 "다시 찍기" 라 여기서 멈추는 것이 맞다.
  if (!rx.drug && rx.unread) return null;

  const slot = rx.schedule.schedule[0];
  const hour = Number(slot.times[0].slice(0, 2));
  const time = `${String(hour).padStart(2, '0')}:00`;
  const label = labelFor(hour);

  const days = Object.keys(DAY_WORD).filter((d) => slot.days & (1 << Object.keys(DAY_WORD).indexOf(d)));
  const everyDay = days.length === 7;

  /*
    표의 플래그와 종이의 플래그를 합친다.

    둘 다 필요하다. 표는 그 약에 언제나 참인 것을 알고(ACE 억제제의 임신 금기),
    종이는 이 조제에만 해당하는 것을 안다(약사가 이 환자에게 금주를 적은 경우).
    한쪽만 쓰면 나머지 절반이 화면에 못 온다.
  */
  /*
    조회 결과는 **표가 침묵할 때만** 섞는다.

    표에서 맞은 약이면 `lookup` 을 아예 안 본다 — 사람이 쓴 것이 늘 이긴다는 규칙이
    이 저장소 전체에 걸려 있고(`say.ts`, `/api/translate`), 여기서만 다르면 그
    규칙이 규칙이 아니다.
  */
  const found = rx.drug ? null : (lookup?.known ? lookup : null);

  /*
    표의 플래그와 종이의 플래그를 합친다.

    둘 다 필요하다. 표는 그 약에 언제나 참인 것을 알고(ACE 억제제의 임신 금기),
    종이는 이 조제에만 해당하는 것을 안다(약사가 이 환자에게 금주를 적은 경우).
    한쪽만 쓰면 나머지 절반이 화면에 못 온다.

    조회에서 온 것은 **더하기만 한다.** 빼는 방향으로는 절대 안 쓴다 — 검증 안 된
    출처가 경고를 지우면 그 조용한 삭제를 아무도 못 본다.
  */
  const flags: ItemFlag[] = [...new Set([
    ...(rx.drug?.flags ?? []),
    ...(found?.flags ?? []),
    ...rx.notes.flags,
  ])];

  return {
    id: `sheet_${(rx.drug?.inn ?? rx.read).toLowerCase().replace(/[^a-z]/g, '')}_${slot.slot}_${hour}`,
    // 표에 없으면 **읽은 글자 그대로** 부른다. 여기서 이름을 지어내면 사람이 종이와
    // 화면을 맞춰 볼 수 없고, 맞춰 보는 것이 이 화면에서 유일한 검산이다.
    name: rx.drug?.name ?? found?.name ?? rx.read,
    kind: 'prescription',
    /*
      표에 없는 약이면 초록을 안 켠다.

      닫힌 어휘가 손글씨 OCR 을 쓸 만하게 만든다는 것이 `match.ts` 의 논지고, 그
      논지는 **맞은 경우에만** 성립한다. 못 맞았으면 우리가 들고 있는 것은 그냥 손글씨
      인식 결과이고, 그것을 확신하고 읽으면 라고스 처방전에서 8hrly 가 8mg 이 된 그
      실패가 그대로 돌아온다.
    */
    unidentified: rx.drug ? undefined : true,
    /*
      조회로 채웠다는 표시. 화면 문구가 이 값으로 갈린다 — "무엇인지 모르겠다" 와
      "우리 목록에 없어 확인 못 한 정보다" 는 사람이 할 일이 다르다.
    */
    lookedUp: found ? true : undefined,
    // 그림은 아이콘이 아니라 픽토그램이 맡는다. 이 자리는 옛 호출부가 아직 읽는
    // 값이라 비워 두지 않을 뿐이다.
    emoji: '',
    detectedVia: 'paper form sheet',
    flags,
    rx: {
      /*
        일정 문장이 그대로 여기 들어간다.

        이 칸은 원래 "어떻게 먹는가" 이고, 화면과 소리가 이미 이것을 읽는다. 문장을
        따로 들고 다니면 그것을 읽어 줄 자리를 화면마다 새로 만들어야 하고, 그러면
        어느 화면에서는 빠진다.
      */
      dosageText: scheduleSentence(rx),
      durationText: slot.durationDays > 0 ? `for ${slot.durationDays} days` : 'ongoing',
      schedule: [{ time, label, emoji: '' }],
      form: rx.drug?.form ?? (found?.form !== 'unknown' ? found?.form : undefined),
      doseCount: rx.count,
      doseText: rx.count ? `${rx.count}` : undefined,
      // 안약·연고는 쓰기 전에 손을 씻어야 한다. 표가 제형을 아니까 여기서 나온다 —
      // OCR 이 그 문장을 못 읽어도 그림에는 뜬다.
      handwash: rx.drug?.form === 'eyedrop' || rx.drug?.form === 'cream'
        || found?.handwash || rx.notes.handwash,
      // 현탁액은 흔들어야 한다. 가라앉은 채로 따르면 앞쪽 몇 회분은 묽고 바닥은
      // 진하다 — 같은 5mL 를 재도 들어가는 약의 양이 다르다.
      shake: rx.drug?.form === 'syrup' || found?.shake || rx.notes.shake,
      noLens: rx.notes.noLens,
      care: rx.notes.care,
      /*
        조회에서 온 한 문장("이 약은 혈압을 낮춥니다")을 종이의 주의 문구 옆에 둔다.
        종이를 못 읽는 사람이 이 약이 무엇인지 아는 유일한 길이고, 화면의 모든 글은
        소리가 붙어 있으므로 눌러서 들을 수 있다.
      */
      notes: [...rx.notes.unknown, ...(found?.purpose ? [found.purpose] : [])],
    },
    chips: [
      { emoji: '', label: `Tray ${slot.slot}` },
      { emoji: '', label: everyDay ? 'Every day' : days.map((d) => DAY_WORD[d].slice(0, 3)).join(' ') },
      { emoji: '', label: slot.durationDays > 0 ? `${slot.durationDays} days` : 'Ongoing' },
    ],
  };
}

/**
 * 일정을 **문장으로**. 그림으로 안 그린다.
 *
 * 왜 이것만 글인가
 * ----------------
 * 이 앱의 규칙은 "글을 못 읽어도 지시가 도착한다" 이지 "모든 것을 그림으로 그린다"
 * 가 아니다. 둘은 다르고, 그 차이가 여기서 드러난다.
 *
 * 그림이 글보다 나은 것은 **말로 옮기면 길어지는 것**들이다 — 안약을 눈에 넣는다,
 * 흔들고 쓴다, 운전하지 않는다. 한 장이면 끝나고 언어가 필요 없다.
 *
 * 요일과 시각과 며칠치는 반대다. `\time_morning` 한 장은 "아침" 까지만 말하고
 * 7시인지 9시인지는 못 말한다. 요일은 형태소가 아예 없어서 그릴 방법이 없고,
 * 30일치는 `\finish_course` 한 장으로 뭉개진다. 그림으로 옮기면 **정확도를 잃으면서
 * 자리는 더 먹는다.**
 *
 * 그리고 이 앱에는 이미 답이 있다. 화면의 모든 글에는 소리가 붙어 있고, 글을 못
 * 읽는 사람은 누르면 듣는다.
 *
 * 문장의 모양
 * -----------
 * 형태는 `describe_pill_schedule.py` 에서 왔다. 옮기면서 셋을 고쳤다.
 *
 *  · **"everyday except" 가 있는 날을 세고 있었다.** 다섯 날이 표시되면 그 다섯을
 *    "빼는 날" 로 적어서 뜻이 정확히 뒤집혔다. 빼는 날은 표시되지 **않은** 날이다.
 *  · 이레가 다 표시되면 `len > 4` 에 먼저 걸려 "everyday except 이레 전부" 가 됐고,
 *    `everyday` 가지는 닿을 수 없었다. 이레부터 갈라낸다.
 *  · 마지막 문장이 `sentence` 가 아니라 `daysofweek` 에 붙고 있었고, f 접두어가
 *    빠져 `{duration}` 이 글자 그대로 나갔다.
 *
 * 그리고 요일을 `MON` 이 아니라 `Monday` 로 적는다. 이 문장이 존재하는 이유가
 * **소리로 듣는 것**인데, 음성 합성기는 `MON` 을 "먼" 이라고 읽는다. 눈으로만 볼
 * 문장이면 약자가 짧아서 낫지만 이 문장은 그런 문장이 아니다.
 */
export function scheduleSentence(rx: SheetPrescription): string {
  const slot = rx.schedule.schedule[0];
  if (!slot) return '';
  /*
    표에 없는 약이어도 문장은 만든다.

    전에는 `!rx.drug` 이면 빈 문자열을 냈다. 그 문장이 이 화면에서 유일하게 "언제
    몇 알" 을 말하는 자리이고 소리도 그것을 읽는다 — 비우면 그 사람이 받는 것은
    아무 말도 없는 화면이다. 버블에서 나온 시각과 요일은 표를 안 거치고 나온 값이라
    약을 못 맞혔다고 해서 덜 확실해지지도 않는다.

    이름만 읽은 글자로 바뀐다. 그것이 사람이 종이와 맞춰 볼 수 있는 유일한 값이다.
  */
  const called = rx.drug?.name ?? rx.read;
  if (!called) return '';

  const raw = Number(slot.times[0].slice(0, 2));
  const pm = raw >= 12;
  const hour = raw === 0 ? 12 : raw > 12 ? raw - 12 : raw;

  const marked = Object.keys(DAY_WORD).filter((_, i) => slot.days & (1 << i));
  const missing = Object.keys(DAY_WORD).filter((_, i) => !(slot.days & (1 << i)));
  const when = marked.length === 7 ? 'everyday'
    : marked.length <= 4 ? `on ${listWords(marked.map((d) => DAY_WORD[d]))}`
      : `everyday except ${listWords(missing.map((d) => DAY_WORD[d]))}`;

  const out = [
    `${called} will drop from layer ${slot.slot}, `
    + `${hour}:00 ${pm ? 'PM' : 'AM'} ${when}.`,
  ];
  if (rx.count) out.push(`Take ${rx.count} each time.`);
  if (slot.durationDays > 0) {
    out.push(`This schedule will be disabled after ${slot.durationDays} days.`);
  }
  return out.join(' ');
}

/** `A, B and C` — 마지막만 and 로. 목록을 소리로 들을 때 끝이 어디인지 알려 준다. */
function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/**
 * 그림에 넘길 때 **일정을 뺀 사본**.
 *
 * 문장이 이미 말한 것을 그림이 다시 말하지 않는다. `Take 2 ... at 7 in the morning`
 * 옆에 `\qty_two` 와 `\time_morning` 이 나란히 서면 같은 사실이 두 번이고, 그 둘은
 * 서로를 확인해 주지도 않는다 — 그림 쪽이 덜 정확하기 때문이다(`time_morning` 은
 * 7시인지 9시인지를 못 말한다).
 *
 * `durationText` 는 **남긴다.** 문장의 "30일치가 있다" 와 `\finish_course` 는 다른
 * 말이다 — 앞은 몇 개가 있는가이고 뒤는 **증상이 가셔도 끝까지 먹으라**는 것이다.
 * 항생제 내성의 주요 경로가 그 지점이라, 이 그림은 일정이 아니라 주의다.
 *
 * 나머지 — 제형, 부위, 손 씻기, 흔들기, 보관, 약사가 적은 주의 — 도 그대로다.
 * 말로 옮기면 길어지는 것들이고, 그림이 글보다 나은 자리가 정확히 거기다.
 */
export function forPictograms(item: ScanItem): ScanItem {
  if (!item.rx) return item;
  return { ...item, rx: { ...item.rx, schedule: [], doseCount: undefined } };
}
