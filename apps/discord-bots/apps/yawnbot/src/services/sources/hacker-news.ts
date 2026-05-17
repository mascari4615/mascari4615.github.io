/**
 * Hacker News 상위 스토리 소스 (구 geeknews.ts 의 fetch+embed 이전, TASK-YB-036).
 *
 * 순수 데이터/포맷 — discord 채널·env 비의존. 스케줄 news notifier
 * (`notifiers/news.ts`)가 2번째 소스로 폴링·게시한다. standalone geeknews
 * 채널/슬래시(/atkup news)는 폐기 (미사용 수동기능 → 자동 news 흡수).
 *
 * - 공개 Firebase API → topstories.json
 * - 정본: https://github.com/HackerNews/API
 */
import { EmbedBuilder } from 'discord.js';

const HN_COLOR = 0xff6600;

export interface HnStoryLine {
  /** HN item id — 안정 식별자(제목 변경에도 불변). */
  id: number;
  title: string;
  href: string;
  score: number;
  by: string;
  host: string;
}

interface HnItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  by?: string;
}

function storyHref(it: HnItem): string {
  if (it.url && /^https?:\/\//i.test(it.url)) return it.url;
  return `https://news.ycombinator.com/item?id=${it.id}`;
}

function hostLabel(it: HnItem): string {
  if (!it.url || !/^https?:\/\//i.test(it.url)) return 'news.ycombinator.com';
  try {
    return new URL(it.url).hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

function truncateTitle(s: string, max = 120): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** 마크다운 링크용: 제목에 [ ] 가 있으면 깨지므로 제거 */
function sanitizeTitleForMdLink(title: string): string {
  return title.replace(/[\[\]]/g, '').trim() || '제목';
}

/**
 * @param limit 5~15 권장 (Discord 임베드 설명 길이)
 */
export async function fetchHnTopStories(limit: number): Promise<HnStoryLine[]> {
  const cap = Math.min(15, Math.max(5, Math.floor(limit)));
  const res = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!res.ok) {
    throw new Error(`HN topstories 요청 실패: ${res.status}`);
  }
  const ids = (await res.json()) as number[];
  const slice = ids.slice(0, cap);
  const raw = await Promise.all(
    slice.map((id) =>
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(
        (r) => r.json() as Promise<HnItem | null>,
      ),
    ),
  );

  const lines: HnStoryLine[] = [];
  for (const it of raw) {
    if (!it || typeof it.title !== 'string' || !it.title.trim()) continue;
    lines.push({
      id: it.id,
      title: truncateTitle(it.title),
      href: storyHref(it),
      score: typeof it.score === 'number' ? it.score : 0,
      by: it.by || '—',
      host: hostLabel(it),
    });
  }
  return lines;
}

/** 한 건 = 한 임베드 (news notifier 의 기사별 게시 흐름과 동형). */
export function buildHnEmbed(s: HnStoryLine): EmbedBuilder {
  const t = sanitizeTitleForMdLink(s.title);
  return new EmbedBuilder()
    .setTitle(`📰 ${t.slice(0, 250)}`)
    .setURL(s.href)
    .setDescription(`${s.score}pt · ${s.host} · ${s.by}`)
    .setColor(HN_COLOR)
    .setFooter({ text: 'YawnBot · Hacker News' });
}
