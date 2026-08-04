'use client';

import { useEffect, useRef, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAnalysis } from '@/stores/analysis';
import { makeThumb } from '@/lib/photos/store';
import { getItem } from '@/lib/snapcare/catalog';
import { ocrToScanItem } from '@/lib/snapcare/fromOcr';
import { looksLikeNutritionLabel, looksLikePrescription, parseNutritionLabel } from '@/lib/nutrition/labelOcr';
import { recognizeText } from '@/lib/ocr';
import { estimateOnDevice, warmUp } from '@/lib/nutrition/estimateOnDevice';
import { decodeQrFromImage } from '@/lib/hardware/qr';
import { useQrWatch } from '@/lib/hardware/useQrWatch';
import { readQr } from '@/lib/dispenser/qrIntent';
import { pairWith } from '@/lib/dispenser/paired';
import { DEFAULT_RELAY } from '@/lib/dispenser/relayUrl';
import { requestPermission } from '@/lib/notifications';
import { speak } from '@/lib/voice';
import { Hint } from '@/components/sc/Hint';
import { sayable, ask, Speakable } from '@/components/sc/Say';
import { SAMPLE_LABELS, SAMPLE_RX, sampleBySlug } from '@/lib/snapcare/samples';
import type { ScanItem } from '@/lib/snapcare/types';
import type { NutrientProfile } from '@/lib/nutrition/types';

const DEMO_IDS = ['energy_drink', 'granola_bar', 'amoxicillin', 'ibuprofen'];

