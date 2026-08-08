/**
 * 시험 돌리는 범위 (TASK-KL-153).
 *
 * 왜 생겼나: `chat-adapter.test.ts` 하나만 **node 내장 시험**(`node:test`)으로 적혀 있다.
 * vitest 가 그 파일을 열면 「시험이 하나도 없다」로 **빨간불**을 켠다 — 실제 코드는 멀쩡한데.
 * 그 한 줄 때문에 「yawnbot 시험을 관문에 걸기」가 계속 미뤄졌고, 그 사이에 라우트가 통째로
 * 사라진 사고가 조용히 배포까지 나갔다.
 *
 * 고르는 법: 그 파일을 vitest 로 옮겨 쓰는 건 남의 파일을 건드리는 일이라 안 했다.
 * 대신 **어느 도구가 그 파일을 맡는지 적어 둔다** — 그 파일은 `node --test` 가 맡는다
 * (파일 머리말에 실행법이 적혀 있다).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'src/bot/chat-adapter.test.ts'],
  },
});
