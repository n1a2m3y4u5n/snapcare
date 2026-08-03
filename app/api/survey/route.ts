import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NextRequest, NextResponse } from 'next/server';

import { notify } from '@/lib/notify';

/**
 * 전문가 설문 응답 수집.
 *
 * 저장 방식이 이 파일의 유일한 설계 판단이다. **응답 하나를 파일 하나로** 쓴다.
 * 한 파일에 이어 붙이면 읽고-고쳐-쓰는 사이에 다른 응답이 끼어들어 사라진다.
 * 688 명에게 한 번에 메일을 보내면 같은 시각에 여러 명이 제출하므로 실제로
 * 일어나는 일이다. 파일을 나누면 그 경합 자체가 없어진다.
 *
 * 쓰기는 임시 파일에 쓰고 rename 한다. rename 은 같은 파일계 안에서 원자적이라,
 * 쓰는 중에 프로세스가 죽어도 반쪽 파일이 남지 않는다. app/api/store 와 같은
 * 방식이다.
 *
 * 인증은 걸지 않는다. 공개 설문이므로 응답자에게 계정을 요구할 수 없다. 대신
 * 본문 크기를 제한하고 같은 IP 의 연속 제출 간격만 본다 — 완전한 방어가 아니라
 * 실수와 단순 반복을 막는 정도다.
 */
const DATA_DIR = process.env.SNAPCARE_DATA_DIR || join(process.cwd(), '.data');
const OUT_DIR = join(DATA_DIR, 'survey');

/** 본문 상한. 자유 서술이 많은 설문이라 넉넉히 두되 무한은 아니다. */
const MAX_BYTES = 256 * 1024;

/** 같은 곳에서 이 간격 안에 다시 제출하면 거절한다. */
const MIN_GAP_MS = 3000;
const lastSeen = new Map<string, number>();

