export interface ResetPost {
  id: string;
  text: string;
  postedAt: string;
  url: string;
  truncated?: boolean;
}

export interface ResetSignal {
  post: ResetPost;
  kind: 'reset' | 'banked' | 'both';
  status: 'completed' | 'scheduled' | 'uncertain';
  timing: { at: string; qualifier: 'around' | 'within' | 'by' | 'exact'; evidence: string } | null;
}

export const DEFAULT_RESET_AUTHOR = 'thsottiaux';

function parsePostUrl(input: string): { author: string; id: string; url: string } {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('X 트윗 링크를 입력해 주세요.'); }
  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{16,19})\/?$/);
  if (url.protocol !== 'https:' || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)
    || url.port || url.username || url.password || !match) throw new Error('X 트윗 링크를 입력해 주세요.');
  return { author: match[1], id: match[2], url: `https://x.com/${match[1]}/status/${match[2]}` };
}

export async function fetchResetPostLink(input: string, author: string, fetcher: typeof fetch = fetch): Promise<ResetPost> {
  const target = parsePostUrl(input);
  if (target.author.toLowerCase() !== author.toLowerCase()) throw new Error(`@${author}의 트윗 링크를 입력해 주세요.`);
  const params = new URLSearchParams({ url: target.url, omit_script: 'true', hide_thread: 'true', hide_media: 'true' });
  const response = await fetcher(`https://publish.x.com/oembed?${params}`, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok) throw new Error(`X 원문 조회 실패 (HTTP ${response.status}). 비공개이거나 삭제된 트윗일 수 있어요.`);
  const body = await response.json() as { html?: string; author_url?: string };
  const expectedAuthors = [`https://x.com/${author}`, `https://twitter.com/${author}`].map(s => s.toLowerCase());
  if (typeof body.html !== 'string' || body.html.length > 100_000 || !expectedAuthors.includes(body.author_url?.replace(/\/$/, '').toLowerCase())) throw new Error('X 원문의 작성자를 확인하지 못했어요.');
  const $ = load(body.html);
  const block = $('blockquote.twitter-tweet').first();
  const permalink = block.children('a').last().attr('href') || '';
  const verified = parsePostUrl(permalink);
  if (verified.id !== target.id || verified.author.toLowerCase() !== author.toLowerCase()) throw new Error('X 원문의 트윗 번호가 일치하지 않아요.');
  block.find('br').replaceWith('\n');
  const text = block.children('p').first().text().trim();
  if (!text) throw new Error('X 원문 본문이 비어 있어요.');
  // X Snowflake 생성 시각. HTML에는 날짜만 있어 초 단위 기준은 ID에서 복원
  const posted = Number((BigInt(target.id) >> 22n) + 1288834974657n);
  if (posted < Date.UTC(2011, 0, 1) || posted > Date.now() + 60_000) throw new Error('X 트윗 생성 시각을 확인하지 못했어요.');
  return { id: target.id, text, postedAt: new Date(posted).toISOString(), url: target.url, ...(/\u2026$|\.{3}$/.test(text) ? { truncated: true } : {}) };
}


const HOURS = 3_600_000;
const numbers: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twelve: 12, twenty: 20, thirty: 30, sixty: 60 };

function zonedParts(at: number, zone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map(p => [p.type, p.value]));
}

function clockTime(posted: number, hour: number, minute: number, zone: string, tomorrow: boolean): number | null {
  const fixed: Record<string, number> = { UTC: 0, GMT: 0, KST: 9, PST: -8, PDT: -7, EST: -5, EDT: -4 };
  const iana = zone === 'PT' ? 'America/Los_Angeles' : 'America/New_York';
  const offset = fixed[zone];
  const base = offset === undefined ? zonedParts(posted, iana) : zonedParts(posted + offset * HOURS, 'UTC');
  const wall = Date.UTC(+base.year, +base.month - 1, +base.day + (tomorrow ? 1 : 0), hour, minute);
  if (offset !== undefined) return wall - offset * HOURS;
  const candidates = (zone === 'PT' ? [-8, -7] : [-5, -4]).map(o => wall - o * HOURS).filter(at => {
    const p = zonedParts(at, iana);
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) === wall;
  });
  // 서머타임 전환의 중복/존재하지 않는 시각은 미정 처리
  return candidates.length === 1 ? candidates[0] : null;
}

