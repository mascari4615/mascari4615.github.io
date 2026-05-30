/**
 * agent-bus — ⑦' 발굴을 *사람이 팔로업 가능한* 디스코드 가시층.
 *
 * 문제(사용자 2026-05-17): 익명 "🛰 에이전트 팀" 한 줄 로그 → 누가/뭘
 * 제안했는지·왜·뭘 하면 되는지 알 수 없음.
 *
 * substrate 진화:
 *  - V-1 (2026-05-17): 텍스트 채널(#team-bus) 카드 + 스레드 + ✅/❌ react.
 *    명명 에이전트 정체성으로 누가/뭘 박힘.
 *  - LT-FORUM (2026-05-20): 작업 카드 substrate = 포럼 채널(#team-work).
 *    1포스트=1흐름객체 (discovery→proposal→verdict→done). announceProposal /
 *    reconcileProposalCards 가 forum-post.ts 단일 seam 경유 — 평행 정의 0.
 *    #team-bus 텍스트는 hb/digest/escalate 1줄용으로 유지(변경 0).
 *    handleProposalReaction = forum starter message 의 ✅/❌ react 그대로
 *    소비(Discord 사양상 forum-post.starter.id == thread.id, 매핑 호환).
 */
import fs from 'fs';
import path from 'path';
import { EmbedBuilder } from 'discord.js';
import type {
  Client,
  TextChannel,
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
} from 'discord.js';
import type { ProposalEnvelope } from './proposal';
import { appendApproval } from './governance-adapter';
import {
  runInboxConsumerOnce,
  materializedPath,
  resolvedLedgerPath,
  readPendingTeamVerdicts,
  markCardReflected,
  type TeamVerdict,
} from './proposal-adapter';
import { loadCoreDef, appendCoreMemory } from '../services/agent-core';
import {
  createForumPost,
  evolveForumPost,
  type ClientLike,
  type ForumStatus,
  type ForumDomain,
} from './forum-post';
import {
  parseTaskId,
  forumTitleForTask,
  appendTaskForumLink,
} from './task-forum-bridge';

export interface ProposalAnnouncement {
  /** 결정적 발굴 id (proposalId) — 승인 매칭 키. */
  id: string;
  /** 라우팅 타겟 (task-new / objectives / self-improve …). */
  target: string;
  kind: ProposalEnvelope['kind'];
  envelope: ProposalEnvelope;
  /** 발굴 에이전트 정체성 (없으면 기본 Atlas). coreId = 코어 def 키. */
  agent?: { name: string; avatarUrl?: string; coreId?: string };
}

const COLOR_BY_KIND: Record<string, number> = {
  task: 0x4caf50,
  objective: 0x3f8cff,
  env: 0xff9800,
  skill: 0x9c27b0,
  agent: 0xcb2431,
};

/** kind → 비개발자용 평이 한국어 분류 라벨. */
const KIND_LABEL: Record<string, string> = {
  task: '할 일(TASK) 제안',
  objective: '목표 제안',
  env: '환경 개선 제안',
  skill: '새 기능(스킬) 제안',
  agent: '새 에이전트 제안',
};

/** 승인 시 평이 결과 안내. */
const KIND_ONAPPROVE: Record<string, string> = {
  task: '할 일(TASK) 카드가 하나 생깁니다 (나중에 진짜 시작할지는 당신이 결정)',
  objective: '"목표 후보"로 등록됩니다 (당신이 활성화하면 자동으로 추진)',
  env: '제안이 검증 단계로 넘어갑니다 (실제 적용은 검증 통과+당신 승인 후)',
  skill: '새 기능 제안이 검증 단계로 넘어갑니다 (적용은 검증+승인 후)',
  agent: '새 에이전트 후보로 올라갑니다 (실제 생성은 당신 승인 후)',
};

/**
 * 발굴 → {제목, 카드용 평이 본문, 스레드용 상세}. 카드 = 동료이 읽을
 * 핵심만(전문용어 분리), 상세·근거 = 스레드. 프롬프트가 평이 작성을
 * 강제하지만 렌더도 카드엔 핵심만 노출(이중 안전).
 */
