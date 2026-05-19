import * as fs from 'fs';
import * as path from 'path';

/**
 * `packages/karmolab-ai/.env` (공통 AI 키)을 `process.env` 에 주입.
 *
 * - 이미 설정된 OS 환경 변수는 덮어쓰지 않음.
 * - 앱별 `.env` 는 이 함수 호출 **이후** 에 로드하면 공통 값을 오버라이드할 수 있음.
 *
 * 관리 대상: `GEMINI_API_KEY`, `VERTEX_API_KEY`, `VERTEX_PROJECT_ID`,
 *            `VERTEX_LOCATION`, `KARMOLAB_AI_SURFACE` 등 AI 자격증명.
 *
 * 사용 예:
 * ```ts
 * import { loadKarmoLabAIEnv } from 'karmolab-ai/node';
 * loadKarmoLabAIEnv(); // 앱 진입점 최상단에서 호출
 * ```
 */
export function loadKarmoLabAIEnv(): void {
  // dist/node/env.js 기준으로 두 단계 위 = packages/karmolab-ai/
  const pkgRoot = path.join(__dirname, '..', '..');
  parseDotenvFile(path.join(pkgRoot, '.env'), false);
}

/** `.env` 파일을 파싱해 `process.env` 에 적용. `override=false` 면 기존 값 보존. */
function parseDotenvFile(filePath: string, override: boolean): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    const raw = line.slice(eq + 1);
    // 따옴표 벗기기 (첫·마지막 " 또는 ' 한 쌍만)
    const val = raw.match(/^(['"])(.*)\1$/) ? raw.slice(1, -1) : raw;
    if (override || !(key in process.env)) {
      process.env[key] = val;
    }
  }
}
