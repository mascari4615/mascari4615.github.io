#!/usr/bin/env node
/**
 * agent-runtime daemon entry — capability 자율 발화 daemon 1개 인스턴스
 * (TASK-KAR-018-LT-DIVERSITY, D-3 / D-7 migration 진입).
 *
 * 한 daemon = 한 코어 = 한 channelId tail. 본 entry 는 thin wrapper —
 * 코어 정체성 + LLM 호출 + bus IO 만 묶음. orchestrator 결정 흐름 정본 =
 * `src/bot/agent-runtime-daemon.ts` (pure, 회귀 잠금).
 *
 * 사용:
 *   node scripts/run-agent-runtime.mjs --core-id <id> --channel-id <id>
 *     [--interval-ms <N>] [--once]
 *
 * env:
 *   MEMO_REPO_PATH        (필수)
 *   YAWNBOT_AGENT_CHANNEL_ID (--channel-id 미지정 시 fallback)
 *   AGENT_RUNTIME_DRY_RUN=1  publish/mem write skip (smoke 검증용)
 *
 * D-7 단계에서 nssm 서비스 `agent-<id>` 가 본 script 를 invoke. D-3 단계
 * 현재는 *수동 smoke* 만(dry-run 권장 — LLM 호출은 본 PR 단계에서 실제
 * channel 에 안 흘림). 라이브 활성화는 D-7 fallback dual-mode + 24h watch.
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(__dirname, '..', 'dist', 'src');

function fail(msg) {
  console.error(`[agent-runtime] ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { coreId: '', channelId: '', intervalMs: 2500, once: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--core-id') out.coreId = (argv[++i] || '').trim();
    else if (a === '--channel-id') out.channelId = (argv[++i] || '').trim();
    else if (a === '--interval-ms') out.intervalMs = Math.max(500, Number(argv[++i]) || 2500);
    else if (a === '--once') out.once = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.coreId) fail('--core-id 필수');
const channelId = args.channelId || (process.env.YAWNBOT_AGENT_CHANNEL_ID || '').trim();
if (!channelId) fail('--channel-id 또는 YAWNBOT_AGENT_CHANNEL_ID 필수');
const memoRoot = (process.env.MEMO_REPO_PATH || '').trim();
if (!memoRoot) fail('MEMO_REPO_PATH 필수');

const dryRun = process.env.AGENT_RUNTIME_DRY_RUN === '1';

const need = [
  resolve(distRoot, 'bot', 'agent-runtime-daemon.js'),
  resolve(distRoot, 'bot', 'agent-channel-bus.js'),
  resolve(distRoot, 'bot', 'agent-channel-bridge.js'),
  resolve(distRoot, 'services', 'agent-core.js'),
];
for (const p of need) {
  if (!existsSync(p)) fail(`dist 산출물 없음: ${p} — 먼저 npm run build`);
}
const daemonMod = await import(need[0]);
const busMod = await import(need[1]);
const bridgeMod = await import(need[2]);
const coreMod = await import(need[3]);

const core = coreMod.loadCoreDef(memoRoot, args.coreId);
if (!core) fail(`코어 정의 부재: memo/.claude/agents/${args.coreId}/core.md`);

// LLM 호출: karmolab-ai 가 동일 패키지에 있음. dry-run 시 stub.
let llmClient = null;
if (!dryRun) {
  try {
    const aiMod = await import('karmolab-ai/node');
    llmClient = aiMod.tryCreateGenerativeTextFromEnv();
    if (!llmClient) console.warn('[agent-runtime] generativeText 미초기화 — stub 모드');
  } catch (e) {
    console.warn(`[agent-runtime] LLM import 실패: ${e?.message ?? e} — stub 모드`);
  }
}

async function callLLM(prompt) {
  if (!llmClient) {
    // 미초기화 = silence default JSON (prefilter) 또는 빈 본문(speak).
    return '{"react": false, "why": "llm-unavailable"}';
  }
  try {
    const r = await llmClient.generateText({ prompt });
    return (r?.text || '').trim();
  } catch (e) {
    return '';
  }
}

const deps = {
  readSince: (chId, sinceTs) =>
    busMod.readRecentBusEvents({ MEMO_REPO_PATH: memoRoot }, chId, {
      sinceTs: sinceTs || undefined,
      daysBack: 1,
      limit: 400,
    }),
  prefilterLLM: callLLM,
  speakLLM: callLLM,
  publishUtter: (ev) => {
    if (dryRun) {
      console.log(`[agent-runtime DRY] core-utter ch=${ev.channelId} core=${ev.coreId}: ${ev.text.slice(0, 200)}`);
      return true;
    }
    return !!bridgeMod.publishToBus({ MEMO_REPO_PATH: memoRoot }, {
      source: 'agent-runtime',
      channelId: ev.channelId,
      ts: ev.ts,
      text: ev.text,
      coreId: ev.coreId,
      type: 'core-utter',
    });
  },
  appendMem: (entry) => {
    if (dryRun) return;
    coreMod.appendCoreMemory(memoRoot, entry.coreId, {
      session: 'agent-runtime',
      type: entry.type,
      topic: entry.topic,
      summary: entry.summary,
    });
  },
  readRecentMem: (coreId) => coreMod.readRecentCoreMemory(memoRoot, coreId, 6),
  now: () => new Date(),
};

let state = { lastSeenTs: '' };
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

console.log(`[agent-runtime] start coreId=${core.id} channel=${channelId} dryRun=${dryRun} interval=${args.intervalMs}ms`);

async function tick() {
  try {
    const m = await daemonMod.agentRuntimeTickOnce(state, deps, {
      core,
      channelId,
    });
    state = { lastSeenTs: m.lastSeenTs || state.lastSeenTs };
    if (m.scanned > 0 || m.spoken > 0 || m.skippedRateLimited > 0) {
      console.log(daemonMod.summarizeTick(core.id, m));
    }
  } catch (e) {
    console.error(`[agent-runtime] tick error: ${e?.stack || e}`);
  }
}

if (args.once) {
  await tick();
  process.exit(0);
}

while (!stopping) {
  await tick();
  await new Promise((r) => setTimeout(r, args.intervalMs));
}
console.log(`[agent-runtime] stop coreId=${core.id}`);
process.exit(0);
