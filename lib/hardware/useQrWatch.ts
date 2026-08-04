'use client';

import { useEffect, useRef, useState } from 'react';
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
export function useQrWatch(enabled = true): QrWatch {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [live, setLive] = useState(false);
  const seen = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const canvas = document.createElement('canvas');

    const stop = () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      setLive(false);
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

  return { videoRef, live, recent, capture };
}