function render(env: ProposalEnvelope): {
  title: string;
  cardBody: string;
  detailBody: string;
} {
  const p = env.payload as unknown as Record<string, unknown>;
  const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  switch (env.kind) {
    case 'task':
      // title=제목, body=불릿(문제/제안/효과/승인시). 중복 X.
      return { title: s(p.title), cardBody: s(p.body), detailBody: s(p.body) };
    case 'objective':
      // summary=제목 한 줄. derivation=핵심 불릿(카드). alignment=목표
      // 정합(스레드에만). 제목 본문 반복 X.
      return {
        title: s(p.summary),
        cardBody: s(p.derivation),
        detailBody: `${s(p.derivation)}\n\n**목표 정합**\n${s(p.alignment)}`,
      };
    case 'env':
      return {
        title: s(p.summary) || s(p.id),
        cardBody: s(p.summary),
        detailBody: `${s(p.summary)}\n\n_출처: ${s(p.source)}_`,
      };
    case 'skill':
      return {
        title: s(p.name),
        cardBody: s(p.summary),
        detailBody: `${s(p.summary)}\n\n_출처: ${s(p.source)}_`,
      };
    case 'agent':
      return {
        title: `새 에이전트: ${s(p.name)}`,
        cardBody: `역할: ${s(p.role)}`,
        detailBody: `역할: ${s(p.role)}\n\n_출처: ${s(p.source)}_`,
      };
  }
}

/**
 * 발굴 raw 출처를 카드 embed 의 dedicated field 로 끌어올림 (TASK-KAR-018-LT-FORUM P4).
 * env/skill/agent payload 의 `source` 가 정본 — LLM 발굴 시 prequel mem
 * (`memo/.claude/discoveries/agent-trace.jsonl` 또는 코어별 mem) 의 출처 식별자
 * (예: `agents/atlas/mem/2026-05-23.jsonl:42`) 가 박힘. task/objective 은 source
 * 미정의 — 빈 문자열. 호출자가 비면 embed field 자체 skip.
 */
export function extractDiscoverySource(env: ProposalEnvelope): string {
  const p = env.payload as unknown as Record<string, unknown>;
  const raw = p && typeof p === 'object' ? p.source : undefined;
  return typeof raw === 'string' ? raw.trim() : '';
}

// ── 메시지↔발굴id 매핑 영속 (V-2 리액션 승인이 소비) ──────────
export interface ProposalMsgEntry {
  messageId: string;
  threadId: string;
  /** 카드가 게시된 채널 id (KAR-018-LT — verdict reconciler 메시지 fetch). */
  channelId?: string;
  id: string;
  kind: string;
  target: string;
  title: string;
  ts: string;
  /** 발의 코어 id (KAR-018-Z-2 — 결과를 그 코어 mem 에 학습). */
  coreId?: string;
}

export function proposalMsgsPath(env: NodeJS.ProcessEnv): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  return root ? path.join(root, '.claude', 'agent-proposal-msgs.jsonl') : '';
}

export function appendProposalMsg(
  env: NodeJS.ProcessEnv,
  e: ProposalMsgEntry,
): void {
  const p = proposalMsgsPath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(e) + '\n', 'utf-8');
  } catch {
    /* best-effort */
  }
}

/** messageId → 발굴 매핑 1건 조회 (V-2 리액션 핸들러용). */
export function lookupProposalByMessage(
  env: NodeJS.ProcessEnv,
  messageId: string,
): ProposalMsgEntry | null {
  const p = proposalMsgsPath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    let hit: ProposalMsgEntry | null = null;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t) as ProposalMsgEntry;
      if (e.messageId === messageId) hit = e;
    }
    return hit;
  } catch {
    return null;
  }
}

/** 발굴 id → 카드 매핑 1건 (최신 — KAR-018-LT verdict reconciler용). */
export function lookupProposalById(
  env: NodeJS.ProcessEnv,
  id: string,
): ProposalMsgEntry | null {
  const p = proposalMsgsPath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    let hit: ProposalMsgEntry | null = null;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t) as ProposalMsgEntry;
      if (e.id === id) hit = e;
    }
    return hit;
  } catch {
    return null;
  }
}

/** threadId → 발굴 매핑 1건 (forum-tag-recovery 에서 태그 복원용). */
export function lookupProposalByThreadId(
  env: NodeJS.ProcessEnv,
  threadId: string,
): ProposalMsgEntry | null {
  const p = proposalMsgsPath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    let hit: ProposalMsgEntry | null = null;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t) as ProposalMsgEntry;
      if (e.threadId === threadId) hit = e;
    }
    return hit;
  } catch {
    return null;
  }
}

