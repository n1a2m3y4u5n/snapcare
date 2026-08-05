'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAnalysis } from '@/stores/analysis';
import { makeThumb } from '@/lib/photos/store';
import { CameraIcon } from '@/components/icons';
import { decodeEvent } from '@/lib/hardware/protocol';
import { decodeBitmap, grayFrom, RETRY_WORK_DIM } from '@/lib/formsheet/decode';
import { parseFormSheet } from '@/lib/formsheet/sheet';
import { scaleTransform } from '@/lib/formsheet/field';
import { readHandwriting } from '@/lib/formsheet/readName';
import { readPrescription, toScanItem } from '@/lib/formsheet/prescription';
import { lookUpDrug, renameOk } from '@/lib/formsheet/drugLookup';
import { useScans, nowLabel, todayKey } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { planTrays, FITTED_TRAYS } from '@/lib/hardware/dispenser';
import { useReminders } from '@/stores/reminders';
import { estimateOnDevice, warmUp } from '@/lib/nutrition/estimateOnDevice';
import { decodeQrFromImage } from '@/lib/hardware/qr';
import { useQrWatch } from '@/lib/hardware/useQrWatch';
import { readQr } from '@/lib/dispenser/qrIntent';
import { pairWith } from '@/lib/dispenser/paired';
import { DEFAULT_RELAY } from '@/lib/dispenser/relayUrl';
import { requestPermission } from '@/lib/notifications';
import { speak } from '@/lib/voice';
import { Hint } from '@/components/sc/Hint';
import { sayable, ask } from '@/components/sc/Say';
import type { ScanItem } from '@/lib/snapcare/types';


