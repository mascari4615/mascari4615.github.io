/**
 * YawnBot — Node.js Discord Bot (game bot)
 * 기존 apps/yawnbot-server/src/index.ts 기반
 */
import './load-env';
import './install-console-timestamps';
import dns from 'node:dns';
import { generateDependencyReport } from '@discordjs/voice';
import sodium from 'libsodium-wrappers';
import { Client, GatewayIntentBits, Partials, TextChannel, type MessageReaction, type PartialMessageReaction, type User, type PartialUser } from 'discord.js';
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
import { isTeamRoomMessage, setBudgetReserve, agentChannelId } from './bot/team-room';
import { isOwnAgentWebhook, sendAsSkin } from './bot/agent-webhook';
import { buildGovernanceReserve, setTeamBusNotify } from './bot/governance-adapter';
import { setProposalAnnouncer } from './bot/proposal-adapter';
import { announceProposal, reconcileProposalCards } from './bot/agent-bus';
import {
  loadCoreDef,
  listCoreIds,
  resolveProposalCore,
  coreLabel,
} from './services/agent-core';
import { getLocalChannels } from './services/webhook-routes';
import { startProactive, stopProactive, sendStartupGreeting, startScheduleReminder, startSpontaneous } from './bot/proactive';
import { startAgentCadence, stopAgentCadence, setCoreSpeak } from './bot/agent-cadence';
import { setDashboardSink } from './bot/team-dashboard';
import { handleReaction } from './bot/reactions';
import { loadOpsReportContext, reportStartup, reportShutdown, reportError, reportHeartbeat, reportCharStateSnapshot, reportMemoSync } from './services/ops-self-report';
import { startHeartbeat, stopHeartbeat } from './services/heartbeat';
import {
  startCharacterStateSnapshot,
  stopCharacterStateSnapshot,
} from './services/character-state-snapshot';
import { startMemoSync, stopMemoSync } from './services/memo-sync';
import { startUnityFreeNotifier, stopUnityFreeNotifier } from './services/notifiers/unity-free';
import { startNewsNotifier, stopNewsNotifier } from './services/notifiers/news';

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

// KAR-018-Y 양방향 스레드 (발단 완료조건 #2 "escalation 승인 루프 닫힘"):
// 워커가 TASK 스레드에 "A/B?" 물으면 사용자가 그 스레드에 답글 → 여기서
// 결정 기록 → 다음 워커 pickup 시 buildWorkerPrompt 가 임베드(자가구동).
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
    isTeamRoomMessage(characterService, message as any);
  if (isBot && !teamWebhook) return;
  if (characterService) {
    await handleAssistantMessage(message as any, characterService, getMemory, memoRepoPath ? getMood : undefined, memoRepoPath ? getRelationship : undefined);
  }
  if (!isBot) await handleMeme(message as any);
});

