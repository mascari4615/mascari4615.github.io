/**
 * GeekNews (news.hada.io) RSS 소스.
 *
 * 순수 데이터/포맷 — discord 채널·env 비의존. 스케줄 news notifier
 * (`notifiers/news.ts`)가 3번째 소스로 폴링·게시한다.
 *
 * - 공개 RSS 피드 → https://news.hada.io/rss
 * - 안정 dedup 키 = URL 내 topic id (예: ?id=12345)
 */
import { EmbedBuilder } from 'discord.js';

const GN_COLOR = 0x00b386;

export interface GnStoryLine {
  /** topic id — 안정 식별자. URL ?id=NNN 에서 추출. */
  id: string;
  title: string;
  href: string;
  pubDate: string;
}

async function fetchRaw(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; YawnBot/1.0; +https://mascari4615.github.io)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractTopicId(url: string): string {
  try {
    const m = url.match(/[?&]id=(\d+)/);
    if (m) return m[1];
    // fallback: URL 전체를 키로
    return url;
  } catch {
    return url;
  }
}

export async function fetchGnTopStories(limit: number): Promise<GnStoryLine[]> {
  const cap = Math.min(20, Math.max(1, Math.floor(limit)));
  const xml = await fetchRaw('https://news.hada.io/rss');

  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  if (itemMatches.length === 0) {
    console.warn('[News/GN] RSS 파싱 0건 — XML 구조 확인 필요 (redirect·포맷 변경 등)');
  }
  const results: GnStoryLine[] = [];

  for (const item of itemMatches) {
    if (results.length >= cap) break;

    const title =
      item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]?.trim() ||
      item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '';
    const link =
      item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ||
      item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1]?.trim() || '';
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';

    if (!title || !link) continue;

    results.push({
      id: extractTopicId(link),
      title: title.slice(0, 120),
      href: link,
      pubDate,
    });
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
