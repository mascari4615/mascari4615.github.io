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
import type { Client, TextChannel } from 'discord.js';
import type { ProposalEnvelope } from './proposal';

export interface ProposalAnnouncement {
  /** 결정적 발굴 id (proposalId) — 승인 매칭 키. */
  id: string;
  /** 라우팅 타겟 (task-new / objectives / self-improve …). */
  target: string;
  kind: ProposalEnvelope['kind'];
  envelope: ProposalEnvelope;
  /** 발굴 에이전트 정체성 (없으면 기본 Atlas). */
  agent?: { name: string; avatarUrl?: string };
}

const COLOR_BY_KIND: Record<string, number> = {
  task: 0x4caf50,
  objective: 0x3f8cff,
  env: 0xff9800,
  skill: 0x9c27b0,
  agent: 0xcb2431,
};

/** 발굴 kind 별 사람이 읽을 제목·본문 추출 (payload shape 흡수). */
function render(env: ProposalEnvelope): { title: string; body: string } {
  const p = env.payload as unknown as Record<string, unknown>;
  const s = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (env.kind) {
    case 'task':
      return { title: s(p.title), body: s(p.body) };
    case 'objective':
      return {
        title: s(p.summary),
        body: `**도출 근거:** ${s(p.derivation)}\n**미션 정렬:** ${s(p.alignment)}`,
      };
    case 'env':
      return {
        title: s(p.summary) || s(p.id),
        body: `**id:** ${s(p.id)}\n**대상:** ${(Array.isArray(p.targetFiles) ? p.targetFiles : []).join(', ')}\n**출처:** ${s(p.source)}`,
      };
    case 'skill':
      return {
        title: `${s(p.name)} (${s(p.id)})`,
        body: `**요약:** ${s(p.summary)}\n**코어:** ${s(p.coreId)}\n**출처:** ${s(p.source)}`,
      };
    case 'agent':
      return {
        title: `새 에이전트: ${s(p.name)} (${s(p.role)})`,
        body: `**id:** ${s(p.id)}\n**코어:** ${s(p.coreId)}\n**출처:** ${s(p.source)}`,
      };
  }
}

// ── 메시지↔발굴id 매핑 영속 (V-2 리액션 승인이 소비) ──────────
export interface ProposalMsgEntry {
  messageId: string;
  threadId: string;
  id: string;
  kind: string;
  target: string;
  title: string;
  ts: string;
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

/**
 * 발굴 1건을 #team-bus 에 *명명 에이전트 카드 + 스레드*로 게시.
 * embed.author = 에이전트(이름/아바타) → 익명 X, 누가 가 보임.
 * 스레드 안 = 전문 + 승인/거절/질문 안내. 매핑 영속(V-2 소비).
 * best-effort: 채널·권한 실패해도 throw X (발굴 파이프 비차단).
 */
export async function announceProposal(
  client: Client,
  env: NodeJS.ProcessEnv,
  channelIds: string[],
  ann: ProposalAnnouncement,
): Promise<void> {
  const agentName = ann.agent?.name || '🛰 Atlas';
  const { title, body } = render(ann.envelope);
  const safeTitle = (title || '(제목 없음)').slice(0, 230);

  for (const channelId of channelIds) {
    const channel = await client.channels
      .fetch(channelId)
      .catch(() => null);
    if (!channel || !channel.isTextBased() || !('send' in channel)) continue;

    const embed = new EmbedBuilder()
      .setColor(COLOR_BY_KIND[ann.kind] ?? 0x4caf50)
      .setAuthor({
        name: `${agentName} · 발굴 제안`,
        iconURL: ann.agent?.avatarUrl,
      })
      .setTitle(safeTitle)
      .setDescription(body.slice(0, 1400) || '(내용 없음)')
      .addFields(
        { name: '종류', value: `\`${ann.kind}\` → ${ann.target}`, inline: true },
        { name: '제안 ID', value: `\`${ann.id}\``, inline: true },
      )
      .setFooter({
        text: '✅ 승인 · ❌ 거절 — 이 메시지에 반응하세요. 자세히/질문은 ▸ 스레드',
      })
      .setTimestamp();

    try {
      const msg = await (channel as TextChannel).send({ embeds: [embed] });
      // 승인/거절 affordance 선반영 (사용자 클릭만)
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
          `**${agentName}** 의 발굴 — 전문\n\n` +
            `**${safeTitle}**\n\n${body.slice(0, 3500)}\n\n` +
            `── 행동 ──\n` +
            `· 위 카드에 ✅ = 승인 → 자동으로 ${
              ann.kind === 'task'
                ? 'seed TASK 생성'
                : ann.kind === 'objective'
                  ? 'objectives 후보 행 추가'
                  : '거버넌스 평가'
            }\n` +
            `· ❌ = 거절 (아무 일도 안 일어남)\n` +
            `· 이 스레드에 답글 = 질문/수정요청 (검토에 반영)`,
        );
      } catch {
        /* 스레드 실패해도 카드는 떴음 (degraded) */
      }

      appendProposalMsg(env, {
        messageId: msg.id,
        threadId,
        id: ann.id,
        kind: ann.kind,
        target: ann.target,
        title: safeTitle,
        ts: new Date().toISOString(),
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
