/**
 * agent-daemon — 코어 1개 = 독립 process 의 ambient listener
 * (KAR-018-LT-DIVERSITY D-3+D-4+D-5+D-6, 2026-05-23).
 *
 * 사용자 비전: "사람처럼 그냥 채팅보고 자기가 스스로 판단해서 읽씹하든
 * 대답하든". 단일 봇 process 의존 폐기 — 코어가 자기 process 로 살아있음.
 *
 * 책임:
 *  - agent-bus subscribe → channel-msg 받음
 *  - 단일 LLM 호출 (JSON 출력: {react, text?}) — silence default
 *  - react=true 면 core-utter publish (Discord 표면 post 는 adapter 가 처리)
 *  - rate limit (per-core 5분 ≤ 2 발화)
 *  - mem write (work-memory append, 자기 발화·skip 사유 기록)
 *
 * 비-책임:
 *  - Discord client X — daemon 은 메신저 무관. bus 만 안다.
 *  - 자기 발화 echo skip — bus event 의 source=core:<self> 면 무시.
 *
 * 진입: `node dist/src/agent-daemon.js --core-id <id> --channel-id <id>`.
 * env:
 *  - LAPTOP_AGENT_BUS_ROOT (default = ~/.karmoddrine/agent-bus)
 *  - LAPTOP_MEMO_ROOT (default = ./memo)
 *  - KARMOLAB_AI_SURFACE 등 karmolab-ai tryCreateGenerativeTextFromEnv 정합
 *  - AGENT_DAEMON_RATE_PER_5MIN (default 2)
 *  - AGENT_DAEMON_CONTEXT_MINUTES (default 5)
 */
import fs from 'node:fs';
import path from 'node:path';
import { tryCreateGenerativeTextFromEnv, type GenerativeTextClient } from 'karmolab-ai/node';
import { loadCoreDef, type CoreDef } from './services/agent-core.js';
import {
  publishBusEvent,
  readRecentBusEvents,
  resolveBusRoot,
  subscribeBusEvents,
  type BusEvent,
} from './services/agent-bus.js';

interface DaemonArgs {
  coreId: string;
  channelId?: string;
}

function parseArgs(argv: string[]): DaemonArgs {
  const out: Partial<DaemonArgs> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--core-id') { out.coreId = v; i += 1; }
    else if (k === '--channel-id') { out.channelId = v; i += 1; }
  }
  if (!out.coreId) {
    out.coreId = process.env.AGENT_DAEMON_CORE_ID;
  }
  if (!out.channelId) {
    out.channelId = process.env.AGENT_DAEMON_CHANNEL_ID;
  }
  if (!out.coreId) {
    throw new Error('agent-daemon: --core-id or AGENT_DAEMON_CORE_ID required');
  }
  return out as DaemonArgs;
}

/** channelId resolve — args/env 없으면 yawnbot provisioned file 통해. */
async function resolveChannelId(args: DaemonArgs): Promise<string | null> {
  if (args.channelId) return args.channelId;
  try {
    const { channelIdFor } = await import('./services/channel-provision.js');
    return channelIdFor('agent-team');
  } catch {
    return null;
  }
}

interface PrefilterDecision {
  /** "answer" = 발화함, "skip" = 읽씹. */
  decision: 'answer' | 'skip';
  /** skip 사유 또는 발화 본문. */
  text: string;
}

/**
 * LLM 호출 → JSON decision 추출. silence default 강조 prompt.
 * 빈/손상 응답 = skip (false-positive 비용 > false-negative 룰 정합).
 */
