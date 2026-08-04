/**
 * /빌드 빌더 — WM 노트북 빌드머신 조작 (TASK-WM-197).
 * registry.ts 가 단일 정본; deploy-commands 가 builder().toJSON() 파생.
 *
 * 시작만 있고 취소·상태가 없으면, 결국 「끄러 깃허브 앱을 연다」가 남는다.
 * 걸고·보고·끄는 세 가지가 한 자리에 있어야 폰만으로 닫힌다.
 */
import { SlashCommandBuilder } from 'discord.js';

export const buildCommand = () =>
  new SlashCommandBuilder()
    .setName('빌드')
    .setDescription('WM 빌드 — 노트북 빌드머신에 걸고, 상태 보고, 끊는다')
    .addSubcommand((s) =>
      s
        .setName('시작')
        .setDescription('빌드를 건다 — 결과는 #wm-build 카드로')
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
        ),
    )
    .addSubcommand((s) => s.setName('상태').setDescription('지금 도는 빌드가 있는지, 몇 분째인지'))
    .addSubcommand((s) => s.setName('취소').setDescription('진행 중인 빌드를 끊는다'));
