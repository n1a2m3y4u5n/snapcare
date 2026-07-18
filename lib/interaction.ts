// 약물 상호작용 체크 API 호출

export interface InteractionResult {
  hasDanger: boolean;
  warnings: string[];
}

/** medication_ids 배열로 상호작용을 체크한다 */
export async function checkInteraction(medicationIds: string[]): Promise<InteractionResult> {
  const res = await fetch('/api/interaction-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ medication_ids: medicationIds }),
  });
  if (!res.ok) return { hasDanger: false, warnings: [] };
  return res.json() as Promise<InteractionResult>;
}
