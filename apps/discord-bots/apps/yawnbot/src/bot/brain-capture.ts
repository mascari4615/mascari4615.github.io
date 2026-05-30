/**
 * brain-capture — 외장 뇌 캡처 레이어.
 *
 * DM 에서 `뇌: <내용>` 형태로 오면:
 *  1. Claude API 로 1줄 요약 + 자동 태그 추출
 *  2. memo/brain/YYYY-MM-DD-<slug>.md 로 저장
 *  3. commitAndPushMemoFile 로 origin 도달
 *  4. 디스코드 확인 reply
 */

import fs from 'fs';
import path from 'path';
import { Message } from 'discord.js';
import { generateAssistantText } from 'karmolab-ai/node';
import { commitAndPushMemoFile } from '../services/memo-push.js';

// `뇌:`, `뇌 :`, `뇌 `, `뇌：` 전부 매칭
const BRAIN_PREFIX_RE = /^뇌\s*[:：]?\s+/;

export function isBrainCapture(content: string): boolean {
  return BRAIN_PREFIX_RE.test(content);
}

function extractBody(content: string): string {
  return content.replace(BRAIN_PREFIX_RE, '').trim();
}

function detectType(body: string): 'link' | 'note' {
  return /https?:\/\//.test(body) ? 'link' : 'note';
}

function todayKST(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toSlug(summary: string): string {
  const english = summary.match(/[a-zA-Z0-9]+/g)?.join('-').toLowerCase();
  if (english && english.length >= 3) return english.slice(0, 30);
  return Date.now().toString(36).slice(-6);
}

async function structureContent(body: string): Promise<{ summary: string; tags: string[] }> {
  try {
    const { text } = await generateAssistantText(
      process.env,
      `다음 메모/링크를 분석해서 JSON으로만 반환해줘 (다른 말 X).\n` +
      `형식: {"summary": "한 줄 요약 (40자 이내)", "tags": ["태그1", "태그2"]}\n` +
      `태그는 한국어 명사 2개 이하.\n\n` +
      `내용: "${body.slice(0, 800)}"`,
    );
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return { summary: body.slice(0, 60), tags: [] };
    const parsed = JSON.parse(match[0]) as { summary?: string; tags?: string[] };
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 60) : body.slice(0, 60),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 2) : [],
    };
  } catch {
    return { summary: body.slice(0, 60), tags: [] };
  }
}

export async function handleBrainCapture(
  message: Message,
  memoRepoPath: string,
): Promise<void> {
  const body = extractBody(message.content);
  if (!body) {
    await message.reply('`뇌: <저장할 내용>` 형태로 써줘요.');
    return;
  }

  let typingInterval: ReturnType<typeof setInterval> | undefined;
  try {
    if ('sendTyping' in message.channel) {
      void (message.channel as { sendTyping(): Promise<void> }).sendTyping();
      typingInterval = setInterval(() => {
        void (message.channel as { sendTyping(): Promise<void> }).sendTyping();
      }, 8000);
    }

    const type = detectType(body);
    const { summary, tags } = await structureContent(body);

    const dateStr = todayKST();
    const slug = toSlug(summary);
    const filename = `${dateStr}-${slug}.md`;
    const brainDir = path.join(memoRepoPath, 'brain');
    const absPath = path.join(brainDir, filename);

    if (!fs.existsSync(brainDir)) {
      fs.mkdirSync(brainDir, { recursive: true });
    }

    const nowKST = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    const tagsYaml = tags.length ? `[${tags.join(', ')}]` : '[]';

    const fileContent = [
      '---',
      `type: ${type}`,
      `tags: ${tagsYaml}`,
      `source: discord`,
      `captured: "${nowKST}"`,
      `summary: "${summary}"`,
      '---',
      '',
      body,
    ].join('\n');

    fs.writeFileSync(absPath, fileContent, 'utf-8');

    const result = await commitAndPushMemoFile(
      process.env,
      absPath,
      `뇌: ${summary.slice(0, 60)}`,
    );

    clearInterval(typingInterval);

    const ok = result.outcome === 'pushed' || result.outcome === 'skipped:no-change';
    const tagStr = tags.length ? `  \`${tags.join('` `')}\`` : '';

    await message.reply(
      ok
        ? `🧠 저장됨 — ${summary}${tagStr}`
        : `⚠ 저장 실패 (\`${result.outcome}\`): ${result.detail ?? ''}`,
    );
  } catch (e) {
    clearInterval(typingInterval);
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[BrainCapture] 에러:', msg);
    await message.reply(`🧠 저장 중 오류: ${msg.slice(0, 100)}`);
  }
}
