import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { fetchByBarcode } from '@/lib/nutrition/openfoodfacts';
import type { NutrientProfile } from '@/lib/nutrition/types';

const CACHE_DIR = join(process.cwd(), 'public', 'nutrition');

/**
 * 바코드 → 영양 프로필 조회.
 *
 * 픽토그램과 같은 write-through 캐시를 쓴다:
 *  - 한 번 조회한 제품은 public/nutrition/<barcode>.json 으로 남아 인터넷 없이 다시 뜬다.
 *  - 대상 지역(불안정한 모바일 인터넷)과 심사 시연 양쪽에서 같은 이유로 필요하다.
 *  - 정적 변환 전시본에서도 캐시된 제품은 그대로 동작한다.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const barcode = req.nextUrl.searchParams.get('barcode')?.trim();
  if (!barcode || !/^\d{6,14}$/.test(barcode)) {
    return NextResponse.json({ error: 'valid barcode required' }, { status: 400 });
  }

  const cached = await readCache(barcode);
  if (cached) {
    return NextResponse.json({ profile: cached, servedFrom: 'cache' });
  }

  try {
    const profile = await fetchByBarcode(barcode);
    if (!profile) {
      return NextResponse.json({ error: 'product not found', barcode }, { status: 404 });
    }
    await writeCache(barcode, profile);
    return NextResponse.json({ profile, servedFrom: 'openfoodfacts' });
  } catch (err) {
    // 오프라인·타임아웃 — 캐시에 없으면 여기서 끝난다. 화면은 정성 판정으로 폴백한다.
    console.error('[nutrition] lookup failed:', err);
    return NextResponse.json(
      { error: 'lookup_failed', detail: String(err), barcode },
      { status: 503 },
    );
  }
}

async function readCache(barcode: string): Promise<NutrientProfile | null> {
  try {
    return JSON.parse(await readFile(join(CACHE_DIR, `${barcode}.json`), 'utf-8')) as NutrientProfile;
  } catch {
    return null;
  }
}

async function writeCache(barcode: string, profile: NutrientProfile): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(
      join(CACHE_DIR, `${barcode}.json`),
      `${JSON.stringify(profile, null, 2)}\n`,
      'utf-8',
    );
  } catch (err) {
    console.warn('[nutrition] cache write skipped:', err);
  }
}
