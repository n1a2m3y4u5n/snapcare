import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * 서버 영속 저장소 (Supabase 대체, fly.io 배포용).
 * household 키별로 JSON blob을 디스크에 저장한다.
 * 로컬: 프로젝트 .data/  ·  fly: SNAPCARE_DATA_DIR=/data (볼륨 마운트)
 */
const DATA_DIR = process.env.SNAPCARE_DATA_DIR || join(process.cwd(), '.data');

function fileFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
  return join(DATA_DIR, `${safe}.json`);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  try {
    const raw = await readFile(fileFor(key), 'utf-8');
    return NextResponse.json({ data: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ data: null }); // 아직 없음
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as { key?: string; data?: unknown };
  if (!body.key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(fileFor(body.key), JSON.stringify(body.data ?? {}), 'utf-8');
  return NextResponse.json({ ok: true });
}
