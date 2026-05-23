/**
 * agent-status-board — 한 화면 status (TASK-KAR-018-INIT 사용자 피드백 2026-05-23).
 *
 * 사용자 발화 (직접 인용): "텍스트랑 채팅이 너무 많고, 그래서 뭘 기다리면 되는건지도
 * 알 수도 없고, 진행상황은 어떤지도 모르겠고." + "한 화면 status는 너가 알아서 고안해".
 *
 * 비전: #team-bus 상단 **고정 메시지 1개** — 봇이 매 tick *edit* 으로 갱신(새 메시지 X).
 * 사용자는 그 1개만 보면 「뭐 진행/뭐 대기」 답. 다른 모든 메시지(digest·ticker·trace) =
 * 부속(스레드 또는 무시 가능).
 *
 * substrate-first (평행 정의 X):
 *  - 측정 = gatherHealthSignals 재사용
 *  - 발의 = `.claude/initiator-ledger.jsonl` tail 재사용 (INIT substrate)
 *  - 사용자 대기 = `.claude/objectives.md` 또는 progress-stale issues 재사용
 *  - state = `.claude/status-board.json` { channelId, messageId } persist
 *  - sender = deps 주입 (edit/send/pin Discord API 추상화)
 *
 * 안전: best-effort, 비차단. 실패해도 cadence 막지 X (trace 만).
 */

import fs from 'fs';
import path from 'path';
import {
  diagnoseHealth,
  gatherHealthSignals,
  type HealthSignals,
} from './system-health';
import { readLedger } from './agent-initiator';

export interface StatusBoardState {
  channelId?: string;
  messageId?: string;
  lastUpdatedAt?: string;
}

export interface StatusBoardData {
  /** 봇 작동 — 마지막 cadence tick 이후 경과(시간 + ✓/⚠). */
  botHealth: { status: 'ok' | 'warn' | 'critical'; lastTickHrs: number; label: string };
  /** 최근 봇 발견 약점 — initiator-ledger 의 최신 seeded TASK 1건. */
  latestFinding: { taskFile?: string; headline?: string; ts?: string } | null;
  /** 사용자 결정 대기 — open issues / 미응답 quality-check / objective 결정 등. */
  userPending: { count: number; topItem?: string };
  /** 자가증강 cycle 진척 — 코어 promotion/revert 카운트 (7d). */
  evolution: { promotedCount: number; revertedCount: number };
  /** 측정 timestamp. */
  ts: string;
}

function statusBoardStatePath(memoRoot: string): string {
  return path.join(memoRoot, '.claude', 'status-board.json');
}

export function readStatusBoardState(memoRoot: string): StatusBoardState {
  if (!memoRoot) return {};
  const p = statusBoardStatePath(memoRoot);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as StatusBoardState;
  } catch {
    return {};
  }
}

export function writeStatusBoardState(
  memoRoot: string,
  state: StatusBoardState,
): void {
  if (!memoRoot) return;
  const p = statusBoardStatePath(memoRoot);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    /* best-effort */
  }
}

/** initiator-ledger.jsonl 의 최신 seeded entry → 사용자 가시 latest finding. */
function gatherLatestFinding(memoRoot: string): StatusBoardData['latestFinding'] {
  const ledger = readLedger(memoRoot);
  for (let i = ledger.length - 1; i >= 0; i--) {
    const e = ledger[i];
    if (e.type === 'seeded' && e.seededTaskFile) {
      return {
        taskFile: e.seededTaskFile,
        headline: e.headline,
        ts: e.ts,
      };
    }
  }
  return null;
}

