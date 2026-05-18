// 에이전트 팀 현황 대시보드 (TASK-KAR-077).
//
// 사용자: "대시보드 같은게 있으면 좋을듯 … 메시지 ID 저장해서 계속 수정 …
// 메시지가 꼭 하나일 필요는 없어". → 전용 #dashboard 채널에 봇이 유지하는
// 2 메시지(Compact 요약 / Detailed)를 cadence tick 마다 *edit-in-place*.
// 채널엔 이 둘만 → 스크롤 0, 그것만 보면 현황 즉시.
//
// 설계: 순수 렌더(스냅샷→문자열) ⊥ IO(채널 fetch·edit·ID 영속). sink 주입
// = setCoreSpeak 동형(agent-cadence ⊥ discord.js). 영속 = provisioned-
// channels 동형 파일(gitignore 파생). 실패 전부 비-fatal(틱 안 막음).

import fs from 'node:fs';
import path from 'node:path';
import {
  channelIdFor,
  primaryGuildId,
  provisionInstanceLabel,
} from '../services/channel-provision';

const PKG_ROOT = path.resolve(__dirname, '..', '..');

export interface DashboardSnapshot {
  atKST: string; // "2026-05-18 18:42"
  lastTickKST: string | null;
  /** 직전 cadence tick 결과 요약(가공 X — 그대로 표기, 파싱 의존 0). */
  tickSummary: string;
  /** repo 별 claimable 큐 수. */
  queue: { repo: string; count: number }[];
  /** 봇 가동 표식(heartbeat). */
  alive: boolean;
}

// ── 순수 렌더 (테스트가능, IO 0) ────────────────────────────────────────
const BAR = '━'.repeat(34);

function fmtQueue(q: { repo: string; count: number }[]): string {
  if (q.length === 0) return '(미상)';
  return q.map((x) => `${x.repo} ${x.count}`).join(' · ');
}

/** Compact — 한눈 요약(채널 위 메시지). */
export function renderCompact(s: DashboardSnapshot): string {
  const total = s.queue.reduce((a, b) => a + b.count, 0);
  return [
    `🛰 **욘봇 팀 현황** · ${s.atKST} KST ${s.alive ? '· 🟢 가동' : '· ⚪'}`,
    BAR,
    `큐(claimable)  ${fmtQueue(s.queue)}  → 합 ${total}`,
    `직전 틱  ${s.lastTickKST ?? '—'}`,
    `  ${s.tickSummary.slice(0, 240) || '(유휴)'}`,
    BAR,
    `_15분마다 자동 갱신 · 상세 = 아래 메시지_`,
  ].join('\n');
}

/** Detailed — 깊게(채널 아래 메시지). */
export function renderDetailed(s: DashboardSnapshot): string {
  const lines: string[] = [
    `📋 **욘봇 팀 — 상세** · ${s.atKST} KST`,
    BAR,
    '▼ 큐 (claimable, repo 라우팅 KAR-075)',
  ];
  if (s.queue.length === 0) lines.push('  (스캔 미상)');
  else for (const x of s.queue) lines.push(`  ${x.repo.padEnd(22)} ${x.count}`);
  lines.push(
    '',
    '▼ 직전 cadence tick',
    `  시각  ${s.lastTickKST ?? '—'}`,
    `  결과  ${s.tickSummary.slice(0, 900) || '(유휴 — 발화/산출 없음)'}`,
    '',
    '▼ 시스템',
    `  봇  ${s.alive ? '🟢 alive' : '⚪ 미상'} · 갱신 ${s.atKST} KST`,
    BAR,
    '_idle/cooldown 도배 X (KAR-075) — 현황은 여기로._',
  );
  return lines.join('\n');
}

// ── IO: 채널 fetch·edit·ID 영속 ────────────────────────────────────────
/**
 * 대시보드 sink — 한 메시지를 ensure(없으면 send, 있으면 edit)하고 그
 * 메시지 ID 반환. main.ts 가 discord client 로 구현 주입(setCoreSpeak 동형).
 * 실패 시 null 반환(상위 비-fatal).
 */
export type DashboardSink = (
  channelId: string,
  messageId: string | null,
  content: string,
) => Promise<string | null>;

let sink: DashboardSink | null = null;
export function setDashboardSink(fn: DashboardSink): void {
  sink = fn;
}

interface DashState {
  compactId?: string;
  detailedId?: string;
}

function statePath(env: NodeJS.ProcessEnv): string | null {
  const gid = primaryGuildId(env);
  if (!gid) return null;
  return path.join(
    PKG_ROOT,
    'data',
    `dashboard-state.${gid}.${provisionInstanceLabel(env)}.json`,
  );
}

function loadState(env: NodeJS.ProcessEnv): DashState {
  const p = statePath(env);
  if (!p) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveState(env: NodeJS.ProcessEnv, st: DashState): void {
  const p = statePath(env);
  if (!p) return;
  try {
    fs.writeFileSync(p, JSON.stringify(st, null, 2));
  } catch {
    /* 영속 실패 = 다음 틱 새 메시지(중복 1회) — 비-fatal */
  }
}

/**
 * 대시보드 갱신 — Compact/Detailed 2 메시지 ensure-or-edit. 채널·sink
 * 미구성/실패 = 조용히 skip(틱 비차단). 정본 = TASK-KAR-077.
 */
export async function updateDashboard(
  env: NodeJS.ProcessEnv,
  snap: DashboardSnapshot,
): Promise<'skip' | 'ok' | 'partial'> {
  if (!sink) return 'skip';
  const cid = channelIdFor('dashboard', env);
  if (!cid) return 'skip';
  const st = loadState(env);
  let ok = 0;
  try {
    const c = await sink(cid, st.compactId ?? null, renderCompact(snap));
    if (c) {
      st.compactId = c;
      ok++;
    }
  } catch {
    /* 비-fatal */
  }
  try {
    const d = await sink(cid, st.detailedId ?? null, renderDetailed(snap));
    if (d) {
      st.detailedId = d;
      ok++;
    }
  } catch {
    /* 비-fatal */
  }
  saveState(env, st);
  return ok === 2 ? 'ok' : ok === 0 ? 'skip' : 'partial';
}
