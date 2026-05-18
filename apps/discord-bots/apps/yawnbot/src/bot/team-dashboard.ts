// 에이전트 팀 현황 대시보드 (TASK-KAR-077).
//
// 사용자: "대시보드 … 메시지 ID 저장 계속 수정 … 꼭 하나일 필요 없어"
// → 전용 #dashboard 채널, 봇이 유지하는 2 메시지 edit-in-place.
// "좀 꾸며봐" → Discord embed(상태색 accent + 워커 이모지 + 2열 필드 +
// footer 타임스탬프). 사용자 선택 = 「상태색 + 이모지」.
//
// 설계: 순수 렌더(스냅샷→embed JSON, discord.js 비의존=테스트가능) ⊥
// IO(채널 fetch·edit·ID 영속, sink 주입=setCoreSpeak 동형). 실패 비-fatal.

import fs from 'node:fs';
import path from 'node:path';
import {
  channelIdFor,
  primaryGuildId,
  provisionInstanceLabel,
} from '../services/channel-provision';

const PKG_ROOT = path.resolve(__dirname, '..', '..');

// ── 워커 상태 파싱 (runWorkerConsumerOnce CSV 계약 — 우리 자체 안정 포맷) ──
// `<core>:idle | cooldown-all | claim-lost | done:<id> | done-no-artifact:
// <id> | <status>`. 알 수 없는 형태 = graceful fallback.
export interface WorkerLine {
  core: string; // 'KAR' | 'KL' | 'WM' | …
  emoji: string; // 🟢 작업/완료 · ⏳ 대기류 · 🟡 무산출 · 🔴 에러
  text: string; // '▸ TASK-… 완료' 등
  kind: 'active' | 'wait' | 'noop' | 'error';
}

function coreShort(coreId: string): string {
  const m = /^([a-z]+)-worker$/i.exec(coreId);
  return (m ? m[1] : coreId).toUpperCase();
}

export function parseWorkerStates(csv: string | undefined): WorkerLine[] {
  if (!csv) return [];
  const out: WorkerLine[] = [];
  for (const seg of csv.split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = seg.indexOf(':');
    if (i < 0) continue;
    const core = coreShort(seg.slice(0, i));
    const rest = seg.slice(i + 1);
    let emoji = '⏳';
    let text = rest;
    let kind: WorkerLine['kind'] = 'wait';
    if (rest === 'idle') text = '대기';
    else if (rest === 'cooldown-all') {
      text = '쿨다운 (전 후보 ~30분)';
    } else if (rest === 'claim-lost') text = '경합 — 재대기';
    else if (rest.startsWith('done:')) {
      emoji = '🟢';
      text = `▸ ${rest.slice(5)} 완료 (push)`;
      kind = 'active';
    } else if (rest.startsWith('done-no-artifact:')) {
      emoji = '🟡';
      text = `▸ ${rest.slice(17)} 무산출 (쿨다운)`;
      kind = 'noop';
    } else {
      emoji = '🔴';
      text = `▸ ${rest}`;
      kind = 'error';
    }
    out.push({ core, emoji, text, kind });
  }
  return out;
}

// ── 스냅샷 ──────────────────────────────────────────────────────────────
export interface DashboardSnapshot {
  atKST: string; // "2026-05-18 18:42"
  lastTickKST: string | null;
  tickSummary: string; // 직전 tick 결과(가공 X — 파싱 의존 0)
  workers: WorkerLine[];
  queue: { repo: string; count: number }[];
  alive: boolean;
}

// ── 순수 렌더 → embed JSON (discord.js APIEmbed 호환) ────────────────────
export interface DashEmbed {
  color: number;
  author?: { name: string };
  title?: string;
  description?: string;
  fields: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
}

const C_GREEN = 0x2ecc71;
const C_YELLOW = 0xf1c40f;
const C_RED = 0xe74c3c;
const C_GREY = 0x95a5a6;

