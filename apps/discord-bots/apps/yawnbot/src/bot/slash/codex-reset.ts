import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { buildResetEmbed, getRecentResets } from '../../services/notifiers/codex-reset';
import { DEFAULT_RESET_AUTHOR, classifyResetPost, fetchResetPostLink, formatKst } from '../../services/sources/codex-reset';

export function buildCodexResetCommand() {
  return new SlashCommandBuilder().setName('코덱스').setDescription('최근 Codex 초기화 소식과 한국시간 조회')
    .addStringOption(option => option.setName('트윗').setDescription('X 트윗 링크. API 키 없이 원문 직접 조회').setMaxLength(300));
}

export async function handleCodexReset(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const link = interaction.options.getString('트윗');
  if (link) {
    try {
      const post = await fetchResetPostLink(link, process.env.YAWNBOT_CODEX_RESET_AUTHOR?.trim() || DEFAULT_RESET_AUTHOR);
      const signal = classifyResetPost(post);
      const embed = signal ? buildResetEmbed(signal) : new EmbedBuilder().setTitle(post.truncated ? 'X 원문 일부만 조회됨' : '초기화 공지로 판단되지 않은 트윗').setURL(post.url)
        .setDescription(post.truncated ? '전체 글을 읽지 못해 초기화 여부를 판단할 수 없어요. 원문 링크를 확인해 주세요.' : '다음 초기화 시각은 이 글에서 확인할 수 없어요.')
        .addFields({ name: '원문', value: post.text.slice(0, 1000) });
      await interaction.editReply({ content: 'X 원문 직접 조회', embeds: [embed], allowedMentions: { parse: [] } });
    } catch (error) {
      const message = error instanceof Error && /^(X |@)/.test(error.message) ? error.message : 'X 원문에 연결하지 못했어요. 잠시 후 다시 조회해 주세요.';
      await interaction.editReply({ content: message, allowedMentions: { parse: [] } });
    }
    return;
  }
  const { state, stale, error } = await getRecentResets();
  const signals = state.signals.slice(-3).reverse();
  const freshness = stale
    ? `${error || '트윗 수집 실패'}. ${state.checkedAt ? `마지막 확인: ${formatKst(state.checkedAt)}` : '아직 확인한 자료 없음'}. 아래 기록은 최신 상태가 아닐 수 있어요.`
    : `마지막 확인: ${formatKst(state.checkedAt!)}. 새로 확인해도 같은 공지를 다시 보내지 않아요.`;
  const empty = signals.length || stale ? '' : '\n가져온 트윗에서 초기화 공지를 찾지 못했어요. 다음 초기화 시각은 미정이에요.';
  await interaction.editReply({ content: freshness + empty, embeds: signals.map(s => buildResetEmbed(s)), allowedMentions: { parse: [] } });
}
