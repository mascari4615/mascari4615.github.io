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
        .setName('에이전트틱')
        .setDescription('에이전트 팀 cadence 1틱 수동 실행 (발굴·워커·대화·하트비트)')
        .setDescriptionLocalizations(enUS('Run one agent-team cadence tick now')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('자기수술')
        .setDescription('자기수술 강제 1회 (12h gate 우회 — 헬스 critical 시 LLM 진단 → task seed)')
        .setDescriptionLocalizations(enUS('Force self-surgery (bypass 12h gate)')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('워커틱')
        .setDescription('워커 소화만 1회 수동 실행 (발굴·대화 없이 워커 소비만)')
        .setDescriptionLocalizations(enUS('Run worker consumer only, once'))
        .addStringOption((opt) =>
          opt
            .setName('워커')
            .setDescription('특정 워커만 실행 (생략 시 전체)')
            .setDescriptionLocalizations(enUS('Run only this worker (default: all)'))
            .addChoices(
              { name: 'kar-worker', value: 'kar-worker' },
              { name: 'kl-worker', value: 'kl-worker' },
              { name: 'wm-support', value: 'wm-support' },
              { name: 'wm-worker', value: 'wm-worker' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('task')
            .setDescription('특정 TASK 강제 실행 (예: KAR-018-LT-W1-WIRE)')
            .setDescriptionLocalizations(enUS('Force specific TASK id (bypasses scan/cooldown)')),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('에이전트자동')
        .setDescription('에이전트 자동 실행 ON/OFF 토글 (발굴·대화·retro 루프)')
        .setDescriptionLocalizations(enUS('Toggle agent cadence auto-loop on/off')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('워커자동')
        .setDescription('워커 자동 실행 ON/OFF 토글 (5분 주기 자동 소화)')
        .setDescriptionLocalizations(enUS('Toggle worker auto-loop on/off')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('자기수술자동')
        .setDescription('자기수술 자동 ON/OFF 토글 (12h 게이트 + critical 이슈 한정 자율 진단)')
        .setDescriptionLocalizations(enUS('Toggle self-surgery auto-loop on/off (12h gate, critical issues only)')),
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
