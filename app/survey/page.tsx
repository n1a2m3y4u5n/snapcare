'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PictogramStrip } from '@/components/sc/PictogramStrip';
import { DEMO } from '@/lib/survey/demo';
import { GLYPH_NAMES } from '@/lib/survey/glyphNames';
import {
  BACKGROUND, BRANCHES, CLOSE, CLOSE_CITE, CONSENT, CORE, LANGS, UI, fieldIdOf,
  type Branch, type Item, type Lang,
} from '@/lib/survey/items';

/**
 * 전문가 설문.
 *
 * 링크로 구획을 나눈다. `?s=q3` 이면 Q3 구획만 열린다 — 메일 머지로 사람마다
 * 링크를 다르게 넣으면 조작은 한 번인데 받는 사람은 자기 분야 문항만 본다.
 * 폼 자체를 여덟 개로 쪼개면 공통 코어의 분모가 갈라지므로 그렇게 하지 않는다.
 *
 * `?lang=en|ro` 로 언어를 정한다. 한 폼에서 전환하는 것이 요점이다. 언어마다
 * 폼을 따로 만들면 몰도바 대상자가 별도 집계가 되어 버린다.
 *
 * 픽토그램 이해도 시험은 이 설문에서 뺐다. ISO 9186 과 ANSI Z535.3 의 이해도
 * 시험은 실제 사용자를 대상으로 해야 하는데, 전문가가 우리 그림을 읽어내는지는
 * 글을 읽지 못하는 환자가 읽어내는지에 대해 거의 아무것도 말해 주지 않는다.
 * 전문가에게서 얻은 수치를 기준 통과로 쓰면 통과한 것처럼 보이지만 아니다.
 * 그래서 시험해 달라고 하는 대신 마무리에서 대상자에게 닿는 경로를 묻는다
 * (d1_recruit). 형태소 10개 선정 근거는 lib/survey/glyphs.ts 에 남겨 두었고,
 * 실제 사용자 대상 시험을 할 때 그대로 쓴다.
 *
 * 주소창 인자는 `useSearchParams` 대신 `window.location` 에서 읽는다. 전자는
 * Suspense 경계를 요구해서, 빠뜨리면 프로덕션 빌드가 깨진다. 이 프로젝트에서
 * 실제로 한 번 겪은 일이라 같은 함정을 두 번 밟지 않는다.
 */

const STORE_KEY = 'sc-survey-draft-v1';

type Answers = Record<string, string>;

type Step =
  | { k: 'intro' }
  | { k: 'background' }
  | { k: 'core' }
  | { k: 'branch' }
  | { k: 'close' }
  | { k: 'done' };

