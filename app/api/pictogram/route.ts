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
    await execFileAsync('python3', [ENGINE, srcFile, '--out', outDir, '--no-pdf'], {
      timeout: 30_000,
      env: { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin' },
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
