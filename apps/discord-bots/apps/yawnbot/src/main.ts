/**
 * YawnBot — Node.js Discord Bot (game bot)
 * 기존 apps/yawnbot-server/src/index.ts 기반
 */
import './load-env';
import './install-console-timestamps';
import dns from 'node:dns';
import { generateDependencyReport } from '@discordjs/voice';
import sodium from 'libsodium-wrappers';
import { Client, GatewayIntentBits, Partials, type MessageReaction, type PartialMessageReaction, type User, type PartialUser } from 'discord.js';
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
import { CharacterService } from './services/character-service';
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
import { mountLocalWebhook } from './bot/local-webhook';
import { getDefaultChannels, hasAnyRoute } from './services/webhook-routes';
import { startPresenceRotation, stopPresenceRotation } from './bot/presence-rotation';
import { handleAssistantMessage } from './bot/assistant-handler';
import { isTeamRoomMessage, setBudgetReserve } from './bot/team-room';
import { buildGovernanceReserve } from './bot/governance-adapter';
import { startProactive, stopProactive, sendStartupGreeting, startScheduleReminder, startSpontaneous } from './bot/proactive';
import { startAgentCadence, stopAgentCadence } from './bot/agent-cadence';
import { handleReaction } from './bot/reactions';
import { loadOpsReportContext, reportStartup, reportShutdown, reportError } from './services/ops-self-report';
import { startUnityFreeNotifier, stopUnityFreeNotifier } from './services/notifiers/unity-free';

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
} catch (e: any) {
  console.warn('[Gemini] 초기화 실패 (선택 기능):', e?.message ?? e);
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
    await handleButtonInteraction(ctx as any, interaction as any);
    return;
  }
  if (interaction.isAutocomplete()) {
    await dispatchAutocomplete(ctx as any, interaction as any);
    return;
  }
  if (interaction.isChatInputCommand()) {
    await dispatchSlashCommand(ctx as any, interaction as any);
  }
});

client.on('messageReactionAdd', async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
  await handleReaction(buildCtx(), reaction, user).catch((e) =>
    console.error('[ReactionAdd]', e instanceof Error ? e.message : e),
  );
});

client.on('messageCreate', async (message) => {
  const isBot = message.author.bot;
  // 팀 방(코어 바인딩 채널) webhook = 에이전트↔에이전트 → handler 로 통과
  // (handler 루프가드 ① 가 자기 webhook 은 drop). 그 외 bot 은 기존대로 무시. (KAR-018-A sub-A-1)
  const teamWebhook =
    isBot && !!message.webhookId && !!characterService &&
    isTeamRoomMessage(characterService, message as any);
  if (isBot && !teamWebhook) return;
  if (characterService) {
    await handleAssistantMessage(message as any, characterService, getMemory, memoRepoPath ? getMood : undefined, memoRepoPath ? getRelationship : undefined);
  }
  if (!isBot) await handleMeme(message as any);
});

const app = createGithubWebhookApp(client as any, gameData as any);
mountLocalWebhook(app, client as any);

client.once('clientReady', async () => {
  setMusicDiscordClient(client);
  console.log(`\n  ⚔️  YawnBot (Node.js)`);
  console.log(`  ─────────────────────────`);
  console.log(`  로그인: ${client.user?.tag}`);
  console.log(`  서버:   ${client.guilds.cache.size}개`);
  console.log(`  유저:   ${Object.keys(gameData.users).length}명 데이터 로드`);
  console.log('');

  stock.startMarket();

  const greetingChannelIds = getDefaultChannels();
  for (const channelId of greetingChannelIds) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      const version = process.env.npm_package_version || '1.0.0';
      const greeting = gameData.getMessage('Server_Startup_Greeting', version);
      await channel.send(greeting).catch((e: any) => console.error('[Startup] 인사 메시지 전송 실패:', e?.message ?? e));
    }
  }

  startPresenceRotation(client);
  startUnityFreeNotifier(client);

  if (characterService) {
    characterService.initialize();
    // default 슬러그 MemoryService 선-초기화 (stub 파일 준비)
    getMemory(characterService.getDefaultSlug());
    startProactive(client, characterService, getMemory, memoRepoPath ? getMood : undefined, memoRepoPath || undefined, memoRepoPath ? getAnniversary : undefined);
    startScheduleReminder(client, characterService, getSchedule);
    startSpontaneous(client, characterService, getMemory, memoRepoPath ? getMood : undefined, memoRepoPath ? getSchedule : undefined, memoRepoPath ? getNews : undefined);
    setBudgetReserve(buildGovernanceReserve(process.env)); // ④ 거버넌스 (KAR-018-D slice-2) — 이벤트·cadence 공통 reserve seam + 전역 !kill
    startAgentCadence(process.env); // ⑦ 자율 cadence (KAR-018-B, default OFF — sub-D 후 ON)
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
  } catch (e: any) {
    if (e?.code === 'TokenInvalid') {
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
  stopPresenceRotation();
  stopUnityFreeNotifier();
  stopAgentCadence();
  stopProactive();
  stock.stopMarket();
  gameData.destroy();
  characterService?.commitIfDirty();
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
