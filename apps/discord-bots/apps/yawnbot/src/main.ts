/**
 * YawnBot — Node.js Discord Bot (game bot)
 * 기존 apps/yawnbot-server/src/index.ts 기반
 */
import './load-env';
import './install-console-timestamps';
import dns from 'node:dns';
import { generateDependencyReport } from '@discordjs/voice';
import sodium from 'libsodium-wrappers';
import { Client, GatewayIntentBits, Partials, TextChannel, type Embed, type MessageReaction, type PartialMessageReaction, type User, type PartialUser } from 'discord.js';
import { parseCommaSeparatedEnv } from '@discord-bots/common';
import { destroyAllVoiceConnections } from './bot/voice-connection';
import { destroyAllMusicPlayers, setMusicDiscordClient, setMusicPlayFailureReporter } from './bot/music-player';
import type { GenerativeTextClient } from 'karmolab-ai/node';
import { tryCreateGenerativeTextFromEnv } from 'karmolab-ai/node';

import { GameDataService } from './services/gamedata';
import { EnhancementService } from './services/enhancement';
import { StockService } from './services/stock';
import { RaidService } from './services/raid';
import { MemoryService } from './services/memory-service';
import { CharacterService, type CharacterCard } from './services/character-service';
import { ScheduleService } from './services/schedule-service';
import { MoodService } from './services/mood-service';
import { AnniversaryService } from './services/anniversary-service';
import { RelationshipService } from './services/relationship-service';
import { NewsService } from './services/news-service';
import { getImageAttachment } from './bot/attachments';
import { handleMeme } from './bot/meme';
import { handleButtonInteraction } from './bot/buttons';
import { dispatchSlashCommand, dispatchAutocomplete } from './bot/slash/router';
import { createGithubWebhookApp } from './bot/webhook';
import { mountLocalWebhook, sendLocalEvent } from './bot/local-webhook';
import { mountDeviceLog } from './bot/device-log';
import { mountWrappedWeb } from './bot/wrapped-web';
import { makeThreadRouter, extractTaskId } from './bot/agent-thread-router';
import { recordDecision } from './bot/agent-decisions';
import { getDefaultChannels, hasAnyRoute } from './services/webhook-routes';
import {
  isProvisioningEnabled,
  shouldProvisionGuild,
  reconcileGuildChannels,
  rememberMap,
  getChannelSpec,
  effectiveCategoryName,
  type GuildLike,
} from './services/channel-provision';
import { startPresenceRotation, stopPresenceRotation } from './bot/presence-rotation';
import { handleAssistantMessage } from './bot/assistant-handler';
import { isBrainCapture, handleBrainCapture } from './bot/brain-capture';
import { isTeamRoomMessage, setBudgetReserve, agentChannelId } from './bot/team-room';
import { isOwnAgentWebhook, sendAsSkin } from './bot/agent-webhook';
import { buildGovernanceReserve, defaultNotify, setTeamBusNotify } from './bot/governance-adapter';
import { checkMemoPushScope } from './services/memo-push';
import type { ClientLike } from './bot/forum-post';
import type { RecoveryClientLike } from './bot/forum-tag-recovery';
import type { ForumDedupClientLike } from './bot/forum-dedup';
import { loadCoreDef } from './services/agent-core';
import { getLocalChannels } from './services/webhook-routes';
import { startProactive, stopProactive, sendStartupGreeting, startScheduleReminder, startSpontaneous } from './bot/proactive';
import { handleReaction } from './bot/reactions';
import { loadOpsReportContext, reportStartup, reportShutdown, reportError, reportHeartbeat, reportCharStateSnapshot, reportMemoSync } from './services/ops-self-report';
import { startHeartbeat, stopHeartbeat } from './services/heartbeat';
import {
  startCharacterStateSnapshot,
  stopCharacterStateSnapshot,
} from './services/character-state-snapshot';
import { startMemoSync, stopMemoSync } from './services/memo-sync';
import { startUnityFreeNotifier, stopUnityFreeNotifier } from './services/notifiers/unity-free';
import { getServerStatsRecorder } from './services/server-stats';
import { startWeeklyWrapped, stopWeeklyWrapped } from './services/notifiers/weekly-wrapped';
import { startNewsNotifier, stopNewsNotifier } from './services/notifiers/news';
import { startBrainResurface, stopBrainResurface } from './services/notifiers/brain-resurface';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