// ── 결정 잠금 (V-2 상태머신) ────────────────────────────────
// 먼저 누른 결정이 확정·잠금. 머터리얼라이즈=부수효과라 1회·불가역.
// 평행정의0 (KAR-018-Y-2): resolved 원장 경로 정본 = substrate
// (proposal-adapter `resolvedLedgerPath`). 본 함수는 호환 위임만.
export function proposalResolvedPath(env: NodeJS.ProcessEnv): string {
  return resolvedLedgerPath(env);
}
export function getResolved(
  env: NodeJS.ProcessEnv,
  id: string,
): 'approved' | 'rejected' | null {
  const p = proposalResolvedPath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    let v: 'approved' | 'rejected' | null = null;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t);
      if (e.id === id) v = e.decision;
    }
    return v;
  } catch {
    return null;
  }
}
function markResolved(
  env: NodeJS.ProcessEnv,
  id: string,
  decision: 'approved' | 'rejected',
): void {
  const p = proposalResolvedPath(env);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(
      p,
      JSON.stringify({ ts: new Date().toISOString(), id, decision }) + '\n',
      'utf-8',
    );
  } catch {
    /* best-effort */
  }
}

/** 머터리얼라이즈 결과 1건 조회 (승인 후 사람에게 "뭐가 생겼나" 회신용). */
function materializedDesc(env: NodeJS.ProcessEnv, id: string): string | null {
  const p = materializedPath(env);
  if (!p || !fs.existsSync(p)) return null;
  try {
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/).reverse()) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t);
      if (e.id === id) return String(e.taskPath || '').split(/[\\/]/).pop() || null;
    }
  } catch {
    /* */
  }
  return null;
}

/**
 * ✅/❌ 리액션 → 승인/거절 상태머신 + *즉시·결과 피드백* (V-2).
 * 발굴 카드가 아니면 false (일반 리액션 핸들러 계속). 발굴 카드면
 * 항상 true(소비) + 스레드에 접수→완료 회신 + 카드 잠금/결과 반영.
 * 규칙: 먼저 누른 결정 확정, 확정 후 추가/취소 무시(스레드 안내).
 * best-effort — 외부 op 실패해도 throw X (게이트웨이 안정).
 */
export async function handleProposalReaction(
  client: Client,
  env: NodeJS.ProcessEnv,
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  isOwner: boolean,
): Promise<boolean> {
  const emoji = reaction.emoji.name ?? '';
  if (emoji !== '✅' && emoji !== '❌') return false;
  const msg = reaction.message;
  const entry = lookupProposalByMessage(env, msg.id);
  if (!entry) return false; // 발굴 카드 아님 → 일반 핸들러로

  const post = async (text: string): Promise<void> => {
    try {
      const ch = entry.threadId
        ? await client.channels.fetch(entry.threadId).catch(() => null)
        : null;
      const target =
        ch && ch.isTextBased() && 'send' in ch ? ch : (msg.channel as any);
      await target?.send?.(text);
    } catch {
      /* 피드백 실패해도 처리 자체는 진행 */
    }
  };

  if (!isOwner) {
    await post('ℹ️ 결정은 오너만 가능합니다 — 이 반응은 무시됩니다.');
    return true;
  }

  // ✅ 폐지 (2026-05-20) — 팀 채택이 자동 진행 substrate. 동료 권한 = veto(❌) 만.
  if (emoji === '✅') {
    await post(
      'ℹ️ 팀 채택 = 자동 진행 — 별도 ✅ 불필요. 동료 권한은 **❌ veto** 만.',
    );
    return true;
  }

  const who = user.username || '오너';
  const prior = getResolved(env, entry.id);
  if (prior) {
    await post(
      `ℹ️ 이미 **${prior === 'approved' ? '승인' : '거절'}**됨 — ` +
        `추가/취소 반응은 무시됩니다 (변경하려면 새 제안에서).`,
    );
    return true;
  }

  await post(`⏳ **${who}** 님 **veto(❌)** 접수 — 처리 중…`);
  try {
    appendApproval(env, {
      ts: new Date().toISOString(),
      objId: entry.id,
      core: 'user',
      status: 'rejected',
      reason: `discord veto reaction by ${user.id}`,
    });
    markResolved(env, entry.id, 'rejected');

    // KAR-018-Z-2: 코어가 자기 제안 결과를 *기억·학습* (veto = 반복 X).
    if (entry.coreId) {
      appendCoreMemory(env.MEMO_REPO_PATH?.trim() || '', entry.coreId, {
        session: 'proposal-resolution',
        type: 'fail',
        topic: `${entry.kind} ${entry.id}`,
        summary: `제안 "${entry.title}" → 동료 veto(❌) (반복 X)`,
      });
    }

    const result = 'veto — 팀 채택을 동료이 거절, 아무것도 만들지 않음';
    await post(`❌ **veto 처리됨** — 아무것도 만들지 않았습니다.`);
    await lockCard(msg, 'rejected', result).catch(() => {});
  } catch (e) {
    await post(
      `⚠️ 처리 중 오류 — ${e instanceof Error ? e.message : String(e)} (다시 시도하거나 알려주세요)`,
    );
  }
  return true;
}

