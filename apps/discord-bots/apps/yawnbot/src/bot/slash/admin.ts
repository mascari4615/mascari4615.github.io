import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './bot-context';
import { triggerAllNewsOnce } from '../../services/notifiers/news';
import { triggerHeartbeatNow } from '../../services/heartbeat';
import { triggerMemoSyncNow } from '../../services/memo-sync';
import { triggerCharStateSnapshotNow } from '../../services/character-state-snapshot';

export async function handleAdminReload(ctx: BotContext, interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
  const { gameData, isAdmin } = ctx;
  if (!isAdmin(userId)) {
    await interaction.reply({ content: gameData.getMessage('Admin_AccessDenied_Desc'), flags: MessageFlags.Ephemeral });
    return;
  }
  await gameData.initialize();
  const embed = new EmbedBuilder()
    .setTitle(gameData.getMessage('Admin_Reload_Title'))
    .setDescription(gameData.getMessage('Admin_Reload_Desc'))
    .setColor(0x4caf50);
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function handleAdminSave(ctx: BotContext, interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
  const { gameData, isAdmin } = ctx;
  if (!isAdmin(userId)) {
    await interaction.reply({ content: gameData.getMessage('Admin_AccessDenied_Desc'), flags: MessageFlags.Ephemeral });
    return;
  }
  gameData.saveGameData();
  const embed = new EmbedBuilder()
    .setTitle(gameData.getMessage('Admin_Save_Title'))
    .setDescription(gameData.getMessage('Admin_Save_Desc'))
    .setColor(0x4caf50);
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function handleAdminNewsTick(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const { gameData, isAdmin, client, getNews, characterService } = ctx;
  if (!isAdmin(userId)) {
    await interaction.reply({ content: gameData.getMessage('Admin_AccessDenied_Desc'), flags: MessageFlags.Ephemeral });
    return;
  }
  if (!getNews || !characterService) {
    await interaction.reply({ content: '⚠ MEMO_REPO_PATH 미설정 — 뉴스 서비스 비활성', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const r = await triggerAllNewsOnce(client, getNews, characterService.getDefaultSlug());
    if (r.noChannel) {
      await interaction.editReply({ content: '⚠ 뉴스 채널 미설정 (YAWNBOT_NEWS_CHANNEL_ID)' }).catch(() => {});
      return;
    }
    const total = r.google + r.gn + r.hn;
    const detail = [
      r.google > 0 && `google ${r.google}건`,
      r.gn > 0 && `gn ${r.gn}건`,
      r.hn > 0 && `hn ${r.hn}건`,
    ].filter(Boolean).join(' · ');
    await interaction.editReply({
      content: total > 0
        ? `📰 뉴스 ${total}건 게시 완료 — ${detail}`
        : '📭 새 기사 없음 (전부 dedup 또는 소스 응답 0건)',
    }).catch(() => {});
  } catch (e) {
    await interaction.editReply({ content: `⚠ 뉴스틱 오류: ${e instanceof Error ? e.message : String(e)}` }).catch(() => {});
  }
}

/** 공통 폴백 — 트리거 함수 1개 호출 + 결과 ephemeral 응답 (YB-038 패턴). */
async function handleManualTrigger(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  userId: string,
  label: string,
  trigger: () => Promise<{ status: 'ok' | 'inactive' }>,
  inactiveReason: string,
): Promise<void> {
  const { gameData, isAdmin } = ctx;
  if (!isAdmin(userId)) {
    await interaction.reply({ content: gameData.getMessage('Admin_AccessDenied_Desc'), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const r = await trigger();
    if (r.status === 'inactive') {
      await interaction.editReply({ content: `⚠ ${label} 비활성 — ${inactiveReason}` }).catch(() => {});
      return;
    }
    await interaction.editReply({ content: `✅ ${label} 1회 완료` }).catch(() => {});
  } catch (e) {
    await interaction.editReply({ content: `⚠ ${label} 오류: ${e instanceof Error ? e.message : String(e)}` }).catch(() => {});
  }
}

export async function handleAdminHeartbeatTick(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  await handleManualTrigger(ctx, interaction, userId, 'heartbeat', triggerHeartbeatNow, 'MEMO_GITHUB_PAT 미설정');
}

export async function handleAdminMemoSyncTick(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  await handleManualTrigger(ctx, interaction, userId, 'memo-sync', triggerMemoSyncNow, 'MEMO_GITHUB_PAT 또는 MEMO_REPO_PATH 미설정');
}

export async function handleAdminCharStateTick(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  await handleManualTrigger(ctx, interaction, userId, 'character-state 스냅샷', triggerCharStateSnapshotNow, 'MEMO_GITHUB_PAT 또는 MEMO_REPO_PATH 미설정');
}