setMusicPlayFailureReporter(async ({ textChannelId, title, reason }) => {
  try {
    const safeTitle = title.replace(/\*\*/g, '').slice(0, 100);
    const raw = reason.replace(/\s+/g, ' ').trim().slice(0, 180);
    const ch = await client.channels.fetch(textChannelId);
    if (!ch?.isTextBased() || ch.isDMBased()) return;
    await ch.send({
      content: `건너뜀(재생 실패): **${safeTitle}** — ${raw}`.slice(0, 500),
    });
  } catch {
    /* ignore */
  }
});

const gameData = new GameDataService();
const enhancement = new EnhancementService(gameData);
const stock = new StockService(gameData);
const raid = new RaidService(gameData);

const memoRepoPath = process.env.MEMO_REPO_PATH?.trim() || '';
const characterService = memoRepoPath
  ? new CharacterService(
      memoRepoPath,
      process.env.ASSISTANT_DEFAULT_CHARACTER?.trim() || 'yawn',
    )
  : null;

/**
 * 슬러그별 서비스 lazy 캐시 팩토리 (TASK-YB-026 slice 1).
 * Map + lazy init + memoRepoPath 가드 = 단일 정본. 호출자는 factory 만 제공.
 * deletion test: 제거 시 위 boilerplate 가 6 caller 로 재출현 → deep.
 */
type SlugCache<T> = ((slug: string) => T) & { dispose: (visit?: (value: T) => void) => void };
function createSlugCache<T>(label: string, factory: (slug: string) => T): SlugCache<T> {
  const cache = new Map<string, T>();
  const get = (slug: string): T => {
    const hit = cache.get(slug);
    if (hit) return hit;
    if (!memoRepoPath) throw new Error(`MEMO_REPO_PATH 미설정 — ${label} 생성 불가`);
    const created = factory(slug);
    cache.set(slug, created);
    return created;
  };
  return Object.assign(get, {
    dispose: (visit?: (value: T) => void): void => {
      if (visit) for (const v of cache.values()) visit(v);
      cache.clear();
    },
  });
}

const charDirOf = (slug: string): string => `${memoRepoPath}/characters/${slug}`;

const getMemory = createSlugCache('MemoryService', (slug) => {
  const m = new MemoryService(memoRepoPath, slug);
  m.initialize();
  return m;
});
const getSchedule = createSlugCache('ScheduleService', (slug) => new ScheduleService(memoRepoPath, slug));
const getMood = createSlugCache('MoodService', (slug) => new MoodService(memoRepoPath, slug));
const getAnniversary = createSlugCache('AnniversaryService', (slug) => new AnniversaryService(memoRepoPath, slug));
const getNews = createSlugCache('NewsService', (slug) => new NewsService(charDirOf(slug)));
const getRelationship = createSlugCache('RelationshipService', (slug) => new RelationshipService(charDirOf(slug)));

const ADMIN_IDS = parseCommaSeparatedEnv(process.env.ADMIN_IDS);
const OWNER_ID = process.env.ASSISTANT_USER_ID?.trim() || '';

/** 운영 자기보고 (TASK-YB-002-D) — channelId 미설정 시 null = 모든 report no-op */
const opsCtx = loadOpsReportContext();
if (!opsCtx) {
  console.warn('[OpsReport] YAWNBOT_OPS_REPORT_CHANNEL_ID 미설정 — 운영 자기보고 비활성');
}

function isAdmin(userId: unknown) {
  return ADMIN_IDS.includes(String(userId));
}

function isOwner(userId: unknown) {
  return !!OWNER_ID && String(userId) === OWNER_ID;
}

const cursorState = { inFlight: false };

let generativeText: GenerativeTextClient | null = null;
try {
  generativeText = tryCreateGenerativeTextFromEnv();
  if (generativeText) {
    console.log(`[Gemini] AI 초기화 완료 (surface=${generativeText.surface})`);
  }
} catch (e: unknown) {
  console.warn('[Gemini] 초기화 실패 (선택 기능):', e instanceof Error ? e.message : String(e));
}

function buildCtx() {
  return {
    client,
    gameData,
    enhancement,
    stock,
    raid,
    characterService,
    getMemory: memoRepoPath ? getMemory : null,
    getSchedule: memoRepoPath ? getSchedule : null,
    getMood: memoRepoPath ? getMood : null,
    getRelationship: memoRepoPath ? getRelationship : null,
    getNews: memoRepoPath ? getNews : null,
    getAnniversary: memoRepoPath ? getAnniversary : null,
    getImageAttachment,
    isAdmin,
    isOwner,
    generativeText,
    cursorState,
    memoRepoPath: memoRepoPath || null,
  };
}

client.on('interactionCreate', async (interaction) => {
  const ctx = buildCtx();
  if (interaction.isButton()) {
    await handleButtonInteraction(ctx, interaction);
    return;
  }
  if (interaction.isAutocomplete()) {
    await dispatchAutocomplete(ctx, interaction);
    return;
  }
  if (interaction.isChatInputCommand()) {
    await dispatchSlashCommand(ctx, interaction);
  }
});

