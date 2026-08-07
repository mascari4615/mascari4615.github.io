/**
 * 슬래시 커맨드 레지스트리 — dispatch 단일 정본 (TASK-YB-025 slice 1).
 *
 * 커맨드 1개 = 엔트리 1개 {name, run, autocomplete?}. router.ts 의 거대 switch 폐기:
 * 커맨드별 sub/group 분기 + 가드 + resolveMemory 가 *그 커맨드 엔트리 안에* colocate.
 * 신규 커맨드 = 엔트리 push 1곳 (router.ts 안 건드림).
 *
 * (slice 2 예정: deploy-builders/deploy-commands 의 builder 도 본 엔트리로 colocate →
 *  deploy 가 레지스트리에서 파생. 본 slice = dispatch 측만.)
 */
import { MessageFlags, EmbedBuilder, SlashCommandBuilder, Locale } from 'discord.js';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { BotContext } from './bot-context';
import { musicCommandGroup } from '../../deploy-builders/voice-music';
import { gameCommandGroup } from '../../deploy-builders/game-stock';
import { characterCommand } from '../../deploy-builders/character';
import { roomCommand } from '../../deploy-builders/room';
import { handleRoom } from './room';
import { buildCommand } from '../../deploy-builders/build';
import { handleBuild } from './build';
import { scheduleCommand } from '../../deploy-builders/schedule';
import { adminCommand } from '../../deploy-builders/admin';
import { atkupCommandGroup } from '../../deploy-builders/atkup';
import { handlePing, handleHelp } from './general';
import {
  handleEnhanceSlash,
  handleSellSlash,
  handleInfo,
  handleMoney,
  handleRank,
  handleAttendance,
  handleGiveMeMoney,
  handleBattle,
  handleSlot,
  handleOddEven,
  handleRps,
} from './core-game';
import { handleStockList, handleStockChart, handleBuy, handleSellStock, handleMyStock } from './stock';
import { handleRaidInfo, handleRaidSpawn, handleRaidAttack } from './raid';
import { handleCursorEdit, handleYawn } from './ai';
import { handleImage } from './image';
import { handleVoiceJoin, handleVoiceLeave } from './voice';
import {
  handlePlay,
  handleSkip,
  handleStopMusic,
  handleQueue,
  handleShuffle,
  handleRemove,
  handleLoop,
} from './music';
import { handleSpeak } from './speak';
import { handleSound } from './sound';
import { handleAdminReload, handleAdminSave, handleAdminNewsTick, handleAdminHeartbeatTick, handleAdminMemoSyncTick, handleAdminCharStateTick } from './admin';
import {
  handleCharacterList,
  handleCharacterSwitch,
  handleCharacterInfo,
  handleCharacterReset,
  handleCharacterCore,
  handleCharacterReload,
  handleCharacterImage,
  handleCharacterImageHistory,
  handleCharacterRelationship,
} from './character';
import { handleScheduleAdd, handleScheduleList, handleScheduleDelete } from './schedule';
import { handleCost } from './cost';
import { handleAnniversaryList, handleAnniversaryAdd, handleAnniversaryDelete } from './anniversary';
import { handleNewsKeywordList, handleNewsKeywordAdd, handleNewsKeywordDelete } from './news-keywords';
import { handleGallery } from './gallery';
import { handleProfile } from './profile';
import { handleAtkupUnity } from './atkup';
import { handleWrapped } from './wrapped';
import { CharacterService } from '../../services/character-service';

/** toJSON() 만 요구하는 구조 타입 — SlashCommandBuilder 및 subcommand/options-only 변종 공통. */
interface CommandBuilderLike {
  toJSON: () => RESTPostAPIChatInputApplicationCommandsJSONBody;
}

