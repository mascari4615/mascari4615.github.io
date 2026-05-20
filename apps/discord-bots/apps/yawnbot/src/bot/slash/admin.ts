import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './bot-context';
import {
  runCadenceTickOnce, runWorkerConsumerOnce,
  getCadenceAutoEnabled, setCadenceAutoEnabled,
  getWorkerAutoEnabled, setWorkerAutoEnabled,
} from '../agent-cadence';

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

/**
 * 워커 소화만 1회 수동 실행 (KAR-018-Y — 사용자 "워커만 실행하는거").
 * runWorkerConsumerOnce 직호출 = 발굴·대화·하트비트 *없이* 워커 소비만.
 * 라이브 프로세스라 워커 idle 사유/착수가 #team-bus 게시(noteWorkerStatus
 * dedupe). owner 전용. claimable 있으면 tier3 = 수분 가능(best-effort
 * editReply, 실제 산출 #team-bus).
 */
export async function handleAdminCadenceToggle(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const { gameData, isAdmin } = ctx;
  if (!isAdmin(userId)) {
    await interaction.reply({ content: gameData.getMessage('Admin_AccessDenied_Desc'), flags: MessageFlags.Ephemeral });
    return;
  }
  const next = !getCadenceAutoEnabled();
  setCadenceAutoEnabled(next);
  await interaction.reply({
    content: next
      ? '🟢 에이전트 자동 ON — 발굴·대화·retro 자동 재개'
      : '🔴 에이전트 자동 OFF — 수동 `/관리자 에이전트틱` 으로만 실행',
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleAdminWorkerToggle(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
  userId: string,
): Promise<void> {
  const { gameData, isAdmin } = ctx;
  if (!isAdmin(userId)) {
    await interaction.reply({ content: gameData.getMessage('Admin_AccessDenied_Desc'), flags: MessageFlags.Ephemeral });
    return;
  }
  const next = !getWorkerAutoEnabled();
  setWorkerAutoEnabled(next);
  await interaction.reply({
    content: next
      ? '🟢 워커 자동 ON — 5분 주기 자동 소화 재개'
      : '🔴 워커 자동 OFF — 수동 `/관리자 워커틱` 으로만 실행',
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleAdminWorkerTick(
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
    const w = await runWorkerConsumerOnce(process.env);
    await interaction
      .editReply({
        content:
          `🤖 워커 소화 1회 완료 — \`${String(w).slice(0, 1500)}\`\n` +
          '(착수·idle 사유는 #team-bus 확인)',
      })
      .catch(() => {});
  } catch (e) {
    await interaction
      .editReply({
        content: `⚠ 워커 틱 오류: ${e instanceof Error ? e.message : String(e)}`,
      })
      .catch(() => {});
  }
}

