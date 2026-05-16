/**
 * /방 빌더 — 에이전트 임시 작업방 스레드 (KAR-018-A sub-A-3, slice-6).
 * registry.ts 가 단일 정본; deploy-commands 가 builder().toJSON() 파생.
 */
import { SlashCommandBuilder } from 'discord.js';

export const roomCommand = () =>
  new SlashCommandBuilder()
    .setName('방')
    .setDescription('에이전트 임시 작업방(스레드) 관리 — KAR-018-A')
    .addSubcommand((s) =>
      s
        .setName('생성')
        .setDescription('이 채널 아래 임시 작업방 생성 + 코어 배치')
        .addStringOption((o) =>
          o.setName('이름').setDescription('방 이름').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('코어').setDescription('배치할 에이전트 코어 id').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('초대')
        .setDescription('이 방(스레드)에 에이전트 코어 배치/교체')
        .addStringOption((o) =>
          o.setName('코어').setDescription('코어 id').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName('해체').setDescription('이 방(스레드) 해체 — 코어 해제 + 아카이브'),
    );
