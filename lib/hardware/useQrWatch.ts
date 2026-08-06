'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * 카메라를 열어 두고 QR 이 읽힐 때까지 계속 훑는다.
 *
 * 왜 사진 한 장으로는 안 되는가
 * -----------------------------
 * 처음에는 찍은 사진 한 장에서 QR 을 찾았다. 실제 기기 화면을 찍어 보면 실패한다 —
 * 그리고 실패하는 방식이 나빴다. 같은 사진을 판별 모델에 보내면 **"QR 코드"** 라고
 * 답한다. 그림에 코드는 분명히 있는데 판독기에 닿는 픽셀이 모자란 것이다.
 *
 * 사진 한 장은 QR 을 읽는 도구로 최악이다. 초점을 맞출 기회가 한 번, 각도를 고칠
 * 기회가 없고, 모듈이 몇 픽셀을 받았는지는 셔터를 누른 뒤에야 알게 된다. 2.8인치
 * 화면을 팔 길이에서 찍으면 그 몇 픽셀이 모자라고, 사람은 왜 안 되는지 모른 채
 * 다시 찍는다.
 *
 * 실시간으로 보면 그 셋이 다 없어진다. 초당 여러 번 훑으므로 손이 흔들리다 멎는
 * 순간, 초점이 맞는 순간, 각도가 맞는 순간 중 **아무 때나 한 번**만 맞으면 된다.
 * 폰의 기본 카메라가 QR 을 잘 읽는 이유가 정확히 이것이고, 특별한 알고리즘이 아니다.
 *
 * 권한을 못 받으면 조용히 물러난다
 * --------------------------------
 * `getUserMedia` 는 거절될 수 있고, 안전하지 않은 출처에서는 아예 없다. 그때 이
 * 훅은 아무 일도 안 한 것처럼 끝나고 화면은 원래의 사진 찍기로 굴러간다 — 실시간
 * 판독은 **더 나은 길**이지 유일한 길이 아니다.
 */

/** 얼마나 자주 훑는가. 60fps 를 다 훑으면 폰이 뜨거워지고 얻는 것이 없다. */
const EVERY_MS = 220;

/** 훑을 때 쓰는 긴 변. 이보다 크면 한 번이 이 간격 안에 안 끝난다. */
const EDGE = 900;

export interface QrWatch {
  /** 카메라 미리보기를 붙일 자리. 못 열었으면 붙어도 아무것도 안 나온다. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 카메라가 실제로 돌고 있는가 — 미리보기를 보여줄지 정하는 데 쓴다. */
  live: boolean;
  /**
   * 최근에 읽어낸 QR, 없으면 null.
   *
   * **스스로 아무것도 하지 않는다.** 이 훅은 보기만 하고, 무엇을 할지는 셔터를 누른
   * 쪽이 정한다 — 이 화면의 약속은 "찍으면 알아서 분류된다" 하나이고, QR 만 셔터
   * 없이 처리되면 규칙이 둘이 된다. 상자를 향한 채 음식을 찍으려던 사람이 짝짓기
   * 화면으로 끌려가는 일도 그래서 안 생긴다.
   */
  recent(): string | null;
  /**
   * 이 기기에서 **눌러서 초점 맞추기**가 되는가.
   *
   * 되는 기기에서만 화면이 그 손짓을 받아야 한다. 안 되는데 받아 두면 누르고 아무
   * 일도 안 일어나는 자리가 생기고, 글을 못 읽는 사람에게 그것은 "고장" 으로 읽힌다.
   * `focusMode` 는 Chromium 계열에만 있고 iOS 의 Safari 에는 없다.
   */
  focusable: boolean;
  /** 영상 안의 그 자리(0~1 비율)에 초점을 맞춘다. 안 되는 기기에서는 아무 일도 안 한다. */
  focusAt(x: number, y: number): Promise<void>;
  /**
   * 지금 보이는 화면을 그대로 사진으로 잡는다. 카메라가 안 켜져 있으면 null.
   *
   * 이것이 없으면 화면이 거짓말을 한다 — 실시간 미리보기를 띄워 놓고 셔터를 누르면
   * **시스템 카메라 앱**이 열려서, 사람이 방금 맞춰 놓은 구도를 버리고 처음부터 다시
   * 찍게 된다. 미리보기가 가짜 이모지였을 때는 말이 됐지만, 진짜 영상이 보이는
   * 지금은 셔터가 그 영상을 찍어야 한다.
   */
  capture(): Promise<Blob | null>;
}

