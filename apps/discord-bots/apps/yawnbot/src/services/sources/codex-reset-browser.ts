/// <reference lib="dom" />
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { PKG_ROOT } from '../../paths';
import type { ResetPost } from './codex-reset';

export const browserSessionPath = () => path.join(PKG_ROOT, 'data', 'codex-reset-browser', 'session.json');
type BrowserSession = Awaited<ReturnType<BrowserContext['storageState']>>;
const activeBrowsers = new Set<Browser>();
let generation = 0;
export async function closeResetBrowsers(): Promise<void> {
  generation++;
  await Promise.allSettled([...activeBrowsers].map(browser => browser.close()));
}
export class ResetBrowserError extends Error {
  constructor(public code: 'login-required' | 'unavailable' | 'incomplete', message: string) { super(message); }
}

export function readBrowserSession(file = browserSessionPath()): BrowserSession {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8')) as BrowserSession;
    if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)
      || !state.cookies.some(c => c.name === 'auth_token' && /(^|\.)x\.com$/.test(c.domain.replace(/^\./, '')))) throw new Error();
    return state;
  } catch { throw new ResetBrowserError('login-required', 'X 로그인 필요. 노트북에서 npm run codex:login 실행'); }
}

export function saveBrowserSession(state: BrowserSession, file = browserSessionPath()): void {
  const onlyX: BrowserSession = {
    cookies: state.cookies.filter(c => /(^|\.)(x|twitter)\.com$/.test(c.domain.replace(/^\./, ''))),
    origins: state.origins.filter(o => /^https:\/\/([a-z0-9-]+\.)?(x|twitter)\.com$/.test(o.origin)),
  };
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(onlyX), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

interface Card { id: string; url: string; postedAt: string; pinned: boolean }

// 프로필의 답글 상대와 인용 글을 제외하고 본인 헤더의 시각 링크만 수집
export async function readTimelineCards(page: Page, author: string): Promise<Card[]> {
  return page.locator('article[data-testid="tweet"]').evaluateAll((articles, name) => articles.flatMap(article => {
    const bounds = article.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= innerHeight) return [];
    const header = article.querySelector('[data-testid="User-Name"]');
    const time = header?.querySelector('time');
    const href = time?.closest('a')?.getAttribute('href') || '';
    const match = href.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)$/);
    if (!match || match[1].toLowerCase() !== name.toLowerCase()) return [];
    return [{ id: match[2], url: `https://x.com${href}`, postedAt: time!.getAttribute('datetime') || '',
      pinned: /Pinned|고정/i.test(article.querySelector('[data-testid="socialContext"]')?.textContent || '') }];
  }), author);
}

async function requireTimeline(page: Page): Promise<void> {
  try {
    await page.waitForFunction(() => !!document.querySelector('article[data-testid="tweet"]')
      || /\/i\/(flow\/login|account\/access)/.test(location.pathname), undefined, { timeout: 20_000 });
  } catch {
    if (await page.getByRole('link', { name: /^(Log in|로그인)$/i }).count()) throw new ResetBrowserError('login-required', 'X 로그인 만료. 노트북에서 다시 로그인 필요');
    throw new ResetBrowserError('unavailable', 'X 게시물 로딩 실패. 마지막 수집 위치 유지');
  }
  if (/\/i\/(flow\/login|account\/access)/.test(new URL(page.url()).pathname)) throw new ResetBrowserError('login-required', 'X 로그인 또는 계정 확인 필요');
}

export async function discoverBrowserPosts(page: Page, author: string, sinceId?: string): Promise<Card[]> {
  await page.goto(`https://x.com/${author}/with_replies`, { waitUntil: 'domcontentloaded' });
  await requireTimeline(page);
  const found = new Map<string, Card>();
  let crossed = false;
  let olderScreens = 0;
  let previous = '';
  for (let scroll = 0; scroll < 40; scroll++) {
    const cards = await readTimelineCards(page, author);
    for (const card of cards) {
      if (!Number.isFinite(Date.parse(card.postedAt))) throw new ResetBrowserError('incomplete', 'X 게시 시각 확인 실패');
      if (!sinceId || BigInt(card.id) > BigInt(sinceId)) found.set(card.id, card);
    }
    const older = cards.some(c => !c.pinned && BigInt(c.id) <= BigInt(sinceId || '0'));
    const newer = cards.some(c => !c.pinned && BigInt(c.id) > BigInt(sinceId || '0'));
    crossed ||= older;
    // 답글 묶음과 고정 글의 역순 배치 때문에 첫 과거 글에서 중단 금지
    olderScreens = crossed && older && !newer ? olderScreens + 1 : 0;
    if (sinceId && olderScreens >= 2) return [...found.values()];
    if (!sinceId && (found.size >= 20 || (scroll >= 5 && found.size > 0))) {
      return [...found.values()].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, 20);
    }
    if (found.size > 100) throw new ResetBrowserError('incomplete', 'X 새 글 100건 초과. 마지막 수집 위치 유지');
    const signature = cards.map(c => c.id).join(',') + ':' + await page.evaluate(() => scrollY);
    if (scroll > 0 && signature === previous) throw new ResetBrowserError('incomplete', 'X 타임라인 추가 로딩 실패. 마지막 수집 위치 유지');
    previous = signature;
    await page.mouse.wheel(0, await page.evaluate(() => Math.floor(innerHeight * 0.8)));
    await page.waitForTimeout(1_000);
    await requireTimeline(page);
  }
  throw new ResetBrowserError('incomplete', 'X 이전 수집 위치까지 읽지 못함. 마지막 수집 위치 유지');
}