// ── 카드 상태 뷰 (동료 ❌ veto + 팀 verdict 공용 — 평행정의 0) ──────
// 2026-05-20: 사람 ✅ 권한 폐지(팀 채택 = 자동 진행 substrate). 동료 권한 =
// ❌ veto 만. 'approved' CardState 도 함께 자기소멸 (사람 ✅ 잔존 dead).
export type CardState =
  | 'rejected' // 동료 ❌ veto
  | 'team-adopt' // 팀 채택 — 진행(시드 생성). 동료 veto 여지 유지(미잠금)
  | 'team-adopt-mods' // 팀 수정 채택 — 새 카드로 분리(원본 supersede)
  | 'team-reject' // 팀 반려 — 닫힘. 동료 override 없음(팀 결정 존중)
  | 'team-escalate'; // 팀 미수렴 — 동료 ❌ veto 또는 그냥 묵힘

interface CardView {
  status: string;
  color: number;
  footer: string;
  /** 사람 추가 반응 무시(잠금) — supersede/동료veto 만 잠금. */
  locked: boolean;
}

const CARD_VIEW: Record<CardState, CardView> = {
  rejected: {
    status: '🔴 동료 veto (잠김)',
    color: 0x95a5a6,
    footer: '🔒 동료 ❌ veto — 추가 반응은 무시됩니다',
    locked: true,
  },
  'team-adopt': {
    status: '🟢 팀 채택 — 진행(시드 생성)',
    color: 0x2ecc71,
    footer: '🧑‍🤝‍🧑 팀이 결정·진행했습니다 · 뒤집으려면 ❌ (동료 veto 유효)',
    locked: false,
  },
  'team-adopt-mods': {
    status: '🟠 팀 수정 채택 — 새 카드로 분리',
    color: 0xff9800,
    footer: '🧑‍🤝‍🧑 팀이 수정안을 새 카드로 올렸습니다 — 이 카드는 대체됨',
    locked: true,
  },
  'team-reject': {
    status: '🔴 팀 반려 — 닫힘',
    color: 0x95a5a6,
    footer: '🧑‍🤝‍🧑 팀이 반려했습니다 — 닫힘',
    locked: false,
  },
  'team-escalate': {
    status: '🟡 팀 미수렴 — 보류 또는 ❌ veto',
    color: 0x3f8cff,
    footer: '🧑‍🤝‍🧑 팀이 수렴 못 함 — 동료 ❌ veto 또는 묵힘',
    locked: false,
  },
};

/**
 * 카드 embed 를 상태 뷰로 갱신 (순수 — Discord 송신 X, 단위 테스트 가능).
 * 사람 결정·팀 verdict 공용. resultLine = "🔒 결과"/"🧑‍🤝‍🧑 팀 토론" 한 줄.
 * @returns 갱신된 EmbedBuilder (호출자가 msg.edit).
 */