client.on('messageReactionAdd', async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
  await handleReaction(buildCtx(), reaction, user).catch((e) =>
    console.error('[ReactionAdd]', e instanceof Error ? e.message : e),
  );
});

// TASK-YB-042 서버 결산: 사람 메시지·반응만 센다 (내용 저장 X, 길이·시각·이모지만).
// 별 핸들러 = 기존 핸들러 흐름 비간섭. 집계 실패가 봇을 절대 막지 않는다.
client.on('messageCreate', (message) => {
  try {
    if (message.author.bot || !message.guildId) return;
    getServerStatsRecorder().onMessage({
      guildId: message.guildId,
      userId: message.author.id,
      userName: message.member?.displayName || message.author.username,
      channelId: message.channelId,
      content: message.content || '',
      at: message.createdAt,
    });
  } catch (e) {
    console.warn('[ServerStats] 메시지 집계 실패:', e instanceof Error ? e.message : e);
  }
});

client.on('messageReactionAdd', (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
  try {
    const guildId = reaction.message.guildId;
    if (!guildId || user.bot) return;
    const author = reaction.message.author;
    getServerStatsRecorder().onReaction({
      guildId,
      giverId: user.id,
      giverName: user.username ?? user.id,
      // 봇 발화가 받은 반응은 「인기상」에서 뺀다 — 사람 경쟁이라야 자랑거리가 된다.
      authorId: author && !author.bot ? author.id : null,
      authorName: author && !author.bot ? author.username : null,
      emojiName: reaction.emoji.name ?? '',
      at: new Date(),
    });
  } catch (e) {
    console.warn('[ServerStats] 반응 집계 실패:', e instanceof Error ? e.message : e);
  }
});

// KAR-018-Y 양방향 스레드 (발단 완료조건 #2 "escalation 승인 루프 닫힘"):
// 워커가 TASK 스레드에 "A/B?" 물으면 사용자가 그 스레드에 답글 → 여기서
// 결정을 agent-decisions 원장에 기록.
// 별 핸들러(기존 핸들러 루프가드 비간섭). 스레드명=TASK id 만 대상.
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot || !memoRepoPath) return;
    const ch = message.channel;
    if (!ch.isThread()) return;
    const taskId = extractTaskId(ch.name || '');
    if (!taskId) return;
    const text = (message.content || '').trim();
    if (!text) return;
    const ok = recordDecision(memoRepoPath, {
      taskId,
      text,
      by: message.author.username,
    });
    await message
      .reply(
        ok
          ? `✅ 결정 기록 — 다음 \`${taskId}\` 워커 픽업에 반영됩니다.`
          : `⚠ 결정 기록 실패(파일). 다시 시도해 주세요.`,
      )
      .catch(() => undefined);
  } catch {
    /* 결정 캡처 실패가 봇 막지 X */
  }
});

client.on('messageCreate', async (message) => {
  const isBot = message.author.bot;
  // ★ race-free 루프가드 (KAR-018-A 회귀 근본 fix): 우리 agent webhook 발화는
  // *무조건* drop. per-message-id 가드(handler ①)는 register-after-send race
  // 가 있어 자기 답장을 재인입 → 무한 self-loop. webhook id 는 생성 시 확정 →
  // race 0. agent↔agent 는 dispatcher(sub-B)가 내부 구동, 재인입 아님.
  if (isBot && isOwnAgentWebhook(message.webhookId)) return;
  // 팀 방(코어 바인딩 채널) webhook = 에이전트↔에이전트 → handler 로 통과
  // (handler 루프가드 ① 가 자기 webhook 은 drop). 그 외 bot 은 기존대로 무시. (KAR-018-A sub-A-1)
  const teamWebhook =
    isBot && !!message.webhookId && !!characterService &&
    isTeamRoomMessage(characterService, message);
  if (isBot && !teamWebhook) return;
  // 뇌 캡처 인터셉트 — DM에서 `뇌: <내용>` 형태면 외장 뇌로 저장 후 return
  const isDM = message.channel.isDMBased();
  const assistantUserId = process.env.ASSISTANT_USER_ID?.trim();
  if (isDM && memoRepoPath && assistantUserId && message.author.id === assistantUserId && isBrainCapture(message.content)) {
    await handleBrainCapture(message, memoRepoPath);
    return;
  }

  if (characterService) {
    await handleAssistantMessage(message, characterService, getMemory, memoRepoPath ? getMood : undefined, memoRepoPath ? getRelationship : undefined);
  }
  if (!isBot) await handleMeme(message);
});

