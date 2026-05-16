/**
 * /방 슬래시 — 에이전트 임시 작업방(스레드) 생성·초대·해체 (KAR-018-A sub-A-3).
 * 방 = .active.json 코어 바인딩된 스레드 → isTeamRoom true (team-thread.ts).
 */
import { MessageFlags, TextChannel } from 'discord.js';
import type { ChatInputCommandInteraction, InteractionReplyOptions } from 'discord.js';
import type { BotContext } from './bot-context';
import { spawnRoom, inviteCore, dissolveRoom } from '../team-thread';

const ephemeral = (content: string): InteractionReplyOptions => ({
  content,
  flags: MessageFlags.Ephemeral,
});

export async function handleRoom(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const cs = ctx.characterService;
  if (!cs) {
    await interaction.reply(
      ephemeral('MEMO_REPO_PATH 미설정 — 캐릭터/코어 시스템 비활성.'),
    );
    return;
  }

  const sub = interaction.options.getSubcommand();
  const ch = interaction.channel;

  if (sub === '생성') {
    const name = interaction.options.getString('이름', true).trim();
    const core = interaction.options.getString('코어', true).trim();
    if (!(ch instanceof TextChannel)) {
      await interaction.reply(
        ephemeral('이 채널에선 방 생성 불가 — 일반 텍스트 채널에서 실행해줘요 (스레드 안 X).'),
      );
      return;
    }
    const room = await spawnRoom(ch, name, core, cs);
    await interaction.reply(
      ephemeral(`임시 작업방 생성: ${room.url}\n코어 **${core}** 배치 (스킨 보존). 24h 무활동 시 자동 아카이브.`),
    );
    return;
  }

  if (sub === '초대') {
    const core = interaction.options.getString('코어', true).trim();
    if (!ch?.isThread()) {
      await interaction.reply(ephemeral('방(스레드) 안에서만 — 그 방 스레드에서 실행해줘요.'));
      return;
    }
    inviteCore(ch.id, core, cs);
    await interaction.reply(ephemeral(`이 방에 코어 **${core}** 배치 (스킨 보존).`));
    return;
  }

  if (sub === '해체') {
    if (!ch?.isThread()) {
      await interaction.reply(ephemeral('방(스레드) 안에서만 — 해체할 방 스레드에서 실행해줘요.'));
      return;
    }
    await dissolveRoom(ch, cs);
    await interaction.reply(ephemeral('방 해체 완료 — 코어 바인딩 제거 + 스레드 아카이브.'));
    return;
  }
}