export function applyCardEmbedState(
  src: Parameters<typeof EmbedBuilder.from>[0],
  state: CardState,
  resultLine: string,
  resultFieldName = '🔒 결과',
): EmbedBuilder {
  const view = CARD_VIEW[state];
  const eb = EmbedBuilder.from(src);
  eb.setColor(view.color);
  const srcFields =
    (src as { fields?: { name: string; value: string; inline?: boolean }[] })
      .fields ?? [];
  const fields = srcFields
    .filter((f) => f.name !== resultFieldName) // 재반영 시 중복 X (멱등)
    .map((f) =>
      f.name === '📌 상태'
        ? { name: '📌 상태', value: view.status, inline: true }
        : { name: f.name, value: f.value, inline: f.inline },
    );
  fields.push({
    name: resultFieldName,
    value: resultLine.slice(0, 1000),
    inline: false,
  });
  eb.setFields(fields);
  eb.setFooter({ text: view.footer });
  return eb;
}

/** 카드 embed 를 동료 ❌ veto 결과로 갱신 + 잠금 (2026-05-20 자기소멸 후 veto 전용). */
async function lockCard(
  msg: MessageReaction['message'],
  decision: 'rejected',
  result: string,
): Promise<void> {
  const src = msg.embeds?.[0];
  if (!src) return;
  const eb = applyCardEmbedState(src, decision, result);
  await (msg as any).edit?.({ embeds: [eb] });
}

// ── 팀 verdict → 원본 카드 반영 (KAR-018-LT 근본) ──────────────
// 숙의는 client-less 순수(runCoreDialogueOnce). 카드 edit 은 client
// 필요(handleProposalReaction 동형). 둘 잇는 *내구 원장 + client
// reconciler* = 그동안 빠졌던 substrate↔Discord 합성 rung. 평행기록
// (Y-2 거절원장/LT-5 progress/Z-2 코어기억) 추가가 아니라, *사용자가
// 보는 카드* 로 되돌아 쓰는 단일 다리. 원장 자체는 substrate
// (proposal-adapter, Discord-free) — 여기는 그 소비(embed 반영)만.

const VERDICT_STATE: Record<TeamVerdict, CardState> = {
  adopt: 'team-adopt',
  'adopt-mods': 'team-adopt-mods',
  reject: 'team-reject',
  escalate: 'team-escalate',
};

/** CardState → forum 의 status 태그 매핑 (#team-work 태그 토글 정합). */
const STATE_TO_FORUM_STATUS: Record<CardState, ForumStatus> = {
  rejected: 'rejected', // 동료 ❌ veto
  'team-adopt': 'in-progress', // 팀 채택 → 진행 (동료 veto 여지)
  'team-adopt-mods': 'approved', // 수정 채택 = 원본 supersede
  'team-reject': 'rejected',
  'team-escalate': 'pending', // 팀 미수렴 — 동료 ❌ veto 또는 묵힘
};

/**
 * 팀 verdict 내구 원장 → 원본 forum-post 반영 (client 쥔 쪽 = main.ts 타이머).
 * 멱등·restart-safe(reflected 마커). adopt = 팀이 *행동* —
 * appendApproval(core:team)+inbox consumer 로 inert seed/draft 생성
 * (자동 실행 X = 진짜 게이트 seed→ready 불변). reject/escalate =
 * 카드 상태만(미잠금 — 동료 veto/override 유효). best-effort:
 * 채널/포스트 실패해도 throw X, 단 *반영 성공분만* 마커(재시도 가능).
 *
 * LT-FORUM 마이그: forum-post 의 evolveForumPost 단일 seam 경유 —
 * embed edit(starter 카드) + status 태그 토글 + 스레드 결과 한 줄 누적.
 * Legacy 텍스트 카드 entries(threadId 없는 옛 데이터) = 닫고 다음(degraded,
 * verdict 자체는 원장 보존). 평행 정의 0.
 * @returns 이번에 카드 반영한 건수.
 */