export default function SurveyPage() {
  const [lang, setLang] = useState<Lang>('ko');
  /* 데모 안의 스피커를 눌렀는지. 문항으로 묻지 않고 기록한다. */
  const [demoTouched, setDemoTouched] = useState(false);
  /**
   * 수신자 토큰과 접속 맥락.
   *
   * 링크의 `?r=` 값을 그대로 되돌려 보낸다. 서버는 이 불투명한 문자열만 기록하고,
   * 누가 답했는지는 우리 손에 있는 명단으로만 풀린다 — 서버에 이메일과 사람의
   * 대응표를 올리지 않는 것이 요점이다.
   *
   * 시각은 두 개를 남긴다. 시작한 때와 낸 때가 있어야 얼마나 걸렸는지 알 수 있고,
   * 그 값이 문항이 너무 길었는지 판단하는 근거가 된다.
   */
  const [meta] = useState(() => ({ startedAt: new Date().toISOString() }));
  const [recipient, setRecipient] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ k: 'intro' });
  const [consent, setConsent] = useState(false);
  const [ans, setAns] = useState<Answers>({});
  const [cite, setCite] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  /*
   * 주소창 인자와 초안은 **마운트 뒤에만** 읽을 수 있다. 이 페이지는 정적으로
   * 생성되므로 서버에는 `window` 도 `localStorage` 도 없다. 그래서 효과 안에서
   * 상태를 채우는 것이 여기서는 옳은 방식이다 — 외부 시스템에서 한 번 읽어
   * 오는 경우이며, react-hooks/set-state-in-effect 가 겨누는 연쇄 렌더가 아니다.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    /*
     * 링크는 수신자 토큰과 언어만 담는다.
     *
     * 한때 `?s=` 로 직군을 지목하거나 미리 채웠다. 둘 다 뺐다 — 1103명의 직군을
     * 우리가 짐작해 링크에 박으려면 전문분야 문자열을 키워드로 훑어야 하는데, 그
     * 방식은 이 프로젝트에서 이미 두 번 사고를 냈다. 응답자가 첫 문항에서 직접
     * 고르면 틀릴 여지가 없다.
     */
    const r = p.get('r');
    if (r && /^[a-z0-9]{4,32}$/.test(r)) setRecipient(r);
    const l = p.get('lang');
    if (l === 'en' || l === 'ro' || l === 'ko') setLang(l);
    else if (navigator.language?.startsWith('ro')) setLang('ro');
    else if (!navigator.language?.startsWith('ko')) setLang('en');
  }, []);

  /* 초안 복원 — 창을 닫아도 답이 남아야 한다. 자유 서술이 길어서 다시 쓰라고 할 수 없다. */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.ans) setAns(d.ans);
      if (d.cite) setCite(d.cite);
      if (d.consent) setConsent(true);
    } catch { /* 초안이 깨졌으면 그냥 새로 시작한다 */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ans, cite, consent }));
    } catch { /* 용량 초과 등은 무시한다 — 저장 실패가 응답을 막아서는 안 된다 */ }
  }, [ans, cite, consent]);

  const t = useCallback((r: Record<Lang, string>) => r[lang], [lang]);
  const set = (id: string, v: string) => setAns((a) => ({ ...a, [id]: v }));

  /*
   * 구획은 응답자가 고른 분야에 따라 열린다.
   *
   * 처음에는 링크의 `?s=` 로 지목했다. 그것이 잘못이었다 — 1103명의 전문분야를
   * 키워드로 훑어 직군에 매핑해야 하는데, 그 방식은 이 프로젝트에서 이미 두 번
   * 사고를 냈다. 본인이 첫 문항에서 고르면 잘못 배정될 일이 아예 없다.
   */
  const mine = fieldIdOf(ans['b_field']);
  const branchesToShow: Branch[] = useMemo(
    () => (mine ? BRANCHES.filter((b) => b.id === mine) : BRANCHES),
    [mine],
  );

  /** 필수 문항이 비었으면 그 id 를 돌려준다. */
  function firstMissing(items: Item[]): string | null {
    for (const it of items) {
      if (!it.required) continue;
      if (!(ans[it.id] ?? '').trim()) return it.id;
    }
    return null;
  }

  function announce(msg: string) {
    setErr(msg);
    if (liveRef.current) liveRef.current.textContent = msg;
  }

  function advance(next: Step, items?: Item[]) {
    if (items) {
      const miss = firstMissing(items);
      if (miss) {
        announce(t(UI.required));
        document.getElementById(miss)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        document.getElementById(miss)?.focus();
        return;
      }
    }
    announce('');
    setStep(next);
    window.scrollTo({ top: 0 });
  }



  async function submit() {
    setSending(true);
    setFailed(false);
    const payload = {
      consent: true,
      citeConsent: true,
      citeScope: cite,
      lang,
      answers: ans,
      recipient,
      startedAt: meta.startedAt,
      clientTime: new Date().toISOString(),
      // 응답 환경 — 문항이 길어서 중간에 닫았는지, 어느 화면에서 답했는지를
      // 나중에 보려면 필요하다. 개인을 식별하려는 것이 아니므로 사용자
      // 에이전트 문자열은 담지 않고 대략적인 분류만 남긴다.
      env: {
        tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })(),
        locale: navigator.language || null,
        demoTouched,
        screen: window.innerWidth < 700 ? 'mobile' : window.innerWidth < 1100 ? 'tablet' : 'desktop',
        fromLink: recipient !== null,
      },
    };
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      localStorage.removeItem(STORE_KEY);
      setStep({ k: 'done' });
      window.scrollTo({ top: 0 });
    } catch (e) {
      console.error('[survey] 제출 실패:', e);
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  /* ─────────────────────────── 화면 ─────────────────────────── */

  return (
    <main className="mx-auto max-w-2xl px-5 py-8" style={{ color: 'var(--color-sc-ink)' }}>
      <div ref={liveRef} role="status" aria-live="polite" className="sr-only" />

      <header className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{t(UI.title)}</h1>
          <fieldset className="flex gap-1">
            <legend className="sr-only">Language</legend>
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                aria-pressed={lang === l.id}
                className="rounded-lg border px-2 py-1 text-xs"
                style={{
                  borderColor: 'var(--color-sc-line)',
                  background: lang === l.id ? 'var(--color-sc-primary)' : 'transparent',
                  color: lang === l.id ? '#fff' : 'var(--color-sc-muted)',
                }}
              >
                {l.label}
              </button>
            ))}
          </fieldset>
        </div>
        {step.k !== 'intro' && step.k !== 'done' && (
          <p className="text-xs" style={{ color: 'var(--color-sc-muted)' }}>
            {t(UI.progress)} — {stepLabel(step.k, lang)}
          </p>
        )}
      </header>

      {err && (
        <p
          className="mb-4 rounded-xl px-3 py-2 text-sm"
          style={{ background: 'var(--color-pink-50)', color: 'var(--color-pink-800)' }}
        >
          {err}
        </p>
      )}

      {step.k === 'intro' && (
        <section className="space-y-4">
          <p className="text-sm leading-relaxed">{t(UI.intro)}</p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>
            {t(UI.timeNote)}
          </p>
          <div
            className="rounded-2xl border p-4 text-sm leading-relaxed"
            style={{ borderColor: 'var(--color-sc-line)', background: 'var(--color-sc-surface)' }}
          >
            <h2 className="mb-2 font-bold">{t(CONSENT.title)}</h2>
            <p className="mb-3">{t(CONSENT.body)}</p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
              />
              <span>{t(CONSENT.agree)}</span>
            </label>
          </div>
          <button
            type="button"
            disabled={!consent}
            onClick={() => advance({ k: 'background' })}
            className="w-full rounded-2xl px-4 py-3 font-bold disabled:opacity-40"
            style={{ background: 'var(--color-sc-primary)', color: '#fff' }}
          >
            {t(UI.start)}
          </button>
        </section>
      )}

      {step.k === 'background' && (
        <Questions
          items={BACKGROUND}
          {...{ ans, set, t }}
          onNext={() => advance({ k: 'core' }, BACKGROUND)}
          onBack={() => setStep({ k: 'intro' })}
          nextLabel={t(UI.next)}
          backLabel={t(UI.back)}
        />
      )}

      {step.k === 'core' && (
        <>
          {/*
            정지 화면이 아니라 동작하는 것을 넣는다. A3 은 "음성이 문서 설명을
            충분히 대신합니까" 를 묻는데, 스크린샷으로는 음성을 판단할 수 없다.
            보여주지 않은 것을 평가해 달라고 하고 있었던 셈이다.

            그리고 모두가 같은 것을 본다. 어떤 사람은 앱을 열어 보고 어떤 사람은
            그림만 봤다면 답을 나란히 놓을 수 없다.
          */}
          <DemoBlock t={t} lang={lang} onTouch={() => setDemoTouched(true)} />

        <Questions
          items={CORE}
          {...{ ans, set, t }}
          onNext={() => advance({ k: 'branch' }, CORE)}
          onBack={() => setStep({ k: 'background' })}
          nextLabel={t(UI.next)}
          backLabel={t(UI.back)}
        />
        </>
      )}




      {step.k === 'branch' && (
        <section className="space-y-5">
          <p className="text-sm" style={{ color: 'var(--color-sc-muted)' }}>
            {t(UI.branchPick)}
          </p>

          {/*
            판단 문항이 이 화면으로 내려왔으므로 화면을 여기서도 볼 수 있어야 한다.
            "앞서 보신 화면을 기준으로" 라고 물으면서 그 화면을 치워 두면, 기억으로
            답하라는 말이 된다. 접어 두는 것은 이미 본 사람에게 두 번 보여주지 않기
            위해서다.
          */}
          <details className="rounded-2xl border p-3" style={{ borderColor: 'var(--color-sc-line)' }}>
            <summary className="cursor-pointer text-sm font-bold">{t(UI.demoReopen)}</summary>
            <div className="mt-3">
              <DemoBlock t={t} lang={lang} onTouch={() => setDemoTouched(true)} />
            </div>
          </details>
          {branchesToShow.map((b) => (
            <fieldset key={b.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-sc-line)' }}>
              <legend className="px-1 text-sm font-bold">{t(b.title)}</legend>
              <div className="mt-2 space-y-5">
                {b.items.map((it) => (
                  <Field key={it.id} item={it} value={ans[it.id] ?? ''} onChange={(v) => set(it.id, v)}
                          followValue={ans[`${it.id}__why`] ?? ''} onFollowChange={(v) => set(`${it.id}__why`, v)}
                          t={t} />
                ))}
              </div>
            </fieldset>
          ))}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep({ k: 'core' })}
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: 'var(--color-sc-line)' }}
            >
              {t(UI.back)}
            </button>
            <button
              type="button"
              onClick={() => advance({ k: 'close' }, branchesToShow.flatMap((b) => b.items))}
              className="flex-1 rounded-2xl px-4 py-3 font-bold"
              style={{ background: 'var(--color-sc-primary)', color: '#fff' }}
            >
              {t(UI.next)}
            </button>
          </div>
        </section>
      )}

      {step.k === 'close' && (
        <section className="space-y-5">
          <fieldset>
            <legend id="cite-legend" className="mb-2 text-sm font-bold">
              {t(CLOSE_CITE.q)}
              <span aria-hidden> *</span>
            </legend>
            <div className="space-y-2">
              {CLOSE_CITE.options.map((o) => (
                <label key={o.en} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="cite"
                    checked={cite === o.en}
                    onChange={() => setCite(o.en)}
                    className="mt-1"
                  />
                  <span>{t(o)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {CLOSE.map((it) => (
            <Field key={it.id} item={it} value={ans[it.id] ?? ''} onChange={(v) => set(it.id, v)}
                          followValue={ans[`${it.id}__why`] ?? ''} onFollowChange={(v) => set(`${it.id}__why`, v)}
                          t={t} />
          ))}

          {failed && (
            <p
              className="rounded-xl px-3 py-2 text-sm"
              style={{ background: 'var(--color-pink-50)', color: 'var(--color-pink-800)' }}
            >
              {t(UI.saveFail)}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep({ k: 'branch' })}
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: 'var(--color-sc-line)' }}
            >
              {t(UI.back)}
            </button>
            <button
              type="button"
              onClick={() => {
                // 동의문에서 "마지막 문항에서 직접 고르실 수 있습니다" 라고 약속했다.
                // 비운 채 제출되면 인용해도 되는지 우리가 알 수 없다.
                if (!cite) {
                  announce(t(UI.required));
                  document.getElementById('cite-legend')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  return;
                }
                submit();
              }}
              disabled={sending}
              className="flex-1 rounded-2xl px-4 py-3 font-bold disabled:opacity-50"
              style={{ background: 'var(--color-sc-primary)', color: '#fff' }}
            >
              {failed ? t(UI.retry) : t(UI.submit)}
            </button>
          </div>
        </section>
      )}

      {step.k === 'done' && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{t(UI.thanksTitle)}</h2>
          <p className="text-sm leading-relaxed">{t(UI.thanksBody)}</p>
        </section>
      )}
    </main>
  );
}

