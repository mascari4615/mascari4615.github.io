/**
 * agent-bus — ⑦' 발굴을 *사람이 팔로업 가능한* 디스코드 가시층 (KAR-018-V).
 *
 * 문제(사용자 2026-05-17): 익명 "🛰 에이전트 팀" 한 줄 로그 → 누가/뭘
 * 제안했는지·왜·뭘 하면 되는지 알 수 없음. "각 에이전트가 구분되는 게
 * 아니잖아요 … 제가 원하던 게 아니에요".
 *
 * V-1: 발굴 = **명명 에이전트(atlas …)가 자기 이름·아바타로** 읽을 수
 * 있는 카드 게시 → 그 메시지를 **스레드**로 (당신 아이디어 채택) →
 * 스레드 안에 *전문* + 승인/거절/질문 안내. 메시지↔발굴id 매핑 영속
 * (V-2 리액션 승인이 소비). 평행정의0 — 코어 정체성은 기존 sub-A0/A
 * 소비(재정의 X), 인박스·승인 seam 재사용.
 *
 * 왜 embed(봇)이고 sendAsSkin(webhook) 아닌가: sendAsSkin 은 메시지 id
 * 미반환 → 스레드·리액션 매핑 불가. embed.author 로 *명명 정체성*은
 * 충족하면서 메시지 객체 확보(스레드·매핑) = V-1 실용 최선.
 */