function clientKey(req: NextRequest): string {
  // fly.io 는 원 주소를 fly-client-ip 로 넘긴다. 없으면 표준 헤더를 본다.
  return (
    req.headers.get('fly-client-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'too_large' }, { status: 413 });
  }

  const who = clientKey(req);
  const now = Date.now();
  const prev = lastSeen.get(who);
  if (prev && now - prev < MIN_GAP_MS) {
    return NextResponse.json({ ok: false, error: 'too_fast' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_json' }, { status: 400 });
  }

  const rec = body as Record<string, unknown>;
  // 동의는 서버에서도 확인한다. 화면에서 막는 것만으로는 부족하다 — 응답을
  // 문서에 인용할 근거가 이 값이므로 저장된 것 자체에 남아야 한다.
  if (rec.consent !== true) {
    return NextResponse.json({ ok: false, error: 'no_consent' }, { status: 400 });
  }

  lastSeen.set(who, now);

  const id = `${new Date(now).toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`;
  const out = {
    id,
    receivedAt: new Date(now).toISOString(),
    // 응답자를 식별하려는 것이 아니라 같은 사람이 두 번 낸 것을 나중에
    // 알아보려는 것이다. 원 주소를 그대로 두지 않는다.
    source: who === 'unknown' ? 'unknown' : 'recorded',
    ...rec,
  };

  try {
    await mkdir(OUT_DIR, { recursive: true });
    const tmp = join(OUT_DIR, `.${id}.tmp`);
    const dst = join(OUT_DIR, `${id}.json`);
    await writeFile(tmp, JSON.stringify(out, null, 1), 'utf8');
    await rename(tmp, dst);
  } catch (err) {
    console.error('[survey] 저장 실패:', err);
    return NextResponse.json({ ok: false, error: 'write_failed' }, { status: 500 });
  }

  /*
   * 응답이 들어왔다고 우리에게 알린다.
   *
   * **await 한다.** 처음에는 void 로 띄워 보냈다. 응답을 돌려준 뒤에 메일을 보내면
   * 그분을 기다리게 하지 않으니 그것이 옳다고 보았는데, 실제로는 메일이 나가지 않았다.
   * 응답을 반환하는 순간 이 요청은 끝난 것으로 처리되고, TLS 연결과 SMTP 왕복 아홉
   * 단계가 끝나기 전에 그 작업이 잘려 나간다. 같은 코드를 서버에서 프로세스로 직접
   * 돌리면 235 Accepted 와 250 OK 까지 정상으로 끝난다 — 코드가 아니라 수명이 문제였다.
   *
   * 그래서 기다린다. 응답자가 1~2초 더 기다리게 되지만, 알림이 오지 않으면 우리는
   * 회신이 필요한 응답을 며칠 뒤에 발견하게 된다. notify 는 안에서 스스로 오류를
   * 삼키고 15초 시간제한을 두므로, 네이버가 막혀도 이 요청이 오래 붙잡히지 않는다.
   */
  await notify(summarize(out));

  return NextResponse.json({ ok: true, id });
}

/**
 * 알림 메일에 담을 요약.
 *
 * 서버에는 명단이 없다 — 도커 이미지에서 scratchpad 를 뺐기 때문이다. 그래서 수신자
 * 토큰만 적고, 누구인지는 응답자가 직접 적은 성함·소속으로 쓴다. 이름을 알아내려면
 * 우리 손의 엑셀과 맞춰야 한다.
 *
 * 자유 서술은 앞부분만 싣는다. 전문을 메일로 옮기면 개인 의견이 우리 메일함과 네이버
 * 서버에 한 벌 더 쌓인다. 무엇이 왔는지 알기에는 앞머리로 충분하다.
 */
function summarize(rec: Record<string, unknown>): { subject: string; body: string } {
  const a = (rec.answers ?? {}) as Record<string, string>;
  const env = (rec.env ?? {}) as Record<string, unknown>;
  const field = a.b_field || '(분야 없음)';
  const who = [a.b_name, a.b_affil, a.b_title].filter(Boolean).join(' · ') || '(이름 없음)';

  const picked = Object.entries(a).filter(([k]) => !k.startsWith('b_') && !k.endsWith('__why'));
  const lines = picked.map(([k, v]) => {
    const why = a[`${k}__why`];
    const head = `  ${k}: ${String(v).slice(0, 120)}`;
    return why ? `${head}\n     이유: ${String(why).slice(0, 200)}` : head;
  });

  const mins = (() => {
    const s = rec.startedAt as string | undefined;
    const e = rec.clientTime as string | undefined;
    if (!s || !e) return '';
    const d = (Date.parse(e) - Date.parse(s)) / 60000;
    return Number.isFinite(d) ? ` · ${d.toFixed(0)}분 걸림` : '';
  })();

  return {
    subject: `[SnapCare 설문] ${field} — ${a.b_name || '익명'}`,
    body: [
      `${who}`,
      `분야: ${field} · 국가: ${a.b_country || '?'} · 접촉 빈도: ${a.b_exposure || '?'}`,
      `수신자 토큰: ${rec.recipient || '(링크 경유 아님)'}${mins}`,
      `화면: ${env.screen || '?'} · 소리 눌러봄: ${env.demoTouched ? '예' : '아니오'}`,
      '',
      `답한 문항 ${picked.length}개`,
      ...lines,
      '',
      `전체 내용은 볼륨에 있다. 응답 id: ${rec.id}`,
    ].join('\n'),
  };
}

/**
 * 응답 수만 돌려준다. 내용은 내보내지 않는다 — 전문가 개인의 의견과 소속이
 * 들어 있어서 주소창 하나로 열려서는 안 된다. 집계는 볼륨에서 직접 내린다.
 */
export async function GET() {
  try {
    const files = await readdir(OUT_DIR);
    return NextResponse.json({ ok: true, count: files.filter((f) => f.endsWith('.json')).length });
  } catch {
    return NextResponse.json({ ok: true, count: 0 });
  }
}
