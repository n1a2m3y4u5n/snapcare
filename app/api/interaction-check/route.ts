import { NextRequest, NextResponse } from 'next/server';

interface InteractionCheckBody {
  medication_ids: string[];
}

/**
 * 약물 상호작용 체크 API
 * 실제 구현 시 약물 상호작용 DB 또는 외부 API와 연동
 */
export async function POST(req: NextRequest) {
  const body: InteractionCheckBody = await req.json() as InteractionCheckBody;
  const { medication_ids } = body;

  // 데모용 스텁 — 실제 상호작용 체크 로직 미구현
  if (!medication_ids || medication_ids.length < 2) {
    return NextResponse.json({ hasDanger: false, warnings: [] });
  }

  // TODO: 실제 약물 상호작용 DB 조회 로직 구현
  return NextResponse.json({
    hasDanger: false,
    warnings: [],
  });
}
