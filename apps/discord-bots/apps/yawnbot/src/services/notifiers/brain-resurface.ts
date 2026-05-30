/**
 * brain-resurface — 외장 뇌 회수 알림 (TASK-KAR-147 Phase 3).
 *
 * memo/brain/ 에서 랜덤 항목을 골라 news 채널에 "이거 기억해?" embed 전송.
 * - 하루 1회 (24h grace window, KST 10:00~22:00 사이 grace)
 * - 최근 30일 내 이미 surfaced 된 항목은 skip (dedup state 파일 영속)
 * - brain/ 파일 전부 surfaced 면 oldest 재순환
 */

import fs from 'fs';
import path from 'path';
import { EmbedBuilder, type Client, type SendableChannels } from 'discord.js';
import { channelIdFor } from '../channel-provision';
import { PKG_ROOT } from '../../paths';

const RESURFACE_INTERVAL_MS = 60 * 60 * 1000;    // 1h 폴링 (grace 판단)
const RESURFACE_COOLDOWN_H = 22;                  // 22h 이상 지나야 다음 전송
const RESURFACE_DEDUP_DAYS = 30;                  // 30일 내 같은 항목 재전송 X
const EMBED_COLOR = 0x9b59b6;

interface BrainResurfaceState {
  lastSentAt: string | null;
  recentlySurfaced: Array<{ file: string; sentAt: string }>;
}

const STATE_PATH = path.join(PKG_ROOT, 'data', 'brain-resurface-state.json');

function loadState(): BrainResurfaceState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as Partial<BrainResurfaceState>;
      return {
        lastSentAt: typeof parsed.lastSentAt === 'string' ? parsed.lastSentAt : null,
        recentlySurfaced: Array.isArray(parsed.recentlySurfaced) ? parsed.recentlySurfaced : [],
      };
    }
  } catch {
    /* 새 state 시작 */
  }
  return { lastSentAt: null, recentlySurfaced: [] };
}

function saveState(state: BrainResurfaceState): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  } catch (e) {
    console.warn('[BrainResurface] state 저장 실패:', e instanceof Error ? e.message : e);
  }
}

function parseFrontmatter(raw: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return meta;
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
    if (m) meta[m[1]] = m[2];
  }
  return meta;
}

function getBody(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

function listBrainFiles(memoRepoPath: string): string[] {
  const brainDir = path.join(memoRepoPath, 'brain');
  if (!fs.existsSync(brainDir)) return [];
  return fs.readdirSync(brainDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => path.join(brainDir, f));
}

function pickItem(
  files: string[],
  recentlySurfaced: Array<{ file: string; sentAt: string }>,
): string | null {
  if (files.length === 0) return null;

  const cutoff = Date.now() - RESURFACE_DEDUP_DAYS * 24 * 60 * 60 * 1000;
  const recentSet = new Set(
    recentlySurfaced
      .filter((r) => new Date(r.sentAt).getTime() > cutoff)
      .map((r) => r.file),
  );

  const candidates = files.filter((f) => !recentSet.has(f));
  const pool = candidates.length > 0 ? candidates : files; // 전부 surfaced면 재순환
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildEmbed(filePath: string, meta: Record<string, string>, body: string): EmbedBuilder {
  const summary = meta['summary'] || path.basename(filePath, '.md');
  const tags = meta['tags'] ? meta['tags'].replace(/[\[\]]/g, '') : '';
  const type = meta['type'] || 'note';
  const source = meta['source'] || '';

  const typeEmoji: Record<string, string> = { link: '🔗', idea: '💡', reference: '📖', note: '📝' };
  const emoji = typeEmoji[type] || '🧠';

  const preview = body.slice(0, 300) + (body.length > 300 ? '…' : '');

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} 이거 기억해?`)
    .setDescription(`**${summary}**\n\n${preview}`)
    .setColor(EMBED_COLOR)
    .setFooter({ text: `외장 뇌 · ${source}${tags ? ` · ${tags}` : ''}` })
    .setTimestamp();

  // 링크면 URL 버튼 대신 embed URL
  if (type === 'link') {
    const urlMatch = body.match(/https?:\/\/[^\s)>]+/);
    if (urlMatch) embed.setURL(urlMatch[0]);
  }

  return embed;
}

async function pollOnce(
  client: Client,
  channelId: string,
  memoRepoPath: string,
): Promise<'sent' | 'cooldown' | 'no_items' | 'channel_unreachable' | 'off_hours'> {
  const state = loadState();

  // 22h cooldown
  if (state.lastSentAt) {
    const elapsed = Date.now() - new Date(state.lastSentAt).getTime();
    if (elapsed < RESURFACE_COOLDOWN_H * 60 * 60 * 1000) return 'cooldown';
  }

  // KST 10:00~22:00 사이만 전송 (너무 이른 새벽 X)
  const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  if (kstHour < 10 || kstHour >= 22) return 'off_hours';

  const files = listBrainFiles(memoRepoPath);
  const picked = pickItem(files, state.recentlySurfaced);
  if (!picked) return 'no_items';

  let channel: SendableChannels;
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch || !('send' in ch)) return 'channel_unreachable';
    channel = ch as SendableChannels;
  } catch {
    return 'channel_unreachable';
  }

  const raw = fs.readFileSync(picked, 'utf-8');
  const meta = parseFrontmatter(raw);
  const body = getBody(raw);
  const embed = buildEmbed(picked, meta, body);

  await channel.send({ embeds: [embed] });

  const now = new Date().toISOString();
  state.lastSentAt = now;
  state.recentlySurfaced = [
    ...state.recentlySurfaced.filter((r) => {
      const cutoff = Date.now() - RESURFACE_DEDUP_DAYS * 24 * 60 * 60 * 1000;
      return new Date(r.sentAt).getTime() > cutoff;
    }),
    { file: picked, sentAt: now },
  ];
  saveState(state);

  console.log(`[BrainResurface] sent: ${path.basename(picked)}`);
  return 'sent';
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startBrainResurface(client: Client, memoRepoPath: string): void {
  if (timer) return;

  const run = async (): Promise<void> => {
    const newsChannelId = channelIdFor('news');
    if (!newsChannelId) {
      console.log('[BrainResurface] news 채널 ID 없음 — skip');
      return;
    }
    try {
      const result = await pollOnce(client, newsChannelId, memoRepoPath);
      console.log(`[BrainResurface] ${result}`);
    } catch (e) {
      console.error('[BrainResurface] 오류:', e instanceof Error ? e.message : e);
    }
  };

  void run();
  timer = setInterval(() => void run(), RESURFACE_INTERVAL_MS);
  console.log(`[BrainResurface] ON — ${RESURFACE_INTERVAL_MS / 60000}분 간격 폴링, ${RESURFACE_COOLDOWN_H}h cooldown`);
}

export function stopBrainResurface(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export async function triggerBrainResurfaceNow(client: Client, memoRepoPath: string): Promise<string> {
  const newsChannelId = channelIdFor('news');
  if (!newsChannelId) return 'no_channel';
  const result = await pollOnce(client, newsChannelId, memoRepoPath);
  console.log(`[BrainResurface] manual trigger: ${result}`);
  return result;
}
