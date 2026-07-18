import { NextResponse } from 'next/server';

/**
 * 감염병 경보 API — 현재는 빈 배열 반환 (스텁)
 * 실제 구현 시 공공데이터 API 또는 자체 DB와 연동
 */
export async function GET() {
  // 데모용 샘플 데이터 (실제 서비스에서는 제거)
  const sampleAlerts = [] as unknown[];

  return NextResponse.json(sampleAlerts, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
