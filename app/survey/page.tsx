'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  BACKGROUND, BRANCHES, CLOSE, CLOSE_CITE, CONSENT, CORE, LANGS, UI,
  type Branch, type Item, type Lang,
} from '@/lib/survey/items';
import { TEST_GLYPHS, glyphSrc, shuffled, type TestGlyph } from '@/lib/survey/glyphs';

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
 * 주소창 인자는 `useSearchParams` 대신 `window.location` 에서 읽는다. 전자는
 * Suspense 경계를 요구해서, 빠뜨리면 프로덕션 빌드가 깨진다. 이 프로젝트에서
 * 실제로 한 번 겪은 일이라 같은 함정을 두 번 밟지 않는다.
 */

const STORE_KEY = 'sc-survey-draft-v1';

type Answers = Record<string, string>;
type GlyphAnswer = { name: string; guess: string; dontKnow: boolean; confidence: string; ms: number };

type Step =
  | { k: 'intro' }
  | { k: 'background' }
  | { k: 'core' }
  | { k: 'testAsk' }
  | { k: 'test' }
  | { k: 'testDone' }
  | { k: 'branch' }
  | { k: 'close' }
  | { k: 'done' };

export default function SurveyPage() {
  const [lang, setLang] = useState<Lang>('ko');
  const [pinned, setPinned] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ k: 'intro' });
  const [consent, setConsent] = useState(false);
  const [citeOk, setCiteOk] = useState(false);
  const [ans, setAns] = useState<Answers>({});
  const [cite, setCite] = useState('');
  const [glyphs, setGlyphs] = useState<TestGlyph[]>([]);
  const [gi, setGi] = useState(0);
  const [gAns, setGAns] = useState<GlyphAnswer[]>([]);
  const [openBranches, setOpenBranches] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const shownAt = useRef<number>(0);
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
    const s = p.get('s');
    if (s && BRANCHES.some((b) => b.id === s)) {
      setPinned(s);
      setOpenBranches([s]);
    }
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
      if (d.gAns) setGAns(d.gAns);
      if (d.cite) setCite(d.cite);
      if (d.consent) setConsent(true);
      if (d.citeOk) setCiteOk(true);
    } catch { /* 초안이 깨졌으면 그냥 새로 시작한다 */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ans, gAns, cite, consent, citeOk }));
    } catch { /* 용량 초과 등은 무시한다 — 저장 실패가 응답을 막아서는 안 된다 */ }
  }, [ans, gAns, cite, consent, citeOk]);

  const t = useCallback((r: Record<Lang, string>) => r[lang], [lang]);
  const set = (id: string, v: string) => setAns((a) => ({ ...a, [id]: v }));

  const branchesToShow: Branch[] = useMemo(
    () => (pinned ? BRANCHES.filter((b) => b.id === pinned) : BRANCHES),
    [pinned],
  );
  const otherBranches: Branch[] = useMemo(
    () => (pinned ? BRANCHES.filter((b) => b.id !== pinned) : []),
    [pinned],
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

  function startTest() {
    setGlyphs(shuffled(TEST_GLYPHS));
    setGi(0);
    shownAt.current = Date.now();
    setStep({ k: 'test' });
    window.scrollTo({ top: 0 });
  }

  function saveGlyph(guess: string, dontKnow: boolean, confidence: string) {
    const g = glyphs[gi];
    setGAns((prev) => [
      ...prev.filter((x) => x.name !== g.name),
      { name: g.name, guess, dontKnow, confidence, ms: Date.now() - shownAt.current },
    ]);
    if (gi + 1 < glyphs.length) {
      setGi(gi + 1);
      shownAt.current = Date.now();
      window.scrollTo({ top: 0 });
    } else {
      setStep({ k: 'testDone' });
      window.scrollTo({ top: 0 });
    }
  }

  async function submit() {
    setSending(true);
    setFailed(false);
    const payload = {
      consent: true,
      citeConsent: citeOk,
      citeScope: cite,
      lang,
      pinnedSection: pinned,
      answers: ans,
      glyphTest: gAns.length ? gAns : null,
      openedBranches: openBranches,
      clientTime: new Date().toISOString(),
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
            <label className="mb-2 flex items-start gap-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
              />
              <span>{t(CONSENT.agree)}</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={citeOk}
                onChange={(e) => setCiteOk(e.target.checked)}
                className="mt-1"
              />
              <span>{t(CONSENT.cite)}</span>
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
        <Questions
          items={CORE}
          {...{ ans, set, t }}
          onNext={() => advance({ k: 'testAsk' }, CORE)}
          onBack={() => setStep({ k: 'background' })}
          nextLabel={t(UI.next)}
          backLabel={t(UI.back)}
        />
      )}

      {step.k === 'testAsk' && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold">{t(TEST_ASK.title)}</h2>
          <p className="text-sm leading-relaxed">{t(TEST_ASK.body)}</p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>
            {t(TEST_ASK.a11y)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startTest}
              className="flex-1 rounded-2xl px-4 py-3 font-bold"
              style={{ background: 'var(--color-sc-primary)', color: '#fff' }}
            >
              {t(TEST_ASK.yes)}
            </button>
            <button
              type="button"
              onClick={() => advance({ k: 'branch' })}
              className="flex-1 rounded-2xl border px-4 py-3"
              style={{ borderColor: 'var(--color-sc-line)' }}
            >
              {t(TEST_ASK.no)}
            </button>
          </div>
        </section>
      )}

      {step.k === 'test' && glyphs[gi] && (
        <GlyphStep
          key={glyphs[gi].name}
          glyph={glyphs[gi]}
          index={gi}
          total={glyphs.length}
          lang={lang}
          onSave={saveGlyph}
        />
      )}

      {step.k === 'testDone' && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold">{t(TEST_ASK.revealTitle)}</h2>
          <p className="text-sm leading-relaxed">{t(TEST_ASK.revealBody)}</p>
          <ul className="space-y-2">
            {glyphs.map((g) => {
              const a = gAns.find((x) => x.name === g.name);
              return (
                <li
                  key={g.name}
                  className="flex items-center gap-3 rounded-xl border p-2"
                  style={{ borderColor: 'var(--color-sc-line)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={glyphSrc(g.name)} alt="" aria-hidden className="h-14 w-14 shrink-0 bg-white p-1" />
                  <div className="min-w-0 text-sm">
                    <p className="font-bold">{g.intended[lang]}</p>
                    <p className="truncate" style={{ color: 'var(--color-sc-muted)' }}>
                      {a?.dontKnow ? '—' : a?.guess}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => advance({ k: 'branch' })}
            className="w-full rounded-2xl px-4 py-3 font-bold"
            style={{ background: 'var(--color-sc-primary)', color: '#fff' }}
          >
            {t(UI.next)}
          </button>
        </section>
      )}

      {step.k === 'branch' && (
        <section className="space-y-5">
          <p className="text-sm" style={{ color: 'var(--color-sc-muted)' }}>
            {t(UI.branchPick)}
          </p>
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

          {otherBranches.length > 0 && (
            <details className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-sc-line)' }}>
              <summary className="cursor-pointer text-sm font-bold">{t(TEST_ASK.moreSections)}</summary>
              <div className="mt-4 space-y-5">
                {otherBranches.map((b) => (
                  <details
                    key={b.id}
                    onToggle={(e) =>
                      setOpenBranches((o) =>
                        (e.currentTarget as HTMLDetailsElement).open ? [...new Set([...o, b.id])] : o.filter((x) => x !== b.id),
                      )
                    }
                  >
                    <summary className="cursor-pointer text-sm">{t(b.title)}</summary>
                    <div className="mt-3 space-y-5">
                      {b.items.map((it) => (
                        <Field key={it.id} item={it} value={ans[it.id] ?? ''} onChange={(v) => set(it.id, v)}
                          followValue={ans[`${it.id}__why`] ?? ''} onFollowChange={(v) => set(`${it.id}__why`, v)}
                          t={t} />
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep({ k: 'testAsk' })}
              className="rounded-2xl border px-4 py-3"
              style={{ borderColor: 'var(--color-sc-line)' }}
            >
              {t(UI.back)}
            </button>
            <button
              type="button"
              onClick={() => advance({ k: 'close' })}
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
            <legend className="mb-2 text-sm font-bold">{t(CLOSE_CITE.q)}</legend>
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
              onClick={submit}
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

function stepLabel(k: Step['k'], lang: Lang): string {
  const m: Record<string, Record<Lang, string>> = {
    background: { ko: '응답자 배경', en: 'About you', ro: 'Despre dumneavoastră' },
    core: { ko: '공통 문항', en: 'Common questions', ro: 'Întrebări comune' },
    testAsk: { ko: '이해도 시험 안내', en: 'Comprehension test', ro: 'Test de comprehensiune' },
    test: { ko: '이해도 시험', en: 'Comprehension test', ro: 'Test de comprehensiune' },
    testDone: { ko: '시험 결과', en: 'Test summary', ro: 'Rezumatul testului' },
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

/**
 * 이해도 시험 한 장.
 *
 * 절차를 어기면 측정이 무의미해지므로 세 가지를 지킨다.
 *
 *  - **선택지를 주지 않는다.** 자유응답만 받는다. 선택지를 주면 이해도가 아니라
 *    재인(recognition)을 재게 된다. Dowse 와 Gutierrez 가 쓴 방식이 자유응답이다.
 *  - **의도한 뜻을 여기서 보이지 않는다.** 10장을 다 끝낸 뒤에만 보여준다.
 *  - **`alt` 를 비운다.** 의도한 뜻을 alt 에 쓰면 스크린리더 사용자에게 정답을
 *    알려주는 셈이다. 그래서 이 구획은 건너뛸 수 있다고 앞서 안내한다.
 */
function GlyphStep({
  glyph, index, total, lang, onSave,
}: {
  glyph: TestGlyph;
  index: number;
  total: number;
  lang: Lang;
  onSave: (guess: string, dontKnow: boolean, confidence: string) => void;
}) {
  const [guess, setGuess] = useState('');
  const [conf, setConf] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const L = TEST_UI[lang];

  return (
    <section className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--color-sc-muted)' }}>
        {index + 1} / {total}
      </p>
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={glyphSrc(glyph.name)}
          alt=""
          aria-hidden
          className="h-44 w-44 rounded-2xl bg-white p-3 shadow-sm"
        />
      </div>
      <div>
        <label htmlFor="guess" className="text-sm font-bold">
          {L.q}
        </label>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          {L.hint}
        </p>
        <textarea
          id="guess"
          ref={inputRef}
          rows={3}
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          className="mt-2 w-full rounded-xl border p-2 text-sm"
          style={{ borderColor: 'var(--color-sc-line)' }}
        />
      </div>
      <fieldset>
        <legend className="text-sm font-bold">{L.conf}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {['1', '2', '3', '4', '5'].map((n) => (
            <label key={n} className="flex items-center gap-1 text-sm">
              <input type="radio" name="conf" checked={conf === n} onChange={() => setConf(n)} />
              <span>{n}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          {L.confHint}
        </p>
      </fieldset>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave('', true, conf)}
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--color-sc-line)' }}
        >
          {L.dunno}
        </button>
        <button
          type="button"
          disabled={!guess.trim()}
          onClick={() => onSave(guess.trim(), false, conf)}
          className="flex-1 rounded-2xl px-4 py-3 font-bold disabled:opacity-40"
          style={{ background: 'var(--color-sc-primary)', color: '#fff' }}
        >
          {L.next}
        </button>
      </div>
    </section>
  );
}

const TEST_UI: Record<Lang, Record<string, string>> = {
  ko: {
    q: '이 그림은 무엇을 뜻한다고 보십니까?',
    hint: '보이는 그대로 적어 주십시오. 정답을 맞히실 필요는 없습니다 — 틀리게 읽히는 그림을 찾는 것이 이 시험의 목적입니다.',
    conf: '방금 답에 얼마나 확신하십니까? (1 전혀 아님 – 5 매우 확신)',
    confHint: '확신했는데 틀린 경우를 찾으려는 문항입니다. 저문해 환자에게서 보고된 현상이라 전문가에게서도 나타나는지 봅니다.',
    dunno: '모르겠다',
    next: '다음 그림',
  },
  en: {
    q: 'What do you think this image means?',
    hint: 'Write what you actually see. You are not expected to get it right — finding the images that read wrongly is the point of this test.',
    conf: 'How confident are you in that answer? (1 not at all – 5 very)',
    confHint: 'This looks for confident wrong answers. It has been reported in low-literacy patients, and we want to know whether it appears in experts too.',
    dunno: 'I don’t know',
    next: 'Next image',
  },
  ro: {
    q: 'Ce credeți că înseamnă această imagine?',
    hint: 'Scrieți ce vedeți efectiv. Nu se așteaptă să ghiciți corect — scopul testului este să găsim imaginile care se citesc greșit.',
    conf: 'Cât de sigur sunteți de acest răspuns? (1 deloc – 5 foarte sigur)',
    confHint: 'Această întrebare caută răspunsuri greșite date cu încredere. Fenomenul a fost raportat la pacienți cu alfabetizare redusă și vrem să știm dacă apare și la specialiști.',
    dunno: 'Nu știu',
    next: 'Imaginea următoare',
  },
};

const TEST_ASK = {
  title: {
    ko: '픽토그램 이해도 시험 (선택)',
    en: 'Pictogram comprehension test (optional)',
    ro: 'Test de comprehensiune a pictogramelor (opțional)',
  } as Record<Lang, string>,
  body: {
    ko:
      '픽토그램 10장을 한 장씩 보여드리고, 각각 무엇으로 보이는지 자유롭게 적어 주시는 시험입니다. 8분 정도 걸립니다. ' +
      '지금 이 프로젝트에서 픽토그램 이해도는 사람이 아니라 기계에게 물어 확인한 상태이고, 사람 대상 시험을 한 적이 없습니다. ' +
      '참여해 주시면 그 공백이 메워집니다.',
    en:
      'We show you 10 pictograms one at a time and ask you to write, in your own words, what each one seems to mean. It takes about 8 minutes. ' +
      'Right now the comprehension of these pictograms has only been checked by asking a model, never by asking people. ' +
      'Taking part closes that gap.',
    ro:
      'Vă arătăm 10 pictograme, una câte una, și vă rugăm să scrieți cu propriile cuvinte ce pare să însemne fiecare. Durează circa 8 minute. ' +
      'În prezent, comprehensiunea acestor pictograme a fost verificată doar întrebând un model, niciodată oameni. ' +
      'Participarea dumneavoastră acoperă această lacună.',
  } as Record<Lang, string>,
  a11y: {
    ko: '이 구획은 그림을 보아야 답할 수 있습니다. 스크린리더를 쓰시는 경우 정답이 노출되지 않도록 대체 텍스트를 비워 두었으니, 건너뛰어 주시면 됩니다.',
    en: 'This section requires seeing the images. If you use a screen reader, the alternative text is deliberately empty so that it does not reveal the answers — please skip this section.',
    ro: 'Această secțiune necesită vizualizarea imaginilor. Dacă folosiți un cititor de ecran, textul alternativ este intenționat gol pentru a nu dezvălui răspunsurile — vă rugăm să omiteți această secțiune.',
  } as Record<Lang, string>,
  yes: { ko: '참여하겠습니다', en: 'I’ll take the test', ro: 'Doresc să dau testul' } as Record<Lang, string>,
  no: { ko: '건너뛰기', en: 'Skip', ro: 'Omiteți' } as Record<Lang, string>,
  revealTitle: { ko: '의도한 뜻', en: 'What we intended', ro: 'Ce am intenționat' } as Record<Lang, string>,
  revealBody: {
    ko: '아래가 각 그림에 우리가 담으려 한 뜻이고, 그 밑이 방금 적어 주신 답입니다. 어긋난 것이 있으면 그것이 저희에게 가장 값어치 있는 결과입니다.',
    en: 'Below is what we meant each image to say, with your answer underneath. Where they diverge is the most valuable result for us.',
    ro: 'Mai jos este ce am intenționat să transmită fiecare imagine, cu răspunsul dumneavoastră dedesubt. Divergențele sunt cel mai valoros rezultat pentru noi.',
  } as Record<Lang, string>,
  moreSections: {
    ko: '다른 분야 문항도 보기',
    en: 'Show the other field sections',
    ro: 'Afișați celelalte secțiuni',
  } as Record<Lang, string>,
};
