/**
 * 관심사 키워드 뉴스 주기 알림 (TASK-YB-027).
 *
 * - unity-free 와 대칭인 전용 스케줄 notifier. Google News(관심사 키워드)
 *   + Hacker News(YB-036 흡수) 2 소스를 같은 `news` 채널에 게시.
 *   기존 NewsService(관심사 키워드 기반 Google News RSS, 캐릭터별)를 재사용.
 * - main.ts clientReady 에서 startNewsNotifier(client, getNews, slug) 호출 — interval poll 시작.
 * - 슬래시 단발 트리거용 triggerNewsOnce 도 동일 send 흐름 사용 (atkup 등에서 배선 가능).
 *
 * NewsService 와의 분담: NewsService = "신선 기사 1건 조회 + in-memory dedup".
 * 본 notifier = "주기 poll + 채널 게시 + 봇 재시작 넘어가는 persistent dedup + 게시 포맷".
 * (spontaneous DM 의 30% 힌트 경로와 독립 — 그쪽은 그대로 둠.)
 */
import { EmbedBuilder, type Client, type SendableChannels } from 'discord.js';
import { channelIdFor } from '../channel-provision';
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../../paths';
import type { NewsService, NewsArticle } from '../news-service';
import { fetchHnTopStories, buildHnEmbed } from '../sources/hacker-news';
import { fetchGnTopStories, buildGnEmbed } from '../sources/geeknews';

const EMBED_COLOR = 0x2196f3;
const SENT_LINKS_CAP = 300;
const SENT_KEYS_CAP = 300;
const SENT_HN_CAP = 300;
const SENT_GN_CAP = 300;

/**
 * 안정적 dedup 키 = 정규화된 제목.
 *
 * Google News RSS 의 <link> (`.../articles/CBMi...?oc=5`) 토큰은 fetch 세션마다
 * 재생성되어 같은 기사가 폴링·재시작마다 다른 link 를 가진다 → link 기준 dedup 이
 * 같은 기사를 못 거른다. 제목은 재fetch·재시작에 안정적이라 영속 dedup 의 1차 키로 적합.
 * (unity-free.ts 가 안정적 키 couponCode/assetUrl 을 영속하는 것과 동일 원리.)
 * Google News 가 붙이는 ` - 언론사` suffix 는 동일 출처 재fetch 간 안정 → 유지
 * (서로 다른 매체의 유사 헤드라인 오병합 방지).
 */
export function dedupKey(title: string): string {
  return title.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function buildNewsEmbed(a: NewsArticle): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(a.title.slice(0, 250) || '(제목 없음)')
    .setColor(EMBED_COLOR)
    .setFooter({ text: `YawnBot · News · 키워드: ${a.keyword}` });
  if (a.link && /^https?:\/\//i.test(a.link)) embed.setURL(a.link);
  const pub = a.pubDate ? new Date(a.pubDate).getTime() : 0;
  if (pub) embed.setTimestamp(new Date(pub));
  return embed;
}

// 봇 재시작·재배포 후에도 dedup 유지 (NewsService.seenTitles 는 in-memory 휘발).
// sentKeys = 정규화 제목 (1차·재시작/link 로테이션 무관). sentLinks = 2차 안전망.
interface NewsNotifierState {
  sentKeys: string[];
  sentLinks: string[];
  /** Hacker News 흡수(YB-036) — 게시한 HN item id (안정 식별자). */
  sentHnKeys: string[];
  /** GeekNews(news.hada.io) — 게시한 topic id (안정 식별자). */
  sentGnKeys: string[];
  lastSentAt: string | null;
}

const STATE_PATH = path.join(PKG_ROOT, 'data', 'news-notifier-state.json');

function loadState(): NewsNotifierState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as Partial<NewsNotifierState>;
      return {
        // 구 state (sentKeys 없음) 하위호환 — 신키는 다음 폴링부터 누적.
        sentKeys: Array.isArray(parsed.sentKeys) ? parsed.sentKeys.filter((x) => typeof x === 'string') : [],
        sentLinks: Array.isArray(parsed.sentLinks) ? parsed.sentLinks.filter((x) => typeof x === 'string') : [],
        sentHnKeys: Array.isArray(parsed.sentHnKeys) ? parsed.sentHnKeys.filter((x) => typeof x === 'string') : [],
        sentGnKeys: Array.isArray(parsed.sentGnKeys) ? parsed.sentGnKeys.filter((x) => typeof x === 'string') : [],
        lastSentAt: typeof parsed.lastSentAt === 'string' ? parsed.lastSentAt : null,
      };
    }
  } catch (err) {
    console.warn('[News] dedup state 읽기 실패 — 새 state 로 시작:', err);
  }
  return { sentKeys: [], sentLinks: [], sentHnKeys: [], sentGnKeys: [], lastSentAt: null };
}

