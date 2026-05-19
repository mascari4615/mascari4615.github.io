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
export declare function loadKarmoLabAIEnv(): void;