import fs from 'fs';
import path from 'path';
import { EmbedBuilder } from 'discord.js';
import type {
  Client,
  TextChannel,
  Message,
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
import { sendAsSkin, WebhookPermissionError } from './agent-webhook';
import type { CharacterCard } from '../services/character-service';

/** ann.agent → sendAsSkin 용 최소 카드 (이름·아바타만 — 실 카드 불요). */
function identityCard(ann: ProposalAnnouncement, name: string): CharacterCard {
  return {
    slug: ann.agent?.coreId || 'atlas',
    name,
    displayName: name,
    frontmatter: ann.agent?.avatarUrl
      ? { avatar_url: ann.agent.avatarUrl }
      : {},
    body: '',
    dir: '',
  } as unknown as CharacterCard;
}

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

/** 승인 시 평이 결과 안내. KAR-018-THR (2026-05-20 사용자 발화: "지들이
 *  채택했는데 알아서 채택됨 그것도 적용안되는 것 같은데" — 코드확정: 승인
 *  ≠ 활성 ≠ 적용 *3 단계* 인데 UX 가 "✅승인 머터리얼라이즈" 한 줄로 묶어
 *  표현 → 사장이 *적용됐다*고 오인. 단계마다 명시. */
const KIND_ONAPPROVE: Record<string, string> = {
  task:
    '① TASK 파일이 `status:seed` 로 생성 (이건 *멈춰 있음*). ' +
    '② 사장이 `seed→ready` 승격해야 워커가 픽업·실행.',
  objective:
    '① `objectives.md` 에 `proposed` 행 추가 (이건 *멈춰 있음*). ' +
    '② 사장이 `proposed→active` 승격해야 cadence 가 픽업.',
  env: '검증 단계로 넘어감 (실제 적용은 ②/②\' 게이트 통과 + 사장 승인 후).',
  skill: '검증 단계로 넘어감 (적용은 행동평가 게이트 통과 + 사장 승인 후).',
  agent:
    '① `core.md` 가 `status:draft` 로 생성 (이건 *멈춰 있음*). ' +
    '② 사장이 `draft→active` 승격(또는 LT-11 자가증강 게이트 통과)해야 활성.',
};

/**
 * 발굴 → {제목, 카드용 평이 본문, 스레드용 상세}. 카드 = 사장이 읽을
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

/**
 * 머터리얼라이즈된 산출물 → "다음 단계는 ___" 명시 안내 (KAR-018-THR).
 * 그동안 "X 생성됨" 한 줄로 *적용됐다*고 오인 유발. 단계마다 명시 = 같은
 * 카피 라인이 시스템 전반(KIND_ONAPPROVE / team adopt result line) 공유.
 * 순수.
 */
export function stageDescription(kind: string, desc: string): string {
  if (kind === 'task') {
    return (
      `**${desc}** 파일 생성 (\`status:seed\` — *멈춰 있음*). ` +
      `→ 다음 단계: 사장이 \`seed→ready\` 승격해야 워커 픽업.`
    );
  }
  if (kind === 'objective') {
    return (
      `\`${desc}\` 행 추가 (\`status:proposed\` — *멈춰 있음*). ` +
      `→ 다음 단계: 사장이 \`proposed→active\` 승격해야 cadence 픽업.`
    );
  }
  if (kind === 'agent') {
    return (
      `**${desc}** 생성 (\`status:draft\` — *멈춰 있음*). ` +
      `→ 다음 단계: 사장이 \`draft→active\` 승격(또는 LT-11 자가증강)해야 활성.`
    );
  }
  return `**${desc}** 생성`;
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

  const decision: 'approved' | 'rejected' =
    emoji === '✅' ? 'approved' : 'rejected';
  const who = user.username || '오너';
  const prior = getResolved(env, entry.id);
  if (prior) {
    await post(
      `ℹ️ 이미 **${prior === 'approved' ? '승인' : '거절'}**됨 — ` +
        `추가/취소 반응은 무시됩니다 (변경하려면 새 제안에서).`,
    );
    return true;
  }

  await post(
    `⏳ **${who}** 님 **${decision === 'approved' ? '승인' : '거절'}** 접수 — 처리 중…`,
  );
  try {
    appendApproval(env, {
      ts: new Date().toISOString(),
      objId: entry.id,
      core: 'user',
      status: decision,
      reason: `discord reaction by ${user.id}`,
    });
    markResolved(env, entry.id, decision);

    // KAR-018-Z-2: 코어가 자기 제안 결과를 *기억·학습* (승인=수용된
    // 방향 / 거절=반복 X — Y-2 거절학습과 동근). best-effort·비차단.
    if (entry.coreId) {
      appendCoreMemory(env.MEMO_REPO_PATH?.trim() || '', entry.coreId, {
        session: 'proposal-resolution',
        type: decision === 'approved' ? 'decision' : 'fail',
        topic: `${entry.kind} ${entry.id}`,
        summary: `제안 "${entry.title}" → 사장 ${
          decision === 'approved' ? '승인(수용된 방향)' : '거절(반복 X)'
        }`,
      });
    }

    let result: string;
    if (decision === 'approved') {
      await runInboxConsumerOnce(env, { notify: () => {} }).catch(() => 0);
      const desc = materializedDesc(env, entry.id);
      // KAR-018-THR: "생성" ≠ "픽업/실행". 3단계 명시(승인→파일생성→
      // 활성승격) — 그동안 한 줄로 묶어 "적용됐다" 오인 유발.
      result = desc
        ? stageDescription(entry.kind, desc)
        : '거버넌스 검토 단계로 넘어감 (엔진 트랙 — 즉시 산출물 없음)';
      await post(`✅ **승인 접수 (1/2 단계)** — ${result}`);
    } else {
      result = '거절됨 — 아무것도 만들지 않았습니다';
      await post(`❌ **거절 처리됨** — 아무것도 만들지 않았습니다.`);
    }
    await lockCard(msg, decision, result).catch(() => {});
  } catch (e) {
    await post(
      `⚠️ 처리 중 오류 — ${e instanceof Error ? e.message : String(e)} (다시 시도하거나 알려주세요)`,
    );
  }
  return true;
}

// ── 카드 상태 뷰 (사람 결정 + 팀 verdict 공용 — 평행정의0) ──────
// 그동안의 미반영 근본: embed 변형 코드가 lockCard 하나뿐 + 사람
// 리액션 경로에서만 호출 → 팀 숙의 verdict 가 카드에 영영 안 찍힘
// (KAR-018-LT). 변형을 단일 뷰 테이블로 공용화 = 사람·팀 한 경로.
export type CardState =
  | 'approved' // 사람 ✅
  | 'rejected' // 사람 ❌
  | 'team-adopt' // 팀 채택 — 진행(시드 생성). 사람 veto 여지 유지(미잠금)
  | 'team-adopt-mods' // 팀 수정 채택 — 새 카드로 분리(원본 supersede)
  | 'team-reject' // 팀 반려 — 닫힘. 사람 ✅ 로 뒤집기 가능(미잠금)
  | 'team-escalate'; // 팀 미수렴 — 여기서만 사람 ✅/❌ 가 진짜 필요

interface CardView {
  status: string;
  color: number;
  footer: string;
  /** 사람 추가 반응을 무시(잠금)하는가. 팀 verdict 는 대부분 미잠금
   *  (사용자 = veto/override — 2026-05-19 결정). supersede 만 잠금. */
  locked: boolean;
}

const CARD_VIEW: Record<CardState, CardView> = {
  approved: {
    status: '🟢 승인됨 (잠김)',
    color: 0x2ecc71,
    footer: '🔒 처리 완료 — 추가/취소 반응은 무시됩니다',
    locked: true,
  },
  rejected: {
    status: '🔴 거절됨 (잠김)',
    color: 0x95a5a6,
    footer: '🔒 처리 완료 — 추가/취소 반응은 무시됩니다',
    locked: true,
  },
  'team-adopt': {
    status: '🟢 팀 채택 — 진행(시드 생성)',
    color: 0x2ecc71,
    footer: '🧑‍🤝‍🧑 팀이 결정·진행했습니다 · 뒤집으려면 ❌ (사장님 veto 유효)',
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
    footer: '🧑‍🤝‍🧑 팀이 반려했습니다 · 되살리려면 ✅ (사장님 override 유효)',
    locked: false,
  },
  'team-escalate': {
    status: '🟡 사용자 판단 필요 — ✅/❌ 로 결정',
    color: 0x3f8cff,
    footer: '🧑‍🤝‍🧑 팀이 수렴 못 함 — 사장님 결정이 필요합니다 (✅ 승인 / ❌ 거절)',
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

/** 카드 embed 를 사람 결정 결과로 갱신 + 잠금 (V-2 리액션 경로). */
async function lockCard(
  msg: MessageReaction['message'],
  decision: 'approved' | 'rejected',
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

/**
 * 팀 verdict 내구 원장 → 원본 카드 반영 (client 쥔 쪽 = main.ts 타이머).
 * 멱등·restart-safe(reflected 마커). adopt = 팀이 *행동* —
 * appendApproval(core:team)+inbox consumer 로 inert seed/draft 생성
 * (자동 실행 X = 진짜 게이트 seed→ready 불변). reject/escalate =
 * 카드 상태만(미잠금 — 사장님 veto/override 유효). best-effort:
 * 카드/채널 실패해도 throw X, 단 *반영 성공분만* 마커(재시도 가능).
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
    if (!entry || !entry.channelId) {
      // 카드 매핑/채널 없음(게시 실패·구버전 엔트리) — 더 기다려도
      // 안 생김. 마커 찍어 무한 재시도 0 (verdict 는 원장/trace 영속).
      markCardReflected(env, v.id);
      continue;
    }
    try {
      const channel = await client.channels
        .fetch(entry.channelId)
        .catch(() => null);
      if (!channel || !channel.isTextBased() || !('messages' in channel)) {
        // 채널 일시 fetch 실패 = 마커 미기록(다음 tick 재시도).
        continue;
      }
      const msg = await (channel as TextChannel).messages
        .fetch(entry.messageId)
        .catch(() => null);
      if (!msg) {
        // 메시지 삭제됨 — 재시도 무의미. 마커 찍고 verdict 는 원장에.
        markCardReflected(env, v.id);
        continue;
      }
      const state = VERDICT_STATE[v.verdict];
      let resultLine: string;
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
        // KAR-018-THR: 팀 채택 = inert 산출물 생성까지만(사장 승격 게이트
        // 잠겨 있음). "생성됨" 한 줄로 *적용됐다* 오인 차단. v.id 로
        // entry 회수해 kind 추정(없으면 generic). 같은 stageDescription
        // 공유 → 사람 ✅ 와 팀 adopt 가 같은 표현 (혼란 0).
        const entry = lookupProposalById(env, v.id);
        const kind = entry?.kind || 'task';
        resultLine = desc
          ? `🧑‍🤝‍🧑 팀 채택 → ${stageDescription(kind, desc)} · 사유: ${v.reason}`
          : `🧑‍🤝‍🧑 팀 채택 — 검토 단계로 (엔진 트랙·즉시 산출물 없음) · ${v.reason}`;
      } else if (v.verdict === 'adopt-mods') {
        resultLine = `🧑‍🤝‍🧑 팀 수정 채택 — 합의 수정안을 새 카드로 분리 게시 · ${v.reason}`;
      } else if (v.verdict === 'reject') {
        resultLine = `🧑‍🤝‍🧑 팀 반려 — 아무것도 만들지 않음 · ${v.reason}`;
      } else {
        resultLine = `🧑‍🤝‍🧑 팀이 수렴 못 함 — 사장님 ✅/❌ 결정 필요 · ${v.reason}`;
      }
      const src = msg.embeds?.[0];
      if (src) {
        const eb = applyCardEmbedState(
          src,
          state,
          resultLine,
          '🧑‍🤝‍🧑 팀 토론 결과',
        );
        await msg.edit({ embeds: [eb] }).catch(() => {});
      }
      // 스레드에도 결과 한 줄 (카드 못 봐도 사람 팔로업).
      if (entry.threadId) {
        const th = await client.channels
          .fetch(entry.threadId)
          .catch(() => null);
        if (th && th.isTextBased() && 'send' in th) {
          await (th as TextChannel)
            .send(resultLine.slice(0, 1900))
            .catch(() => {});
        }
      }
      markCardReflected(env, v.id);
      n += 1;
    } catch {
      /* 이 건 실패 = 마커 미기록(다음 tick 재시도). 다른 건 계속 */
    }
  }
  return n;
}

/**
 * 발굴 1건을 #team-bus 에 *명명 에이전트 카드 + 스레드*로 게시.
 * embed.author = 에이전트(이름/아바타) → 익명 X, 누가 가 보임.
 * 스레드 안 = 전문 + 승인/거절/질문 안내. 매핑 영속(V-2 소비).
 * best-effort: 채널·권한 실패해도 throw X (발굴 파이프 비차단).
 */
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

export async function announceProposal(
  client: Client,
  env: NodeJS.ProcessEnv,
  channelIds: string[],
  ann: ProposalAnnouncement,
): Promise<void> {
  const agentName = ann.agent?.name || '🛰 Atlas';
  const { title, cardBody, detailBody } = render(ann.envelope);
  const safeTitle = (title || '(제목 없음)').slice(0, 230);
  const kindLabel = KIND_LABEL[ann.kind] ?? ann.kind;
  const onApprove = KIND_ONAPPROVE[ann.kind] ?? '검토 단계로 넘어갑니다';
  // R-2: atlas 가 카드 전에 자기 목소리로 운다 (주도적 동료).
  const intro = await atlasVoicedIntro(
    env,
    ann.agent?.coreId || 'atlas',
    safeTitle,
    cardBody,
  );

  for (const channelId of channelIds) {
    const channel = await client.channels
      .fetch(channelId)
      .catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) continue;

    // 구조화 카드 — 사장이 스캔 가능. 상세·근거는 ▸ 스레드.
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
        { name: '📌 상태', value: '🟡 승인 대기', inline: true },
        { name: '✅ 승인하면', value: onApprove },
      )
      .setFooter({
        text: '✅ 승인  ·  ❌ 거절  ·  ▸ 스레드에서 자세히/질문  |  먼저 누른 결정이 확정·잠금',
      })
      .setTimestamp();

    try {
      // R-2: atlas 가 *먼저 자기 목소리로* 운다 → 그 다음 정식 카드.
      // 이름 = 봇앱("YawnDev") 아니라 *에이전트 정체*(webhook username
      // =displayName, sub-A sendAsSkin). 권한 없으면 봇 send 폴백.
      if (intro) {
        const body = intro.slice(0, 1800);
        try {
          await sendAsSkin(
            channel as TextChannel,
            identityCard(ann, agentName),
            { content: body },
          );
        } catch (e) {
          if (!(e instanceof WebhookPermissionError)) {
            console.error(
              '[agent-bus] intro 송신 오류:',
              e instanceof Error ? e.message : e,
            );
          }
          await (channel as TextChannel)
            .send({ content: body })
            .catch(() => {});
        }
      }
      // R-5 정체통일: 카드도 *에이전트 정체* webhook 게시(봇앱 YawnDev
      // X). hook.send 반환 id 로 fetch → react/startThread (스레드·리액션
      // 매핑 유지). WebhookPermissionError·실패 = 봇 embed fallback
      // (기존 동작·회귀0·graceful — 권한 없어도 카드는 뜸).
      let msg: Message | null = null;
      try {
        const sentId = await sendAsSkin(
          channel as TextChannel,
          identityCard(ann, agentName),
          { content: '', embeds: [embed] },
        );
        if (sentId) {
          msg = await (channel as TextChannel).messages
            .fetch(sentId)
            .catch(() => null);
        }
      } catch (e) {
        if (!(e instanceof WebhookPermissionError)) {
          console.error(
            '[agent-bus] 카드 정체 송신 오류:',
            e instanceof Error ? e.message : e,
          );
        }
      }
      if (!msg) {
        msg = await (channel as TextChannel).send({ embeds: [embed] });
      }
      await msg.react('✅').catch(() => {});
      await msg.react('❌').catch(() => {});

      let threadId = '';
      try {
        const thread = await msg.startThread({
          name: `제안 ${ann.id}: ${safeTitle}`.slice(0, 95),
          autoArchiveDuration: 1440,
        });
        threadId = thread.id;
        await thread.send(
          `**${agentName}** 의 제안 — 자세히\n\n` +
            `**${safeTitle}**\n\n${detailBody.slice(0, 3500)}\n\n` +
            `────────\n` +
            `**어떻게 하나요?**\n` +
            `· 위 카드에 **✅** = 승인 → ${onApprove}\n` +
            `· **❌** = 거절 → 아무것도 만들지 않습니다\n` +
            `· 이 스레드에 **답글** = 질문/수정요청 (검토에 반영)\n` +
            `· 누르면 **여기 스레드에 처리 결과가 답글로 달립니다** (접수→완료)\n` +
            `· 규칙: 먼저 누른 결정이 확정. 확정 후 추가/취소 반응은 무시.`,
        );
      } catch {
        /* 스레드 실패해도 카드는 떴음 (degraded) */
      }

      appendProposalMsg(env, {
        messageId: msg.id,
        threadId,
        channelId: msg.channelId, // KAR-018-LT: verdict reconciler 메시지 fetch
        id: ann.id,
        kind: ann.kind,
        target: ann.target,
        title: safeTitle,
        ts: new Date().toISOString(),
        coreId: ann.agent?.coreId, // Z-2: 결과를 이 코어 mem 에 학습
      });
    } catch (e) {
      console.error(
        '[agent-bus] 발굴 카드 게시 실패:',
        channelId,
        e instanceof Error ? e.message : e,
      );
    }
  }
}
