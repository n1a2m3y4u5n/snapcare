'use client';

import { useEffect, useState, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';

interface PhotoLog {
  id: string;
  photo_url: string;
  created_at: string;
}

/**
 * 사진 경과 화면 — 업로드 + 그리드
 */
export default function PhotoLogPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [photos, setPhotos] = useState<PhotoLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoTts) speak('사진으로 경과를 기록해요.', 'ko-KR');
    loadPhotos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPhotos() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('photo_logs')
      .select('id, photo_url, created_at')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });
    setPhotos((data as PhotoLog[] | null) ?? []);
    setLoading(false);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    const path = `${user?.id ?? 'anon'}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('photo-logs').upload(path, file);

    if (!error) {
      const { data: urlData } = supabase.storage.from('photo-logs').getPublicUrl(path);
      const photoUrl = urlData.publicUrl;

      await supabase.from('photo_logs').insert({
        user_id: user?.id,
        photo_url: photoUrl,
        created_at: new Date().toISOString(),
      });

      await loadPhotos();
    }
    setUploading(false);
  }

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="text-pink-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-pink-800">📸 사진 경과</h1>
      </div>

      {/* 사진 추가 버튼 */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{ minHeight: 64 }}
        className="w-full mb-4 rounded-2xl bg-pink-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
      >
        {uploading ? '업로드 중...' : '📷 사진 추가'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-label="사진 파일 선택"
      />

      {/* 사진 그리드 */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-pink-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-400">
          <span className="text-6xl">🖼️</span>
          <p className="text-lg">아직 사진이 없어요</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="relative rounded-2xl overflow-hidden aspect-square bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.photo_url}
                alt={`경과 사진 ${new Date(p.created_at).toLocaleDateString('ko-KR')}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs px-2 py-1">
                {new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Screen>
  );
}