/* ─────────────────────────── 부품 ─────────────────────────── */

/**
 * 저희가 만든 화면.
 *
 * 두 곳에서 쓴다 — 보여주는 단계와, 그것을 판단하는 문항이 있는 분야별 단계. 같은
 * 것을 두 번 적어 두면 한쪽만 고치는 사고가 난다.
 *
 * `onTouch` 는 응답자가 이 안의 버튼(스피커)을 실제로 눌렀는지를 알린다. 한때
 * "소리를 들어 보셨습니까" 를 문항으로 물었는데, 우리가 기록으로 알 수 있는 것을
 * 사람에게 묻는 것은 칸을 낭비하는 일이다.
 */
/**
 * 저희가 만든 것을 소개하는 화면.
 *
 * 두 곳에서 쓴다 — 보여주는 단계와, 그것을 판단하는 문항이 있는 분야별 단계. 같은
 * 것을 두 번 적어 두면 한쪽만 고치는 사고가 난다.
 *
 * 처음에는 처방 문구 한 줄과 픽토그램만 있었다. 그것으로는 우리가 무엇을 했는지
 * 전해지지 않는다 — 받는 분은 그림 몇 장을 보고 이 프로젝트를 판단해야 했다. 아이디어,
 * 어떻게 굴러가는지, 무엇을 목표로 하는지를 먼저 적고, 처방전 원본과 결과를 위아래로
 * 붙여 무엇이 무엇으로 바뀌는지 보이게 한다.
 *
 * `onTouch` 는 응답자가 이 안의 버튼(스피커)을 실제로 눌렀는지를 알린다. 한때
 * "소리를 들어 보셨습니까" 를 문항으로 물었는데, 우리가 기록으로 알 수 있는 것을
 * 사람에게 묻는 것은 칸을 낭비하는 일이다.
 */