export async function decideUtterance(
  llm: GenerativeTextClient,
  core: CoreDef,
  context: BusEvent[],
  trigger: BusEvent,
): Promise<PrefilterDecision> {
  const contextLines = context
    .filter((e) => e.ts !== trigger.ts)
    .slice(-15)
    .map((e) => {
      const who =
        e.type === 'core-utter'
          ? `[${e.coreId || 'core?'}]`
          : `[${e.refs?.author || e.source}]`;
      return `${who} ${e.text}`;
    })
    .join('\n');
  const triggerWho =
    trigger.type === 'core-utter'
      ? `[${trigger.coreId || 'core?'}]`
      : `[${trigger.refs?.author || trigger.source}]`;

  const prompt = [
    `당신은 "${core.displayName}" (id=${core.id}) — ${core.role}.`,
    '',
    '## 당신의 직무·경계 (core.md 본문)',
    core.body.slice(0, 1500),
    '',
    '## 채팅방 상황',
    '#team-bus 채널을 *듣고 있는* 동료 N명 중 한 명입니다.',
    '아래 = 직전 N분 채팅 흐름. 당신은 *답할 수도 있고 읽씹할 수도* 있습니다.',
    '사람 채팅방처럼 — 시각이 *있을 때만* 끼어들고, 없으면 듣기만 하세요.',
    '',
    '## 침묵 우선 원칙 (중요)',
    '확실히 *내 시각에서 의미 있는 한 마디* 가 떠오를 때만 답하세요.',
    '- 다른 동료가 더 잘 답할 주제 = SKIP',
    '- 단순 인사·맞장구·페르소나 발화로 빈자리 채우기 = SKIP',
    '- "내 역할이니까 답해야 한다" 강박 = SKIP (역할 정의는 *권한* 이지 *의무* 아님)',
    '- 직전 흐름에 이미 같은 얘기 나옴 = SKIP',
    '',
    '## 직전 채팅 흐름',
    contextLines || '(없음)',
    '',
    '## 방금 올라온 메시지 (트리거)',
    `${triggerWho} ${trigger.text}`,
    '',
    '## 출력 형식 (JSON, 다른 문자 X)',
    '{"decision": "answer" | "skip", "text": "..."}',
    '- decision=answer: text = 당신이 채널에 적을 한 마디 (2-4줄).',
    '- decision=skip:  text = 왜 skip 인지 1줄 사유 (관측용, 채널엔 안 나감).',
  ].join('\n');

  let raw: string;
  try {
    raw = await llm.generateFromPrompt(prompt);
  } catch (e) {
    return { decision: 'skip', text: `llm-error: ${e instanceof Error ? e.message : String(e)}` };
  }
  return parseDecision(raw);
}

/** JSON 추출 robust — code fence·앞뒤 공백 허용. */
export function parseDecision(raw: string): PrefilterDecision {
  const stripped = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const m = stripped.match(/\{[\s\S]*?\}/);
  if (!m) return { decision: 'skip', text: 'parse-fail-no-json' };
  try {
    const obj = JSON.parse(m[0]);
    if (obj?.decision === 'answer' && typeof obj.text === 'string' && obj.text.trim()) {
      return { decision: 'answer', text: obj.text.trim() };
    }
    if (obj?.decision === 'skip') {
      return { decision: 'skip', text: typeof obj.text === 'string' ? obj.text : '' };
    }
    return { decision: 'skip', text: 'parse-fail-unknown-shape' };
  } catch {
    return { decision: 'skip', text: 'parse-fail-json-syntax' };
  }
}

/** 5분 sliding window 안 자기 발화 N건 카운트. */
export function countRecentSelfUtterances(
  context: BusEvent[],
  coreId: string,
  windowMinutes: number,
  now: Date = new Date(),
): number {
  const cutoff = now.getTime() - windowMinutes * 60 * 1000;
  return context.filter(
    (e) =>
      e.type === 'core-utter' &&
      e.coreId === coreId &&
      new Date(e.ts).getTime() >= cutoff,
  ).length;
}

/** mem 파일 append (jsonl). 부재 디렉토리 자동 생성. */
function appendCoreMem(memoRoot: string, coreId: string, entry: Record<string, unknown>): void {
  try {
    const dir = path.join(memoRoot, '.claude', 'agents', coreId, 'mem');
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const yyyy = kst.getUTCFullYear();
    const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(kst.getUTCDate()).padStart(2, '0');
    const file = path.join(dir, `${yyyy}-${mm}-${dd}-daemon.jsonl`);
    fs.appendFileSync(file, JSON.stringify({ ts: now.toISOString(), ...entry }) + '\n', 'utf8');
  } catch {
    // mem 손실은 daemon 막지 X
  }
}

