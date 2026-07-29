/**
 * Tesseract 자산을 우리 서버에서 서빙할 자리로 옮긴다.
 *
 * 왜 필요한가
 * -----------
 * tesseract.js 는 기본값으로 워커·코어·언어 데이터를 **CDN(jsdelivr)에서** 받아온다.
 * 번들 안에 그 주소가 그대로 들어 있다:
 *
 *     https://cdn.jsdelivr.net/npm/tesseract.js@v${v}/dist/worker.min.js
 *
 * 그런데 우리는 CSP 에 `connect-src 'self'` 를 걸었다. 그래서 배포본에서 **OCR 이
 * 통째로 죽어 있었다** — 영양성분표 표본을 눌러도 "Could not read that" 만 떴고,
 * 콘솔에도 아무것도 남지 않아 눈으로는 멀쩡해 보였다.
 *
 * OCR 은 대체 경로가 아니라 핵심 경로다. 대상 지역의 현지 식품은 어느 제품
 * 데이터베이스에도 없어서, 성분표를 직접 읽는 것이 유일하게 작동하는 길이다.
 *
 * 우리 서버에서 주면 CSP 도 통과하고 오프라인에서도 돈다 — onnxruntime 의 WASM 이
 * 이미 그렇게 되어 있는 것과 같은 구조다.
 *
 * 언어 데이터(kor, eng)는 패키지에 들어 있지 않아 받아야 한다. 없으면 빌드를 막지
 * 않고 넘어간다 — 개발 기계에서 망이 없다고 빌드가 깨지면 안 되고, 그때는 예전처럼
 * CDN 으로 떨어진다.
 */
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const ROOT = process.cwd();
const OUT = join(ROOT, 'public', 'ocr');

/**
 * 워커와 코어는 패키지 안에 있다.
 *
 * 코어는 **전부** 옮긴다. 처음에는 쓸 것 같은 두 판만 골라 담았는데, tesseract 가
 * 브라우저 기능을 보고 고르는 판이 그중에 없었다:
 *
 *     Failed to load .../tesseract-core-relaxedsimd-lstm.wasm.js
 *
 * 어느 판이 필요한지는 기기가 정한다 — SIMD 유무, relaxed SIMD 유무. 골라 담으면
 * 우리 노트북에서만 되고 사용자 폰에서 안 되는 일이 생긴다. 다 합쳐 몇 MB 이고,
 * 서비스워커는 실제로 받은 것만 캐시하므로 폰에 쌓이는 것은 한 판뿐이다.
 */
const WORKER = ['tesseract.js/dist/worker.min.js', 'worker.min.js'];

/** 언어 데이터는 따로 받는다. 한국어와 영어 둘 다 읽어야 한다. */
const LANGS = ['kor', 'eng'];
const LANG_BASE = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';

async function have(path) {
  try { await access(path); return true; } catch { return false; }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const [from, to] = WORKER;
  const worker = join(ROOT, 'node_modules', from);
  if (await have(worker)) await copyFile(worker, join(OUT, to));
  else console.log(`[copy-ocr] ${from} 없음 — 건너뜀`);

  const coreDir = join(ROOT, 'node_modules', 'tesseract.js-core');
  if (await have(coreDir)) {
    const files = (await readdir(coreDir)).filter((f) => /\.wasm(\.js)?$/.test(f));
    for (const f of files) await copyFile(join(coreDir, f), join(OUT, f));
    console.log(`[copy-ocr] 코어 ${files.length}개 복사`);
  }

  for (const lang of LANGS) {
    const dest = join(OUT, `${lang}.traineddata.gz`);
    if (await have(dest)) continue;   // 한 번 받으면 다시 받지 않는다
    const url = `${LANG_BASE}/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      console.log(`[copy-ocr] ${lang} 언어 데이터 받음`);
    } catch (e) {
      // 빌드를 막지 않는다. 없으면 tesseract 가 예전처럼 CDN 으로 떨어지고,
      // 그때는 CSP 에 막히지만 빌드가 깨지는 것보다는 낫다.
      console.log(`[copy-ocr] ${lang} 받기 실패 (${e.message}) — CDN 폴백`);
    }
  }
  console.log('[copy-ocr] -> public/ocr/');
}

main().catch((e) => console.log('[copy-ocr] 건너뜀:', e.message));