function DemoBlock({
  t, lang, onTouch,
}: {
  t: (r: Record<Lang, string>) => string;
  lang: Lang;
  onTouch: () => void;
}) {
  const card = { borderColor: 'var(--color-sc-line)', background: 'var(--color-sc-surface)' };
  const muted = { color: 'var(--color-sc-muted)' };
  return (
    <section
      className="mb-7"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button')) onTouch();
      }}
    >
      {/* 1. 아이디어 */}
      <h2 className="text-sm font-bold">{t(UI.ideaTitle)}</h2>
      <p className="mt-1 text-sm leading-relaxed">{t(UI.ideaBody)}</p>

      {/* 2. 동작 원리 — 네 단계. 각 단계는 한 줄 요약과 그 아래 설명으로 나눈다. */}
      <h2 className="mt-6 text-sm font-bold">{t(UI.howTitle)}</h2>
      <ol className="mt-2 space-y-3">
        {([
          [UI.how1, UI.how1b],
          [UI.how2, UI.how2b],
          [UI.how3, UI.how3b],
          [UI.how4, UI.how4b],
        ] as const).map(([head, body], i) => (
          <li key={i} className="rounded-2xl border p-3" style={card}>
            <p className="text-sm font-bold">{t(head)}</p>
            <p className="mt-1 text-xs leading-relaxed" style={muted}>{t(body)}</p>
          </li>
        ))}
      </ol>

      {/* 3. SDG */}
      <h2 className="mt-6 text-sm font-bold">{t(UI.sdgTitle)}</h2>
      <ul className="mt-2 space-y-2">
        {[UI.sdg34, UI.sdg38, UI.sdg3d].map((g, i) => (
          <li key={i} className="rounded-2xl border p-3 text-xs leading-relaxed" style={card}>
            {t(g)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed" style={muted}>{t(UI.sdgNote)}</p>

      {/* 4. 처방전 원본 → 결과 */}
      <h2 className="mt-6 text-sm font-bold">{t(UI.demoTitle)}</h2>
      <p className="mt-1 text-xs leading-relaxed" style={muted}>{t(UI.demoNote)}</p>
      {DEMO.map((d) => (
        <div key={d.id} className="mt-3 rounded-2xl border p-3" style={card}>
          <p className="text-[11px] font-bold tracking-wide" style={muted}>{t(UI.beforeLabel)}</p>
          {/*
            처방전 원본. width/height 를 적는다 — 크기를 비워 두면 clientHeight 가 0 이
            되고, loading="lazy" 가 화면 밖으로 판단해 영원히 받아오지 않는다. 형태소
            78장에서 이미 겪은 일이다.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={d.image}
            alt={d.rx[lang]}
            width={620}
            height={470}
            className="mt-1 w-full rounded-xl border bg-white"
            style={{ borderColor: 'var(--color-sc-line)' }}
          />
          <p className="mt-2 text-[11px] font-bold tracking-wide" style={muted}>{t(UI.rxSpoken)}</p>
          <p className="mt-1 text-sm leading-relaxed">{d.rx[lang]}</p>

          <p className="mt-4 text-[11px] font-bold tracking-wide" style={muted}>{t(UI.afterLabel)}</p>
          {/*
            픽토그램이 다섯 장을 넘으면 가로로 밀려 잘린다. 앱 컴포넌트를 고치는 대신
            이 자리에서만 줄바꿈하게 덮어쓴다 — 앱의 좁은 화면에서는 가로 스크롤이 맞다.
          */}
          <div className="[&_.overflow-x-auto]:flex-wrap [&_.overflow-x-auto]:overflow-x-visible">
            <PictogramStrip source={d.dsl} />
          </div>
          <p className="mt-2 text-[11px] font-bold tracking-wide" style={muted}>{t(UI.showsLabel)}</p>
          <p className="mt-1 text-xs leading-relaxed" style={muted}>{d.shows[lang]}</p>
        </div>
      ))}

      {/*
        형태소 전체를 접어 둔다. AAC·HCI·디자인 문항은 이 세트를 봐야 답이 달라지지만,
        78장을 펼쳐 두면 다른 응답자에게는 화면만 길어진다.
      */}
      <details className="mt-3 rounded-2xl border p-3" style={{ borderColor: 'var(--color-sc-line)' }}>
        <summary className="cursor-pointer text-xs font-bold">{t(UI.glyphsToggle)}</summary>
        <p className="mt-2 text-xs leading-relaxed" style={muted}>{t(UI.glyphsNote)}</p>
        <div className="mt-2 grid grid-cols-6 gap-1 sm:grid-cols-10">
          {GLYPH_NAMES.map((g) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={g} src={`/glyphs/${g}.png`} alt={g} width={512} height={512}
                 className="aspect-square w-full rounded bg-white object-contain p-0.5" />
          ))}
        </div>
      </details>
      <a href="/" target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline"
         style={{ color: 'var(--color-sc-primary)' }}>
        {t(UI.tryIt)}
      </a>
    </section>
  );
}


function stepLabel(k: Step['k'], lang: Lang): string {
  const m: Record<string, Record<Lang, string>> = {
    background: { ko: '응답자 배경', en: 'About you', ro: 'Despre dumneavoastră' },
    core: { ko: '저희가 만든 것', en: 'What we built', ro: 'Ce am construit' },
    branch: { ko: '분야별 문항', en: 'Field questions', ro: 'Întrebări pe domeniu' },
    close: { ko: '마무리', en: 'Finish', ro: 'Finalizare' },
  };
  return m[k]?.[lang] ?? '';
}

function Questions({
  items, ans, set, t, onNext, onBack, nextLabel, backLabel,
}: {
  items: Item[];
  ans: Answers;
  set: (id: string, v: string) => void;
  t: (r: Record<Lang, string>) => string;
  onNext: () => void;
  onBack: () => void;
  nextLabel: string;
  backLabel: string;
}) {
  return (
    <section className="space-y-6">
      {items.map((it) => (
        <Field key={it.id} item={it} value={ans[it.id] ?? ''} onChange={(v) => set(it.id, v)}
                          followValue={ans[`${it.id}__why`] ?? ''} onFollowChange={(v) => set(`${it.id}__why`, v)}
                          t={t} />
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--color-sc-line)' }}>
          {backLabel}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-2xl px-4 py-3 font-bold"
          style={{ background: 'var(--color-sc-primary)', color: '#fff' }}
        >
          {nextLabel}
        </button>
      </div>
    </section>
  );
}

/**
 * 문항 한 개.
 *
 * 선택지는 `fieldset` + `legend` 로 묶는다. `div` 에 라벨만 붙이면 스크린리더가
 * 어느 질문의 선택지인지 읽어 주지 못한다. 우리 응답자 명단에 W3C WAI 와 인지
 * 접근성 연구자가 들어 있어서, 이 부분이 틀리면 그 한 번으로 신뢰를 잃는다.
 */
function Field({
  item, value, onChange, t, followValue = '', onFollowChange,
}: {
  item: Item;
  value: string;
  onChange: (v: string) => void;
  t: (r: Record<Lang, string>) => string;
  followValue?: string;
  onFollowChange?: (v: string) => void;
}) {
  const noteId = item.note ? `${item.id}-note` : undefined;
  const followId = `${item.id}__why`;

  if (item.kind === 'single') {
    return (
      <fieldset>
        <legend className="text-sm font-bold">
          {t(item.q)}
          {item.required && <span aria-hidden> *</span>}
        </legend>
        {item.note && (
          <p id={noteId} className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>
            {t(item.note)}
          </p>
        )}
        <div className="mt-2 space-y-2" aria-describedby={noteId}>
          {item.options?.map((o, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                id={i === 0 ? item.id : undefined}
                name={item.id}
                checked={value === o.en}
                onChange={() => onChange(o.en)}
                className="mt-1"
              />
              <span>{t(o)}</span>
            </label>
          ))}
        </div>
        {item.follow && (
          <div className="mt-3">
            <label htmlFor={followId} className="text-xs" style={{ color: 'var(--color-sc-muted)' }}>
              {t(item.follow)}
            </label>
            <textarea
              id={followId}
              rows={2}
              value={followValue}
              onChange={(e) => onFollowChange?.(e.target.value)}
              className="mt-1 w-full rounded-xl border p-2 text-sm"
              style={{ borderColor: 'var(--color-sc-line)' }}
            />
          </div>
        )}
      </fieldset>
    );
  }

  const box = 'mt-2 w-full rounded-xl border p-2 text-sm';
  return (
    <div>
      <label htmlFor={item.id} className="text-sm font-bold">
        {t(item.q)}
        {item.required ? <span aria-hidden> *</span> : (
          <span className="ml-1 text-xs font-normal" style={{ color: 'var(--color-sc-muted)' }}>
            ({t(UI.optional)})
          </span>
        )}
      </label>
      {item.note && (
        <p id={noteId} className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>
          {t(item.note)}
        </p>
      )}
      {item.kind === 'longtext' ? (
        <textarea
          id={item.id}
          aria-describedby={noteId}
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={box}
          style={{ borderColor: 'var(--color-sc-line)' }}
        />
      ) : (
        <input
          id={item.id}
          type="text"
          aria-describedby={noteId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={box}
          style={{ borderColor: 'var(--color-sc-line)' }}
        />
      )}
    </div>
  );
}