/** 한 트리거에 대한 daemon 의 평가·발화 사이클 (test 가능 단위). */
export async function handleTrigger(deps: {
  core: CoreDef;
  llm: GenerativeTextClient;
  busRoot: string;
  channelId: string;
  memoRoot: string;
  ratePer5min: number;
  contextMinutes: number;
  now?: Date;
}, trigger: BusEvent): Promise<void> {
  if (trigger.type !== 'channel-msg' && trigger.type !== 'core-utter') return;
  if (trigger.channelId !== deps.channelId) return;
  // 자기 발화 echo skip
  if (trigger.type === 'core-utter' && trigger.coreId === deps.core.id) return;
  if (trigger.source === `core:${deps.core.id}`) return;

  const context = await readRecentBusEvents(
    deps.busRoot,
    deps.channelId,
    deps.contextMinutes,
    deps.now,
  );
  const recentSelf = countRecentSelfUtterances(
    context,
    deps.core.id,
    5,
    deps.now,
  );
  if (recentSelf >= deps.ratePer5min) {
    appendCoreMem(deps.memoRoot, deps.core.id, {
      kind: 'skip',
      reason: 'rate-limit',
      recentSelf,
      cap: deps.ratePer5min,
      triggerTs: trigger.ts,
    });
    await publishBusEvent(deps.busRoot, {
      type: 'core-react-skip',
      channelId: deps.channelId,
      source: `core:${deps.core.id}`,
      coreId: deps.core.id,
      text: '',
      refs: { skipReason: 'rate-limit', parentTs: trigger.ts },
    });
    return;
  }

  const decision = await decideUtterance(deps.llm, deps.core, context, trigger);
  if (decision.decision === 'skip') {
    appendCoreMem(deps.memoRoot, deps.core.id, {
      kind: 'skip',
      reason: decision.text || 'llm-skip',
      triggerTs: trigger.ts,
    });
    await publishBusEvent(deps.busRoot, {
      type: 'core-react-skip',
      channelId: deps.channelId,
      source: `core:${deps.core.id}`,
      coreId: deps.core.id,
      text: '',
      refs: { skipReason: decision.text || 'llm-skip', parentTs: trigger.ts },
    });
    return;
  }

  appendCoreMem(deps.memoRoot, deps.core.id, {
    kind: 'utter',
    text: decision.text,
    triggerTs: trigger.ts,
  });
  await publishBusEvent(deps.busRoot, {
    type: 'core-utter',
    channelId: deps.channelId,
    source: `core:${deps.core.id}`,
    coreId: deps.core.id,
    text: decision.text,
    refs: {
      parentTs: trigger.ts,
      parentMessageId: trigger.refs?.messageId,
      parentAuthor:
        trigger.type === 'core-utter'
          ? trigger.coreId
          : trigger.refs?.author,
      parentSnippet: trigger.text ? trigger.text.slice(0, 200) : undefined,
    },
  });
}

