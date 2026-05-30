#!/usr/bin/env node
/**
 * Manual single cadence tick — KAR-116-A2 (KarmoApp GUI 「⚡ Cadence 1회」 버튼의 진입점).
 *
 * 정본 cadence 함수는 `src/bot/agent-cadence.ts` 의 `runCadenceTickOnce` —
 * 본 script 는 그 1회 실행 CLI shim. tsc 빌드 산출물(dist/) 을 require.
 *
 * 사용:
 *   node scripts/run-cadence-tick.mjs [--include-worker]
 *
 * env:
 *   - MEMO_REPO_PATH  (필수)
 *   - DISCORD_TOKEN / KARMODDRINE_GUILD_ID 등 yawnbot 통상 env
 *   - AGENT_CADENCE_QUIET=1 = 잡담·발굴 skip
 *
 * exit:
 *   - 0 = OK (마지막 줄에 result string)
 *   - 1 = build 산출물 부재 또는 실행 실패
 *
 * KarmoApp 에서는 데스크톱 dev yawnbot 인스턴스 위에서 호출 default. prod
 * 노트북에서 돌리려면 laptop-ops `/exec` 우회 + LAPTOP_OPS_TOKEN 필요(별 사이클).
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(__dirname, '..', 'dist', 'src', 'bot', 'agent-cadence.js');
if (!existsSync(distPath)) {
  console.error(
    `[cadence-tick] dist 산출물 없음: ${distPath}\n  먼저 \`npm --prefix apps/discord-bots/apps/yawnbot run build\` 후 재실행.`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const includeWorker = args.includes('--include-worker');

const startedAt = Date.now();
console.log(`[cadence-tick] 시작 ${new Date().toISOString()} includeWorker=${includeWorker}`);

try {
  const mod = await import(distPath);
  if (typeof mod.runCadenceTickOnce !== 'function') {
    console.error('[cadence-tick] runCadenceTickOnce export 없음 — yawnbot 버전 mismatch?');
    process.exit(1);
  }
  const result = await mod.runCadenceTickOnce(process.env, { includeWorker });
  const elapsed = Date.now() - startedAt;
  console.log(`[cadence-tick] OK (${elapsed}ms) result=${result}`);
  process.exit(0);
} catch (e) {
  console.error(`[cadence-tick] 실행 실패: ${e && e.stack ? e.stack : String(e)}`);
  process.exit(1);
}