/** 읽은 QR 을 얼마나 오래 유효하다고 볼 것인가. 이보다 오래되면 다른 것을 보고 있다. */
const FRESH_MS = 4000;

/**
 * @param enabled 꺼 두면 카메라를 열지 않는다 (다른 처리가 도는 동안 등).
 */
/**
 * 초점이 되는 뒤쪽 카메라를 찾는다. 못 찾으면 `null` — 부르는 쪽이 원래 것을 쓴다.
 *
 * 이름으로 먼저 거른다. 권한을 이미 받은 뒤라 이름이 보이고, 초광각·심도·접사는
 * 초점 장치가 없는 것이 흔하다. 그래도 이름은 기기마다 제멋대로라 **믿지 않고**,
 * 실제로 열어서 `focusMode` 가 있는지 본다.
 *
 * 둘까지만 열어 본다. 렌즈 하나를 여는 데 시간이 들고 그동안 사람은 검은 화면을 본다.
 */
async function pickFocusable(current: MediaStreamTrack): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.enumerateDevices) return null;
  let devices: MediaDeviceInfo[];
  try { devices = await navigator.mediaDevices.enumerateDevices(); } catch { return null; }

  const now = current.getSettings?.().deviceId;
  const SKIP = /ultra|wide|depth|macro|tele|front|user/i;
  const candidates = devices
    .filter((d) => d.kind === 'videoinput' && d.deviceId && d.deviceId !== now)
    .filter((d) => !SKIP.test(d.label))
    .slice(0, 2);

  for (const d of candidates) {
    let s: MediaStream | null = null;
    try {
      s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: d.deviceId }, width: { ideal: 2560 }, height: { ideal: 1440 } },
        audio: false,
      });
      const caps = s.getVideoTracks()[0]?.getCapabilities?.() as { focusMode?: string[] } | undefined;
      if (caps?.focusMode?.includes('continuous')) return s;
      s.getTracks().forEach((t) => t.stop());
    } catch {
      s?.getTracks().forEach((t) => t.stop());
    }
  }
  return null;
}