// KAR-018-LT-DIVERSITY D-2: #team-bus 메시지 → agent-bus publish (인바운드 bridge).
// 코어 daemon 들이 subscribe 하여 ambient 판단(답/읽씹) 입력으로 사용.
// 자기 코어 발화(isOwnAgentWebhook) = skip — daemon 이 자체 core-utter 로 이미 publish.
// 외부 bot·사용자 메시지만 → bus 인입.
client.on('messageCreate', async (message) => {
  try {
    const targetCh = agentChannelId();
    if (!targetCh || message.channelId !== targetCh) return;
    if (message.author.bot && isOwnAgentWebhook(message.webhookId)) return;
    const { publishBusEvent, resolveBusRoot } = await import('./services/agent-bus.js');
    await publishBusEvent(resolveBusRoot(), {
      type: 'channel-msg',
      channelId: targetCh,
      source: message.author.bot ? 'discord:bot' : 'discord:user',
      text: message.content || '',
      refs: {
        messageId: message.id,
        author: message.author.username,
      },
    });
  } catch (e) {
    console.error(
      '[agent-bus] inbound publish 실패',
      e instanceof Error ? e.message : e,
    );
  }
});

// KAR-018-LT-DIVERSITY D-2 (outbound): agent-bus core-utter → Discord post.
// daemon process 가 publish 한 발화 → 봇이 받아서 채널에 webhook post.
// daemon = Discord client 무관, 본 어댑터가 thin bridge.
let agentBusSubscription: { stop: () => void } | null = null;

const app = createGithubWebhookApp(client, gameData);
mountLocalWebhook(app, client);
// TASK-WM-201 — 폰(WM Android)이 밀어 넣는 실행 로그 수신 + 웹 뷰어 + tail.
mountDeviceLog(app, client);
// TASK-YB-042 — 웹 결산 페이지. 자랑은 디스코드 밖에서 일어나야 유입이 된다.
mountWrappedWeb(app, client);

