import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './bot-context';
import { runCadenceTickOnce } from '../agent-cadence';

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

/**
 * 에이전트 팀 cadence 1틱 수동 실행 (KAR-018-Y — 사용자 "수동 호출").
 * 라이브 봇 프로세스라 #team-bus(setTeamBusNotify/setCoreSpeak 전역
 * wired)에 실제 게시. interval 줄이는 churn 제거. defer(틱=발굴 LLM
 * ~수십초, 워커 claimable 시 tier3 수분 가능 — best-effort editReply,
 * 실제 산출은 #team-bus). owner/admin 전용.
 */
export async function handleAdminCadenceTick(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const { gameData, isAdmin } = ctx;
  if (!isAdmin(userId)) {
    await interaction.reply({
      content: gameData.getMessage('Admin_AccessDenied_Desc'),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const r = await runCadenceTickOnce(process.env);
    await interaction
      .editReply({
        content:
          `🛰 cadence 1틱 완료 — \`${String(r).slice(0, 1500)}\`\n` +
          '(실제 발화·제안·워커 상태는 #team-bus 확인)',
      })
      .catch(() => {});
  } catch (e) {
    await interaction
      .editReply({
        content: `⚠ cadence 틱 오류: ${e instanceof Error ? e.message : String(e)}`,
      })
      .catch(() => {});
  }
}