/** 건강색 — red(에러/down) > yellow(전부 대기·큐0) > green(작업/정상). */
function health(s: DashboardSnapshot): { color: number; tag: string } {
  if (!s.alive) return { color: C_GREY, tag: '⚪ 미상' };
  if (s.workers.some((w) => w.kind === 'error'))
    return { color: C_RED, tag: '🔴 에러' };
  const total = s.queue.reduce((a, b) => a + b.count, 0);
  const anyActive = s.workers.some((w) => w.kind === 'active');
  if (anyActive) return { color: C_GREEN, tag: '🟢 작업중' };
  if (s.workers.some((w) => w.kind === 'noop'))
    return { color: C_YELLOW, tag: '🟡 무산출 회전' };
  if (total === 0) return { color: C_YELLOW, tag: '🟡 큐 빔' };
  return { color: C_GREEN, tag: '🟢 가동' };
}

function workerBlock(ws: WorkerLine[]): string {
  if (ws.length === 0) return '_(워커 보고 대기)_';
  return ws
    .map((w) => `${w.emoji} \`${w.core.padEnd(3)}\` ${w.text}`)
    .join('\n')
    .slice(0, 1000);
}

/** Compact — 채널 위, 한눈. */
export function renderCompact(s: DashboardSnapshot): DashEmbed {
  const h = health(s);
  const total = s.queue.reduce((a, b) => a + b.count, 0);
  const q =
    s.queue.length === 0
      ? '(미상)'
      : s.queue.map((x) => `${x.repo} **${x.count}**`).join(' · ');
  return {
    color: h.color,
    author: { name: `🛰 욘봇 팀 · ${h.tag}` },
    fields: [
      { name: '워커', value: workerBlock(s.workers), inline: false },
      { name: '큐 (claimable)', value: `${q}\n합 **${total}**`, inline: true },
      {
        name: '직전 틱',
        value: `${s.lastTickKST ?? '—'}\n${(s.tickSummary || '유휴').slice(0, 180)}`,
        inline: true,
      },
    ],
    footer: { text: `🔄 15분 자동 갱신 · ${s.atKST} KST · 상세 ↓` },
  };
}

/** Detailed — 채널 아래, 깊게. */
export function renderDetailed(s: DashboardSnapshot): DashEmbed {
  const h = health(s);
  const qLines =
    s.queue.length === 0
      ? '(스캔 미상)'
      : s.queue.map((x) => `\`${x.repo.padEnd(8)}\` ${x.count}`).join('\n');
  return {
    color: h.color,
    title: `📋 욘봇 팀 — 상세 · ${h.tag}`,
    fields: [
      { name: '워커 상태', value: workerBlock(s.workers), inline: false },
      {
        name: '큐 (KAR-075 repo 라우팅)',
        value: qLines,
        inline: true,
      },
      {
        name: '시스템',
        value: `봇 ${s.alive ? '🟢 alive' : '⚪ 미상'}\n갱신 ${s.atKST} KST`,
        inline: true,
      },
      {
        name: '직전 cadence tick',
        value:
          `시각 ${s.lastTickKST ?? '—'}\n` +
          '```\n' +
          (s.tickSummary || '유휴 — 발화·산출 없음').slice(0, 850) +
          '\n```',
        inline: false,
      },
    ],
    footer: { text: `idle/cooldown 도배 X (KAR-075) — 현황은 여기로` },
  };
}

// ── IO: 채널 fetch·edit·ID 영속 ────────────────────────────────────────
/** main.ts 가 discord client 로 구현 주입(setCoreSpeak 동형). embed JSON
 *  하나를 ensure(없으면 send/있으면 edit)하고 그 메시지 ID 반환. */
export type DashboardSink = (
  channelId: string,
  messageId: string | null,
  embed: DashEmbed,
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

/** Compact/Detailed 2 embed ensure-or-edit. 미구성/실패 = 조용히 skip. */
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