export async function readBrowserPost(page: Page, card: Pick<Card, 'id' | 'url'>, author: string): Promise<ResetPost> {
  await page.goto(card.url, { waitUntil: 'domcontentloaded' });
  await requireTimeline(page);
  const article = page.locator('article[data-testid="tweet"]').first();
  const original = article.locator('button:not([role="link"] button)').filter({ hasText: /^(Show original|View original|원본 보기)$/i }).first();
  if (await original.count()) {
    await original.click();
    await original.waitFor({ state: 'hidden' });
  }
  const post = await article.evaluate((element, expected) => {
    const header = element.querySelector('[data-testid="User-Name"]');
    const authorOk = [...(header?.querySelectorAll('a[href]') || [])].some(a => a.getAttribute('href')?.toLowerCase() === `/${expected.author.toLowerCase()}`);
    const time = [...element.querySelectorAll('a[href] time')].find(t => t.closest('a')?.getAttribute('href') === `/${expected.author}/status/${expected.id}`);
    const text = [...element.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')].find(n => !n.closest('[role="link"]'));
    return { authorOk, postedAt: time?.getAttribute('datetime'), text: text?.innerText || '', lang: text?.lang || '',
      truncated: [...element.querySelectorAll('[data-testid="tweet-text-show-more-link"]')].some(n => !n.closest('[role="link"]')) };
  }, { author, id: card.id });
  if (!post.authorOk || !Number.isFinite(Date.parse(post.postedAt)) || post.truncated) throw new ResetBrowserError('incomplete', 'X 전체 원문/작성자/게시 시각 확인 실패');
  if (await original.count()) throw new ResetBrowserError('incomplete', 'X 원본 전환 실패. 번역문으로 판정하지 않음');
  return { id: card.id, url: card.url, text: post.text, postedAt: new Date(post.postedAt).toISOString() };
}

export function createBrowserResetSource(author: string, sessionFile = browserSessionPath()): (sinceId?: string) => Promise<ResetPost[]> {
  return async sinceId => {
    if (!/^[A-Za-z0-9_]{1,15}$/.test(author) || (sinceId && !/^\d{1,19}$/.test(sinceId))) throw new Error('X 작성자/수집 위치 형식 오류');
    const state = readBrowserSession(sessionFile);
    const modified = fs.statSync(sessionFile).mtimeMs;
    const current = generation;
    const channel = process.env.YAWNBOT_CODEX_RESET_BROWSER === 'chromium' ? undefined : 'msedge';
    const browser = await chromium.launch({ channel, headless: true, chromiumSandbox: true, timeout: 20_000 });
    activeBrowsers.add(browser);
    const deadline = setTimeout(() => { void browser.close(); }, 180_000);
    deadline.unref();
    try {
      if (current !== generation) throw new ResetBrowserError('unavailable', 'X 수집 종료 중');
      const context = await browser.newContext({ storageState: state, locale: 'en-US', viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      page.setDefaultNavigationTimeout(25_000);
      const cards = await discoverBrowserPosts(page, author, sinceId);
      const posts: ResetPost[] = [];
      for (const card of cards) posts.push(await readBrowserPost(page, card, author));
      // 수집 중 재로그인한 새 인증을 옛 세션으로 덮어쓰지 않음
      if (fs.statSync(sessionFile).mtimeMs === modified) saveBrowserSession(await context.storageState(), sessionFile);
      return posts.sort((a, b) => BigInt(a.id) > BigInt(b.id) ? 1 : -1);
    } catch (error) {
      if (error instanceof ResetBrowserError) throw error;
      throw new ResetBrowserError('unavailable', 'X 브라우저 수집 실패. 연결/Edge 상태 확인 필요');
    } finally { clearTimeout(deadline); activeBrowsers.delete(browser); await browser.close(); }
  };
}