// KAR-018-LT: 팀 verdict → 카드 reconciler 타이머 핸들 (shutdown 정리).
let cardReconcileTimer: ReturnType<typeof setTimeout> | null = null;

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
      } catch (e: any) {
        console.error(
          `[ChannelProvision] ${guild.name}(${guild.id}) reconcile 실패 — env 폴백:`,
          e?.message ?? e,
        );
      }
    }
  }

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
        client as any,
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
      }),
    );
    // KAR-018-V R-4: 발굴 = *담당 코어*가 자기 정체로 게시 (복수 동료).
    // 도메인 라우팅(yb/디스코드 → echo, 그 외 → atlas) = 결정적·순수
    // (agent-core). 코어 정체성 소비(평행정의0, 재정의 X) — 단일 'atlas'
    // 하드코딩 폐기, agents/ 디렉토리가 정본. 라우팅 default=atlas =
    // 기존 전량 atlas 행동 보존(회귀 0).
    setProposalAnnouncer(async (a) => {
      const channelIds = agentCh
        ? [agentCh]
        : getLocalChannels('agent-team');
      const payload = a.envelope.payload as unknown as Record<
        string,
        unknown
      >;
      const coreId = resolveProposalCore(listCoreIds(memoRepoPath), {
        domain: typeof payload.domain === 'string' ? payload.domain : undefined,
        explicitCoreId:
          typeof payload.coreId === 'string' ? payload.coreId : undefined,
        text: `${a.target} ${JSON.stringify(payload)}`.slice(0, 2000),
      });
      const coreDef = memoRepoPath
        ? loadCoreDef(memoRepoPath, coreId)
        : null;
      // 코어의 스킨(목소리/아바타) 카드 = avatar 출처. 코어 정체명은
      // coreLabel(emoji+displayName) — 봇앱명·하드코딩 X.
      const skinCard = coreDef
        ? characterService?.loadCard(coreDef.defaultSkin) ?? null
        : null;
      await announceProposal(client as any, process.env, channelIds, {
        ...a,
        agent: coreDef
          ? {
              name: coreLabel(coreDef),
              avatarUrl: skinCard?.frontmatter?.avatar_url,
              coreId: coreDef.id,
            }
          : { name: '🛰 Atlas', coreId: 'atlas' },
      });
    });
    // KAR-018-Y-1 코어↔코어 대화: 응답 코어가 *자기 정체*(coreLabel +
    // 스킨 아바타)로 #team-bus 에 발화 = 팀이 실제로 대화. announcer 와
    // 동일 identity 패턴(평행정의0). dispatcher 내부 구동 — Discord
    // 재인입 X(self-loop 안전 불변). 미배선/실패 = cadence 가 NotifyFn
    // 폴백(무음 손실 0).
    setCoreSpeak(async (coreId, text) => {
      try {
        if (!memoRepoPath || !characterService) return false;
        const cd = loadCoreDef(memoRepoPath, coreId);
        if (!cd) return false;
        const skinCard = characterService.loadCard(cd.defaultSkin);
        if (!skinCard) return false;
        const ids = agentCh ? [agentCh] : getLocalChannels('agent-team');
        const cid = ids[0];
        if (!cid) return false;
        const ch = await client.channels.fetch(cid).catch(() => null);
        if (!(ch instanceof TextChannel)) return false;
        const speakAs: CharacterCard = {
          slug: skinCard.slug,
          name: skinCard.name,
          displayName: coreLabel(cd),
          frontmatter: skinCard.frontmatter,
          body: '',
          dir: skinCard.dir,
        } as unknown as CharacterCard;
        await sendAsSkin(ch, speakAs, { content: text.slice(0, 1900) });
        return true;
      } catch (e: any) {
        console.error('[CoreSpeak]', e?.message ?? e);
        return false;
      }
    });
    // TASK-KAR-077: 대시보드 sink — ensure-or-edit 한 메시지, ID 반환.
    // setCoreSpeak 동형(client 주입, agent-cadence ⊥ discord.js).
    setDashboardSink(async (channelId, messageId, panel, embed) => {
      try {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (!(ch instanceof TextChannel)) return null;
        const payload = { content: '', embeds: [embed as any] };
        if (messageId) {
          try {
            await ch.messages.edit(messageId, payload);
            return messageId;
          } catch {
            /* state 무효(삭제/소실) → self-discovery 폴백 */
          }
        }
        // self-heal: state 파일이 deploy git-clean 으로 소실돼도 채널의
        // 봇 기존 대시보드 메시지를 marker 로 찾아 edit (새 메시지 도배 X).
        // compact = embed.author "욘봇 팀"·title 無 / detailed = title
        // "욘봇 팀 — 상세". 멱등 — 최후에만 send.
        try {
          const recent = await ch.messages.fetch({ limit: 30 });
          const mine = recent.find((m) => {
            if (m.author?.id !== client.user?.id) return false;
            const e0: any = m.embeds?.[0];
            if (!e0) return false;
            const a = e0.author?.name ?? '';
            const t = e0.title ?? '';
            return panel === 'detailed'
              ? t.includes('욘봇 팀 — 상세')
              : a.includes('욘봇 팀') && !t;
          });
          if (mine) {
            await ch.messages.edit(mine.id, payload);
            return mine.id;
          }
        } catch {
          /* 탐색 실패 → 새 전송 */
        }
        const m = await ch.send(payload);
        return m.id;
      } catch (e: any) {
        console.error('[Dashboard]', e?.message ?? e);
        return null;
      }
    });
    // 부팅 self-test: 파이프(NotifyFn→sendLocalEvent→webhook-routes→실채널)
    // end-to-end 관측 증거 1회. 사용자가 #team-bus 채널에서 직접 확인 = behavior-verify.
    void sendLocalEvent(
      client as any,
      {
        kind: 'agent-team',
        source: `KAR-018-W · ${agentCh ? 'dev(격리)' : 'prod(webhook-routes)'}`,
        title: '🛰 에이전트 팀 — #team-bus 연결',
        summary: `에이전트 팀 알림 파이프 라이브 (${agentCh ? 'dev 전용 채널 격리' : 'prod 기본 채널'}). 이후 거버넌스 escalate / 자가개선 reject / ⑦' 발굴이 이 채널로 게시됩니다. (cadence 자율 구동은 기본 ON, AGENT_CADENCE_ENABLED=0 으로 명시 시 OFF.)`,
        level: 'info',
      },
      agentChOverride,
    );
    startAgentCadence(process.env); // ⑦ 자율 cadence (KAR-018-B, default OFF — sub-D 후 ON)
    // KAR-018-LT: 팀 verdict → 원본 제안 카드 반영 reconciler. 숙의는
    // client-less 순수(원장에만 기록) → client 쥔 여기서 카드 edit.
    // 멱등·restart-safe(reflected 마커). self-scheduling(자기 작업 중
    // 다음 틱 안 쌓임). cadence OFF 여도 무해(원장 비면 no-op).
    {
      const reconcileMs =
        Number(process.env.AGENT_CARD_RECONCILE_MS) || 120_000;
      const reconcileTick = async (): Promise<void> => {
        try {
          await reconcileProposalCards(client, process.env);
        } catch (e) {
          console.error(
            '[agent-bus] 카드 verdict reconcile 오류:',
            e instanceof Error ? e.message : e,
          );
        }
        cardReconcileTimer = setTimeout(reconcileTick, reconcileMs);
      };
      cardReconcileTimer = setTimeout(reconcileTick, reconcileMs);
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
  stopHeartbeat();
  stopCharacterStateSnapshot();
  stopMemoSync();
  stopUnityFreeNotifier();
  stopNewsNotifier();
  stopAgentCadence();
  if (cardReconcileTimer) {
    clearTimeout(cardReconcileTimer);
    cardReconcileTimer = null;
  }
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
