import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, readdir, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { splitDslLines, dslKey, type PictogramManifest } from '@/lib/snapcare/dsl';
import { CATALOG } from '@/lib/snapcare/catalog';
import { itemToDsl } from '@/lib/snapcare/sigil';

const execFileAsync = promisify(execFile);
const ENGINE = join(process.cwd(), 'engine', 'main.py');
const CACHE_DIR = join(process.cwd(), 'public', 'pictograms');
const MANIFEST = join(CACHE_DIR, 'manifest.json');

/**
 * SIGIL 픽토그램 합성 — DSL 소스를 줄 단위 PNG로 컴파일한다.
 *
 * 디스크 캐시를 앞에 둔다:
 *  - 전부 캐시에 있으면 python 을 아예 안 띄운다 (심사 시연에서 가장 빠르고 안전한 경로).
 *  - 렌더에 성공하면 public/pictograms/ 에 write-through 해 다음부터 엔진 없이 뜬다.
 *  - 대회 후 "동적 웹앱 → 정적 변환" 전시 요건에서도 캐시된 PNG로 화면이 유지된다.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json() as { source?: string };
  const source = body.source?.trim();
  if (!source) {
    return NextResponse.json({ error: 'source required' }, { status: 400 });
  }

  const dslLines = splitDslLines(source);

  // ── 캐시 우선 ─────────────────────────────────────────────
  const cached = await Promise.all(dslLines.map(readCached));
  if (cached.every((c): c is string => c !== null)) {
    return NextResponse.json({ images: cached, source, dslLines, servedFrom: 'cache' });
  }

  // ── 엔진 렌더 ─────────────────────────────────────────────
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

    const buffers = await Promise.all(files.map((f) => readFile(join(outDir, f))));
    const images = buffers.map((buf) => `data:image/png;base64,${buf.toString('base64')}`);

    // 엔진은 라벨 1줄당 PNG 1장을 순서대로 낸다 — 줄 수가 맞을 때만 캐시에 반영한다.
    if (buffers.length === dslLines.length) {
      await writeThrough(dslLines, buffers);
    }

    return NextResponse.json({ images, source, dslLines, servedFrom: 'engine' });
  } catch (err) {
    console.error('[pictogram] engine error:', err);
    // 엔진이 죽어도 부분 캐시가 있으면 그것만이라도 돌려준다 (전부 사라지는 것보다 낫다).
    const partial = cached.filter((c): c is string => c !== null);
    if (partial.length > 0) {
      return NextResponse.json({ images: partial, source, dslLines, servedFrom: 'cache-partial' });
    }
    return NextResponse.json(
      { error: 'engine failed', detail: String(err), source },
      { status: 500 },
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * 캐시가 반드시 덮어야 하는 DSL 목록 — 데모 카탈로그 전 아이템 × (정상 / 금지) 판정.
 * 실제 앱이 쓰는 itemToDsl 을 그대로 호출하므로 로직이 이중화되지 않는다.
 * 캐시 워밍 스크립트가 이 목록을 받아 POST 한다.
 */
export async function GET(): Promise<NextResponse> {
  const sources = CATALOG.flatMap((item) => [
    itemToDsl(item, false),
    itemToDsl(item, true),
  ]);

  const lines = [...new Set(sources.flatMap(splitDslLines))];
  const status = await Promise.all(
    lines.map(async (line) => ({
      line,
      key: dslKey(line),
      cached: (await readCached(line)) !== null,
    })),
  );

  return NextResponse.json({
    sources: [...new Set(sources)],
    lines: status,
    cachedCount: status.filter((s) => s.cached).length,
    totalCount: status.length,
  });
}

/** 캐시된 PNG를 data URL로 읽는다. 없으면 null. */
async function readCached(line: string): Promise<string | null> {
  try {
    const buf = await readFile(join(CACHE_DIR, `${dslKey(line)}.png`));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** 렌더 결과를 public/pictograms/ 에 기록하고 매니페스트를 갱신한다. */
async function writeThrough(lines: string[], buffers: Buffer[]): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });

    let manifest: PictogramManifest = {};
    try {
      manifest = JSON.parse(await readFile(MANIFEST, 'utf-8')) as PictogramManifest;
    } catch {
      // 첫 실행 — 빈 매니페스트로 시작
    }

    await Promise.all(
      lines.map(async (line, i) => {
        const key = dslKey(line);
        manifest[key] = line;
        await writeFile(join(CACHE_DIR, `${key}.png`), buffers[i]);
      }),
    );

    await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  } catch (err) {
    // 캐시 기록 실패는 렌더 결과에 영향을 주지 않는다 (읽기전용 파일시스템 등).
    console.warn('[pictogram] cache write skipped:', err);
  }
}
