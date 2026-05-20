/**
 * GeekNews (news.hada.io) 피드 소스.
 *
 * 순수 데이터/포맷 — discord 채널·env 비의존. 스케줄 news notifier
 * (`notifiers/news.ts`)가 3번째 소스로 폴링·게시한다.
 *
 * - 피드 URL = FeedBurner (news.hada.io/rss 는 redirect 체인 끝에 여기로 옴 +
 *   직접 fetch 시 403; FeedBurner 는 인증·UA 불요 200).
 * - 포맷 = Atom XML (`<entry>`). RSS 2.0 (`<item>`) 도 dual 지원 (소스 포맷 변경 대비).
 * - 안정 dedup 키 = URL 내 topic id (예: ?id=12345). 없으면 link 전체.
 */
import { EmbedBuilder } from 'discord.js';

const GN_COLOR = 0x00b386;
const FEED_URL = 'http://feeds.feedburner.com/geeknews-feed';

export interface GnStoryLine {
  /** topic id — 안정 식별자. URL ?id=NNN 에서 추출. */
  id: string;
  title: string;
  href: string;
  pubDate: string;
}

async function fetchRaw(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractTopicId(url: string): string {
  const m = url.match(/[?&]id=(\d+)/);
  return m ? m[1] : url;
}

function parseEntry(block: string): GnStoryLine | null {
  const title =
    block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]?.trim() ||
    block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() || '';

  // Atom: <link href="..." rel="alternate"/>  /  RSS: <link>URL</link>
  // 다중 link 중 rel="alternate" 또는 첫 link 의 href 우선.
  const atomHref =
    block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/)?.[1] ||
    block.match(/<link[^>]*href=["']([^"']+)["']/)?.[1] || '';
  const rssLink = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
  const id = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
  const guid = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1]?.trim() || '';
  const link = atomHref || rssLink || id || guid;

  // Atom: <published>/<updated>  /  RSS: <pubDate>
  const pubDate =
    block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ||
    block.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() ||
    block.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim() || '';

  if (!title || !link) return null;

  return {
    id: extractTopicId(link),
    title: title.slice(0, 120),
    href: link,
    pubDate,
  };
}

export async function fetchGnTopStories(limit: number): Promise<GnStoryLine[]> {
  const cap = Math.min(20, Math.max(1, Math.floor(limit)));
  const xml = await fetchRaw(FEED_URL);

  // Atom <entry> 우선, RSS <item> fallback (dual format).
  const blocks =
    xml.match(/<entry[\s\S]*?<\/entry>/g) ??
    xml.match(/<item[\s\S]*?<\/item>/g) ??
    [];
  if (blocks.length === 0) {
    console.warn('[News/GN] 피드 파싱 0건 — XML 구조 확인 필요 (entry·item 둘 다 없음)');
  }

  const results: GnStoryLine[] = [];
  for (const block of blocks) {
    if (results.length >= cap) break;
    const entry = parseEntry(block);
    if (entry) results.push(entry);
  }
  return results;
}

export function buildGnEmbed(s: GnStoryLine): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📰 ${s.title.slice(0, 250)}`)
    .setColor(GN_COLOR)
    .setFooter({ text: 'YawnBot · GeekNews' });
  if (/^https?:\/\//i.test(s.href)) embed.setURL(s.href);
  const pub = s.pubDate ? new Date(s.pubDate).getTime() : 0;
  if (pub) embed.setTimestamp(new Date(pub));
  return embed;
}