export async function reconcileProposalCards(
  client: Client,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const pending = readPendingTeamVerdicts(env);
  let n = 0;
  for (const v of pending) {
    const entry = lookupProposalById(env, v.id);
    if (!entry || !entry.channelId || !entry.threadId) {
      // 카드 매핑/채널/스레드 없음(게시 실패·forum 마이그 전 legacy) —
      // 더 기다려도 안 생김. 마커 찍어 무한 재시도 0.
      markCardReflected(env, v.id);
      continue;
    }
    try {
      const state = VERDICT_STATE[v.verdict];
      let resultLine: string;
      // TASK-YB-039: adopt 분기에서 materialize 결과의 TASK id 추출 →
      // 같은 forum-post thread 제목 rename + kind 태그 proposal→task 토글 +
      // bridge ledger 박음.
      let renameTo: string | undefined;
      let kindToggle: 'task' | undefined;
      if (v.verdict === 'adopt') {
        // 팀이 *행동*: inert seed/draft 머터리얼라이즈 트리거 (자동
        // 실행 X — 진짜 게이트 seed→ready 불변, 2026-05-19 결정).
        appendApproval(env, {
          ts: new Date().toISOString(),
          objId: v.id,
          core: 'team',
          status: 'approved',
          reason: `team deliberation adopt — ${v.reason}`.slice(0, 300),
        });
        await runInboxConsumerOnce(env, { notify: () => {} }).catch(() => 0);
        const desc = materializedDesc(env, v.id);
        resultLine = desc
          ? `🧑‍🤝‍🧑 팀 채택 → **${desc}** 생성 (동료이 ready 승격 시 진행) · ${v.reason}`
          : `🧑‍🤝‍🧑 팀 채택 — 검토 단계로 (엔진 트랙·즉시 산출물 없음) · ${v.reason}`;
        const taskId = parseTaskId(desc);
        if (taskId) {
          appendTaskForumLink(env, {
            taskId,
            postId: entry.threadId,
            channelId: entry.channelId,
            proposalId: v.id,
          });
          renameTo = forumTitleForTask(taskId, entry.title);
          kindToggle = 'task';
        }
      } else if (v.verdict === 'adopt-mods') {
        resultLine = `🧑‍🤝‍🧑 팀 수정 채택 — 합의 수정안을 새 카드로 분리 게시 · ${v.reason}`;
      } else if (v.verdict === 'reject') {
        resultLine = `🧑‍🤝‍🧑 팀 반려 — 아무것도 만들지 않음 · ${v.reason}`;
      } else {
        resultLine = `🧑‍🤝‍🧑 팀이 수렴 못 함 — 동료 ✅/❌ 결정 필요 · ${v.reason}`;
      }
      // forum starter 의 source embed → applyCardEmbedState 로 진화된 embed
      // 만들기. 채널 fetch 실패 = 일시(continue, 다음 tick 재시도).
      const channel = (await client.channels
        .fetch(entry.channelId)
        .catch(() => null)) as unknown as
        | (Awaited<ReturnType<ClientLike['channels']['fetch']>> & {
            threads?: {
              fetch: (id: string) => Promise<unknown>;
            };
          })
        | null;
      if (!channel) continue;
      const thread = (await channel?.threads
        ?.fetch(entry.threadId)
        .catch(() => null)) as
        | (Awaited<ReturnType<NonNullable<typeof channel.threads>['fetch']>> & {
            fetchStarterMessage?: () => Promise<{
              embeds?: { data?: unknown }[];
            } | null>;
          })
        | null;
      let editedEmbed: EmbedBuilder | undefined;
      if (thread && typeof thread.fetchStarterMessage === 'function') {
        const starter = await thread.fetchStarterMessage().catch(() => null);
        const src = (starter?.embeds as { data?: unknown }[] | undefined)?.[0];
        if (src) {
          editedEmbed = applyCardEmbedState(
            (src.data ?? src) as Parameters<typeof EmbedBuilder.from>[0],
            state,
            resultLine,
            '🧑‍🤝‍🧑 팀 토론 결과',
          );
        }
      }
      await evolveForumPost(
        client as unknown as ClientLike,
        { postId: entry.threadId, channelId: entry.channelId },
        {
          embedEdit: editedEmbed,
          statusTag: STATE_TO_FORUM_STATUS[state],
          kindTag: kindToggle,
          threadMessage: resultLine,
          setName: renameTo,
        },
      );
      markCardReflected(env, v.id);
      n += 1;
    } catch {
      /* 이 건 실패 = 마커 미기록(다음 tick 재시도). 다른 건 계속 */
    }
  }
  return n;
}

/** ProposalAnnouncement → forum domain 태그. payload.domain 우선,
 *  coreId prefix 폴백, 기본 KAR. */