function saveState(state: NewsNotifierState): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    const trimmed: NewsNotifierState = {
      sentKeys: state.sentKeys.slice(-SENT_KEYS_CAP),
      sentLinks: state.sentLinks.slice(-SENT_LINKS_CAP),
      sentHnKeys: state.sentHnKeys.slice(-SENT_HN_CAP),
      sentGnKeys: state.sentGnKeys.slice(-SENT_GN_CAP),
      lastSentAt: state.lastSentAt,
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(trimmed, null, 2) + '\n', 'utf-8');
  } catch (err) {
    // dedup 깨지더라도 알림 자체는 살림 — 권한 사고 시 안전 degrade.
    console.warn('[News] dedup state 저장 실패:', err);
  }
}

export async function sendNewsArticleToChannel(channel: SendableChannels, a: NewsArticle): Promise<void> {
  await channel.send({ embeds: [buildNewsEmbed(a)] });
}

async function pollOnce(
  client: Client,
  channelId: string,
  news: NewsService,
  maxAgeHours: number,
  maxPerPoll: number,
): Promise<{ status: 'sent' | 'no_article' | 'no_keywords' | 'channel_unreachable'; sent: number }> {
  if (news.getKeywords().length === 0) {
    return { status: 'no_keywords', sent: 0 };
  }

  const state = loadState();
  const seenKeys = new Set(state.sentKeys);
  const seenLinks = new Set(state.sentLinks);
  const fresh: NewsArticle[] = [];

  // fetchFreshArticle 은 호출마다 키워드를 섞어 미열람 1건 반환 + in-memory seen 누적.
  // 영속 dedup: 1차 = 정규화 제목(재시작·link 로테이션 무관), 2차 = link(안전망).
  // 둘 중 하나라도 본 적 있으면 skip 하고 다음 시도.
  for (let i = 0; i < maxPerPoll * 3 && fresh.length < maxPerPoll; i++) {
    const a = await news.fetchFreshArticle(maxAgeHours);
    if (!a) break;
    const key = dedupKey(a.title);
    if (seenKeys.has(key)) continue;
    if (a.link && seenLinks.has(a.link)) continue;
    seenKeys.add(key);
    if (a.link) seenLinks.add(a.link);
    fresh.push(a);
  }

  if (fresh.length === 0) {
    return { status: 'no_article', sent: 0 };
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) {
    console.error('[News] 채널을 찾을 수 없거나 메시지를 보낼 수 없습니다:', channelId);
    return { status: 'channel_unreachable', sent: 0 };
  }

  let sent = 0;
  for (const a of fresh) {
    try {
      await sendNewsArticleToChannel(channel, a);
      state.sentKeys.push(dedupKey(a.title));
      if (a.link) state.sentLinks.push(a.link);
      sent++;
    } catch (err) {
      console.warn('[News] 기사 전송 실패:', err instanceof Error ? err.message : String(err));
    }
  }
  if (sent > 0) {
    state.lastSentAt = new Date().toISOString();
    saveState(state);
  }
  return { status: 'sent', sent };
}

