'use client';

import { useEffect, useRef, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { speak } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';

type DocMode = 'prescription' | 'device_manual';

export default function CameraPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<DocMode>('prescription');
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (autoTts) speak('카메라 화면이에요. 진단서를 사각형 안에 맞춰주세요.', 'ko-KR');
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch {
      setCameraError('카메라를 사용할 수 없어요.');
      if (autoTts) speak('카메라를 사용할 수 없어요. 파일 올리기를 이용해주세요.', 'ko-KR');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function handleShutter() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const cropX = canvas.width * 0.05;
    const cropY = canvas.height * 0.2;
    const cropW = canvas.width * 0.9;
    const cropH = canvas.height * 0.6;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    cropCanvas.getContext('2d')?.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const dataUrl = cropCanvas.toDataURL('image/jpeg', 0.9);
    stopCamera();
    sessionStorage.setItem('capturedImage', dataUrl);
    sessionStorage.setItem('docMode', mode);
    router.push('/processing');
  }

  function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      stopCamera();
      sessionStorage.setItem('capturedImage', dataUrl);
      sessionStorage.setItem('docMode', mode);
      router.push('/processing');
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.back()}
        className="absolute top-4 left-4 z-20 text-white text-2xl bg-black/40 rounded-full w-10 h-10 flex items-center justify-center"
      >
        ‹
      </button>

      {/* 모드 토글 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex rounded-full overflow-hidden border border-white/30">
        <button
          onClick={() => setMode('prescription')}
          className={`px-4 py-2 text-sm font-bold transition-colors ${
            mode === 'prescription' ? 'bg-blue-600 text-white' : 'bg-black/40 text-white/70'
          }`}
        >
          📋 진단서
        </button>
        <button
          onClick={() => setMode('device_manual')}
          className={`px-4 py-2 text-sm font-bold transition-colors ${
            mode === 'device_manual' ? 'bg-blue-600 text-white' : 'bg-black/40 text-white/70'
          }`}
        >
          📖 설명서
        </button>
      </div>

      {/* 카메라 뷰 / 에러 */}
      {cameraError ? (
        <div className="flex-1 flex flex-col items-center justify-center text-white gap-4 px-8 text-center">
          <span className="text-5xl">⚠️</span>
          <p className="text-base">{cameraError}</p>
          <p className="text-sm text-white/60">아래 파일 올리기 버튼을 이용해주세요</p>
        </div>
      ) : (
        <div className="flex-1 relative">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
          {/* 가이드 프레임 */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-4 border-white rounded-xl relative" style={{ width: '90%', height: '60%' }}>
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-lg" />
            </div>
          </div>
          <div className="absolute bottom-36 left-0 right-0 text-center">
            <p className="text-white text-sm bg-black/40 mx-auto px-4 py-2 rounded-full inline-block">
              {mode === 'prescription' ? '진단서를 사각형 안에 맞춰주세요' : '설명서를 사각형 안에 맞춰주세요'}
            </p>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* 하단 버튼 — 촬영 + 파일 업로드 항상 노출 */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-8">
        {/* 파일 업로드 — 항상 표시 */}
        <label
          className="flex flex-col items-center justify-center text-white/90 text-xs font-medium gap-1 cursor-pointer active:scale-95 transition-transform"
          aria-label="파일 올리기"
        >
          <span
            className="rounded-full bg-white/15 border border-white/40 flex items-center justify-center text-2xl"
            style={{ width: 60, height: 60 }}
          >
            📁
          </span>
          <span>파일 올리기</span>
          <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        </label>

        {/* 셔터 — 카메라 준비됐을 때만 */}
        <button
          onClick={handleShutter}
          disabled={!ready}
          style={{ width: 80, height: 80 }}
          className="rounded-full bg-white border-4 border-neutral-300 shadow-2xl active:scale-90 transition-transform flex items-center justify-center text-2xl disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="촬영"
        >
          📸
        </button>

        {/* 균형 */}
        <div style={{ width: 60 }} aria-hidden />
      </div>
    </div>
  );
}