function resolveDomain(ann: ProposalAnnouncement): ForumDomain {
  const p = ann.envelope.payload as unknown as Record<string, unknown>;
  const raw = (typeof p?.domain === 'string' ? p.domain : '')
    .trim()
    .toLowerCase();
  if (raw === 'wm') return 'WM';
  if (raw === 'kl' || raw === 'karmolab') return 'KL';
  if (raw === 'yb' || raw === 'yawnbot') return 'YB';
  if (raw === 'kar' || raw === 'karmoddrine') return 'KAR';
  const cid = (ann.agent?.coreId || '').toLowerCase();
  if (cid.startsWith('wm')) return 'WM';
  if (cid.startsWith('kl')) return 'KL';
  if (cid.startsWith('yb') || cid === 'echo') return 'YB';
  return 'KAR';
}

/**
 * 카드 앞 동료 한 줄 — **결정적**(LLM 호출 X), KAR-018-Y 근본.
 *
 * 왜 결정적: 비-agentic claude-cli 단발은 *페르소나 나레이션* 에 구조적
 * 비신뢰 — prod 에서 "저는 Claude…동료가 아니라" 디스클레이머/카드 표
 * 복붙을 *틱마다 다른 phrasing* 으로 반복(프롬프트 강화·regex 새니타이즈
 * 둘 다 whack-a-mole 로 불충분 실증). preamble 한 줄에 flaky LLM 쓸 이유
 * 0 — 카드가 이미 코어 정체·내용·승인 UI 완비, "에이전트끼리 대화" 는
 * Y-1(별 경로). LLM 제거 = 거부·덤프가 *구조적으로 불가능*(regex 의존
 * X). discovery(제안 본문) 의 Claude 는 그대로 — 지적 작업 유지, cosmetic
 * preamble 만 결정적. 코어 정체(displayName/role)로 개인화, title 해시로
 * 약한 변형(로봇처럼 동일문장 반복 X). 순수·동기.
 */
function atlasVoicedIntro(
  env: NodeJS.ProcessEnv,
  coreId: string,
  title: string,
  _gist: string,
): string {
  const root = env.MEMO_REPO_PATH?.trim() || '';
  let core: ReturnType<typeof loadCoreDef> = null;
  try {
    core = root ? loadCoreDef(root, coreId) : null;
  } catch {
    core = null;
  }
  const name = core ? core.displayName || core.id : coreId || 'Atlas';
  const t = String(title || '발견 1건').replace(/\s+/g, ' ').trim().slice(0, 70);
  // title 해시로 결정적 변형 (동일 제목=동일 문장, 다양성↑ 로봇감↓)
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  const variants = [
    `${name} 예요. 점검하다 「${t}」 가 눈에 띄어 카드로 정리했어요 — 같이 봐주세요.`,
    `팀, ${name} 인데 「${t}」 가 걸려서 제안 카드 올립니다. 검토 부탁드려요.`,
    `「${t}」 — 시스템 보다 이 부분이 비어 보여 정리했어요. 아래 카드 확인 부탁해요. (${name})`,
  ];
  return variants[h % variants.length];
}

/**
 * 발굴 1건을 #team-work forum 채널에 *1포스트=1흐름객체* 로 게시
 * (TASK-KAR-018-LT-FORUM 마이그). starter embed = 명명 에이전트 카드,
 * appliedTags = [kind, pending, domain]. 스레드 첫 메시지 = atlas voiced
 * intro, 두 번째 메시지 = 전문 + 승인/거절/질문 안내. starter 에 ✅/❌
 * react (사람 결정 인터페이스, handleProposalReaction 호환).
 *
 * best-effort: forum 미프로비저닝(handle=null) → 콘솔 경고 후 skip.
 * #team-bus 텍스트 폴백 X — 평행 정의 회피 (자기소멸 마이그 정합).
 */