/**
 * Hacker News 흡수 폴 (YB-036) — 같은 `news` 채널에 HN 상위 글을 게시.
 * Google News 와 독립 dedup namespace(`sentHnKeys` = HN item id). 미게시
 * 상위 글을 최대 maxPerPoll 개. id 는 제목 변경에도 불변 = 안정 키.
 */
async function pollHnOnce(
  client: Client,
  channelId: string,
  maxPerPoll: number,
): Promise<{ status: 'sent' | 'no_story' | 'channel_unreachable'; sent: number }> {
  let stories;
  try {
    stories = await fetchHnTopStories(15);
  } catch (err) {
    console.warn('[News/HN] topstories 조회 실패:', err instanceof Error ? err.message : String(err));
    return { status: 'no_story', sent: 0 };
  }

  const state = loadState();
  const seen = new Set(state.sentHnKeys);
  const fresh = stories.filter((s) => !seen.has(String(s.id))).slice(0, maxPerPoll);
  if (fresh.length === 0) {
    return { status: 'no_story', sent: 0 };
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) {
    console.error('[News/HN] 채널을 찾을 수 없거나 메시지를 보낼 수 없습니다:', channelId);
    return { status: 'channel_unreachable', sent: 0 };
  }

  let sent = 0;
  for (const s of fresh) {
    try {
      await channel.send({ embeds: [buildHnEmbed(s)] });
      state.sentHnKeys.push(String(s.id));
      sent++;
    } catch (err) {
      console.warn('[News/HN] 게시 실패:', err instanceof Error ? err.message : String(err));
    }
  }
  if (sent > 0) {
    state.lastSentAt = new Date().toISOString();
    saveState(state);
  }
  return { status: 'sent', sent };
}

/**
 * GeekNews(news.hada.io) 폴 — 같은 `news` 채널에 상위 글을 게시.
 * HN 과 독립 dedup namespace(`sentGnKeys` = topic id). 미게시 글을 최대 maxPerPoll 개.
 */
async function pollGnOnce(
  client: Client,
  channelId: string,
  maxPerPoll: number,
): Promise<{ status: 'sent' | 'no_story' | 'channel_unreachable'; sent: number }> {
  let stories;
  try {
    stories = await fetchGnTopStories(15);
  } catch (err) {
    console.warn('[News/GN] RSS 조회 실패:', err instanceof Error ? err.message : String(err));
    return { status: 'no_story', sent: 0 };
  }

  const state = loadState();
  const seen = new Set(state.sentGnKeys);
  const fresh = stories.filter((s) => !seen.has(s.id)).slice(0, maxPerPoll);
  if (fresh.length === 0) {
    return { status: 'no_story', sent: 0 };
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) {
    console.error('[News/GN] 채널을 찾을 수 없거나 메시지를 보낼 수 없습니다:', channelId);
    return { status: 'channel_unreachable', sent: 0 };
  }

  let sent = 0;
  for (const s of fresh) {
    try {
      await channel.send({ embeds: [buildGnEmbed(s)] });
      state.sentGnKeys.push(s.id);
      sent++;
    } catch (err) {
      console.warn('[News/GN] 게시 실패:', err instanceof Error ? err.message : String(err));
    }
  }
  if (sent > 0) {
    state.lastSentAt = new Date().toISOString();
    saveState(state);
  }
  return { status: 'sent', sent };
}

let timer: ReturnType<typeof setInterval> | null = null;

const ALL_SOURCES = ['google', 'hn', 'gn'] as const;
type NewsSource = (typeof ALL_SOURCES)[number];

function parseSources(raw: string | undefined): Set<NewsSource> {
  if (!raw?.trim()) return new Set(ALL_SOURCES);
  const tokens = raw.split(',').map((s) => s.trim().toLowerCase());
  const valid = tokens.filter((t): t is NewsSource => (ALL_SOURCES as readonly string[]).includes(t));
  return valid.length > 0 ? new Set(valid) : new Set(ALL_SOURCES);
}