export default function CameraPage() {
  const router = useRouter();
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const setPhoto = useAnalysis((s) => s.setPhoto);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  /**
   * 대안 경로(샘플 처방전·데모 아이템)는 처음엔 감춰둔다.
   * 사진 찍기가 한 번의 동작으로 끝나야 습관이 되는데, 선택지를 먼저 보여주면
   * 무엇을 눌러야 할지 고르는 일부터 시작된다. 인식이 실패했을 때만 펼친다.
   */
  const [showOptions, setShowOptions] = useState(false);

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

  /**
   * 홈의 "TRY IT" 에서 표본을 눌러 들어온 경우, 도착하자마자 그 표본을 읽는다.
   *
   * 홈에서 직접 읽지 않고 여기로 보내는 이유: 인식 경로(OCR·모델·판정)가 전부
   * 이 화면에 있다. 홈에 복사하면 두 벌이 되고, 한쪽만 고쳐지는 날이 온다.
   *
   * 슬러그로만 받는다 — 경로를 그대로 받으면 쿼리 문자열이 무엇이든 가져오는
   * 통로가 된다. useSearchParams 대신 location 을 쓰는 것은 이 화면을
   * Suspense 로 감싸지 않기 위해서다 (어차피 effect 안이라 서버에서 돌지 않는다).
   */
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    const sample = sampleBySlug(new URLSearchParams(window.location.search).get('try'));
    if (!sample) return;
    tried.current = true;
    void scanSample(sample.src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fail(message: string) {
    setHint(message);
    setShowOptions(true);
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

  function scanDemo(itemId: string) {
    const item = getItem(itemId);
    if (item) goWith(item);
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
      setStatus('Connecting to the box…');
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
      void speak('This box is now yours. It will tell you when your medicine is ready.');
      router.push('/device');
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
        ? `That code joins the box's own WiFi (${found.ssid}). For the app, photograph the code next to it.`
        : "That is the box's WiFi code. For the app, photograph the code next to it.");
      return true;
    }

    return false;
  }

  /** 셔터. 미리보기가 살아 있으면 그 프레임을, 아니면 시스템 카메라를 쓴다. */
  async function shutter() {
    const frame = await capture();
    if (frame) { void runOcr(frame); return; }
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

      setStatus('Reading text… 0%');
      const text = await recognizeText(image, (p) => setStatus(`Reading text… ${Math.round(p * 100)}%`));
      if (!text || text.trim().length < 4) {
        // 글자가 없는 사진(음식 그 자체) → 사진 판별
        await tryVision(image);
        return;
      }

      // 영양성분표라면 표를 읽어 그대로 계산 엔진에 넣는다.
      // 제품 DB도 인터넷도 필요 없는 경로 — 대상 지역 로컬 식품에서 유일하게 작동한다.
      if (looksLikeNutritionLabel(text)) {
        const parsed = parseNutritionLabel(text);

        // 오프라인으로 전 항목을 검증까지 통과했으면 그대로 쓴다 — 네트워크를 타지 않는다.
        if (parsed.profile && parsed.rejected.length === 0) {
          goWith(labelItem(parsed.profile, parsed.servingGrams), shot);
          return;
        }

        // 일부를 못 읽었다면 인터넷이 있을 때만 판별로 보강한다.
        // 실측상 표 읽기는 Vision이 Tesseract보다 정확했다 (같은 라벨에서 8/8 대 부분성공).
        setStatus('Checking the label…');
        if (await tryVision(image)) return;

        // 보강도 실패 — 부분적으로라도 읽힌 게 있으면 그것만이라도 쓴다.
        if (parsed.profile) {
          goWith(labelItem(parsed.profile, parsed.servingGrams), shot);
          return;
        }
        fail('Could not read the table reliably. Hold steady and fill the frame with the label.');
        return;
      }

      // 처방전도 명시적 신호가 있을 때만 그 경로로 보낸다.
      // 글자가 읽혔다는 이유만으로 처방전 취급하면 음식 사진이 처방전이 된다.
      if (looksLikePrescription(text)) {
        const { item } = ocrToScanItem(text);
        goWith(item, shot);
        return;
      }

      // 글자는 있지만 성분표도 처방전도 아니다 → 음식 사진으로 보고 판별에 맡긴다
      await tryVision(image);
      return;
    } catch (err) {
      // 사용자에게는 다시 해보라고만 말하지만, 무엇이 터졌는지는 남긴다.
      // 이 자리가 조용했던 탓에 OCR 이 배포본에서 통째로 죽어 있는 것을 오래 몰랐다 —
      // 화면에는 "다시 시도하세요" 만 뜨고 콘솔에는 아무것도 없어서, 표본이 원래
      // 어려운 것처럼 보였다.
      console.error('[ocr] 읽기 실패:', err);
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
    const NEEDS_NET = 'Photo recognition needs a connection. Photograph the nutrition label instead, or pick one below.';

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

  /** 성분표에서 읽어낸 프로필을 스캔 아이템으로. */
  function labelItem(profile: NutrientProfile, servingGrams?: number): ScanItem {
    return {
      // 라벨 내용에서 결정론적으로 만든 id (같은 라벨은 같은 id)
      id: `label_${Math.round(profile.per100.energy ?? 0)}_${servingGrams ?? 100}`,
      name: profile.name,
      kind: 'food',
      emoji: '🥫',
      detectedVia: 'nutrition label',
      flags: [],
      profile,
    };
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) runOcr(file);
  }

  async function scanSample(src: string) {
    setBusy(true);
    setStatus('Loading sample…');
    try {
      const blob = await (await fetch(src)).blob();
      await runOcr(blob);
    } catch (err) {
      console.error('[camera] 표본을 불러오지 못했다:', err);
      fail('Sample could not be loaded.');
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-black">
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col text-white">
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
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full
                             text-3xl leading-none active:scale-95 transition-transform"
                  style={{ background: 'rgba(0,0,0,0.45)' }}>
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
            <span className="text-5xl">📷</span>
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
                  className="h-16 w-16 shrink-0 rounded-full bg-white/90 active:scale-95 transition-transform disabled:opacity-50"
                  aria-label="Capture" />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        </div>

        {/*
          인식이 실패하기 전까지는 대안 경로를 감춘다 — 주된 동작은 셔터 하나뿐이다.
          완전히 막아두면 카메라를 못 쓰는 상황에서 갇히므로, 눈에 띄지 않는 링크로만 열어둔다.
        */}
        {!showOptions ? (
          <div className="relative z-10 px-5 pb-8 text-center"
               style={{ background: 'rgba(0,0,0,0.55)' }}>
            <button
              onClick={() => setShowOptions(true)}
              className="inline-flex items-center gap-1 text-xs underline underline-offset-4 opacity-60"
            >
              {/* 물음표. 이 자리는 **카메라를 못 쓴 사람**이 오는 유일한 출구인데
                  글자뿐이었다. 사진을 못 찍는 이유에는 손이 떨리는 것도, 종이가 너무
                  작은 것도 있고(이번 조사에서 AAC 응답자가 짚었다), 그 사람들이
                  정확히 글자로 된 출구를 못 찾는 사람과 겹친다. */}
              <span aria-hidden className="no-underline">❓</span>
              <span {...sayable('Cannot take a photo? Tap here for things you can try instead.')}>Can&apos;t take a photo?</span>
            </button>
          </div>
        ) : (
          /* 대안 목록. 열리면 영상을 덮는다 — 여기서 고르는 동안 미리보기는 방해다. */
          <div className="relative z-10 min-h-screen" style={{ background: '#000' }}>
            <div className="px-5 pt-1">
              <Speakable text={'Try a nutrition label. Tap one and it will be read like a photograph.'} className="text-[11px] font-bold tracking-wide opacity-60 flex w-full items-center gap-2">
          <span className="flex-1">SCAN A NUTRITION LABEL (OCR)</span>
        </Speakable>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {SAMPLE_LABELS.map((s) => (
                  <button key={s.src} onClick={() => scanSample(s.src)} disabled={busy} className="shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    🥫 {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 pt-3">
              <Speakable text={'Try a prescription.'} className="text-[11px] font-bold tracking-wide opacity-60 flex w-full items-center gap-2">
          <span className="flex-1">SCAN A REAL PRESCRIPTION (OCR)</span>
        </Speakable>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {SAMPLE_RX.map((s) => (
                  <button key={s.src} onClick={() => scanSample(s.src)} disabled={busy} className="shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    📄 {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 pb-8 pt-3">
              <Speakable text={'Or try a ready-made item.'} className="text-[11px] font-bold tracking-wide opacity-60 flex w-full items-center gap-2">
          <span className="flex-1">TRY A DEMO ITEM</span>
        </Speakable>
              {/*
                두 칸으로 고정하지 않는다. 글자를 가장 크게 두면 "Peanut chocolate bar"
                한 줄이 반 칸(163px)보다 넓어져 화면 밖으로 밀려났다 — 화면 전체에
                가로 스크롤이 생겼고, 그것은 WCAG 1.4.10 이 막는 것이다.

                최소 너비를 rem 으로 적으면 글자 크기가 그 최소값을 같이 끌어올린다.
                기본 크기에서는 두 칸, 글자를 키우면 저절로 한 칸이 된다. 글자 크기를
                뿌리 font-size 하나로 다루기 때문에 조건문 없이 따라온다.
              */}
              <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
                {DEMO_IDS.map((id) => {
                  const it = getItem(id)!;
                  return (
                    <button key={id} onClick={() => scanDemo(id)} disabled={busy} className="flex items-center gap-2 rounded-2xl px-3 py-3 text-left disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-lg">{it.emoji}</span>
                      <span className="text-xs font-semibold">{it.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
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