client.once('clientReady', async () => {
  setMusicDiscordClient(client);
  // KAR-018-LT-DIVERSITY D-2 outbound: agent-bus core-utter → Discord webhook post.
  try {
    const { subscribeBusEvents, resolveBusRoot } = await import('./services/agent-bus.js');
    const targetCh = agentChannelId();
    if (targetCh && memoRepoPath && characterService) {
      const busRoot = resolveBusRoot();
      agentBusSubscription = subscribeBusEvents(
        busRoot,
        targetCh,
        async (event) => {
          if (event.type !== 'core-utter' || !event.coreId || !event.text) return;
          try {
            const core = loadCoreDef(memoRepoPath!, event.coreId);
            if (!core || core.status !== 'active') return;
            const card = characterService!.loadCard(core.defaultSkin);
            if (!card) return;
            const ch = await client.channels.fetch(targetCh);
            if (!ch?.isTextBased()) return;
            // KAR-018-LT-DIVERSITY: 발화에 *어떤 메시지에 대한 답*인지 자연 인용 prefix.
            // 사용자 push back 2026-05-23: "갑자기 지혼자 이렇게 말하는데, 최소한 뭘 대상을
            // 말하는지는 알 수 있어야 할 것 같은데" — 컨텍스트 단절 fix.
            const refs = event.refs;
            let prefix = '';
            if (refs?.parentAuthor && refs?.parentSnippet) {
              const author = refs.parentAuthor.replace(/[<>@*_`~]/g, '');
              const snippet = refs.parentSnippet.replace(/\s+/g, ' ').trim().slice(0, 100);
              const ellipsis = (refs.parentSnippet?.length ?? 0) > 100 ? '…' : '';
              prefix = `> ↩ **${author}**: ${snippet}${ellipsis}\n\n`;
            }
            await sendAsSkin(ch as TextChannel, card, { content: prefix + event.text });
          } catch (e) {
            console.error('[agent-bus] outbound post 실패', e instanceof Error ? e.message : e);
          }
        },
        {
          intervalMs: 500,
          onError: (e) => console.error('[agent-bus] outbound tail error', e.message),
        },
      );
      console.log(`[agent-bus] outbound bridge ON channel=${targetCh} root=${busRoot}`);
    }
  } catch (e) {
    console.error('[agent-bus] outbound init 실패', e instanceof Error ? e.message : e);
  }

  console.log(`\n  ⚔️  YawnBot (Node.js)`);
  console.log(`  ─────────────────────────`);
  console.log(`  로그인: ${client.user?.tag}`);
  console.log(`  서버:   ${client.guilds.cache.size}개`);
  console.log(`  유저:   ${Object.keys(gameData.users).length}명 데이터 로드`);
  console.log('');

  stock.startMarket();

  // 채널 자동 프로비저닝 (dev·prod 공통 — 옛 하드코딩 채널 폐기). 허용 길드
  // (YAWNBOT_ALLOWED_GUILD_IDS)만 — 봇이 초대된 친구 서버 등엔 손대지 않음.
  // 인사·notifier 시작 *전* 에 reconcile → resolver(channelIdFor)가 즉시 신선.
  if (isProvisioningEnabled()) {
    const spec = getChannelSpec();
    for (const guild of client.guilds.cache.values()) {
      if (!shouldProvisionGuild(guild.id)) continue;
      const canManage = guild.members.me?.permissions.has('ManageChannels') ?? false;
      if (!canManage) {
        console.warn(
          `[ChannelProvision] ${guild.name}(${guild.id}) — ManageChannels 권한 없음, env 채널 ID 폴백 사용 (봇 초대 권한 확인 필요)`,
        );
        continue;
      }
      try {
        const r = await reconcileGuildChannels(guild as unknown as GuildLike, spec);
        rememberMap(r.guildId, r.map);
        // KAR-018-V 라벨 추종 근본: atlas 코어를 *현 provisioned agent-team
        // 채널*에 자동 바인딩. 프로비저닝이 채널 id 를 바꿔도 매 부팅
        // 추종 → "에이전트가 사라짐"(하드코딩 ID 스테일) 영구 차단.
        const agentTeamId = r.map['agent-team'];
        if (agentTeamId && characterService) {
          characterService.bindChannel(agentTeamId, 'atlas', 'alisa');
          console.log(
            `[AgentBind] atlas → provisioned agent-team 채널 ${agentTeamId} (라벨 추종, 하드코딩 X)`,
          );
        }
        console.log(
          `[ChannelProvision] ${guild.name}: 카테고리「${effectiveCategoryName(spec)}」/ 생성 ${r.created.length} · claim ${r.claimed.length} · 재사용 ${r.reused.length}`,
        );
      } catch (e: unknown) {
        console.error(
          `[ChannelProvision] ${guild.name}(${guild.id}) reconcile 실패 — env 폴백:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }
  }

  // TASK-YB-039 P6: 기존 ready/in_progress/seed TASK 들을 #team-work
  // forum-post 로 1회 시드 (멱등 — ledger 박힌 건 skip). 채널 프로비저닝
  // *뒤* 호출해서 agent-work channelId 신선 보장. best-effort — 실패해도
  // boot 자체 진행.
  try {
    const { runTaskForumBackfillOnce } = await import('./bot/task-forum-backfill.js');
    await runTaskForumBackfillOnce(client as unknown as ClientLike, process.env);
  } catch (e) {
    console.error(
      '[TaskForumBackfill] 부팅 backfill 실패:',
      e instanceof Error ? e.message : e,
    );
  }

  // 부팅 태그 복원: 채널 재프로비저닝으로 availableTags ID 가 새로 발급된 경우
  // 기존 포스트의 appliedTags 가 stale ID 참조 → 태그 소실. 1회 전수 점검·복원.
  try {
    const { recoverForumTagsOnce } = await import('./bot/forum-tag-recovery.js');
    await recoverForumTagsOnce(client as unknown as RecoveryClientLike, process.env);
  } catch (e) {
    console.error(
      '[ForumTagRecovery] 부팅 태그 복원 실패:',
      e instanceof Error ? e.message : e,
    );
  }

  // TASK-YB-039 P5: md status drift → #team-work forum 태그 sync (단방향
  // md=정본). 부팅 1회 + 주기 5분 (env override 가능). 멱등 — last-applied
  // 캐시로 변화 없는 entry 는 API 미호출.
  try {
    const { reconcileTaskForumStatusOnce, startTaskForumReconciler } =
      await import('./bot/task-forum-reconciler.js');
    await reconcileTaskForumStatusOnce(client as unknown as ClientLike, process.env);
    startTaskForumReconciler(client as unknown as ClientLike, process.env);
  } catch (e) {
    console.error(
      '[TaskForumReconciler] 부팅 sync 실패:',
      e instanceof Error ? e.message : e,
    );
  }

  // KAR-150: "TASK당 forum-post 1개" 불변식. 예방 = backfill 이 생성 전 Discord
  // ground-truth 확인(원장 단일실패점 보강). 여기 = 비파괴 감사 — 중복 *감지*만
  // (원장 heal + WARN/알림). **삭제 안 함** (포스트 내 사람 소통 가능 → 삭제는 최후
  // 수단·수동: node memo/scripts/forum-dedupe.mjs). 부팅 1회 + 주기(기본 60분).
  try {
    const { auditForumDupsOnce } = await import('./bot/forum-dedup.js');
    await auditForumDupsOnce(client as unknown as ForumDedupClientLike, process.env);
    const dedupMin = parseInt(
      process.env.YAWNBOT_FORUM_DEDUP_INTERVAL_MIN || '60',
      10,
    );
    const dedupTimer = setInterval(() => {
      void import('./bot/forum-dedup.js')
        .then(({ auditForumDupsOnce: tick }) =>
          tick(client as unknown as ForumDedupClientLike, process.env),
        )
        .catch((err) =>
          console.error(
            '[ForumDedup] tick 실패:',
            err instanceof Error ? err.message : err,
          ),
        );
    }, Math.max(60_000, dedupMin * 60_000));
    if (typeof dedupTimer.unref === 'function') dedupTimer.unref();
  } catch (e) {
    console.error('[ForumDedup] 부팅 감사 실패:', e instanceof Error ? e.message : e);
  }

  const greetingChannelIds = getDefaultChannels();
  for (const channelId of greetingChannelIds) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      const version = process.env.npm_package_version || '1.0.0';
      const greeting = gameData.getMessage('Server_Startup_Greeting', version);
      await channel.send(greeting).catch((e: unknown) => console.error('[Startup] 인사 메시지 전송 실패:', e instanceof Error ? e.message : String(e)));
    }
  }

  startPresenceRotation(client);
  startUnityFreeNotifier(client);
  // TASK-YB-021: outbound heartbeat (push 모델, 자체 구현 — 제3자 의존 0).
  // 봇이 memo orphan 브랜치에 시각 기록 → github.io Actions watcher 가 신선도
  // 감시. 인증 = 기존 MEMO_GITHUB_PAT(digest-webhook 과 동일). egress 단절은
  // inbound·외부 watcher 사각이라 ops-report 로도 alert (상태 전이 1회).
  startHeartbeat({
    token: process.env.MEMO_GITHUB_PAT || process.env.GITHUB_TOKEN,
    repo: process.env.YAWNBOT_HEARTBEAT_REPO,
    branch: process.env.YAWNBOT_HEARTBEAT_BRANCH,
    path: process.env.YAWNBOT_HEARTBEAT_PATH,
    intervalMin: process.env.YAWNBOT_HEARTBEAT_INTERVAL_MIN
      ? parseInt(process.env.YAWNBOT_HEARTBEAT_INTERVAL_MIN, 10)
      : undefined,
    alert: opsCtx ? (event) => void reportHeartbeat(opsCtx, event) : undefined,
  });

  // TASK-KAR-CHARSTATE: 캐릭터 런타임 내구 스냅샷 (heartbeat 패턴 미러).
  // KAR-MEMOSYNC part2 가 캐릭터 런타임(mood/relationship/.active/memory)을
  // git untrack → divergence 동결은 해소됐으나 git 백업·이력·복원이 사라짐.
  // 본 서비스가 단일-writer(prod 봇만) 로 memo orphan 브랜치에 스냅샷 →
  // divergence 0 유지하며 durable. 로컬 git 무관 = race 0 (heartbeat 동형).
  startCharacterStateSnapshot({
    token: process.env.MEMO_GITHUB_PAT || process.env.GITHUB_TOKEN,
    memoRepoPath: memoRepoPath || undefined,
    repo: process.env.YAWNBOT_CHARSTATE_REPO,
    branch: process.env.YAWNBOT_CHARSTATE_BRANCH,
    path: process.env.YAWNBOT_CHARSTATE_PATH,
    intervalMin: process.env.YAWNBOT_CHARSTATE_INTERVAL_MIN
      ? parseInt(process.env.YAWNBOT_CHARSTATE_INTERVAL_MIN, 10)
      : undefined,
    alert: opsCtx ? (event) => void reportCharStateSnapshot(opsCtx, event) : undefined,
  });

  // TASK-KAR-MEMOSYNC part4: prod memo 자동 동기 (heartbeat 패턴 미러).
  // 현 memo-sync 는 github.io deploy 안에서만 → memo-only 변경(TASK·agent
  // core·rules)이 deploy 없으면 prod 미반영(실증: wm-worker inactive 적용에
  // deploy 수동 트리거 강제). 봇이 *스스로* memo fetch+reset --hard 를
  // (a) 주기(env interval) (b) 이벤트 전(worker tick 직전 freshness hook,
  // agent-cadence 측 호출) 으로 수행. part2/3 로 reset --hard 가 결정적·
  // 안전(런타임 untracked, divergence 구조적 0) → 자주 돌려도 무해.
  // deploy "Sync prod memo" 스텝과 동일 시맨틱(평행정의 X).
  startMemoSync({
    token: process.env.MEMO_GITHUB_PAT || process.env.GITHUB_TOKEN,
    memoRepoPath: memoRepoPath || undefined,
    repoSlug: process.env.YAWNBOT_MEMOSYNC_REPO_SLUG,
    branch: process.env.YAWNBOT_MEMOSYNC_BRANCH,
    intervalMin: process.env.YAWNBOT_MEMOSYNC_INTERVAL_MIN
      ? parseInt(process.env.YAWNBOT_MEMOSYNC_INTERVAL_MIN, 10)
      : undefined,
    alert: opsCtx ? (event) => void reportMemoSync(opsCtx, event) : undefined,
  });

  if (characterService) {
    characterService.initialize();
    // default 슬러그 MemoryService 선-초기화 (stub 파일 준비)
    getMemory(characterService.getDefaultSlug());
    startProactive(client, characterService, getMemory, memoRepoPath ? getMood : undefined, memoRepoPath || undefined, memoRepoPath ? getAnniversary : undefined);
    startScheduleReminder(client, characterService, getSchedule);
    startSpontaneous(client, characterService, getMemory, memoRepoPath ? getMood : undefined, memoRepoPath ? getSchedule : undefined, memoRepoPath ? getNews : undefined);
    if (memoRepoPath) startNewsNotifier(client, getNews, characterService.getDefaultSlug());
    // TASK-YB-042: 켠 서버에만 간다 (기본 꺼짐) — memo 저장소와 무관하므로 조건 없이 시작.
    startWeeklyWrapped(client);
    if (memoRepoPath) startBrainResurface(client, memoRepoPath);
    setBudgetReserve(buildGovernanceReserve(process.env)); // ④ 거버넌스 (KAR-018-D slice-2) — 이벤트·cadence 공통 reserve seam + 전역 !kill
    // KAR-018-W: 에이전트 팀 #team-bus 실 Discord 게시 배선 (전 엔진 단일 seam).
    // sendLocalEvent = webhook-routes 정본 재사용(평행정의0). 미주입 시 trace만(graceful).
    const agentCh = agentChannelId(); // prod=null(webhook-routes) / dev=전용 채널
    const agentChOverride = agentCh ? [agentCh] : undefined;
    // KAR-018-Y: TASK 당 스레드 라우팅 + 전문 청크(트렁케이트 폐기,
    // 사용자 페인 직격). taskId 없는 팀-공통(하트비트 등)=기존 embed
    // 폴백. 스레드 불가/실패도 폴백(무손실 우선).
    const teamBusFallback = (msg: string): void => {
      void sendLocalEvent(
        client,
        {
          kind: 'agent-team',
          source: 'KAR-018 에이전트 팀',
          title: '🛰 에이전트 팀',
          summary: String(msg).slice(0, 3900),
          level: 'info',
        },
        agentChOverride,
      );
    };
    setTeamBusNotify(
      makeThreadRouter(client, {
        resolveChannelId: () =>
          agentCh ?? getLocalChannels('agent-team')[0] ?? null,
        fallback: teamBusFallback,
        // 2026-05-23 사용자 피드백 "텍스트랑 채팅이 너무 많고 정신없음" fix:
        // TASK-id 추출 실패 메시지(digest·ticker·qc·등)는 메인 채널 spam X.
        // 정보 통합 = status board 1개 메시지 (cadence INIT 후 매 tick edit).
        // env `AGENT_NOTIFY_FALLBACK=fallback` 으로 명시적 override 가능.
        onMissingTask:
          process.env.AGENT_NOTIFY_FALLBACK?.trim() === 'fallback'
            ? 'fallback'
            : 'silent',
      }),
    );
    // memo push pre-flight — MEMO_GITHUB_PAT 가 memo push 권한 있는지 startup
    // 1회 검증. 소비처 = brain-capture(뇌 캡처) / task-status-sync(PR merge →
    // TASK status). 부족 시 알림 (silent fail 회피). 비차단.
    try {
      const scope = await checkMemoPushScope(process.env);
      if (!scope.ok) {
        console.warn(`[memo-push] preflight FAIL: ${scope.error}`);
        defaultNotify(process.env)(
          `🔐 memo-push pre-flight FAIL — ${scope.error}. memo 자동 커밋(뇌 캡처 / TASK status sync)이 silent fail 상태. 사용자 secret 또는 PAT 점검 필요.`,
        );
      } else if (scope.canPush === false) {
        console.warn(`[memo-push] preflight: token OK but push permission missing (scopes=${scope.scopes})`);
        defaultNotify(process.env)(
          `🔐 memo-push pre-flight: MEMO_GITHUB_PAT 인증 OK 이나 push 권한 없음 (scopes=${scope.scopes || '<empty>'}). PAT 에 repo (classic) 또는 Contents+Pull requests Write (fine-grained) 권한 보강 필요.`,
        );
      } else {
        console.log(`[memo-push] preflight OK: canPush=true scopes=${scope.scopes || '<fine-grained>'}`);
      }
    } catch (e) {
      console.warn(`[memo-push] preflight exception: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sendStartupGreeting(client, characterService, getMemory);
    console.log(
      '[Assistant] AI 비서 활성화 (ASSISTANT_USER_ID:',
      process.env.ASSISTANT_USER_ID,
      ', default:',
      characterService.getDefaultSlug(),
      ')',
    );
  } else {
    console.warn('[Assistant] MEMO_REPO_PATH 미설정 — AI 비서 비활성화');
  }

  if (opsCtx) {
    await reportStartup(opsCtx, {
      botTag: client.user?.tag ?? 'unknown',
      guilds: client.guilds.cache.size,
      users: Object.keys(gameData.users).length,
    });
  }
});

async function main() {
  /** Discord 음성 UDP가 IPv6 경로에서만 막히는 환경 완화 (Node 17+) */
  if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
    console.log('[voice] DNS: IPv4 우선 (음성 연결 안정화)');
  }
  if (process.env.VOICE_DEBUG === '1') {
    console.log('[voice] VOICE_DEBUG=1 — join 시 [voice] 디버그 로그 출력');
  }

  await gameData.initialize();

  /** 음성 암호화(sodium) 준비 전에 join하면 signalling↔connecting만 반복되는 경우가 많음 */
  console.log('[voice] dependency report:\n' + generateDependencyReport());
  await sodium.ready;
  console.log('[voice] libsodium 준비 완료');

  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) {
    console.error(
        '[YawnBot] DISCORD_TOKEN이 비어 있습니다. apps/yawnbot/.env 에 봇 토큰을 넣으세요. (Discord Developer Portal → 앱 → Bot → Token)',
    );
    process.exit(1);
  }

  try {
    await client.login(token);
  } catch (e: unknown) {
    if (e instanceof Error && (e as Error & { code?: string }).code === 'TokenInvalid') {
      console.error(
        '[YawnBot] TokenInvalid — 토큰이 만료되었거나 잘못되었습니다. Discord Developer Portal에서 Bot Token을 재발급하고 .env 의 DISCORD_TOKEN을 갱신하세요.',
      );
    }
    throw e;
  }

  /** GitHub POST 시 client.channels.fetch 를 쓰므로, Discord 준비 후에 HTTP 서버를 연다 */
  const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 4615;
  app.listen(WEBHOOK_PORT, () => {
    console.log(`[Webhook] GitHub Webhook 서버 시작: http://0.0.0.0:${WEBHOOK_PORT}/webhook/github`);
    if (!hasAnyRoute()) {
      console.warn(
        '[Webhook] data/webhook-routes.json 의 default·routes 가 모두 비어 있습니다 — 수신해도 디스코드로 보내지 않습니다.',
      );
    }
  });
}

function shutdownMemory(): void {
  getMemory.dispose((m) => {
    try {
      m.destroy();
    } catch (e: unknown) {
      console.warn('[Shutdown] memory destroy 실패:', e instanceof Error ? e.message : e);
    }
  });
}

async function gracefulShutdown(reason: string): Promise<void> {
  if (opsCtx) {
    await reportShutdown(opsCtx, reason);
  }
  setMusicDiscordClient(null);
  if (agentBusSubscription) {
    agentBusSubscription.stop();
    agentBusSubscription = null;
  }
  stopPresenceRotation();
  stopHeartbeat();
  stopCharacterStateSnapshot();
  stopMemoSync();
  stopUnityFreeNotifier();
  stopNewsNotifier();
  stopWeeklyWrapped();
  stopBrainResurface();
  stopProactive();
  stock.stopMarket();
  gameData.destroy();
  characterService?.commitIfDirty();
  getServerStatsRecorder().flush();
  shutdownMemory();
  destroyAllMusicPlayers();
  destroyAllVoiceConnections();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => {
  console.log('\n[Shutdown] 종료 중...');
  void gracefulShutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  if (opsCtx) void reportError(opsCtx, err, 'uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  if (opsCtx) void reportError(opsCtx, reason, 'unhandledRejection');
});

main().catch((err) => {
  console.error('[Fatal]', err);
  process.exit(1);
});
