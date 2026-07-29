'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  BACKGROUND, BRANCHES, CLOSE, CLOSE_CITE, CONSENT, CORE, LANGS, UI,
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
  const [pinned, setPinned] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ k: 'intro' });
  const [consent, setConsent] = useState(false);
  const [citeOk, setCiteOk] = useState(false);
  const [ans, setAns] = useState<Answers>({});
  const [cite, setCite] = useState('');
  const [openBranches, setOpenBranches] = useState<string[]>([]);
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
      if (d.cite) setCite(d.cite);
      if (d.consent) setConsent(true);
      if (d.citeOk) setCiteOk(true);
    } catch { /* 초안이 깨졌으면 그냥 새로 시작한다 */ }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ans, cite, consent, citeOk }));
    } catch { /* 용량 초과 등은 무시한다 — 저장 실패가 응답을 막아서는 안 된다 */ }
  }, [ans, cite, consent, citeOk]);

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
          onNext={() => advance({ k: 'branch' }, CORE)}
          onBack={() => setStep({ k: 'background' })}
          nextLabel={t(UI.next)}
          backLabel={t(UI.back)}
        />
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
              <summary className="cursor-pointer text-sm font-bold">{t(UI.moreSections)}</summary>
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
              onClick={() => setStep({ k: 'core' })}
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