async function main(): Promise<void> {
  // load-env 는 entry 가동 시에만 (test import 시 path resolve 충돌 회피).
  await import('./load-env.js');
  const args = parseArgs(process.argv.slice(2));
  const memoRoot = (process.env.LAPTOP_MEMO_ROOT || process.env.MEMO_REPO_PATH || path.resolve('./memo')).trim();
  const busRoot = resolveBusRoot();
  const ratePer5min = Number.parseInt(process.env.AGENT_DAEMON_RATE_PER_5MIN || '2', 10);
  const contextMinutes = Number.parseInt(process.env.AGENT_DAEMON_CONTEXT_MINUTES || '5', 10);

  // channelId resolve — boot 시점에 yawnbot 이 아직 provision 안 했을 수 있음 → retry.
  let channelId: string | null = await resolveChannelId(args);
  let waited = 0;
  while (!channelId && waited < 600) {  // 최대 10분 대기
    await new Promise((r) => setTimeout(r, 5000));
    waited += 5;
    channelId = await resolveChannelId(args);
    if (waited % 60 === 0) {
      console.log(`[agent-daemon] channelId 대기 중 (${waited}s) — yawnbot provisioning 대기`);
    }
  }
  if (!channelId) {
    console.error('[agent-daemon] channelId resolve 실패 (10분 timeout). 종료.');
    process.exit(5);
  }

  const core = loadCoreDef(memoRoot, args.coreId);
  if (!core) {
    console.error(`[agent-daemon] core 로드 실패 coreId=${args.coreId} memoRoot=${memoRoot}`);
    process.exit(2);
  }
  if (core.status !== 'active') {
    console.error(`[agent-daemon] core status=${core.status} (active 아님). 종료.`);
    process.exit(3);
  }

  const llm = tryCreateGenerativeTextFromEnv();
  if (!llm) {
    console.error('[agent-daemon] LLM 초기화 실패 (KARMOLAB_AI_SURFACE / API 키 확인).');
    process.exit(4);
  }

  const selfTickMs = Number.parseInt(process.env.AGENT_DAEMON_CADENCE_MS || '1800000', 10);
  console.log(`[agent-daemon] start coreId=${core.id} channelId=${channelId} surface=${llm.surface} bus=${busRoot} selfTickMs=${selfTickMs}`);

  let inFlight = 0;
  const sub = subscribeBusEvents(busRoot, channelId, (event) => {
    // 동시 1개만 처리 (cap LLM 비용 폭주). 초과 = 다음 사이클서 자연 catchup.
    if (inFlight > 0) return;
    inFlight += 1;
    handleTrigger(
      { core, llm, busRoot, channelId: channelId!, memoRoot, ratePer5min, contextMinutes },
      event,
    )
      .catch((e) =>
        console.error('[agent-daemon] handleTrigger 실패', e instanceof Error ? e.message : e),
      )
      .finally(() => { inFlight -= 1; });
  }, { intervalMs: 500, onError: (e) => console.error('[agent-daemon] tail error', e.message) });

  // KAR-018-LT-PEER-ONLY P-3: self-tick — 사용자 발화 0 시간에도 자기 cadence
  // 로 자율 발의. orchestrator 폐기 후 producer 책임을 daemon 이 흡수.
  // jitter ±20% (모든 daemon 동시 tick 폭주 방지). silence default 그대로
  // 적용 = 의미 없으면 skip, 시각 있을 때만 publish.
  const jitter = (): number => selfTickMs * (0.8 + Math.random() * 0.4);
  const scheduleSelfTick = (): NodeJS.Timeout =>
    setTimeout(async () => {
      try {
        if (inFlight > 0) {
          scheduleSelfTick();
          return;
        }
        inFlight += 1;
        const ctx = await readRecentBusEvents(busRoot, channelId!, contextMinutes);
        const recentSelf = countRecentSelfUtterances(ctx, core.id, 5);
        if (recentSelf >= ratePer5min) {
          inFlight -= 1;
          scheduleSelfTick();
          return;
        }
        const selfTrigger: BusEvent = {
          ts: new Date().toISOString(),
          type: 'channel-msg',
          channelId: channelId!,
          source: 'self-tick',
          text: `(자율 cadence — ${core.displayName} 자기 시점·직무 안에서 박을 게 있나)`,
        };
        const decision = await decideUtterance(llm, core, ctx, selfTrigger);
        if (decision.decision === 'answer') {
          await publishBusEvent(busRoot, {
            type: 'core-utter',
            channelId: channelId!,
            source: `core:${core.id}`,
            coreId: core.id,
            text: decision.text,
            refs: { parentTs: selfTrigger.ts },
          });
          console.log(`[agent-daemon] self-tick utter coreId=${core.id} len=${decision.text.length}`);
        } else {
          console.log(`[agent-daemon] self-tick skip coreId=${core.id} reason=${decision.text.slice(0, 80)}`);
        }
      } catch (e) {
        console.error('[agent-daemon] self-tick 실패', e instanceof Error ? e.message : e);
      } finally {
        inFlight = Math.max(0, inFlight - 1);
        scheduleSelfTick();
      }
    }, jitter()).unref();
  let selfTickTimer = scheduleSelfTick();

  const shutdown = (sig: string): void => {
    console.log(`[agent-daemon] ${sig} 수신 — shutdown`);
    sub.stop();
    clearTimeout(selfTickTimer);
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // healthy log heartbeat (no-news=bad-news 룰 정합)
  setInterval(() => {
    console.log(`[agent-daemon] alive coreId=${core.id} inFlight=${inFlight}`);
  }, 5 * 60 * 1000).unref();
}

// entry: node ... agent-daemon.js
// (vitest 로 직접 import 시 main() 안 돔 — process.argv 가 vitest 본인)
if (process.argv[1] && /agent-daemon\.[jt]s$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error('[agent-daemon] fatal', e);
    process.exit(1);
  });
}
