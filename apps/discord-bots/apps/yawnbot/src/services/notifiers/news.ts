/**
 * 관심사 키워드 뉴스 주기 알림 (TASK-YB-027).
 *
 * - unity-free / geeknews 와 대칭인 전용 스케줄 notifier.
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

const EMBED_COLOR = 0x2196f3;
const SENT_LINKS_CAP = 300;

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
interface NewsNotifierState {
  sentLinks: string[];
  lastSentAt: string | null;
}

const STATE_PATH = path.join(PKG_ROOT, 'data', 'news-notifier-state.json');

function loadState(): NewsNotifierState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as Partial<NewsNotifierState>;
      return {
        sentLinks: Array.isArray(parsed.sentLinks) ? parsed.sentLinks.filter((x) => typeof x === 'string') : [],
        lastSentAt: typeof parsed.lastSentAt === 'string' ? parsed.lastSentAt : null,
      };
    }
  } catch (err) {
    console.warn('[News] dedup state 읽기 실패 — 새 state 로 시작:', err);
  }
  return { sentLinks: [], lastSentAt: null };
}

function saveState(state: NewsNotifierState): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    const trimmed: NewsNotifierState = {
      sentLinks: state.sentLinks.slice(-SENT_LINKS_CAP),
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
  const seen = new Set(state.sentLinks);
  const fresh: NewsArticle[] = [];

  // fetchFreshArticle 은 호출마다 키워드를 섞어 미열람 1건 반환 + in-memory seen 누적.
  // persistent dedup(seen) 으로 재시작 후 중복 방지. 같은 link 면 skip 하고 다음 시도.
  for (let i = 0; i < maxPerPoll * 3 && fresh.length < maxPerPoll; i++) {
    const a = await news.fetchFreshArticle(maxAgeHours);
    if (!a) break;
    if (!a.link || seen.has(a.link)) continue;
    seen.add(a.link);
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
      state.sentLinks.push(a.link);
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

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * 환경변수:
 * - YAWNBOT_NEWS_CHANNEL_ID — 알림 채널 (미설정 시 폴링 비활성)
 * - YAWNBOT_NEWS_INTERVAL_MIN — 폴링 간격 (분, 기본 180, 최소 30)
 * - YAWNBOT_NEWS_MAX_AGE_HOURS — 신선 기사 기준 (시간, 기본 12)
 * - YAWNBOT_NEWS_MAX_PER_POLL — 1회 poll 최대 게시 수 (기본 3)
 */
export function startNewsNotifier(client: Client, getNews: (slug: string) => NewsService, slug: string): void {
  stopNewsNotifier();

  const channelId = channelIdFor('news');
  if (!channelId) {
    console.warn('[News] YAWNBOT_NEWS_CHANNEL_ID 미설정 — 관심사 뉴스 알림 비활성');
    return;
  }

  const intervalMin = Math.max(30, parseInt(process.env.YAWNBOT_NEWS_INTERVAL_MIN || '180', 10));
  const maxAgeHours = Math.max(1, parseInt(process.env.YAWNBOT_NEWS_MAX_AGE_HOURS || '12', 10));
  const maxPerPoll = Math.max(1, parseInt(process.env.YAWNBOT_NEWS_MAX_PER_POLL || '3', 10));
  const intervalMs = intervalMin * 60 * 1000;

  const tick = (): void => {
    let news: NewsService;
    try {
      news = getNews(slug);
    } catch (err) {
      console.warn('[News] NewsService 생성 불가 (MEMO_REPO_PATH?):', err instanceof Error ? err.message : String(err));
      return;
    }
    void pollOnce(client, channelId, news, maxAgeHours, maxPerPoll).then((r) => {
      if (r.status === 'sent') console.log(`[News] 관심사 뉴스 ${r.sent}건 게시 (채널: ${channelId})`);
      else if (r.status === 'no_keywords') console.log('[News] 등록된 관심사 키워드 0개 — 게시 건너뜀 (/일정 키워드 추가)');
    });
  };

  console.log(`[News] 관심사 뉴스 알림 활성 (채널: ${channelId}, 간격: ${intervalMin}분, 신선: ${maxAgeHours}h, 회당 최대: ${maxPerPoll})`);
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