/** 커맨드 레지스트리 엔트리 = schema(builder) + dispatch(run) + autocomplete 단일 정본. */
export interface SlashCommand {
  name: string;
  /** Discord 등록 스키마 빌더. deploy-commands 가 이걸로 파생 (slice 2). */
  builder: () => CommandBuilderLike;
  run: (ctx: BotContext, interaction: ChatInputCommandInteraction) => Promise<void>;
  /** 슬래시 옵션 autocomplete (해당 커맨드만). 없으면 빈 응답. */
  autocomplete?: (ctx: BotContext, interaction: AutocompleteInteraction) => Promise<void>;
  /**
   * 남의 서버에서도 쓸 수 있는 명령 (TASK-YB-042).
   * true 면 `YAWNBOT_ALLOWED_GUILD_IDS` 허용 목록을 타지 않는다 — 초대받은 서버에서
   * 동작해야 하는 것들만. 사적인 기능은 표시하지 않는다(기본 = 본진 전용).
   */
  public?: boolean;
}

const ephemeral = (content: string): InteractionReplyOptions => ({ content, flags: MessageFlags.Ephemeral });

const EN = Locale.EnglishUS;
const enUS = (s: string): Record<string, string> => ({ [EN]: s });

/** owner 전용 커맨드 가드. 비인가면 ephemeral 응답 후 false. */
async function guardOwner(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (ctx.isOwner(interaction.user.id)) return true;
  await interaction.reply(ephemeral('이 명령어는 봇 소유자만 사용할 수 있어요.'));
  return false;
}

/** 현재 /기억 호출 컨텍스트의 활성 슬러그 memory 를 돌려준다. 없으면 null + 안내. */
async function resolveMemoryForInteraction(
  ctx: BotContext,
  interaction: ChatInputCommandInteraction,
): Promise<{ card: import('../../services/character-service').CharacterCard; memory: import('../../services/memory-service').MemoryService } | null> {
  const cs = ctx.characterService;
  const getMem = ctx.getMemory;
  if (!cs || !getMem) {
    await interaction.reply(ephemeral('MEMO_REPO_PATH가 설정되지 않아 기억 기능이 비활성화되어 있습니다.'));
    return null;
  }
  const isDM = !interaction.guildId;
  const channelKey = CharacterService.channelKey({
    isDM,
    userId: interaction.user.id,
    channelId: interaction.channelId ?? '',
  });
  const card = cs.resolveCard(channelKey);
  if (!card) {
    await interaction.reply(ephemeral('활성 캐릭터 카드가 없어요. `/character list` 로 확인해봐요.'));
    return null;
  }
  return { card, memory: getMem(card.slug) };
}

