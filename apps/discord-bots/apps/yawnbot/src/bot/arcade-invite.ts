/**
 * `/오락실` 이 뿌린 글이 방을 따라 산다 (사용자 2026-09-01)
 *
 * 여태 그 글은 링크 한 줄이었다. 방이 닫혀도, 판이 끝나도 그대로 남아 있어서
 * 나중에 온 사람은 죽은 링크를 누름. 초대가 살아 있는 것처럼 보이는데 아니었음
 *
 * 하는 일 둘
 *  ① `/오락실` 이 보낸 글을 방 코드로 기억
 *  ② 방 소식이 올 때마다 그 글을 고침. 기다리는 중 -> 두는 중 -> 끝
 *
 * 고치기는 **실패해도 조용하다.** 글이 지워졌거나 권한이 없을 수 있고,
 * 그건 판과 아무 상관 없음
 */
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Client } from 'discord.js';

/** 이만큼 지나면 잊는다. 방 TTL 과 같은 자리 */
const FORGET_MS = 30 * 60 * 1000;

export type Stage = 'waiting' | 'playing' | 'done';

interface Card {
  channelId: string;
  messageId: string;
  game: string;
  gameName: string;
  link: string;
  at: number;
  stage: Stage;
}

const cards = new Map<string, Card>();

/** 검사용 뒷문 */
export function resetInvites(): void {
  cards.clear();
}

export function rememberCard(code: string, card: Omit<Card, 'at' | 'stage'>): void {
  const now = Date.now();
  for (const [k, c] of cards) if (now - c.at > FORGET_MS) cards.delete(k);
  cards.set(code, { ...card, at: now, stage: 'waiting' });
}

export function cardOf(code: string): Card | undefined {
  return cards.get(code);
}

/** 상태 줄. 사람이 읽는 유일한 자리라 여기 한 벌만 둔다 */
export function lineOf(stage: Stage, extra?: string): string {
  if (stage === 'playing') return '두는 중' + (extra ? `, ${extra}` : '');
  if (stage === 'done') return '끝난 판' + (extra ? `, ${extra}` : '');
  return '자리 기다리는 중';
}

/**
 * 버튼. 판이 돌고 있으면 들어가기가 아니라 **구경하기**
 * - 자리가 차면 들어가도 구경이라 (arcade.ts 의 자리 없으면 -1), 글자가 그걸 미리 말해 줌
 * - 끝난 판은 누를 것이 없으므로 버튼을 뗌
 */
export function inviteRow(link: string, stage: Stage): ActionRowBuilder<ButtonBuilder>[] {
  if (stage === 'done') return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(stage === 'playing' ? '구경하기' : '들어가기')
        .setStyle(ButtonStyle.Link)
        .setURL(link)
    )
  ];
}

export function inviteEmbed(gameName: string, code: string, stage: Stage, extra?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`🎮 ${gameName}`)
    .setDescription(`방 \`${code}\`\n${lineOf(stage, extra)}`)
    .setColor(stage === 'done' ? 0x8b897b : stage === 'playing' ? 0xff9800 : 0x4caf50);
}

/**
 * 그 글을 고친다. 모르는 방이면 아무 일도 안 함
 * - 되돌아가지 않음. 끝난 판이 기다리는 중으로 돌면 사람이 헛걸음
 */
export async function moveCard(client: Client, code: string, stage: Stage, extra?: string): Promise<boolean> {
  const c = cards.get(code);
  if (!c) return false;
  const order: Stage[] = ['waiting', 'playing', 'done'];
  if (order.indexOf(stage) < order.indexOf(c.stage)) return false;
  c.stage = stage;
  c.at = Date.now();
  try {
    const channel = await client.channels.fetch(c.channelId);
    if (!channel?.isTextBased()) return false;
    const msg = await channel.messages.fetch(c.messageId);
    await msg.edit({
      embeds: [inviteEmbed(c.gameName, code, stage, extra)],
      components: inviteRow(c.link, stage)
    });
    return true;
  } catch {
    /* 글이 지워졌거나 권한이 없음. 판과 상관없다 */
    return false;
  }
}
