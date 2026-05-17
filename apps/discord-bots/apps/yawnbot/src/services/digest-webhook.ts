/**
 * TASK-YB-004 — dev-digest webhook 분기 핸들러.
 *
 * trigger: push event, commit message starts with "chore(digests):", added path contains "digests/YYYY-MM-DD.md"
 * 처리:
 *   1. GitHub raw URL 에서 digest .md 본문 fetch
 *   2. Yawn 캐릭터 톤으로 AI 가공 (generateBlobTextFromEnvWithOptions)
 *   3. Discord 채널에 embed 전송 (regular commit embed 는 skip)
 */
import type { Client } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { generateBlobTextFromEnvWithOptions } from 'karmolab-ai/node';
import { channelIdFor } from './channel-provision';
const MAX_PLAIN_CHARS = 1800;
const MAX_FETCH_CHARS = 8000;

/** .md 본문에서 앞 YAML frontmatter (--- ... ---) 를 제거하고 본문만 반환 */
function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---[\s\S]*?---\r?\n([\s\S]*)$/);
  return m ? m[1].trim() : raw.trim();
}

/**
 * push payload 의 commit 하나가 dev-digest commit 인지 판별.
 * 조건: message 첫 줄이 "chore(digests):" 로 시작 + added 파일 중 "digests/" 경로 .md 있음.
 */
export function isDigestCommit(commit: any): string | null {
  const firstLine = String(commit?.message ?? '').split('\n', 1)[0];
  if (!firstLine.startsWith('chore(digests):')) return null;
  const added: string[] = Array.isArray(commit?.added) ? commit.added : [];
  const digestFile = added.find((p) => p.startsWith('digests/') && p.endsWith('.md'));
  return digestFile ?? null;
}

/**
 * digest commit 을 Yawn 톤으로 가공 후 Discord 전송.
 * 실패해도 예외를 삼켜 호출부 흐름 유지 (digest 실패가 전체 webhook 을 깨지 않게).
 */
export async function handleDigestCommit(
  client: Client,
  commit: any,
  repoFullName: string,
  channelIds: string[],
): Promise<void> {
  const digestFile = isDigestCommit(commit);
  if (!digestFile) return;

  const sha: string = String(commit.id ?? '');
  const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${sha}/${digestFile}`;

  try {
    // 1. fetch digest body
    let rawBody = '';
    try {
      const resp = await fetch(rawUrl, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      rawBody = await resp.text();
    } catch (e: any) {
      console.error(`[DigestWebhook] raw fetch 실패 (${rawUrl}):`, e?.message ?? e);
      return;
    }
    const body = stripFrontmatter(rawBody).slice(0, MAX_FETCH_CHARS);
    if (!body.trim()) {
      console.warn('[DigestWebhook] 빈 digest 본문 — 전송 skip');
      return;
    }

    // 2. Yawn AI 가공
    const systemPrompt = buildYawnDigestSystemPrompt();
    const userPrompt = buildYawnDigestUserPrompt(body);

    let yawnResponse = '';
    try {
      const { text } = await generateBlobTextFromEnvWithOptions(process.env, userPrompt, {
        systemInstruction: systemPrompt,
        modelId: process.env.YAWN_DIGEST_MODEL_ID,
      });
      yawnResponse = text.trim();
    } catch (e: any) {
      console.error('[DigestWebhook] AI 가공 실패:', e?.message ?? e);
      // fallback: 원본 첫 500자 그대로
      yawnResponse = body.slice(0, 500) + (body.length > 500 ? '\n…' : '');
    }

    // 3. Discord 전송 — embed description 한계 4096, 실 메시지 2000자 권장
    const dateLabel = digestFile.replace('digests/', '').replace('.md', '');
    const repoUrl = `https://github.com/${repoFullName}/blob/${sha}/${digestFile}`;

    const embed = new EmbedBuilder()
      .setAuthor({ name: 'Yawn', iconURL: process.env.YAWN_AVATAR_URL || undefined })
      .setTitle(`📰 ${dateLabel} dev digest`)
      .setURL(repoUrl)
      .setDescription(yawnResponse.slice(0, 4000))
      .setColor(0xb39ddb)
      .setFooter({ text: `${repoFullName} · chore(digests)` })
      .setTimestamp();

    // 별도 digest 채널: dev=프로비저닝 'digest' / prod=env YAWN_DIGEST_CHANNEL_ID
    // (둘 다 없으면 호출부가 넘긴 기본 채널 = webhook-routes default).
    const digestChannelId = channelIdFor('digest');
    const targetChannels = digestChannelId ? [digestChannelId] : channelIds;

    for (const channelId of targetChannels) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel?.isSendable()) {
        await channel.send({ embeds: [embed] }).catch((e: any) =>
          console.error('[DigestWebhook] 채널 전송 실패:', channelId, e?.message ?? e),
        );
      }
    }

    console.log(`[DigestWebhook] ${dateLabel} digest 전송 완료 (${targetChannels.length} 채널)`);
  } catch (e: any) {
    console.error('[DigestWebhook] handleDigestCommit 예외:', e?.message ?? e);
  }
}

function buildYawnDigestSystemPrompt(): string {
  const envPrompt = process.env.YAWN_SYSTEM_PROMPT ?? process.env.BOT_YAWN_SYSTEM_PROMPT ?? '';
  const base = envPrompt.trim().replace(/\\n/g, '\n') ||
    '너는 YawnBot 이야. 활기차고 재치 있는 디스코드 봇. 친절하고 유머러스하게 답해줘.';
  return (
    base +
    '\n\n오늘은 daily dev digest 를 받아서 디스코드 채널에 소개하는 역할이야. ' +
    '너의 말투로 짧게 한 마디 코멘트 + top 3 entry 각 1줄 코멘트 + 전체 보기 링크 형식으로 작성해. ' +
    `Discord 메시지이므로 ${MAX_PLAIN_CHARS}자 이내로 작성해. Markdown 링크는 [텍스트](URL) 형식.`
  );
}

function buildYawnDigestUserPrompt(digestBody: string): string {
  return `오늘 dev digest 본문이야. 위 지침대로 디스코드 메시지 작성해줘:\n\n${digestBody}`;
}