/** 캐릭터 슬러그 autocomplete (이미지 캐릭터 / character slug 공용). */
async function characterSlugAutocomplete(ctx: BotContext, interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const slugs = ctx.characterService ? ctx.characterService.listCharacters() : [];
  const query = String(focused.value).toLowerCase();
  await interaction.respond(
    slugs.filter((s) => s.includes(query)).slice(0, 25).map((s) => ({ name: s, value: s })),
  );
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: '관리자',
    builder: adminCommand,
    run: async (ctx, interaction) => {
      const userId = interaction.user.id;
      switch (interaction.options.getSubcommand()) {
        case '핑': await handlePing(ctx, interaction); break;
        case '리로드': await handleAdminReload(ctx, interaction, userId); break;
        case '저장': await handleAdminSave(ctx, interaction, userId); break;
        case '에이전트': await handleCursorEdit(ctx, interaction, userId); break;
        case '뉴스틱': await handleAdminNewsTick(ctx, interaction, userId); break;
        case '하트비트': await handleAdminHeartbeatTick(ctx, interaction, userId); break;
        case '메모싱크': await handleAdminMemoSyncTick(ctx, interaction, userId); break;
        case '캐릭상태': await handleAdminCharStateTick(ctx, interaction, userId); break;
        default: await interaction.reply(ephemeral('알 수 없는 관리자 하위 명령입니다.'));
      }
    },
  },
  {
    name: '도움말',
    builder: () =>
      new SlashCommandBuilder()
        .setName('도움말')
        .setNameLocalizations(enUS('help'))
        .setDescription('카테고리별 도움말 (주제를 비우면 개요)')
        .setDescriptionLocalizations(enUS('Help by category (empty topic = overview)'))
        .addStringOption((opt) =>
          opt
            .setName('주제')
            .setNameLocalizations(enUS('topic'))
            .setDescription('게임 · /music · AI·ping 등')
            .setDescriptionLocalizations(enUS('game, music, utility, or overview'))
            .setRequired(false)
            .addChoices(
              { name: '개요', name_localizations: enUS('Overview'), value: 'overview' },
              { name: '음성 · /music', name_localizations: enUS('Voice · /music'), value: 'music' },
              { name: '검 · 미니게임 · 주식 · 레이드', name_localizations: enUS('Sword · minigames · stocks · raid'), value: 'game' },
              { name: 'AI · ping · 음성 입장', name_localizations: enUS('AI · ping · voice join'), value: 'utility' },
            ),
        ),
    run: async (ctx, interaction) => { await handleHelp(ctx, interaction); },
    public: true,
  },
  {
    name: '게임',
    builder: gameCommandGroup,
    run: async (ctx, interaction) => {
      const userId = interaction.user.id;
      const userName = interaction.user.displayName || interaction.user.username;
      const group = interaction.options.getSubcommandGroup(true);
      const sub = interaction.options.getSubcommand();
      switch (group) {
        case '검':
          switch (sub) {
            case '강화': await handleEnhanceSlash(ctx, interaction, userId, userName); break;
            case '판매': await handleSellSlash(ctx, interaction, userId); break;
            case '정보': await handleInfo(ctx, interaction, userId, userName); break;
            case '돈': await handleMoney(ctx, interaction, userId, userName); break;
            case '랭킹': await handleRank(ctx, interaction); break;
            case '출첵': await handleAttendance(ctx, interaction, userId); break;
            case '돈내놔': await handleGiveMeMoney(ctx, interaction, userId); break;
            default: await interaction.reply(ephemeral('알 수 없는 명령입니다.'));
          }
          break;
        case '미니':
          switch (sub) {
            case '배틀': await handleBattle(ctx, interaction, userId, userName); break;
            case '슬롯': await handleSlot(ctx, interaction, userId); break;
            case '홀짝': await handleOddEven(ctx, interaction, userId); break;
            case '가위바위보': await handleRps(ctx, interaction, userId); break;
            default: await interaction.reply(ephemeral('알 수 없는 명령입니다.'));
          }
          break;
        case '주식':
          switch (sub) {
            case '목록': await handleStockList(ctx, interaction); break;
            case '차트': await handleStockChart(ctx, interaction); break;
            case '매수': await handleBuy(ctx, interaction, userId); break;
            case '매도': await handleSellStock(ctx, interaction, userId); break;
            case '내꺼': await handleMyStock(ctx, interaction, userId, userName); break;
            default: await interaction.reply(ephemeral('알 수 없는 명령입니다.'));
          }
          break;
        case '레이드':
          switch (sub) {
            case '정보': await handleRaidInfo(ctx, interaction); break;
            case '소환': await handleRaidSpawn(ctx, interaction); break;
            case '공격': await handleRaidAttack(ctx, interaction, userId); break;
            default: await interaction.reply(ephemeral('알 수 없는 명령입니다.'));
          }
          break;
        default:
          await interaction.reply(ephemeral('알 수 없는 게임 그룹입니다.'));
      }
    },
  },
  {
    name: 'yawn',
    builder: () =>
      new SlashCommandBuilder()
        .setName('yawn')
        .setDescription('Gemini AI에게 무엇이든 물어보세요!')
        .setDescriptionLocalizations(enUS('Ask the Gemini AI anything'))
        .addStringOption((opt) =>
          opt
            .setName('질문')
            .setNameLocalizations(enUS('question'))
            .setDescription('AI에게 전달할 메시지')
            .setDescriptionLocalizations(enUS('Message for the AI'))
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('api')
            .setDescription('호출 API (비우면 .env의 KARMOLAB_AI_SURFACE 등 기본)')
            .setDescriptionLocalizations(
              enUS('API surface (default: .env KARMOLAB_AI_SURFACE / GEMINI_SURFACE)'),
            )
            .addChoices(
              { name: '기본 (.env)', name_localizations: enUS('Default (.env)'), value: 'inherit' },
              { name: 'Google AI Studio', name_localizations: enUS('Google AI Studio'), value: 'ai_studio' },
              { name: 'Vertex AI', name_localizations: enUS('Vertex AI'), value: 'vertex' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('model')
            .setDescription('모델 ID (예: gemini-2.5-flash). 비우면 GEMINI_MODEL·패키지 기본')
            .setDescriptionLocalizations(enUS('Model id; empty = GEMINI_MODEL / package default'))
            .setMaxLength(64),
        ),
    run: async (ctx, interaction) => { await handleYawn(ctx, interaction); },
  },
  {
    name: '이미지',
    builder: () =>
      new SlashCommandBuilder()
        .setName('이미지')
        .setNameLocalizations(enUS('image'))
        .setDescription('Vertex Imagen으로 이미지를 생성합니다.')
        .setDescriptionLocalizations(enUS('Generate images via Vertex Imagen'))
        .addStringOption((opt) =>
          opt
            .setName('프롬프트')
            .setNameLocalizations(enUS('prompt'))
            .setDescription('이미지 프롬프트 (영어 권장)')
            .setDescriptionLocalizations(enUS('Image prompt (English recommended)'))
            .setRequired(true)
            .setMaxLength(1500),
        )
        .addStringOption((opt) =>
          opt
            .setName('캐릭터')
            .setNameLocalizations(enUS('character'))
            .setDescription('캐릭터 슬러그 (비우면 활성 캐릭터, "none"=캐릭터 없이)')
            .setDescriptionLocalizations(
              enUS('Character slug (empty=active, "none"=no character)'),
            )
            .setMaxLength(64)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('모델')
            .setNameLocalizations(enUS('model'))
            .setDescription('모델 ID (비우면 IMAGE_MODEL_ID 기본)')
            .setDescriptionLocalizations(enUS('Model id; empty = IMAGE_MODEL_ID default'))
            .addChoices(
              { name: 'Imagen 4 Generate', value: 'imagen-4.0-generate-001' },
              { name: 'Imagen 4 Ultra', value: 'imagen-4.0-ultra-generate-001' },
              { name: 'Imagen 4 Fast', value: 'imagen-4.0-fast-generate-001' },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('비율')
            .setNameLocalizations(enUS('aspect'))
            .setDescription('가로세로 비율 (기본 1:1)')
            .setDescriptionLocalizations(enUS('Aspect ratio (default 1:1)'))
            .addChoices(
              { name: '1:1 (정사각)', value: '1:1' },
              { name: '16:9 (가로)', value: '16:9' },
              { name: '9:16 (세로)', value: '9:16' },
              { name: '4:3', value: '4:3' },
              { name: '3:4', value: '3:4' },
            ),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('개수')
            .setNameLocalizations(enUS('count'))
            .setDescription('생성할 이미지 개수 (1~4)')
            .setDescriptionLocalizations(enUS('Number of images (1-4)'))
            .setMinValue(1)
            .setMaxValue(4),
        )
        .addStringOption((opt) =>
          opt
            .setName('네거티브')
            .setNameLocalizations(enUS('negative'))
            .setDescription('피하고 싶은 요소 (negative prompt)')
            .setDescriptionLocalizations(enUS('Elements to avoid (negative prompt)'))
            .setMaxLength(500),
        ),
    run: async (ctx, interaction) => { await handleImage(ctx, interaction); },
    autocomplete: characterSlugAutocomplete,
  },
  {
    name: 'music',
    builder: musicCommandGroup,
    run: async (ctx, interaction) => {
      switch (interaction.options.getSubcommand()) {
        case 'join': await handleVoiceJoin(ctx, interaction); break;
        case 'leave': await handleVoiceLeave(ctx, interaction); break;
        case 'play': await handlePlay(ctx, interaction); break;
        case 'speak': await handleSpeak(ctx, interaction); break;
        case 'sound': await handleSound(ctx, interaction); break;
        case 'skip': await handleSkip(ctx, interaction); break;
        case 'stop': await handleStopMusic(ctx, interaction); break;
        case 'shuffle': await handleShuffle(ctx, interaction); break;
        case 'remove': await handleRemove(ctx, interaction); break;
        case 'loop': await handleLoop(ctx, interaction); break;
        case 'queue': await handleQueue(ctx, interaction); break;
        default: await interaction.reply(ephemeral('알 수 없는 music 하위 명령입니다.'));
      }
    },
  },
  {
    name: 'character',
    builder: characterCommand,
    run: async (ctx, interaction) => {
      const group = interaction.options.getSubcommandGroup(true);
      const sub = interaction.options.getSubcommand();
      if (group === '카드') {
        switch (sub) {
          case 'list': await handleCharacterList(ctx, interaction); break;
          case 'switch':
            if (!(await guardOwner(ctx, interaction))) return;
            await handleCharacterSwitch(ctx, interaction); break;
          case 'info': await handleCharacterInfo(ctx, interaction); break;
          case 'reset':
            if (!(await guardOwner(ctx, interaction))) return;
            await handleCharacterReset(ctx, interaction); break;
          case 'image': await handleCharacterImage(ctx, interaction); break;
          case 'history': await handleCharacterImageHistory(ctx, interaction); break;
          case 'reload': await handleCharacterReload(ctx, interaction); break;
          case 'core':
            if (!(await guardOwner(ctx, interaction))) return;
            await handleCharacterCore(ctx, interaction); break;
          case '친밀도': await handleCharacterRelationship(ctx, interaction); break;
          default: await interaction.reply(ephemeral('알 수 없는 명령입니다.'));
        }
      } else if (group === '기억') {
        if (!(await guardOwner(ctx, interaction))) return;
        const resolved = await resolveMemoryForInteraction(ctx, interaction);
        if (!resolved) return;
        const { card, memory } = resolved;
        switch (sub) {
          case '확인': {
            try {
              const userMd = memory.getUserMd();
              const selfMd = memory.getSelfMd();
              const userContent = userMd.slice(0, 1024) || '(없음)';
              const selfContent = selfMd.slice(0, 1024) || '(없음)';
              const userSize = Buffer.byteLength(userMd, 'utf-8');
              const selfSize = Buffer.byteLength(selfMd, 'utf-8');
              const embed = new EmbedBuilder()
                .setTitle(`🧠 ${card.displayName} 메모리 (${card.slug})`)
                .addFields(
                  { name: `나에 대한 정보 (${(userSize / 1024).toFixed(1)}KB)`, value: userContent },
                  { name: `봇 자신에 대한 정보 (${(selfSize / 1024).toFixed(1)}KB)`, value: selfContent },
                )
                .setFooter({ text: userSize > 1024 || selfSize > 1024 ? '⚠️ 전체 내용을 보려면 /기억 핫로그를 사용하세요' : undefined })
                .setColor(0x7c4dff);
              await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } catch (e) {
              await interaction.reply(ephemeral(`기억 조회 실패: ${e instanceof Error ? e.message : String(e)}`));
            }
            break;
          }
          case '저장': {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
              memory.commitIfDirty();
              await interaction.editReply(`${card.displayName}(${card.slug}) 대화 기록을 memo 레포에 저장했습니다.`);
            } catch (e) {
              await interaction.editReply(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
            }
            break;
          }
          case '수정': {
            const content = interaction.options.getString('내용');
            if (!content) {
              await interaction.reply(ephemeral('내용을 입력해주세요.'));
              break;
            }
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            try {
              const { generateAssistantText } = await import('karmolab-ai/node');
              const currentUserMd = memory.getUserMd();
              const { text: updatedUserMd } = await generateAssistantText(
                process.env,
                `너는 mascari4615의 개인 AI 비서야.\n다음은 현재 user.md의 내용이야:\n${currentUserMd}\n\n사용자가 요청한 수정 사항:\n${content}\n\n이를 반영해서 업데이트된 user.md 내용을 마크다운 형식으로 작성해줘. 기존 정보는 유지하면서 새로운 정보를 추가/수정해.`,
              );
              memory.appendHotMemory(`[기억수정] ${content.slice(0, 50)}`);
              const fs = await import('fs');
              fs.default.writeFileSync(
                memory.getUserMdPath(),
                `# 나에 대한 정보\n\n${updatedUserMd.trim()}\n`,
                'utf-8',
              );
              const oldLines = currentUserMd.split('\n').length;
              const newLines = updatedUserMd.split('\n').length;
              const diff = `${oldLines}줄 → ${newLines}줄`;
              const embed = new EmbedBuilder()
                .setTitle(`✅ ${card.displayName} user.md 업데이트 완료`)
                .addFields(
                  { name: '요청', value: content.slice(0, 256) },
                  { name: '변화', value: diff, inline: true },
                  { name: '새 용량', value: `${(Buffer.byteLength(updatedUserMd, 'utf-8') / 1024).toFixed(1)}KB`, inline: true },
                )
                .setColor(0x4caf50);
              await interaction.editReply({ embeds: [embed] });
            } catch (e) {
              await interaction.editReply(`수정 실패: ${e instanceof Error ? e.message : String(e)}`);
            }
            break;
          }
          case '핫로그': {
            try {
              const hotLog = memory.getHotMemoryLog(20);
              const embed = new EmbedBuilder()
                .setTitle(`🔥 ${card.displayName} 핫 메모리 로그`)
                .setDescription('최근 중요 기억들 (최대 20개)')
                .addFields({ name: '기록', value: `\`\`\`\n${hotLog}\n\`\`\`` })
                .setColor(0xff9800);
              await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } catch (e) {
              await interaction.reply(ephemeral(`핫로그 조회 실패: ${e instanceof Error ? e.message : String(e)}`));
            }
            break;
          }
          default:
            await interaction.reply(ephemeral('알 수 없는 기억 하위 명령입니다.'));
        }
      } else {
        await interaction.reply(ephemeral('알 수 없는 character 그룹입니다.'));
      }
    },
    autocomplete: characterSlugAutocomplete,
  },
  {
    name: '빌드',
    builder: buildCommand,
    run: async (ctx, interaction) => {
      // 빌드 1회 = 노트북 30~40분 점유 → 소유자만.
      if (!(await guardOwner(ctx, interaction))) return;
      await handleBuild(ctx, interaction);
    },
  },
  {
    name: '방',
    builder: roomCommand,
    run: async (ctx, interaction) => {
      // 방 생성·초대·해체 = mutating → owner 가드 (slice-2b core 동형).
      if (!(await guardOwner(ctx, interaction))) return;
      await handleRoom(ctx, interaction);
    },
  },
  {
    name: '일정',
    builder: scheduleCommand,
    run: async (ctx, interaction) => {
      if (!(await guardOwner(ctx, interaction))) return;
      const group = interaction.options.getSubcommandGroup(true);
      const sub = interaction.options.getSubcommand();
      switch (group) {
        case '일정':
          switch (sub) {
            case '추가': await handleScheduleAdd(ctx, interaction); break;
            case '목록': await handleScheduleList(ctx, interaction); break;
            case '삭제': await handleScheduleDelete(ctx, interaction); break;
            default: await interaction.reply(ephemeral('알 수 없는 일정 하위 명령입니다.'));
          }
          break;
        case '기념일':
          switch (sub) {
            case '목록': await handleAnniversaryList(ctx, interaction); break;
            case '추가': await handleAnniversaryAdd(ctx, interaction); break;
            case '삭제': await handleAnniversaryDelete(ctx, interaction); break;
            default: await interaction.reply(ephemeral('알 수 없는 기념일 하위 명령입니다.'));
          }
          break;
        case '키워드':
          switch (sub) {
            case '목록': await handleNewsKeywordList(ctx, interaction); break;
            case '추가': await handleNewsKeywordAdd(ctx, interaction); break;
            case '삭제': await handleNewsKeywordDelete(ctx, interaction); break;
            default: await interaction.reply(ephemeral('알 수 없는 키워드 하위 명령입니다.'));
          }
          break;
        default:
          await interaction.reply(ephemeral('알 수 없는 일정 그룹입니다.'));
      }
    },
  },
  {
    name: '갤러리',
    builder: () =>
      new SlashCommandBuilder()
        .setName('갤러리')
        .setNameLocalizations(enUS('gallery'))
        .setDescription('캐릭터 이미지 캐시 갤러리 (◀▶ 페이지 이동)')
        .setDescriptionLocalizations(enUS('Browse character image cache gallery'))
        .addStringOption((opt) =>
          opt
            .setName('정렬')
            .setNameLocalizations(enUS('sort'))
            .setDescription('정렬 기준 (기본: 최신순)')
            .setDescriptionLocalizations(enUS('Sort order (default: recent)'))
            .addChoices(
              { name: '최신순', value: 'recent' },
              { name: '인기순', value: 'popular' },
            ),
        ),
    run: async (ctx, interaction) => { await handleGallery(ctx, interaction); },
  },
  {
    name: '프로필',
    builder: () =>
      new SlashCommandBuilder()
        .setName('프로필')
        .setNameLocalizations(enUS('profile'))
        .setDescription('친밀도·기분·일정·기념일·뉴스 키워드 대시보드')
        .setDescriptionLocalizations(enUS('Your relationship & schedule dashboard')),
    run: async (ctx, interaction) => { await handleProfile(ctx, interaction); },
  },
  {
    name: '사용량',
    builder: () =>
      new SlashCommandBuilder()
        .setName('사용량')
        .setNameLocalizations(enUS('usage'))
        .setDescription('이미지 생성 비용 대시보드 (모델별/일별 집계)')
        .setDescriptionLocalizations(enUS('Image generation cost dashboard')),
    run: async (ctx, interaction) => { await handleCost(ctx, interaction); },
  },
  {
    name: '결산',
    builder: () =>
      new SlashCommandBuilder()
        .setName('결산')
        .setNameLocalizations(enUS('wrapped'))
        .setDescription('우리 서버 결산 카드 — 수다왕·인기상·새벽 유령')
        .setDescriptionLocalizations(enUS('Server wrapped card'))
        .addIntegerOption((option) =>
          option
            .setName('기간')
            .setNameLocalizations(enUS('range'))
            .setDescription('며칠치를 볼지 (기본: 7일)')
            .setDescriptionLocalizations(enUS('How many days (default: 7)'))
            .addChoices(
              { name: '오늘', value: 1 },
              { name: '최근 7일', value: 7 },
              { name: '최근 30일', value: 30 },
              { name: '올해 (365일)', value: 365 },
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName('매주')
            .setNameLocalizations(enUS('weekly'))
            .setDescription('월요일 아침마다 이 채널로 자동 게시 (켜기/끄기)')
            .setDescriptionLocalizations(enUS('Post automatically every Monday morning')),
        )
        .addBooleanOption((option) =>
          option
            .setName('자세히')
            .setNameLocalizations(enUS('raw'))
            .setDescription('원시 수치 + 저장 상태 (나만 보임 · 디버그용)')
            .setDescriptionLocalizations(enUS('Raw counters & save state (ephemeral, debug)')),
        ),
    run: async (ctx, interaction) => { await handleWrapped(ctx, interaction); },
    public: true,
  },
  {
    name: 'atkup',
    builder: atkupCommandGroup,
    run: async (ctx, interaction) => {
      switch (interaction.options.getSubcommand()) {
        case 'unity': await handleAtkupUnity(ctx, interaction); break;
        default: await interaction.reply(ephemeral('알 수 없는 atkup 하위 명령입니다.'));
      }
    },
  },
];

export const SLASH_BY_NAME: ReadonlyMap<string, SlashCommand> = new Map(
  SLASH_COMMANDS.map((c) => [c.name, c]),
);