/**
 * 환경변수:
 * - YAWNBOT_NEWS_CHANNEL_ID — 알림 채널 (미설정 시 폴링 비활성)
 * - YAWNBOT_NEWS_SOURCES — 활성 소스 목록(쉼표 구분, 기본 google,hn,gn). 새 소스 = 이 값만 수정.
 * - YAWNBOT_NEWS_INTERVAL_MIN — 폴링 간격 (분, 기본 180, 최소 30)
 * - YAWNBOT_NEWS_MAX_AGE_HOURS — google 신선 기사 기준 (시간, 기본 12)
 * - YAWNBOT_NEWS_MAX_PER_POLL — 소스당 1회 최대 게시 수 (기본 3)
 */
export function startNewsNotifier(client: Client, getNews: (slug: string) => NewsService, slug: string): void {
  stopNewsNotifier();

  const channelId = channelIdFor('news');
  if (!channelId) {
    console.warn('[News] YAWNBOT_NEWS_CHANNEL_ID 미설정 — 관심사 뉴스 알림 비활성');
    return;
  }

  const sources = parseSources(process.env.YAWNBOT_NEWS_SOURCES);
  const intervalMin = Math.max(30, parseInt(process.env.YAWNBOT_NEWS_INTERVAL_MIN || '180', 10));
  const maxAgeHours = Math.max(1, parseInt(process.env.YAWNBOT_NEWS_MAX_AGE_HOURS || '12', 10));
  const maxPerPoll = Math.max(1, parseInt(process.env.YAWNBOT_NEWS_MAX_PER_POLL || '3', 10));
  const intervalMs = intervalMin * 60 * 1000;

  const tick = (): void => {
    if (sources.has('google')) {
      let news: NewsService;
      try {
        news = getNews(slug);
      } catch (err) {
        console.warn('[News] NewsService 생성 불가 (MEMO_REPO_PATH?):', err instanceof Error ? err.message : String(err));
        return;
      }
      void pollOnce(client, channelId, news, maxAgeHours, maxPerPoll).then((r) => {
        if (r.status === 'sent') console.log(`[News/google] 관심사 뉴스 ${r.sent}건 게시 (채널: ${channelId})`);
        else if (r.status === 'no_keywords') console.log('[News/google] 등록된 관심사 키워드 0개 — 게시 건너뜀 (/일정 키워드 추가)');
      });
    }
    if (sources.has('hn')) {
      void pollHnOnce(client, channelId, maxPerPoll).then((r) => {
        if (r.status === 'sent') console.log(`[News/hn] Hacker News ${r.sent}건 게시 (채널: ${channelId})`);
      });
    }
    if (sources.has('gn')) {
      void pollGnOnce(client, channelId, maxPerPoll).then((r) => {
        if (r.status === 'sent') console.log(`[News/gn] GeekNews ${r.sent}건 게시 (채널: ${channelId})`);
      });
    }
  };

  console.log(`[News] 알림 활성 (채널: ${channelId}, 소스: ${[...sources].join(',')}, 간격: ${intervalMin}분, 신선: ${maxAgeHours}h, 회당 최대: ${maxPerPoll})`);
  tick();
  timer = setInterval(tick, intervalMs);
}

export function stopNewsNotifier(): void {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 슬래시 단발 트리거 진입점. YAWNBOT_NEWS_CHANNEL_ID 미설정 시 'no_channel'.
 */
export async function triggerNewsOnce(
  client: Client,
  news: NewsService,
  maxAgeHours = 12,
  maxPerPoll = 3,
): Promise<{ status: 'sent' | 'no_article' | 'no_keywords' | 'channel_unreachable' | 'no_channel'; sent: number }> {
  const channelId = channelIdFor('news');
  if (!channelId) {
    return { status: 'no_channel', sent: 0 };
  }
  return pollOnce(client, channelId, news, maxAgeHours, maxPerPoll);
}
