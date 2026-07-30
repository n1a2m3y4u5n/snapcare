import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);
const SCRIPT = join(process.cwd(), 'pill_dispenser', 'form_sheet_parser', 'parse_cli.py');

/**
 * 종이 폼시트 사진 → 복약 일정. **이제는 대체 경로다.**
 *
 * 의사가 칸마다 약을 채우고 버블시트를 표시해 환자에게 준다. 환자는 그걸 찍기만 하면
 * 되므로, 글을 못 읽어도 일정이 기기로 넘어간다.
 *
 * 앱은 이 판독을 `lib/formsheet` 로 **브라우저 안에서** 한다. 파이썬 파서를 그대로
 * 옮긴 것이고, 합성 사진 40장에서 두 구현이 같은 답을 낸다(tools/formsheet_check.ts).
 * 옮긴 이유는 이 한 경로만 서버를 필요로 했기 때문이다 — 인터넷이 없는 진료소에서
 * 가장 쓰고 싶은 기능이 인터넷을 요구하고 있었다.
 *
 * 이 라우트를 남겨 두는 이유는 둘이다. 캔버스나 createImageBitmap 이 없는 아주 오래된
 * 브라우저, 그리고 앱이 아닌 다른 클라이언트. 판독은 그대로 팀의 OpenCV 파서
 * (pill_dispenser/form_sheet_parser)가 하고 여기서는 파이썬을 실행해 결과를 넘긴다.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { image?: string };
  if (!body.image) {
    return NextResponse.json({ error: 'image required' }, { status: 400 });
  }

  const base64 = body.image.replace(/^data:image\/[a-zA-Z.+-]+;base64,/, '');
  const dir = join(tmpdir(), `formsheet-${randomUUID()}`);
  const file = join(dir, 'sheet.png');

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, Buffer.from(base64, 'base64'));

    // OpenCV 가 있는 인터프리터.
    // 프로덕션 이미지는 apk 로 py3-opencv 를 넣어 시스템 python3 에 있고,
    // 로컬 개발은 격리 venv(.venv-cv)를 쓴다. 둘 다 없으면 아래 catch 로 떨어진다.
    const python = process.env.FORMSHEET_PYTHON
      || (process.env.NODE_ENV === 'production'
        ? 'python3'
        : join(process.cwd(), '.venv-cv', 'bin', 'python'));

    const { stdout } = await execFileAsync(python, [SCRIPT, file], { timeout: 20_000 });
    const parsed = JSON.parse(stdout) as { ok: boolean; error?: string; values?: unknown; problems?: string[] };

    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error ?? 'parse failed' }, { status: 422 });
    }
    return NextResponse.json(parsed);
  } catch (err) {
    // 인터프리터가 없거나 OpenCV 가 안 깔린 환경 — 앱의 나머지는 그대로 동작해야 한다.
    console.error('[form-sheet] parser unavailable:', err);
    return NextResponse.json(
      { error: 'parser_unavailable', detail: String(err) },
      { status: 501 },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