export default function CameraPage() {
  const router = useRouter();
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const setPhoto = useAnalysis((s) => s.setPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  /*
    상자 화면의 복용 결과를 기록에 남기는 데 필요한 것들. 기기 탭에 있던 것을
    그대로 옮겼다 — 트레이 번호만으로는 이름을 못 붙이므로, 알람에서 만든 층 배치가
    이름표를 준다.
  */
  const addScan = useScans((st) => st.addScan);
  const reminders = useReminders((st) => st.reminders);
  const member = useProfile((st) => st.profile);
  const trayNames = useMemo(
    () => planTrays(reminders, FITTED_TRAYS).plan.map((t) => t.name),
    [reminders],
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  /**
   * 대안 경로(샘플 처방전·데모 아이템)는 처음엔 감춰둔다.
   * 사진 찍기가 한 번의 동작으로 끝나야 습관이 되는데, 선택지를 먼저 보여주면
   * 무엇을 눌러야 할지 고르는 일부터 시작된다. 인식이 실패했을 때만 펼친다.
   */

  // 16MB 를 사진 찍은 뒤에 받기 시작하면 그만큼 기다린다. 화면에 들어올 때 미리 받는다.
  useEffect(() => { warmUp(); }, []);

  /*
    이 화면이 열려 있는 동안 뒤에서 계속 QR 을 훑는다. **스스로는 아무것도 안 한다.**

    이 화면의 약속은 하나다 — 무엇이든 찍으면 알아서 분류된다. QR 만 셔터 없이
    처리되면 규칙이 둘이 되고, 상자를 향한 채 음식을 찍으려던 사람이 짝짓기 화면으로
    끌려간다. 그래서 누르는 동작은 그대로 두고, 훑어 둔 것은 **셔터가 쓰는 재료**로만
    쓴다: 사진 한 장이 아니라 그동안 본 수십 프레임 중 읽힌 것을 쓰게 된다.

    이유는 useQrWatch 에 적었다 — 사진 한 장은 QR 을 읽는 도구로 최악이다.
  */
  const { videoRef, live, recent, capture } = useQrWatch(!busy);

  /*
    `?try=` 로 표본을 열던 길이 여기 있었다. 홈의 "TRY IT" 이 그리로 보냈는데, 그
    자리가 없어졌다(궤도를 걷고 아래 줄로 바꾸면서). 들어올 곳이 없는 문은 닫는다 —
    남겨 두면 주소를 아는 사람만 쓰는 숨은 기능이 되고, 그런 것은 고쳐지지 않는다.
  */

  function fail(message: string) {
    setHint(message);
  }

  /**
   * 결과 화면으로 넘어간다. 사진이 있으면 섬네일을 함께 들려 보낸다.
   *
   * 섬네일 만들기를 기다리지 않는다. 판정은 이미 끝났고 사람은 결과를 보러 가는
   * 중인데, 캔버스가 돌아가는 동안 화면이 멈춰 있으면 그 지연이 판정이 느린 것으로
   * 읽힌다. 늦게 도착해도 저장은 결과 화면에서 하므로 늦지 않는다.
   */
  function goWith(item: ScanItem, photo?: string) {
    setCurrent(item);
    setPhoto(null);
    if (photo) void makeThumb(photo).then((t) => { if (t) setPhoto(t); });
    router.push('/scan');
  }

  /**
   * 사진에 QR 이 있으면 그것부터 답한다.
   *
   * 왜 OCR 보다 먼저인가
   * --------------------
   * 이 앱의 약속은 "찍으면 알아서 판단한다" 하나다. 그런데 기기와 짝을 맺는 일만은
   * 그 약속 밖에 있었다 — 설정으로 들어가서, 짝짓기 칸을 찾아서, 라벨의 열 글자를
   * **타이핑**해야 했다. 글을 못 읽는 사람을 전제한 앱에서 그건 사실상 못 하는 일이다.
   *
   * 그래서 상자를 그냥 찍으면 된다. 카메라가 이미 "지금 보이는 게 뭔지" 를 판단하고
   * 있으므로, 기기가 판단 대상 하나로 늘어날 뿐 새로운 동작이 아니다.
   *
   * QR 판독을 먼저 두는 이유는 두 가지다. **싸다** — 축소한 캔버스에서 jsQR 한 번이라
   * Tesseract 를 태우는 것보다 훨씬 빠르다. 그리고 **결정적이다** — QR 은 읽히거나
   * 안 읽히거나이고, 읽혔다면 그것이 무엇인지에 대한 추측이 필요 없다.
   *
   * 라벨에는 QR 이 넷 있고(`lib/dispenser/qrIntent`) 어느 것이 잡힐지는 정해져 있지
   * 않다. 넷을 다 알아보고 각각 답한다 — 우리가 할 수 있는 일이 없는 것까지 포함해서.
   * "찍었는데 아무 일도 안 났다" 는 이 앱의 사용자가 스스로 빠져나올 수 없는 상태다.
   *
   * @returns 처리했으면 true. 그러면 호출한 쪽은 OCR 로 넘어가지 않는다.
   */
  async function handledAsQr(image: string | File | Blob): Promise<boolean> {
    /*
      미리보기에서 이미 읽어 둔 것이 있으면 그것을 쓴다. 같은 코드를 두고 사진 한
      장이 실패하고 프레임 수십 장이 성공하는 일이 실제로 벌어진다 — 손이 멎는 순간,
      초점이 맞는 순간 중 아무 때나 한 번만 맞으면 되기 때문이다.

      없으면 예전처럼 찍은 사진에서 찾는다. 카메라 권한을 못 받았거나 미리보기를
      못 여는 기기가 그 길로 간다.
    */
    const live = recent();
    if (live) return actOnQr(readQr(live));
    return actOnQr(readQr(await decodeQrFromImage(image)));
  }

  /**
   * 읽어낸 QR 하나에 대해 할 일. 사진 경로와 실시간 경로가 같은 것을 쓴다.
   *
   * 두 벌로 두면 한쪽만 고쳐지는 날이 온다 — 이 파일에서 이미 한 번 겪었다.
   */
  async function actOnQr(found: ReturnType<typeof readQr>): Promise<boolean> {

    if (found.kind === 'pair') {
      setStatus('Connecting to the dispenser…');
      try {
        await pairWith(found.claim, DEFAULT_RELAY);
      } catch (err) {
        console.error('[camera] 짝짓기 실패:', err);
        fail('That code did not work. Photograph the label again.');
        return true;
      }
      /*
        알림 권한은 여기서 묻는다 — 상자를 방금 자기 것이라고 말한 사람에게
        "약이 나오면 알려 드릴까요" 는 이어지는 말이다. DispenserPanel 이 같은
        자리에서 같은 이유로 묻는다.
      */
      void requestPermission();
      void speak('This dispenser is now yours. It will tell you when your medicine is ready.');
      router.push('/device');
      return true;
    }

    if (found.kind === 'event') {
      /*
        상자 화면에 뜬 복용 결과. 기기 탭에 따로 있던 것을 여기로 옮겼다.

        옮긴 이유는 자리를 줄이려는 것이 아니라 **찍는 자리가 하나여야** 하기
        때문이다. 사람이 상자 앞에 서서 "이걸 찍어야 하나" 를 물을 때 답이 두 곳이면
        그 중 하나는 안 찾아진다. 이 앱에서 사진을 찍는 자리는 홈 한가운데 하나다.
      */
      const event = decodeEvent(found.sc1);
      if (!event) { fail('That code from the dispenser was damaged. Photograph it again.'); return true; }

      const name = trayNames[event.slot - 1] ?? `Compartment ${event.slot}`;
      addScan({
        id: `dev_${event.seq}_${event.slot}_${event.time}`,
        itemId: `device_slot_${event.slot}`,
        name,
        kind: 'medicine',
        emoji: '',
        memberId: member?.id ?? 'you',
        level: event.taken ? 'safe' : 'caution',
        timeLabel: nowLabel(),
        dayKey: todayKey(),
      });
      const said = event.taken
        ? `${name} taken at ${event.time}.`
        : `${name} was missed at ${event.time}.`;
      void speak(said);
      setHint(said);
      setBusy(false);
      return true;
    }

    if (found.kind === 'device' || found.kind === 'setup') {
      // 기기 자신의 페이지. 우리가 대신 열어 주는 편이 "아무 일도 안 남" 보다 낫다.
      window.location.href = found.url;
      return true;
    }

    if (found.kind === 'wifi') {
      /*
        앱은 폰을 다른 망에 붙일 수 없다 — 브라우저에 그런 권한이 없다. 하지만 무엇을
        찍었는지는 알므로, **다음에 무엇을 찍어야 하는지**를 말해 줄 수 있다. 그것이
        아무 반응이 없는 것과의 차이다.
      */
      fail(found.ssid
        ? `That code joins the dispenser's own WiFi (${found.ssid}). For the app, photograph the code next to it.`
        : "That is the dispenser's WiFi code. For the app, photograph the code next to it.");
      return true;
    }

    return false;
  }

  /**
   * 종이 폼시트를 읽었는가.
   *
   * 기기 탭에 따로 있던 것을 옮겼다. 이 종이는 처방전이고, 처방전을 찍는 자리는
   * 카메라다 — 기기 탭에 있을 때는 "약통을 다루는 화면" 안에 종이 읽기가 들어 있어서,
   * 처방전을 받아 온 사람이 그 화면을 열 이유가 없었다.
   */
  async function handledAsSheet(image: string | File | Blob, shot: string): Promise<boolean> {
    const blob = typeof image === 'string' ? await (await fetch(image)).blob() : image;
    let sheet;
    try {
      setStatus('Looking for the sheet…');
      /*
        사진을 **한 번만 푼다.**

        여기가 같은 blob 을 최대 세 번 디코딩하고 있었다 — 마커를 찾을 작은 판, 못
        찾았을 때의 큰 판, 그리고 칸을 자를 큰 판. 그때마다 JPEG 을 처음부터 다시
        풀었고, 폰이 찍는 12메가픽셀 한 장에서 그 일은 공짜가 아니다. 사람은 그 동안
        셔터를 누른 채 기다린다.

        비트맵 하나를 들고 크기만 다시 뽑는다. 다 쓰면 닫는다 — 안 닫으면 사진 한 장
        분량의 픽셀이 그대로 남는다.
      */
      const bitmap = await decodeBitmap(blob);
      let work;
      let full;
      try {
        work = grayFrom(bitmap);
        sheet = parseFormSheet(work);
        if (!sheet.foundPage) {
          work = grayFrom(bitmap, RETRY_WORK_DIM);
          sheet = parseFormSheet(work);
        }
        if (!sheet.foundPage || !sheet.transform) return false;

        // 이름칸은 더 큰 그림에서 읽는다 — 종이의 4.7mm 라 2000px 배율에서는 글자가
        // 남지 않는다. 마커는 다시 안 찾는다.
        setStatus('Reading the name…');
        full = work.w >= RETRY_WORK_DIM ? work : grayFrom(bitmap, RETRY_WORK_DIM);
      } finally {
        // 여기까지가 비트맵이 필요한 전부다. `grayFrom` 이 픽셀을 복사해 돌려주므로
        // 아래는 이것 없이 돈다 — 사진 한 장 분량을 더 들고 있을 이유가 없다.
        bitmap.close();
      }

      const M = full === work ? sheet.transform
        : scaleTransform(sheet.transform, full.w / work.w);
      const hand = await readHandwriting(full, M,
        (p) => setStatus(`Reading the name… ${Math.round(p * 100)}%`));

      const rx = readPrescription(sheet.values, hand.name, hand.count, hand.notes);

      /*
        표에 없으면 물어본다.

        표에서 맞았으면 안 부른다 — 사람이 쓴 표가 이기고, 부를 이유도 없다. 글자가
        아예 안 나온 경우(`unread`)도 안 부른다: 물어볼 것이 없고, 그때 사람이 할
        일은 다시 찍는 것이다.

        기다리는 것은 이 한 번뿐이고 화면이 그동안 무엇을 하는지 말한다. 안 기다리고
        먼저 띄웠다가 나중에 채우는 방법도 있었는데, 그러면 경고가 뒤늦게 뜬다 —
        사람이 이미 화면을 보고 판단한 다음에 "사실 임신 중에는 안 됩니다" 가 붙는
        것이라, 그 순서는 이 앱에서 가장 나쁜 순서다.
      */
      let lookup = null;
      if (!rx.drug && !rx.unread) {
        setStatus('Looking up the medicine…');
        lookup = await lookUpDrug(rx.read);
        // 이름을 바꾸는 것은 오타 교정일 때만. 아니면 종이에 쓴 글자를 그대로 쓴다.
        if (lookup && !renameOk(rx.read, lookup)) lookup = { ...lookup, name: rx.read };
      }

      const item = toScanItem(rx, lookup);
      if (!item) {
        /*
          종이는 찾았는데 채워진 것이 모자라다. 다른 것을 찍은 것이 아니라 이 종이를
          못 읽은 것이라, 글자 읽기로 넘기지 않고 여기서 말한다.

          **왜 못 읽었는지에 따라 다른 말을 한다.**

          셋이 한 문구로 나가고 있었다. tesseract 를 걷어낸 뒤로 이 칸은 언제나 망이
          필요해졌고, 그래서 망이 끊긴 사람이 "평평하게, 밝은 곳에서 다시 찍으세요"
          를 반복해서 듣게 됐다 — 몇 번을 다시 찍어도 안 바뀌는 일이다. 사람이 할 일이
          다르면 말도 달라야 한다.
        */
        fail(hand.reason === 'offline'
          ? 'The sheet is fine — reading the writing needs a connection. Try again when you are online.'
          : rx.unread
            ? 'Found the sheet, but could not read the medicine name. Photograph it flat, in good light.'
            : `Found the sheet, but ${rx.schedule.missing.join(', ') || 'the drop time'} is missing. Fill that in and photograph it again.`);
        return true;
      }
      goWith(item, shot);
      return true;
    } catch (err) {
      // 이 갈래가 실패해도 사진은 아직 처방전일 수 있다. 글자 읽기로 넘긴다.
      console.error('[camera] 폼시트를 못 읽었다:', err);
      return false;
    }
  }

  /** 셔터. 미리보기가 살아 있으면 그 프레임을, 아니면 시스템 카메라를 쓴다. */
  async function shutter() {
    /*
      **누른 즉시** 화면이 답한다.

      전에는 `capture()` 를 먼저 기다렸다. 그 사이 화면은 아무 일도 안 일어난 것과
      똑같이 생겼는데, 한 프레임을 캔버스에 그려 JPEG 으로 굽는 일은 폰에서 공짜가
      아니다 — 12메가픽셀 프레임이면 수백 밀리초다. 사람은 그 동안 안 눌린 줄 알고
      한 번 더 누른다.

      상태를 먼저 세우면 그 시간이 통째로 사라진다. 실제로 빨라지는 것은 없고,
      **기다리는지 모르는 상태**가 없어진다. 그 둘의 차이가 여기서는 크다 — 이 앱을
      쓰는 사람은 화면이 답하지 않으면 자기가 잘못한 줄 안다.
    */
    setBusy(true);
    setHint(null);
    setStatus('Looking…');
    const started = performance.now();
    const frame = await capture();
    console.info(`[camera] 프레임 ${Math.round(performance.now() - started)}ms`,
                 frame ? `${Math.round(frame.size / 1024)}KB` : '없음');
    if (frame) { void runOcr(frame); return; }
    setBusy(false);
    setStatus(null);
    fileRef.current?.click();
  }

  /** 실제 OCR (Tesseract, 오프라인) → 구조화 처방 */
  async function runOcr(image: string | File | Blob) {
    setBusy(true);
    setHint(null);
    // "글자를 읽는 중" 이라고 먼저 말하지 않는다. 상자를 찍은 사람에게 그것은 틀린
    // 말이고, QR 판독은 그 문구가 한 번 깜빡일 시간보다 빨리 끝난다.
    setStatus('Looking…');
    // 어느 갈래로 가든 사진은 같다. 여기서 한 번만 만들어 둔다.
    const shot = typeof image === 'string' ? image : await toDataUrl(image);
    try {
      // 상자를 찍었는가. 맞으면 여기서 끝난다 — 아래의 어떤 갈래도 QR 을 읽지 못한다.
      if (await handledAsQr(image)) return;

      /*
        종이 폼시트인가. QR 다음, 글자 읽기 **전**이다.

        순서에 이유가 있다. 이 종이는 네 귀퉁이에 마커가 있어서 **읽히거나 안 읽히거나**
        이고 — QR 과 같은 성질이다 — 마커가 없으면 즉시 아니라고 답한다. 반대로 먼저
        OCR 을 태우면 이 종이의 인쇄된 낱말들("LAYER", "DAYS OF WEEK")이 처방전 글로
        읽히고, 그 다음은 아무도 못 고치는 오독이다.
      */
      if (await handledAsSheet(image, shot)) return;

      /*
        글자 읽기는 **Vision 하나로 간다.**

        여기 tesseract 가 있었다. 사진 전체를 OCR 해서 나온 글자로 성분표인지 처방전
        인지 가르고, 성분표면 그 글자를 표로 파싱했다(labelOcr — 같이 지웠다).
        공짜에 오프라인이라는 것이 그 경로의 값어치였다.

        걷어낸 이유는 정확도다. 두 자리에서 나란히 쟀다:

          손글씨 약 이름   tesseract 1/3 (conf 33·41·0)   Vision 3/3
          영양성분표       tesseract 부분 성공             Vision 8/8 칸 일치

        그리고 tesseract 가 잘하는 자리 — 반듯하게 인쇄된 글자 — 는 이 앱에서 드물다.
        사람이 찍는 것은 손으로 쓴 종이와 구겨진 포장지다. 두 번째 인식기를 유지하는
        값(52MB 자산, 두 갈래 코드, 두 벌의 실패 모드)이 그 드문 경우를 위해 치르기에
        비쌌다.

        잃은 것을 적어 둔다: **성분표를 오프라인으로 읽던 길이 없어졌다.** 망이 없으면
        이제 아래 판별도 못 하므로, 그 경우 화면은 "연결이 필요하다" 로 간다.
      */
      // 글자는 있지만 성분표도 처방전도 아니다 → 음식 사진으로 보고 판별에 맡긴다
      await tryVision(image);
      return;
    } catch (err) {
      // 사용자에게는 다시 해보라고만 말하지만, 무엇이 터졌는지는 남긴다.
      // 이 자리가 조용했던 탓에 OCR 이 배포본에서 통째로 죽어 있는 것을 오래 몰랐다 —
      // 화면에는 "다시 시도하세요" 만 뜨고 콘솔에는 아무것도 없어서, 표본이 원래
      // 어려운 것처럼 보였다.
      console.error('[camera] 읽기 실패:', err);
      fail('Could not read that. Try again, or pick one below.');
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  /** 사진 판별 (Vision). 성공하면 결과 화면으로 넘어가고 true를 돌려준다. */
  async function tryVision(image: string | File | Blob): Promise<boolean> {
    const dataUrl = typeof image === 'string' ? image : await toDataUrl(image);

    // 영양 추정은 기기 안에서 먼저 한다 (onnxruntime-web). 인터넷도 서버도 필요 없고,
    // 사진에서 제일 맞히기 어려운 '얼마나 있나'(질량)를 저울 데이터로 배운 모델이 답한다.
    // 실패하면 null 이고, 그때는 Vision 이 혼자 답한다.
    setStatus('Estimating…');
    const blob = typeof image === 'string' ? await (await fetch(image)).blob() : image;
    const modelTotals = await estimateOnDevice(blob);

    // 망이 끊기면 fetch 는 값을 돌려주는 게 아니라 **던진다.** 예전에는 그 예외가
    // runOcr 의 바깥 catch 까지 올라갔고, 두 가지가 함께 잘못됐다.
    //
    //  - 화면에는 "읽지 못했다" 가 떴다. 실제로는 읽었다 — OCR 은 기기에서 돌아
    //    끝까지 갔고 망을 타는 마지막 단계만 실패했다. 사용자는 사진을 다시 찍는다.
    //  - 성분표를 **일부만** 읽어낸 경우, 아래쪽의 "부분적으로라도 읽힌 게 있으면
    //    그것만이라도 쓴다" 갈래에 닿기 전에 예외가 튀어 나갔다. 오프라인에서
    //    반쯤 읽힌 라벨은 그렇게 통째로 버려졌다.
    //
    // 그래서 여기서 잡고 501(서버에 판별 수단이 없음)과 같은 답으로 돌려보낸다.
    // 둘 다 "다시 찍어도 소용없다, 성분표를 찍어라" 이기 때문이다.
    /*
      오프라인 성분표 읽기가 있었을 때는 "성분표를 대신 찍으세요" 가 진짜 출구였다.
      그 경로를 걷어냈으므로(tesseract 제거) 이제 그 말은 할 수 없는 일을 시키는 것이다.
    */
    const NEEDS_NET = 'This needs a connection. Try again when you are online.';

    /*
      밀렸으면 **한 번은 앱이 알아서 다시 보낸다.**

      처방전 200장을 재다가 아홉 장이 503 으로 실패했는데, 한 장씩 다시 보내니 아홉 장
      전부 정상으로 읽혔다. 그 장들의 문제가 아니라 그 순간 상류가 밀린 것이다.

      사용자에게 "다시 눌러 보세요" 라고 말할 수는 있지만, 이 앱의 사용자는 그 문장을
      읽지 못한다. 소리로 들려줘도 한 번 더 누르는 일 자체가 우리가 없애기로 한 종류의
      수고다 — 앱이 대신할 수 있는 일이면 앱이 한다.

      한 번만 한다. 두 번, 세 번 조용히 재시도하면 사용자는 앱이 멈춘 줄 안다.
    */
    async function ask(): Promise<Response> {
      return fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, modelTotals }),
      });
    }

    let res: Response;
    try {
      res = await ask();
      if (res.status === 503) {
        await new Promise((r) => setTimeout(r, 1200));
        res = await ask();
      }
    } catch (err) {
      console.warn('[camera] 판별 요청 실패 (오프라인이면 정상):', err);
      fail(NEEDS_NET);
      return false;
    }
    if (res.status === 501) {
      fail(NEEDS_NET);
      return false;
    }
    /*
      503 은 **잠깐 밀린 것**이다. 사진에는 아무 문제가 없고, 같은 사진을 다시 보내면
      읽힌다. 아래 일반 문구("알아보지 못했습니다")로 묶으면 사용자가 사진을 탓하며
      다시 찍는데, 다시 찍을 이유가 없다 — 그냥 한 번 더 누르면 된다.
    */
    if (res.status === 503) {
      fail('Busy right now — press again in a moment. The photo is fine.');
      return false;
    }
    if (!res.ok) {
      fail('Could not recognise that. Try again, or pick one below.');
      return false;
    }
    const { item } = (await res.json()) as { item: ScanItem };

    /*
      판별이 "코드를 찍은 사진" 이라고 답했다.

      그러면 우리 판독기가 못 푼 것이지 사진이 나쁜 것이 아니다 — 그림 안에 코드는
      분명히 있고, 모델이 그걸 알아봤다. 실제로 기기 화면을 조금 멀리서 찍었을 때
      이렇게 돌아온다:

          Caution for You / Unrecognized image (QR code)
          ⚠ Not sure what this is — check the packet

      그 문장은 두 번 틀렸다. **포장지를 확인하라**고 말하는데 손에 든 것은 약통이고,
      다음에 무엇을 해야 하는지는 한 글자도 없다. 이 앱을 쓰는 사람은 거기서 멈춘다.

      코드는 가까이 대면 읽힌다. 재 보면 모듈이 5px 아래로 내려갈 때 무너지는데,
      그것은 거리의 문제이지 사진 실력의 문제가 아니다. 그러니 그렇게 말한다.
    */
    if (looksLikeACode(item.name)) {
      fail('That is a code, and it needs to be bigger in the picture. Hold the camera about a hand\'s width away and take it again.');
      return true;
    }

    // 사진을 함께 넘긴다. 되짚는 화면에서 "이 날 뭘 먹었나" 에 답하는 것은 이름이
    // 아니라 그림이고, 이름은 읽어야 하지만 자기가 찍은 사진은 안 그렇다.
    goWith(item, dataUrl);
    return true;
  }

  /**
   * 판별이 "이건 코드를 찍은 사진" 이라고 답했는가.
   *
   * 그러면 사진이 나쁜 것이 아니라 우리 판독기에 닿은 픽셀이 모자란 것이다. 모델이
   * 지은 이름을 보고 판단하므로 정확한 검사는 아니지만, 틀려도 손해가 없다 — 최악의
   * 경우 "코드 같다" 는 안내가 한 번 더 뜰 뿐이다.
   */
  function looksLikeACode(name: string): boolean {
    return /\b(qr|barcode|bar code)\b/i.test(name);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) runOcr(file);
  }

  return (
    /*
      화면 높이에 **못박는다.**

      `min-h-screen` 이었다. 최소값이라 안의 것들이 커지면 기둥이 화면보다 길어지고,
      그러면 페이지가 스크롤되면서 셔터가 아래로 조금 밀려 잘린다. 이 화면에서 잘리면
      안 되는 것이 정확히 그 하나다 — 여기서 사람이 하는 일은 셔터를 누르는 것뿐이고,
      영상은 어차피 뒤에 깔려 있어서 스크롤해도 새로 보이는 것이 없다.

      그래서 스크롤을 없애고 자리를 나눈다. 머리글과 셔터 띠는 제 높이를 갖고, 남는
      자리는 영상이 받는다. 대안 목록을 펼쳤을 때만 그 안이 따로 스크롤한다.
    */
    <div className="h-[100dvh] w-full flex justify-center overflow-hidden bg-black">
      <div className="relative w-full sc-shell h-full flex flex-col text-white">
        {/* 머리글. 영상 위라 검은 그라데이션을 깔아 글자가 읽히게 한다. */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-14 pb-3"
             style={{ background: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0))' }}>
          {/*
            나가는 문. 있었지만 **보이지 않았다** — 영상 위에 얹힌 얇은 글자 하나라
            장면에 따라 묻혔고, 그래서 "나갈 버튼도 있어야겠다" 는 말을 들었다.
            있는 것과 보이는 것은 같지 않다.

            둥근 어두운 바탕을 깔아 어떤 장면 위에서도 버튼으로 읽히게 한다. 56px 인
            것은 이 앱의 다른 누를 곳들과 같은 이유다 — 손이 떨리는 사람이 쓴다.

            홈으로 간다. 탭끼리 이어지지 않고 모든 이동이 홈을 지나는 구조라, 여기서
            나가는 곳은 홈 하나뿐이다.
          */}
          <button onClick={() => router.push('/home')} aria-label="Close the camera"
                  className="flex shrink-0 items-center justify-center rounded-full
                             leading-none active:scale-95 transition-transform"
                  style={{ background: 'rgba(0,0,0,0.45)', width: 56, height: 56, fontSize: 28 }}>
            ×
          </button>
          <span className="text-sm font-semibold"
                {...ask('Point at something. Hold the camera over a prescription, a label, or your food.')}>
            Point at something
          </span>
          {/* 제목이 가운데 오도록 반대쪽에 같은 자리를 비운다. */}
          <span className="h-14 w-14 shrink-0" />
        </div>

        {/*
          미리보기는 **화면 전체**다.

          전에는 여백 안의 둥근 창이었는데, 그건 미리보기가 이모지 하나였을 때의
          모양이다. 진짜 영상이 들어온 뒤로는 그 여백이 그대로 손해가 됐다 — 찍을
          것을 보는 면적이 작아지고, 작아진 만큼 사람이 가까이 대기 어려워진다.
          그리고 가까이 대는 것이 이 앱에서 QR 과 작은 글자가 읽히느냐를 가른다.

          그래서 영상을 바닥에 깔고 조작을 그 위에 얹는다. 카메라 앱이 전부 이렇게
          생긴 이유이기도 하고, 홈 화면이 카메라 버튼을 한가운데 크게 둔 것과 같은
          판단이다 — 이 앱에서 가장 중요한 것은 지금 무엇이 보이는가다.
        */}
        <video ref={videoRef} playsInline muted
               className="absolute inset-0 h-full w-full object-cover"
               style={{ opacity: live ? 1 : 0 }} />

        {/*
          조준 틀. 영상 위에 얹으니 위아래 조작 띠를 피해 가운데에만 둔다.
        */}
        {live && (
          <div className="pointer-events-none absolute inset-x-8 top-1/4 bottom-1/4 rounded-3xl"
               style={{ border: '2px solid rgba(255,255,255,0.35)' }} />
        )}

        {/*
          카메라를 못 열었을 때만 나오는 자리. 영상이 있으면 화면을 가리지 않는다.
        */}
        {!live && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            {/*
              카메라를 못 열었을 때의 자리 표시. 📷 였다 — 화면에서 가장 큰 그림이
              기기마다 다른 그림이면, 이 앱이 무엇을 하는 앱인지가 폰마다 달라진다.
            */}
            <span aria-hidden className="leading-none" style={{ fontSize: 56 }}><CameraIcon /></span>
            <span className="text-xs opacity-70"
                  {...sayable('The camera is pointed here. Press the big round button below to take the photograph.')}>
              camera preview
            </span>
          </div>
        )}

        {/* 처리 중이거나 할 말이 있을 때. 영상 위에 뜨되 셔터를 가리지 않는다. */}
        {(busy || hint) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-32 flex flex-col items-center gap-2 px-6 text-center">
            {busy && (
              <span className="rounded-full px-4 py-2 text-xs font-semibold"
                    style={{ background: 'rgba(0,0,0,0.6)' }}
                    {...sayable(status ?? 'Working on it.')}>
                {status ?? 'Analyzing…'}
              </span>
            )}
            {hint && <div className="pointer-events-auto"><Hint text={hint} /></div>}
          </div>
        )}

        {/* 캡처. 화면 아래에 얹고, 영상이 끝까지 보이도록 자리만 차지한다. */}
        <div className="relative z-10 mt-auto flex justify-center pb-2 pt-10"
             style={{ background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0.55))' }}>
          {/*
            보고 있는 것을 찍는다.

            미리보기가 살아 있으면 그 프레임을 그대로 뜬다. 예전에는 여기서 언제나
            시스템 카메라 앱이 열렸는데, 그건 미리보기가 이모지 하나였을 때의 이야기다.
            진짜 영상이 보이는 화면에서 셔터가 다른 앱을 열면, 사람이 방금 맞춰 놓은
            구도를 버리고 처음부터 다시 찍게 된다 — 한 번에 끝나야 할 동작이 두 번이 된다.

            카메라를 못 열었으면 예전 길 그대로다. 권한을 거절했거나 안전하지 않은
            출처이거나 카메라가 없는 기기가 거기로 간다.
          */}
          <button onClick={() => void shutter()} disabled={busy}
                  /* 셔터는 틀이다. rem 이면 가장 큰 글자에서 지름 128px 이 되어
                     그것만으로 화면 아래를 다 먹는다 — 그리고 이 단추는 커진다고
                     더 잘 눌리지도 않는다. 64px 은 이 앱의 다른 어떤 표적보다 크다. */
                  className="shrink-0 rounded-full bg-white/90 active:scale-95 transition-transform disabled:opacity-50"
                  style={{ width: 64, height: 64 }}
                  aria-label="Capture" />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        </div>

        {/*
          표본 목록이 여기 있었다 — 성분표 석 장, 처방전 넉 장, 미리 만든 항목 몇 개.

          걷어낸 이유가 둘이다. **이름이 거짓이었다**: "Can't take a photo?" 라고
          적혀 있었는데 눌러서 나오는 것은 진열대였고, 손이 떨려 못 찍는 사람에게
          남의 성분표 사진은 아무 도움이 안 된다. 그리고 **강제로 열렸다**: 판독이
          한 번 실패하면 `fail()` 이 이 판을 펼쳤고, 다시 찍으려는 사람 앞에서
          영상을 덮은 채 닫을 길이 없었다.

          진짜 출구는 이미 있다. 미리보기를 못 열면 셔터가 시스템 카메라를 열고,
          거기서 이미 찍어 둔 사진을 고를 수 있다.

          시연에서 실물을 못 들고 갈 때는 `/present` 와 시연 모드가 그 자리를 대신한다.
        */}
      </div>
    </div>
  );
}

function toDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
