import { SlashCommandBuilder, Locale } from 'discord.js';

const EN = Locale.EnglishUS;
const enUS = (s: string): Record<string, string> => ({ [EN]: s });

export const adminCommand = () =>
  new SlashCommandBuilder()
    .setName('관리자')
    .setDescription('[관리자] 봇 관리 명령')
    .setDescriptionLocalizations(enUS('[Admin] Bot management commands'))
    .addSubcommand((sub) =>
      sub
        .setName('핑')
        .setDescription('봇 응답 속도 확인')
        .setDescriptionLocalizations(enUS('Check bot latency')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('리로드')
        .setDescription('데이터를 다시 불러옵니다.')
        .setDescriptionLocalizations(enUS('Reload persisted data')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('저장')
        .setDescription('데이터를 저장합니다.')
        .setDescriptionLocalizations(enUS('Save data to disk')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('에이전트')
        .setDescription('로컬 저장소에서 Cursor agent로 프롬프트 실행')
        .setDescriptionLocalizations(enUS('Run a Cursor agent prompt on the local repo'))
        .addStringOption((opt) =>
          opt
            .setName('prompt')
            .setDescription('에이전트에 전달할 지시')
            .setDescriptionLocalizations(enUS('Instructions for the agent'))
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('mode')
            .setDescription('세션 모드')
            .setDescriptionLocalizations(enUS('Session mode'))
            .addChoices(
              { name: 'agent', value: 'agent' },
              { name: 'ask', value: 'ask' },
              { name: 'plan', value: 'plan' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('뉴스틱')
        .setDescription('뉴스 소스 1회 즉시 폴 (YAWNBOT_NEWS_SOURCES 기준 전체)')
        .setDescriptionLocalizations(enUS('Trigger one news poll now (all active sources)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('하트비트')
        .setDescription('heartbeat 1회 즉시 기록 (memo orphan 브랜치)')
        .setDescriptionLocalizations(enUS('Trigger one heartbeat write now')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('메모싱크')
        .setDescription('memo 레포 1회 즉시 동기 (git reset --hard origin)')
        .setDescriptionLocalizations(enUS('Trigger one memo-sync now')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('캐릭상태')
        .setDescription('캐릭터 런타임 상태 1회 즉시 스냅샷')
        .setDescriptionLocalizations(enUS('Trigger one character-state snapshot now')),
    );
