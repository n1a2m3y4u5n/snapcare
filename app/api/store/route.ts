import { createHash, webcrypto } from 'node:crypto';
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { NextRequest, NextResponse } from 'next/server';

/**
 * 서버 영속 저장소 (fly.io 볼륨).
 *
 * 예전에는 `?key=h_01075a74...` 를 그대로 믿었다. 두 가지가 나빴다:
 *
 *   - 열쇠가 **주소창에** 실려 다녀서 서버·프록시 기록에 남았다. 건강 정보에 접근하는
 *     열쇠가 로그에 쌓이는 구조다.
 *   - 그 값을 한 번 본 사람은 그대로 흉내 낼 수 있었다. 아이디를 비밀번호로 쓰는 것과
 *     같아서, 인증이라고 부를 수 없었다.
 *
 * 지금은 기기가 **꺼낼 수 없는 개인키로 서명**해서 보낸다(lib/snapcare/deviceKey.ts).
 * 그리고 **가구 ID 를 공개키에서 유도한다** — 그래서 등록 절차가 없고, 남의 파일을
 * 요구하려면 그 사람의 개인키가 있어야 하는데 그것은 그 기기 밖으로 나갈 수 없다.
 *
 * 사용자는 아무것도 하지 않는다. 화면도 늘지 않는다.
 */
const DATA_DIR = process.env.SNAPCARE_DATA_DIR || join(process.cwd(), '.data');

/** 서명이 이보다 오래됐으면 거절한다. 가로챈 서명을 나중에 다시 쓰지 못하게. */
const MAX_AGE_MS = 5 * 60 * 1000;

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/** 공개키 → 파일 이름. 이 유도가 곧 접근 통제다. */
function householdFor(publicKeyB64: string): string {
  const h = createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest();
  return b64url(h).slice(0, 32);
}

/**
 * 서명 확인. 통과하면 이 요청이 그 공개키의 주인에게서 왔다는 뜻이다.
 *
 * 서명 대상에 시각과 본문 해시가 함께 들어간다 — 시각이 없으면 가로챈 서명을 나중에
 * 다시 쓸 수 있고, 본문 해시가 없으면 서명만 떼어 다른 내용에 붙일 수 있다.
 */
async function verify(req: NextRequest, method: string, body: string): Promise<string | null> {
  const pub = req.headers.get('x-device');
  const sig = req.headers.get('x-sig');
  const ts = Number(req.headers.get('x-ts'));
  if (!pub || !sig || !Number.isFinite(ts)) return null;
  if (Math.abs(Date.now() - ts) > MAX_AGE_MS) return null;

  try {
    const key = await webcrypto.subtle.importKey(
      'raw', Buffer.from(pub, 'base64'),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const digest = createHash('sha256').update(body).digest().toString('base64');
    const payload = `${ts}.${method}.${digest}`;
    const ok = await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key,
      Buffer.from(sig, 'base64'), Buffer.from(payload, 'utf8'),
    );
    return ok ? householdFor(pub) : null;
  } catch {
    return null;   // 공개키 형식이 틀렸거나 서명이 깨졌다
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const id = await verify(req, 'GET', '');
  if (!id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const raw = await readFile(join(DATA_DIR, `${id}.json`), 'utf-8');
    return NextResponse.json({ data: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ data: null });   // 아직 없음
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const id = await verify(req, 'PUT', body);
  if (!id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  await mkdir(DATA_DIR, { recursive: true });
  const file = join(DATA_DIR, `${id}.json`);
  // 임시 파일에 쓰고 옮긴다. writeFile 은 원자적이지 않아서, 쓰는 도중에 끊기면
  // 잘린 JSON 이 남고 다음 읽기에서 파싱이 터진다 — 그러면 앱은 "자료 없음" 으로
  // 알아듣고 처음부터 시작한다. rename 은 원자적이라 반쯤 쓰인 파일이 남지 않는다.
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(parsed), 'utf-8');
  await rename(tmp, file);
  return NextResponse.json({ ok: true });
}