/** trace + health → 봇 작동 상태 추론. */
function gatherBotHealth(
  signals: HealthSignals,
): StatusBoardData['botHealth'] {
  const hrs = signals.traceStalenessHrs;
  if (!isFinite(hrs)) {
    return { status: 'critical', lastTickHrs: hrs, label: '봇 첫 부팅 대기 (trace 0)' };
  }
  if (hrs >= 2) {
    return {
      status: 'critical',
      lastTickHrs: hrs,
      label: `⚠ 마지막 tick ${Math.round(hrs)}h 전 — 봇 막힘/재시작 필요 가능`,
    };
  }
  if (hrs >= 0.6) {
    return {
      status: 'warn',
      lastTickHrs: hrs,
      label: `△ 마지막 tick ${Math.round(hrs * 60)}분 전`,
    };
  }
  return {
    status: 'ok',
    lastTickHrs: hrs,
    label: `✓ 봇 작동 (마지막 tick ${Math.max(1, Math.round(hrs * 60))}분 전)`,
  };
}

/**
 * 사용자 결정 대기 카운트 — progress-stale / worker-fail-critical 같은 critical
 * 이슈 수. 봇 자체가 처리 못 하고 사용자 입력 필요한 항목 (1차 = critical issues).
 */
function gatherUserPending(
  signals: HealthSignals,
): StatusBoardData['userPending'] {
  const issues = diagnoseHealth(signals);
  const criticals = issues.filter((i) => i.severity === 'critical');
  if (criticals.length === 0) return { count: 0 };
  return { count: criticals.length, topItem: criticals[0].detail };
}

/** evolution-events ledger tail — 7d window promotion/revert 카운트. */
function gatherEvolution(memoRoot: string): StatusBoardData['evolution'] {
  if (!memoRoot) return { promotedCount: 0, revertedCount: 0 };
  const p = path.join(memoRoot, '.claude', 'evolution-events.jsonl');
  if (!fs.existsSync(p)) return { promotedCount: 0, revertedCount: 0 };
  const cutoff = Date.now() - 7 * 24 * 3_600_000;
  let promoted = 0;
  let reverted = 0;
  try {
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const e = JSON.parse(t);
        const ts = Date.parse(e.ts || '');
        if (!isFinite(ts) || ts < cutoff) continue;
        if (e.code === 'core-promoted') promoted++;
        if (e.code === 'core-reverted') reverted++;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* best-effort */
  }
  return { promotedCount: promoted, revertedCount: reverted };
}

export function gatherStatusBoardData(
  env: NodeJS.ProcessEnv,
  nowMs: number = Date.now(),
): StatusBoardData {
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  const signals = gatherHealthSignals(env, nowMs);
  return {
    botHealth: gatherBotHealth(signals),
    latestFinding: gatherLatestFinding(memoRoot),
    userPending: gatherUserPending(signals),
    evolution: gatherEvolution(memoRoot),
    ts: new Date(nowMs).toISOString(),
  };
}

/**
 * 한 화면 메시지 포맷. *순수* — 사용자가 1번 보면 끝.
 *
 * 형식 design:
 *   📊 봇 상태 (auto-update · 이거 1개만 보면 됨)
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   • 봇 작동: ✓ 마지막 tick 1분 전
 *   • 봇이 발견한 약점: TASK-KAR-136 「팀원 작업 실패 원인」
 *   • 진화 7d: 코어 승격 0 · 자동 원복 0
 *   • 사용자 결정 대기: 2건 (progress-stale·worker-fail)
 *   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *   _다른 디스코드 메시지 = 내부 cron 펼치기 (스레드). 모두 펴볼 필요 X._
 */
export function formatStatusBoard(data: StatusBoardData): string {
  const lines: string[] = [];
  lines.push('📊 **봇 상태** _(auto-update · 이거 1개만 보면 됨)_');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`• **봇 작동**: ${data.botHealth.label}`);
  if (data.latestFinding) {
    const file = data.latestFinding.taskFile || '?';
    const head = (data.latestFinding.headline || '').replace(/^📜\s*/u, '');
    lines.push(`• **최근 발견 약점**: \`${file}\``);
    lines.push(`    ↳ ${head}`);
  } else {
    lines.push('• **최근 발견 약점**: _(아직 발의 0건 — 봇이 신호 잡으면 박힘)_');
  }
  lines.push(
    `• **진화 7d**: 코어 승격 ${data.evolution.promotedCount} · 자동 원복 ${data.evolution.revertedCount}`,
  );
  if (data.userPending.count === 0) {
    lines.push('• **사용자 결정 대기**: _없음_ ✨');
  } else {
    lines.push(
      `• **사용자 결정 대기**: ${data.userPending.count}건${data.userPending.topItem ? ` — ${data.userPending.topItem.slice(0, 80)}` : ''}`,
    );
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(
    `_갱신 ${data.ts} · 다른 디스코드 메시지 = 내부 cron 펼치기 (스레드) — 모두 펴볼 필요 X_`,
  );
  return lines.join('\n');
}

