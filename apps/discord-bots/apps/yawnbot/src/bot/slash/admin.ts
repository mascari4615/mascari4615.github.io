import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BotContext } from './bot-context';
import {
  runCadenceTickOnce, runWorkerConsumerOnce,
  getCadenceAutoEnabled, setCadenceAutoEnabled,
  getWorkerAutoEnabled, setWorkerAutoEnabled,
  defaultListWorkers, type WorkerConsumerDeps,
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
  await interaction
    .editReply({ content: '🛰 cadence 1틱 시작… (발굴 LLM 수십초, 산출은 #team-bus)' })
    .catch(() => {});
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
  const workerFilter = interaction.options.getString('워커')?.trim() || '';
  const taskInput = interaction.options.getString('task')?.trim() || '';
  // task 옵션 = "KAR-018-LT-W1-WIRE" 형식(TASK- prefix 없이) 또는 "TASK-..." 모두 수용.
  const taskBare = taskInput.replace(/^TASK-/, '');

  // task 지정 시 메모 dir 에서 파일 lookup (manual override = scan/cooldown 우회).
  // prod(memo standalone) = MEMO_REPO_PATH/tasks · 로컬(umbrella) = MEMO_REPO_PATH/memo/tasks.
  // resolveTaskRoot 동치: .claude 있으면 standalone, 없으면 umbrella.
  let forcedTaskFile: string | null = null;
  if (taskBare) {
    const memoRoot = process.env.MEMO_REPO_PATH?.trim() || '';
    const isMemoStandalone = fs.existsSync(path.join(memoRoot, '.claude'));
    const tasksRel = isMemoStandalone ? 'tasks' : path.join('memo', 'tasks');
    const tasksDir = path.join(memoRoot, tasksRel);
    try {
      const files = fs.readdirSync(tasksDir).filter((f) =>
        f === `TASK-${taskBare}.md` || f.startsWith(`TASK-${taskBare}-`),
      );
      if (files.length > 0) forcedTaskFile = path.join(tasksRel, files[0]);
    } catch { /* memoRoot 없음/접근불가 → forcedTaskFile null 유지 */ }
    if (!forcedTaskFile) {
      await interaction.reply({
        content: `⚠ TASK 파일을 못 찾음: \`TASK-${taskBare}*.md\` (${tasksRel}/)`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const filterDesc =
    [workerFilter && `워커=${workerFilter}`, taskBare && `task=${taskBare}`]
      .filter(Boolean).join(' · ') || '전체';
  await interaction
    .editReply({ content: `🤖 워커 시작… (${filterDesc}, 산출은 #team-bus)` })
    .catch(() => {});

  const deps: WorkerConsumerDeps = {};
  if (workerFilter) {
    deps.listWorkers = (memoRoot) =>
      defaultListWorkers(memoRoot).filter((w) => w.coreId === workerFilter);
  }
  if (forcedTaskFile) {
    deps.scan = () => [{ id: `TASK-${taskBare}`, file: forcedTaskFile! } as never];
  }

  try {
    const w = await runWorkerConsumerOnce(process.env, deps);
    await interaction
      .editReply({
        content:
          `🤖 워커 소화 1회 완료 (${filterDesc}) — \`${String(w).slice(0, 1500)}\`\n` +
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

