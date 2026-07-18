import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, readdir, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);
const ENGINE = join(process.cwd(), 'engine', 'main.py');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { source?: string };
  const source = body.source?.trim();
  if (!source) {
    return NextResponse.json({ error: 'source required' }, { status: 400 });
  }

  const id = randomUUID();
  const workDir = join(tmpdir(), `eicon-${id}`);
  const srcFile = join(workDir, 'input.p');
  const outDir = join(workDir, 'out');

  await mkdir(workDir, { recursive: true });
  await writeFile(srcFile, source, 'utf-8');

  try {
    // 로컬 dev에선 PICTOGRAM_PYTHON 으로 Pillow가 깔린 python을 지정한다.
    // (배포 Docker 이미지엔 python3 + Pillow가 PATH에 있으므로 기본값으로 동작)
    const python = process.env.PICTOGRAM_PYTHON || 'python3';
    await execFileAsync(python, [ENGINE, srcFile, '--out', outDir, '--no-pdf'], {
      timeout: 30_000,
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ''}`,
      },
    });

    const files = (await readdir(outDir))
      .filter((f) => f.endsWith('.png'))
      .sort();

    const images = await Promise.all(
      files.map(async (f) => {
        const buf = await readFile(join(outDir, f));
        return `data:image/png;base64,${buf.toString('base64')}`;
      }),
    );

    // 엔진 입력 DSL 줄 단위로 분해 (주석·빈 줄 제거)
    const dslLines = source
      .split('\n')
      .map((l) => l.replace(/[%#].*$/, '').trim())
      .filter((l) => l.length > 0);

    return NextResponse.json({ images, source, dslLines });
  } catch (err) {
    console.error('[pictogram] engine error:', err);
    return NextResponse.json(
      { error: 'engine failed', detail: String(err), source },
      { status: 500 },
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
