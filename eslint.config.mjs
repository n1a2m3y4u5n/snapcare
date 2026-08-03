import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 우리가 쓴 것이 아니라 scripts/copy-ocr.mjs 가 tesseract.js 에서 복사해 온
    // 번들이다. 한 줄짜리 minified 파일이라 규칙마다 걸려서 경고를 2,019 개 냈고,
    // 그 사이에 우리 코드의 오류가 묻혔다 — 린트가 아무 말도 안 하는 것과 같아진다.
    "public/ocr/**",
  ]),
]);

export default eslintConfig;
