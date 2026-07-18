'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';

interface Contact {
  id: string;
  name: string;
  phone: string;
  relation: string;
}

interface Medication {
  id: string;
  name: string;
}

/**
 * 응급 화면 — 119 전화 + 응급 연락처 + 현재 복용 약
 */
export default function EmergencyPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeMeds, setActiveMeds] = useState<Medication[]>([]);

  useEffect(() => {
    if (autoTts) speak('응급 화면이에요. 119를 누르면 전화해요.', 'ko-KR');
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();

    const [contactsRes, medsRes] = await Promise.all([
      supabase.from('emergency_contacts').select('id, name, phone, relation').eq('user_id', user?.id),
      supabase.from('medications').select('id, name').eq('user_id', user?.id).eq('is_active', true),
    ]);

    setContacts((contactsRes.data as Contact[] | null) ?? []);
    setActiveMeds((medsRes.data as Medication[] | null) ?? []);
  }

  return (
    <Screen hideSos>
      <div className="flex flex-col gap-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-red-600 text-2xl" aria-label="뒤로">‹</button>
          <h1 className="text-2xl font-bold text-red-800">🚨 응급</h1>
        </div>

        {/* 119 대형 버튼 */}
        <a
          href="tel:119"
          style={{ minHeight: 100 }}
          className="flex flex-col items-center justify-center rounded-3xl bg-red-600 text-white shadow-2xl active:scale-95 transition-transform py-6 no-underline"
          aria-label="119 전화"
        >
          <span className="text-6xl">📞</span>
          <span className="text-3xl font-extrabold mt-2">119 전화</span>
        </a>

        {/* 현재 복용 약 */}
        <div>
          <p className="text-base font-bold text-neutral-700 mb-2">💊 현재 복용 약</p>
          {activeMeds.length === 0 ? (
            <p className="text-sm text-neutral-400 bg-neutral-50 rounded-xl p-3">복용 중인 약 없음</p>
          ) : (
            <div className="flex flex-col gap-2">
              {activeMeds.map((m) => (
                <div
                  key={m.id}
                  style={{ minHeight: 48 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100"
                >
                  <span className="text-xl">💊</span>
                  <span className="text-sm font-bold text-red-800">{m.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 응급 연락처 */}
        <div>
          <p className="text-base font-bold text-neutral-700 mb-2">👤 응급 연락처</p>
          {contacts.length === 0 ? (
            <p className="text-sm text-neutral-400 bg-neutral-50 rounded-xl p-3">등록된 연락처 없음</p>
          ) : (
            <div className="flex flex-col gap-2">
              {contacts.map((c) => (
                <a
                  key={c.id}
                  href={`tel:${c.phone}`}
                  style={{ minHeight: 72 }}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-red-50 border-2 border-red-100 no-underline active:scale-95 transition-transform"
                >
                  <span className="text-3xl">👤</span>
                  <div className="flex-1">
                    <p className="font-bold text-red-800">{c.name}</p>
                    <p className="text-xs text-neutral-500">{c.relation} · {c.phone}</p>
                  </div>
                  <span className="text-red-600 text-2xl">📞</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}