export function inferResetTiming(post: ResetPost): ResetSignal['timing'] {
  const posted = Date.parse(post.postedAt);
  if (!Number.isFinite(posted)) return null;
  const clauses = post.text.split(/(?<!\d)\.(?!\d)|[!?\n]+/).map(s => s.trim()).filter(Boolean);
  const candidates = clauses.filter(s => /\b(?:reset|lands?|landing)\b/i.test(s)
    && !/\b(?:create|upgrade|sign up|account by|end of (?:the )?day|tonight|soon|later)\b/i.test(s));
  const times: NonNullable<ResetSignal['timing']>[] = [];
  for (const clause of candidates) {
    if (/\bor\b(?!\s+so\b)/i.test(clause)) continue;
    const relative = clause.match(/\b(?:in|within)\s+(?:(?:about|around)\s+|~\s*)?(\d+(?:\.\d+)?|the next|an?|one|two|three|four|five|six|twelve|twenty|thirty|sixty)\s*(minutes?|mins?|hours?|hrs?)\b/i);
    if (relative) {
      const amount = relative[1].toLowerCase() === 'the next' ? 1 : numbers[relative[1].toLowerCase()] ?? Number(relative[1]);
      const ms = amount * (/^(min)/i.test(relative[2]) ? 60_000 : HOURS);
      if (ms > 0 && ms <= 7 * 24 * HOURS) times.push({ at: new Date(posted + ms).toISOString(), qualifier: /within|next/i.test(relative[0]) ? 'within' : 'around', evidence: relative[0] });
      continue;
    }
    const clock = clause.match(/\b(at|by|around)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(PST|PDT|PT|EST|EDT|ET|UTC|GMT|KST)\b/i);
    if (!clock || /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b|\d{4}-\d{2}-\d{2}/i.test(clause)) continue;
    let hour = Number(clock[2]);
    const minute = Number(clock[3] || 0);
    if (minute > 59 || (clock[4] ? hour < 1 || hour > 12 : hour > 23)) continue;
    if (clock[4]) hour = hour % 12 + (clock[4].toLowerCase() === 'pm' ? 12 : 0);
    const at = clockTime(posted, hour, minute, clock[5].toUpperCase(), /\btomorrow\b/i.test(clause));
    if (at === null || at < posted - 60_000) continue;
    times.push({ at: new Date(at).toISOString(), qualifier: clock[1].toLowerCase() === 'by' ? 'by' : clock[1].toLowerCase() === 'around' ? 'around' : 'exact', evidence: clause });
  }
  return times.length === 1 ? times[0] : null;
}

export function classifyResetPost(post: ResetPost): ResetSignal | null {
  const text = post.text;
  if (!/\breset(?:s|ting|ted)?\b/i.test(text)) return null;
  if (/\b(?:my|your) (?:own )?(?:codex )?(?:usage|quota|limits?)\b/i.test(text) && !/\b(?:all|everyone|global)\b/i.test(text)) return null;
  if (/\b(?:no|not|never)\s+(?:(?:a|any|usage|global|codex)\s+){0,3}reset\b|\b(?:won't|will not|haven't|have not|didn't|did not)\s+(?:\w+\s+){0,2}reset\b/i.test(text)) return null;
  const banked = /\b(?:banked reset|reset bank)\b/i.test(text);
  const relevant = banked || /\b(?:codex|chatgpt|usage|quota|limits?|subscriptions?)\b/i.test(text)
    || /\ball reset for everyone\b/i.test(text);
  if (!relevant) return null;
  const both = banked && /\b(?:double reset|not only|also.*(?:full|global) reset|full reset.*also)\b/i.test(text);
  const future = /\b(?:will|going to|plan to)\b.{0,100}\b(?:reset|credit)\b|\b(?:lands?|landing)\b/i.test(text);
  const completed = /\b(?:have|has|just|now|already)\s+(?:been\s+)?reset\b|\breset\s+(?:usage|limits|quota)\b|\ball reset for everyone\b|\breset (?:has been|is) (?:propagated|applied|complete)\b/i.test(text);
  const resetClauses = text.split(/[.!?\n]+/).filter(s => /\breset\b/i.test(s)).join(' ');
  const speculative = /\b(?:maybe|might|could|should|hope|wish|please|if)\b|\?/i.test(resetClauses) || /\b(?:did|have|will|can)\s+(?:you|we)\b.{0,50}\breset\b[^.!]*\?/i.test(text);
  const status = post.truncated || speculative ? 'uncertain' : future ? 'scheduled' : completed ? 'completed' : 'uncertain';
  return { post, kind: both ? 'both' : banked ? 'banked' : 'reset', status, timing: status === 'scheduled' ? inferResetTiming(post) : null };
}

export function formatKst(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)) + ' KST';
}
import { load } from 'cheerio';
