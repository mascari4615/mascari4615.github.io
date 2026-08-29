import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './bot-context';
import { CharacterService } from '../../services/character-service';
import { AnniversaryService } from '../../services/anniversary-service';

function resolveService(ctx: BotContext, interaction: ChatInputCommandInteraction): AnniversaryService | null {
  if (!ctx.characterService || !ctx.memoRepoPath) return null;
  const isDM = !interaction.guildId;
  const channelKey = CharacterService.channelKey({
    isDM,
    userId: interaction.user.id,
    channelId: interaction.channelId,
  });
  const card = ctx.characterService.resolveCard(channelKey);
  if (!card) return null;
  return new AnniversaryService(ctx.memoRepoPath, card.slug);
}

export async function handleAnniversaryList(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const svc = resolveService(ctx, interaction);
  if (!svc) {
    await interaction.reply({ content: '캐릭터 또는 MEMO_REPO_PATH 설정 없음.', flags: MessageFlags.Ephemeral });
    return;
  }

  const list = svc.list();
  if (!list.length) {
    await interaction.reply({ content: '등록된 기념일이 없어요.', flags: MessageFlags.Ephemeral });
    return;
  }

  const lines = list.map((a) => {
    const dateStr = `${a.month}월 ${a.day}일${a.year ? ` (${a.year}년~)` : ''}`;
    return `\`${a.id.slice(0, 8)}\` **${a.label}**. ${dateStr}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('📅 기념일 목록')
    .setDescription(lines.join('\n'))
    .setColor(0xf06292);

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export async function handleAnniversaryAdd(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const svc = resolveService(ctx, interaction);
  if (!svc) {
    await interaction.reply({ content: '캐릭터 또는 MEMO_REPO_PATH 설정 없음.', flags: MessageFlags.Ephemeral });
    return;
  }

  const label = interaction.options.getString('이름', true);
  const month = interaction.options.getInteger('월', true);
  const day   = interaction.options.getInteger('일', true);
  const year  = interaction.options.getInteger('연도') ?? undefined;

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    await interaction.reply({ content: '날짜가 올바르지 않아요.', flags: MessageFlags.Ephemeral });
    return;
  }

  const entry = svc.add(label, month, day, year);
  const dateStr = `${month}월 ${day}일${year ? ` (${year}년~)` : ''}`;
  await interaction.reply({
    content: `✅ 기념일 추가됨: **${entry.label}**. ${dateStr}`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleAnniversaryDelete(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  const svc = resolveService(ctx, interaction);
  if (!svc) {
    await interaction.reply({ content: '캐릭터 또는 MEMO_REPO_PATH 설정 없음.', flags: MessageFlags.Ephemeral });
    return;
  }

  const id = interaction.options.getString('id', true);
  const removed = svc.remove(id);
  await interaction.reply({
    content: removed ? `🗑️ 삭제됨: \`${id}\`` : `기념일을 찾을 수 없어요: \`${id}\``,
    flags: MessageFlags.Ephemeral,
  });
}