export interface StatusBoardSender {
  /** 새 메시지 1개 send + 메시지 id 반환. send 실패 = null. */
  send: (channelId: string, content: string) => Promise<string | null>;
  /** 기존 메시지 edit. 실패 (메시지 삭제·권한 등) = false → 새 send 폴백. */
  edit: (channelId: string, messageId: string, content: string) => Promise<boolean>;
  /** 메시지 pin (channel pinned ≤50 한도 안전). 첫 send 시만 호출. */
  pin?: (channelId: string, messageId: string) => Promise<boolean>;
}

// setDashboardSink 패턴(평행정의0). main.ts 가 Discord client 로 sender 주입.
// 미주입 = cadence wiring 시 silent skip (가용성 우선).
let registeredSender: StatusBoardSender | null = null;
export function setStatusBoardSender(fn: StatusBoardSender | null): void {
  registeredSender = fn;
}
export function getStatusBoardSender(): StatusBoardSender | null {
  return registeredSender;
}

/**
 * 한 화면 status board 1회 갱신. 기존 메시지 있으면 edit, 없으면 send + pin.
 * state persist (`.claude/status-board.json`). best-effort 비차단.
 *
 * deps.sender 미주입 시 registeredSender(main.ts setStatusBoardSender) 사용.
 * 둘 다 없으면 'status:no-sender' (silent skip, 가용성 우선).
 *
 * @returns label = 'status:edited' | 'status:created' | 'status:no-sender' |
 *   'status:no-channel' | 'status:no-memo-root' | 'status:send-fail' | 'status:error'.
 */
export async function runStatusBoardOnce(
  env: NodeJS.ProcessEnv,
  deps: {
    resolveChannelId: () => string | null;
    sender?: StatusBoardSender | null;
    nowMs?: number;
  },
): Promise<string> {
  const memoRoot = env.MEMO_REPO_PATH?.trim() || '';
  if (!memoRoot) return 'status:no-memo-root';
  const sender = deps.sender ?? registeredSender;
  if (!sender) return 'status:no-sender';
  const channelId = deps.resolveChannelId();
  if (!channelId) return 'status:no-channel';
  const data = gatherStatusBoardData(env, deps.nowMs);
  const content = formatStatusBoard(data);
  const state = readStatusBoardState(memoRoot);

  // 같은 채널 + 기존 messageId 있으면 edit 시도
  if (state.channelId === channelId && state.messageId) {
    try {
      const ok = await sender.edit(channelId, state.messageId, content);
      if (ok) {
        writeStatusBoardState(memoRoot, {
          ...state,
          lastUpdatedAt: data.ts,
        });
        return 'status:edited';
      }
      // edit fail = 메시지 삭제·권한 등 → fall through to send 폴백
    } catch {
      /* fall through */
    }
  }

  // 새 send + pin
  try {
    const newId = await sender.send(channelId, content);
    if (!newId) return 'status:send-fail';
    if (sender.pin) {
      try {
        await sender.pin(channelId, newId);
      } catch {
        /* pin 실패 = send 자체는 성공 */
      }
    }
    writeStatusBoardState(memoRoot, {
      channelId,
      messageId: newId,
      lastUpdatedAt: data.ts,
    });
    return 'status:created';
  } catch {
    return 'status:error';
  }
}
