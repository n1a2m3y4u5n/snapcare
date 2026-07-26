/**
 * nutrition_manager/web/model → public/models
 *
 * 모델은 하드웨어·모델 쪽이 관리하는 자리(web/model)에 있고, 브라우저가 받으려면
 * public/ 아래 있어야 한다. 16MB 를 레포에 두 벌 두는 대신 빌드 때 옮긴다 —
 * 두 벌이 되는 순간 하나만 갱신되는 일이 반드시 생기고, 그때 앱은 낡은 모델을 쓰면서
 * 새 모델의 정확도를 주장하게 된다.
 *
 * promote.py 가 web/model 을 갈아끼우면 다음 빌드가 자동으로 따라온다.
 */
import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'nutrition_manager', 'web', 'model');
const to = join(root, 'public', 'models');

if (!existsSync(from)) {
  // 모델이 아직 없는 체크아웃에서도 빌드는 통과해야 한다. 앱은 모델이 없으면
  // Vision 경로로 돌아간다 — 여기서 실패시키면 그 폴백이 무의미해진다.
  console.log('[copy-model] nutrition_manager/web/model 없음 — 건너뜀');
  process.exit(0);
}

await mkdir(to, { recursive: true });
for (const f of await readdir(from)) {
  await cp(join(from, f), join(to, f));
}
console.log(`[copy-model] ${(await readdir(to)).join(', ')} -> public/models/`);