export async function announceProposal(
  client: Client,
  env: NodeJS.ProcessEnv,
  ann: ProposalAnnouncement,
): Promise<void> {
  const agentName = ann.agent?.name || '🛰 Atlas';
  const { title, cardBody, detailBody } = render(ann.envelope);
  const safeTitle = (title || '(제목 없음)').slice(0, 230);
  const kindLabel = KIND_LABEL[ann.kind] ?? ann.kind;
  const onApprove = KIND_ONAPPROVE[ann.kind] ?? '검토 단계로 넘어갑니다';
  const intro = await atlasVoicedIntro(
    env,
    ann.agent?.coreId || 'atlas',
    safeTitle,
    cardBody,
  );

  const source = extractDiscoverySource(ann.envelope);

  const embed = new EmbedBuilder()
    .setColor(COLOR_BY_KIND[ann.kind] ?? 0x4caf50)
    .setAuthor({
      name: `🛰 ${agentName} 의 제안`,
      iconURL: ann.agent?.avatarUrl,
    })
    .setTitle(`💡 ${safeTitle}`)
    .addFields(
      {
        name: '📋 무엇 / 왜',
        value: (cardBody || '(내용 없음)').slice(0, 1000),
      },
      { name: '🏷️ 분류', value: kindLabel, inline: true },
      { name: '🆔', value: `\`${ann.id}\``, inline: true },
      { name: '📌 상태', value: '🟡 팀 결정 대기', inline: true },
      // LT-FORUM P4: discovery raw → 카드 embed 의 dedicated source field.
      // env/skill/agent 만 source 박힘 (task/objective = LLM payload 미정의).
      // 1024 limit (discord field) 만족 위해 절단 — 긴 path 다중 사용자 X.
      ...(source
        ? [{ name: '🔗 출처', value: source.slice(0, 1000) }]
        : []),
      { name: '🧑‍🤝‍🧑 팀 채택 시', value: onApprove },
    )
    .setFooter({
      text: '🧑‍🤝‍🧑 팀 채택 = 자동 진행  ·  ❌ veto = 동료 거절  ·  ▸ 스레드에서 자세히/질문',
    })
    .setTimestamp();

  const handle = await createForumPost(
    client as unknown as ClientLike,
    env,
    {
      kind: 'proposal',
      domain: resolveDomain(ann),
      title: `제안 ${ann.id}: ${safeTitle}`,
      embed,
      intro: intro || undefined,
    },
  );
  if (!handle) {
    console.warn(
      '[agent-bus] #team-work forum 미프로비저닝 — 제안 카드 게시 skip:',
      ann.id,
    );
    return;
  }

  // 진입 후속 — 스레드 상세 메시지 + starter ❌ react (동료 veto).
  // ✅ 자동 박기 폐지 — 팀 채택이 자동 진행 (사용자 의향, 2026-05-20).
  // Discord 사양: forum-post 의 starter message id == thread id.
  try {
    const channel = (await client.channels
      .fetch(handle.channelId)
      .catch(() => null)) as unknown as
      | {
          threads?: {
            fetch: (id: string) => Promise<unknown>;
          };
        }
      | null;
    const thread = (await channel?.threads
      ?.fetch(handle.postId)
      .catch(() => null)) as
      | (TextChannel & {
          fetchStarterMessage?: () => Promise<{
            react: (e: string) => Promise<unknown>;
          } | null>;
        })
      | null;
    if (thread && 'send' in thread) {
      await thread
        .send({
          content:
            `**${agentName}** 의 제안 — 자세히\n\n` +
            `**${safeTitle}**\n\n${detailBody.slice(0, 3500)}\n\n` +
            `────────\n` +
            `**어떻게 하나요?**\n` +
            `· **팀 채택 = 자동 진행** (별도 ✅ 불필요)\n` +
            `· 위 카드에 **❌** = 동료 veto → 아무것도 만들지 않습니다\n` +
            `· 이 스레드에 **답글** = 질문/수정요청 (검토에 반영)\n` +
            `· 처리 결과는 **여기 스레드에 답글**로 달립니다 (팀 결정→완료)`,
        })
        .catch(() => {});
    }
    if (thread && typeof thread.fetchStarterMessage === 'function') {
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter) {
        // ❌ veto 만 자동 박음 — ✅ 폐지(팀 채택 = 자동 진행, 2026-05-20).
        await starter.react('❌').catch(() => {});
      }
    }
  } catch (e) {
    console.error(
      '[agent-bus] forum-post 후속 처리 실패:',
      e instanceof Error ? e.message : e,
    );
  }

  // 매핑 영속 — forum 사양상 starter msg id == thread id, 둘 다 postId.
  // ProposalMsgEntry 그대로 — verdict reconciler / handleProposalReaction 호환.
  appendProposalMsg(env, {
    messageId: handle.postId,
    threadId: handle.postId,
    channelId: handle.channelId,
    id: ann.id,
    kind: ann.kind,
    target: ann.target,
    title: safeTitle,
    ts: new Date().toISOString(),
    coreId: ann.agent?.coreId,
  });
}
