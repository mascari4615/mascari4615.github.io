/**
 * 슬래시 dispatch — thin (TASK-YB-025 slice 1).
 *
 * 커맨드별 분기·가드·resolveMemory 는 전부 `registry.ts` 의 엔트리로 colocate.
 * 본 파일 = 횡단 관심사만: guard / usage 로그 / 레지스트리 lookup / 공통 try-catch.
 */
import { MessageFlags } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './bot-context';
import { guardSlashInteraction } from './slash-guard';
import { logSlashUsage } from './usage-log';
import { SLASH_BY_NAME } from './registry';

export async function dispatchAutocomplete(ctx: BotContext, interaction: AutocompleteInteraction): Promise<void> {
  const command = SLASH_BY_NAME.get(interaction.commandName);
  if (command?.autocomplete) {
    await command.autocomplete(ctx, interaction);
    return;
  }
  await interaction.respond([]);
}

export async function dispatchSlashCommand(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  if (!(await guardSlashInteraction(interaction))) return;
  logSlashUsage(interaction);

  const command = SLASH_BY_NAME.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: '알 수 없는 명령어입니다.', flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    await command.run(ctx, interaction);
  } catch (err) {
    console.error(`[Error] ${interaction.commandName}:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    const reply = interaction.replied || interaction.deferred ? interaction.editReply : interaction.reply;
    await reply
      .call(interaction, { content: `오류가 발생했습니다: ${msg}`, flags: MessageFlags.Ephemeral })
      .catch(() => {});
  }
}