export function useQrWatch(enabled = true): QrWatch {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [live, setLive] = useState(false);
  /*
    이 기기에서 **눌러서 초점 맞추기**가 되는가.

    되는 기기에서만 화면이 그 손짓을 받는다. 안 되는데 받아 두면, 누르고 아무 일도
    안 일어나는 자리가 생긴다 — 글을 못 읽는 사람에게 그것은 "고장" 으로 읽힌다.
  */
  const [focusable, setFocusable] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const seen = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    let stream: MediaStream | null = null;
    let track: MediaStreamTrack | null = null;
    let onVisible: (() => void) | null = null;

    /** 계속 맞추라고 말한다. 되는 기기에서만, 몇 번을 불러도 안전하게. */
    const keepFocusing = async () => {
      const t = trackRef.current;
      const c = t?.getCapabilities?.() as { focusMode?: string[] } | undefined;
      if (!t || !c?.focusMode?.includes('continuous')) return;
      try {
        await t.applyConstraints({ advanced: [{ focusMode: 'continuous' } as never] });
      } catch { /* 기기가 거절했다. 기본 동작으로 둔다. */ }
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const canvas = document.createElement('canvas');

    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
      stream?.getTracks().forEach((t) => t.stop());
      trackRef.current = null;
      setLive(false);
      setFocusable(false);
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // 뒤쪽 카메라. 상자는 사람 쪽에 있지 않다.
          video: {
          facingMode: { ideal: 'environment' },
          // 셔터가 이 스트림에서 사진을 뜨므로 판독 품질이 여기에 걸린다. 성분표와
          // 처방전을 OCR 로 읽어야 하고, 그 글자는 640x480 에서 살아남지 못한다.
          // `ideal` 이라 못 주는 기기는 줄 수 있는 만큼 준다.
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
          audio: false,
        });
      } catch (err) {
        // 거절, 또는 카메라가 없는 기기. 사진 찍기로 계속 간다.
        console.warn('[qr] 실시간 판독을 못 켰다 — 사진으로 계속한다:', err);
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }

      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      video.setAttribute('playsinline', '');   // iOS 가 전체화면으로 뺏어가지 않게
      video.muted = true;
      try { await video.play(); } catch { /* 자동재생 거절 — 아래에서 걸러진다 */ }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }

      /*
        **초점을 계속 맞추라고 말한다.**

        브라우저 기본값에 맡기고 있었다. 대부분의 기기가 알아서 계속 맞추지만,
        고정 초점으로 시작하거나 한 번 맞춘 뒤 놓아버리는 기기가 있다. 이 앱이
        읽어야 하는 것은 성분표의 작은 글자와 처방전의 손글씨라, 초점 하나가
        "읽힘" 과 "다시 찍으세요" 를 가른다.

        **되는 기기에서만 켜진다.** `focusMode` 는 Chromium 계열이 지원하고 iOS 의
        Safari 에는 없다. 그래서 능력을 물어보고 있을 때만 건다 — 없는 값을 주면
        `applyConstraints` 가 통째로 던지고, 그러면 켜지던 것까지 안 켜진다.
      */
      track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;

      /*
        **초점이 되는 렌즈를 고른다.**

        `facingMode: environment` 는 "뒤쪽" 까지만 말한다. 어느 뒤쪽인지는 기기가
        고르는데, 요즘 폰은 뒤에 렌즈가 서넛이고 **초광각·심도·접사 렌즈는 초점
        장치가 아예 없는 것이 흔하다.** 그런 렌즈를 잡으면 계속 맞추라고 아무리
        말해도 안 맞는다 — 말할 상대가 없다.

        아이폰에서는 안 겪었고 안드로이드에서 겪었다. WebKit 은 애초에 초점 제어를
        안 열어 주므로 기기의 기본 동작(주 렌즈, 자동 초점)이 그대로 나오는데,
        Chromium 계열은 우리가 고르게 해 주면서 잘못 고를 여지도 같이 준다.

        그래서 잡은 렌즈에 `focusMode` 가 없으면 다른 뒤쪽 카메라를 열어 본다. 이름에
        초광각·심도·접사가 들어간 것은 건너뛴다 — 권한을 이미 받았으므로 이름이 보인다.
        둘까지만 시도한다: 렌즈를 하나 여는 데 시간이 들고, 사람은 그동안 검은 화면을
        본다.
      */
      const focusless = (t: MediaStreamTrack | null) => {
        const c = t?.getCapabilities?.() as { focusMode?: string[] } | undefined;
        return !c?.focusMode?.includes('continuous');
      };
      /*
        **다른 렌즈를 열어 보는 것은 위험하다.**

        iOS 는 카메라 스트림을 하나만 허용한다. 이미 열려 있는데 두 번째를 열려고 하면
        **첫 번째가 죽고**, 화면이 검게 남는다. 실제로 그렇게 됐다 — 아이폰에서 카메라
        화면이 갑자기 검정으로 떴다.

        그리고 iOS 에서는 이 시도 자체가 뜻이 없다. WebKit 은 초점 제어를 웹에 안 열어
        주므로 어느 렌즈를 열어도 `focusMode` 가 안 나온다 — 잃을 것만 있고 얻을 것이
        없는 시도였다.

        그래서 **이 브라우저가 `focusMode` 라는 제약을 아는지** 먼저 묻는다.
        `getSupportedConstraints()` 는 스트림을 안 열고도 답하고, iOS 에서는 거짓이다.
      */
      const knowsFocus = !!(navigator.mediaDevices.getSupportedConstraints?.() as
        { focusMode?: boolean } | undefined)?.focusMode;
      if (knowsFocus && track && focusless(track)) {
        const better = await pickFocusable(track);
        if (better && !stopped) {
          stream.getTracks().forEach((t) => t.stop());
          stream = better;
          track = better.getVideoTracks()[0] ?? null;
          trackRef.current = track;
          video.srcObject = better;
          try { await video.play(); } catch { /* 아래에서 걸러진다 */ }
        }
      }

      const caps = track?.getCapabilities?.() as
        { focusMode?: string[]; pointsOfInterest?: unknown } | undefined;
      await keepFocusing();
      /*
        어느 렌즈를 잡았고 무엇을 할 수 있는지 남긴다.

        초점이 안 맞는 것은 화면에서 "흐릿한 사진" 하나로만 보이고, 그 흐릿함이
        고정 초점 렌즈 때문인지 그냥 손이 흔들린 것인지 구별할 방법이 없다. 기기가
        여럿이라 우리 손에 없는 폰에서 물어볼 수 있어야 한다.
      */
      const how = caps?.focusMode?.join('/') ?? 'none';
      console.info('[camera]', track?.label || '(이름 없음)',
                   '· 초점방식', how, '· 지점지정', caps?.pointsOfInterest ? '됨' : '안 됨');

      /*
        **다시 걸어 주는 자리가 둘 있다.**

        기기가 카메라를 잠깐 놓았다가 되찾으면(다른 앱으로 갔다 오거나, 화면이 꺼졌다
        켜지거나) 초점 방식이 기본값으로 돌아가는 기기가 있다. 그러면 이 화면은 계속
        맞추는 줄 알고 있는데 실제로는 안 맞춘다 — 화면에 아무 표시도 안 난다.

        `visibilitychange` 로 돌아온 순간에 한 번 더 건다. 이미 걸려 있으면 같은 값을
        다시 주는 것뿐이라 값이 싸다.
      */
      onVisible = () => { if (document.visibilityState === 'visible') void keepFocusing(); };
      document.addEventListener('visibilitychange', onVisible);

      setFocusable(!!caps?.pointsOfInterest);
      setLive(true);

      timer = setInterval(() => {
        const w0 = video.videoWidth, h0 = video.videoHeight;
        if (!w0 || !h0) return;

        const scale = Math.min(1, EDGE / Math.max(w0, h0));
        const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);

        // 기기 화면은 발광체라 극성이 뒤집혀 보일 수 있다. 양쪽 다 본다.
        const hit = jsQR(ctx.getImageData(0, 0, w, h).data, w, h,
                         { inversionAttempts: 'attemptBoth' });
        if (!hit?.data) return;

        // 멈추지 않는다. 사람이 아직 셔터를 안 눌렀고, 그동안 더 나은 프레임이
        // 올 수도 있다. 기억만 해 둔다.
        seen.current = { text: hit.data, at: Date.now() };
      }, EVERY_MS);
    })();

    return stop;
  }, [enabled]);

  const recent = () => {
    const hit = seen.current;
    return hit && Date.now() - hit.at < FRESH_MS ? hit.text : null;
  };

  /*
    구울 때의 긴 변 상한.

    카메라가 주는 프레임을 그대로 구우면 폰에 따라 4032픽셀이 오고, 그 한 장을 JPEG
    으로 굽는 데만 수백 밀리초가 든다. 그 시간은 셔터를 누른 사람이 그냥 기다리는
    시간이고, 그 뒤의 QR 판독·마커 찾기·업로드가 전부 그 크기에 비례해 더 든다.

    2400 인 이유는 **폼시트 때문**이다. 이 종이의 손글씨 칸은 원본 해상도에서 잘라
    OCR 에 넘긴다(`lib/formsheet/field.ts`) — 실측에서 그 조각이 3712×112 였고, 정규
    격자에서 자른 928×28 보다 훨씬 잘 읽혔다. 여기서 너무 줄이면 그 이득이 사라진다.
    2400 이면 A4 를 화면 가득 채워 찍었을 때 한 줄이 여전히 200픽셀 넘게 남는다.

    이보다 작은 프레임은 그대로 둔다 — 늘리는 것은 얻는 것 없이 파일만 키운다.
  */
  const MAX_EDGE = 2400;

  const capture = async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // JPEG 0.92 — 나머지 경로가 전부 사진 파일을 받으므로 형식을 맞춘다. 무손실로
    // 두면 4메가짜리 PNG 가 OCR 과 판별 요청에 실린다.
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92));
  };

  /**
   * 화면의 그 자리를 보라고 말한다. `x`·`y` 는 영상 안에서의 비율(0~1).
   *
   * **초점 방식은 계속 `continuous` 로 둔다.** 한때 여기서 `single-shot` 으로 한 번
   * 맞추고 2.5초 뒤 되돌렸는데, 그 사이 초점이 그 거리에 붙박인다 — 사람이 종이를
   * 가까이 대거나 손이 흔들리면 안 따라오고, 그 몇 초가 정확히 사진을 찍는 순간이다.
   *
   * `pointsOfInterest` 만 주면 **어디를 볼지**가 바뀌고 계속 따라가는 성질은 남는다.
   * 되돌릴 타이머도 없어진다.
   */
  const focusAt = useCallback(async (x: number, y: number) => {
    const track = trackRef.current;
    if (!track) return;
    const caps = track.getCapabilities?.() as { pointsOfInterest?: unknown } | undefined;
    if (!caps?.pointsOfInterest) return;
    try {
      await track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }] } as never] });
    } catch { /* 기기가 거절했다. 계속 맞추는 것은 그대로다. */ }
  }, []);

  return { videoRef, live, recent, capture, focusable, focusAt };
}
