/**
 * /빌드 빌더 — WM 노트북 빌드머신 발사 (TASK-WM-197).
 * registry.ts 가 단일 정본; deploy-commands 가 builder().toJSON() 파생.
 */
import { SlashCommandBuilder } from 'discord.js';

export const buildCommand = () =>
  new SlashCommandBuilder()
    .setName('빌드')
    .setDescription('WM 빌드를 노트북 빌드머신에 건다 — 결과는 #wm-build 카드로')
    .addStringOption((o) =>
      o
        .setName('플랫폼')
        .setDescription('무엇을 만들까 (안드로이드 = 폰 설치용 APK)')
        .setRequired(true)
        .addChoices(
          { name: '안드로이드 (폰)', value: 'android' },
          { name: '윈도우 (PC)', value: 'windows' },
        ),
    )
    .addStringOption((o) =>
      o
        .setName('종류')
        .setDescription('개발 빌드 = 로그·디버깅 포함 (기본)')
        .addChoices(
          { name: '개발', value: 'development' },
          { name: '릴리스', value: 'release' },
        ),
    )
    .addBooleanOption((o) =>
      o
        .setName('취소하고시작')
        .setDescription('진행 중인 빌드를 끊고 바로 시작 (기본: 줄서기)'),
    );
