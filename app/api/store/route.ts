import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { NextRequest, NextResponse } from 'next/server';

import { verifySigned } from '@/lib/store/auth';

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

/**
 * 서명 확인은 `lib/store/auth.ts` 로 옮겼다.
 *
 * 여기 있는 동안에는 시험이 하나도 없었다. 이 파일은 next/server 를 불러서 앱의
 * 시험 러너(`node --test --experimental-strip-types`)로 열리지 않고, 그래서 "열 수
 * 없으니 안 쟀다" 가 굳어 있었다. 저장된 건강 정보 전부를 지키는 함수치고는 나쁜
 * 자리였다. 밖으로 꺼내니 열 개가 붙었고, 그중 셋(메서드 바꿔치기, 미래 시각 서명,
 * 공개키 바꿔치기)은 여기서는 한 번도 확인된 적이 없던 성질이다.
 */
async function verify(req: NextRequest, method: string, body: string): Promise<string | null> {
  return verifySigned(
    {
      device: req.headers.get('x-device'),
      sig: req.headers.get('x-sig'),
      ts: req.headers.get('x-ts'),
    },
    method,
    body,
  );
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
