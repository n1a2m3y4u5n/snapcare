/**
 * 아직 없는 개념의 글리프를 그 자리에서 만든다.
 *
 * 왜 필요한가: 형태소는 78개뿐이고 세상의 약과 음식은 그보다 많다. 지금은 모르는
 * 제형을 만나면 lib/snapcare/sigil.ts 가 조용히 `pill_bottle` 로 떨어진다 — 안약이든
 * 흡입기든 약병 그림이 뜬다. 조용히 틀리는 쪽이라 아무도 모른다.
 *
 * 왜 여기서만 하는가: 이 경로는 **온라인 판** 전용이다. 온디바이스 판은 만들 수
 * 없으므로 "맞는 그림이 없다" 를 그대로 보여준다. 둘 다 조용히 다른 그림을 보여주는
 * 것보다 낫다 — 읽지 못하는 사람에게 틀린 그림은 그림이 없는 것보다 나쁘다. 없으면
 * 음성과 글씨로 넘어가지만, 틀린 그림은 자신 있게 틀리고 사용자는 알 방법이 없다.
 *
 * 관문이 둘이다. 기계 검사(굵기·구멍·32px 생존)를 통과해야 하고, 그다음 "무엇으로
 * 보이나" 를 물어 답이 기대와 맞아야 한다. 두 번째가 특히 필요한 이유: 78개를 뽑던
 * 날 4개가 기계 검사를 전부 통과하고도 틀렸다. qty_one 은 속 빈 고리로 나왔는데
 * 잉크량도 구멍도 개수도 정상이었다 — 다만 '1' 이 아니라 '0' 으로 읽혔다.
 *
 * 한 번 만든 것은 모두가 함께 쓴다. 개념 하나당 한 번이지 사용자 하나당 한 번이
 * 아니다. 그래서 두 번째 사람부터는 기다림이 없다.
 */
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { NextRequest, NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
/**
 * 만든 그림을 어디에 둘 것인가.
 *
 * public/ 안에 두었더니 두 방향으로 틀렸다. 배포할 때마다 앱 이미지가 통째로 새로
 * 만들어지므로 **서버가 만든 그림은 사라지고**, 반대로 개발 중에 시험 삼아 만든
 * 파일은 이미지에 구워져 **실제 서비스로 올라갔다.**
 *
 * 사라지면 다음 사용자가 다시 45초를 기다리고 요금도 다시 나간다. misses.json 은
 * "무엇의 그림이 없었는가" 를 쌓으라고 만든 것인데 배포마다 비워지면 아무것도 쌓이지
 * 않는다 — 만든 의미가 없어진다.
 *
 * 그래서 사용자 자료와 같은 볼륨에 둔다. 배포해도 지워지지 않는 유일한 자리다.
 * 대신 public/ 밖이라 정적으로 서빙되지 않으므로 아래 GET 이 읽어서 내보낸다.
 */
const OUT_DIR = join(process.env.SNAPCARE_DATA_DIR || join(ROOT, '.data'), 'glyphs-gen');
const MISSES = join(OUT_DIR, 'misses.json');
const GEN = join(ROOT, 'engine', 'gen_glyphs.py');

/** 같은 개념을 두 사람이 동시에 요청해도 한 번만 만든다. */
const inFlight = new Map<string, Promise<Result>>();

type Result = { ok: true; url: string; means?: string } | { ok: false; reason: string };

/**
 * 개념 이름을 파일 이름으로 쓸 수 있게 다듬는다.
 *
 * 이 값이 곧 경로가 되므로 통과시키는 글자를 좁게 잡는다 — 사용자가 보낸 문자열이
 * 파일 경로가 되는 자리는 넘겨받은 이름을 그대로 믿으면 안 되는 자리다.
 */
function slug(concept: string): string | null {
  const s = concept.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s.length >= 2 && s.length <= 40 ? s : null;
}

/**
 * 무엇이 없어서 만들어야 했는지를 남긴다.
 *
 * 만들어진 그림 자체보다 이 목록이 오래 간다. 자주 나오는 개념은 다음 배포 때
 * 정식 형태소로 넣는 것이 맞다 — 실행 중 생성은 빈자리를 메우는 것이지 세트를
 * 대신하는 것이 아니다. 지금까지는 무엇이 빈자리인지조차 몰랐다.
 */
async function recordMiss(key: string, made: boolean): Promise<void> {
  try {
    await mkdir(OUT_DIR, { recursive: true });
    let log: Record<string, { seen: number; made: boolean }> = {};
    try { log = JSON.parse(await readFile(MISSES, 'utf8')); } catch { /* 첫 기록 */ }
    const prev = log[key] ?? { seen: 0, made: false };
    log[key] = { seen: prev.seen + 1, made: prev.made || made };
    await writeFile(MISSES, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
  } catch { /* 기록 실패가 그림을 막지는 않는다 */ }
}

async function make(key: string): Promise<Result> {
  const file = join(OUT_DIR, `${key}.png`);
  try {
    await access(file);
    return { ok: true, url: `/api/glyph?name=${key}` };
  } catch { /* 없으면 만든다 */ }

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, reason: 'no-key' };
  }
  const python = process.env.PICTOGRAM_PYTHON || 'python3';
  try {
    // 두 번까지만 다시 뽑는다. 실행 중이라 기다림이 그대로 사람의 시간이고,
    // 두 번 실패한 개념은 프롬프트를 손봐야 하는 것이지 더 굴린다고 나오지 않는다.
    const { stdout } = await execFileAsync(
      python, [GEN, '--one', key, '--out', file, '--tries', '2'],
      { timeout: 240_000, env: process.env },
    );
    const last = stdout.trim().split('\n').pop() ?? '{}';
    const r = JSON.parse(last) as { ok: boolean; means?: string; log?: string[] };
    if (!r.ok) {
      console.warn('[glyph]', key, '실패:', r.log?.join(' | '));
      return { ok: false, reason: 'rejected' };
    }
    return { ok: true, url: `/api/glyph?name=${key}`, means: r.means };
  } catch (e) {
    console.error('[glyph]', key, e);
    return { ok: false, reason: 'error' };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { concept?: string };
  const key = slug(body.concept ?? '');
  if (!key) return NextResponse.json({ ok: false, reason: 'bad-concept' }, { status: 400 });

  let job = inFlight.get(key);
  if (!job) {
    job = make(key).finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  const result = await job;
  await recordMiss(key, result.ok);
  // 실패도 200 으로 돌려준다. 화면은 "맞는 그림이 없다" 를 보여줘야 하고, 그것은
  // 오류가 아니라 정상적인 결과다.
  return NextResponse.json(result);
}

/**
 * name 이 있으면 그 그림을, 없으면 "무엇이 부족했는지" 목록을 준다.
 *
 * 그림이 public/ 밖에 있어서 이 경로가 필요하다. 한 번 만든 그림은 내용이 바뀌지
 * 않으므로 오래 캐시하게 둔다 — 두 번째 사람부터는 서버에 묻지도 않는다.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) {
    try {
      return NextResponse.json(JSON.parse(await readFile(MISSES, 'utf8')));
    } catch {
      return NextResponse.json({});
    }
  }
  const key = slug(name);
  if (!key) return NextResponse.json({ error: 'bad name' }, { status: 400 });
  try {
    const png = await readFile(join(OUT_DIR, `${key}.png`));
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'content-type': 'image/png',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
