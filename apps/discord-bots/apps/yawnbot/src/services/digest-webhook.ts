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
 * 레포 파일 1개 본문 fetch. **memo = private** 라 무인증
 * raw.githubusercontent 는 404 (digest 송신0 진짜 근본). 토큰
 * (`MEMO_GITHUB_PAT`/`GITHUB_TOKEN`) 있으면 GitHub API contents
 * (`Accept: raw`, private OK), 없으면 raw fallback (public github.io
 * 호환). !ok = throw (caller graceful return). 평행정의0 — memo→prod
 * sync 와 동일 「private=인증 필수」 class (quality.md § 정본→prod 동기).
 */
export async function fetchRepoFile(
  repoFullName: string,
  sha: string,
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const token =
    env.MEMO_GITHUB_PAT?.trim() || env.GITHUB_TOKEN?.trim() || '';
  const signal = AbortSignal.timeout(10_000);
  if (token) {
    const apiUrl = `https://api.github.com/repos/${repoFullName}/contents/${filePath}?ref=${sha}`;
    const resp = await fetch(apiUrl, {
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'yawnbot-digest-webhook',
      },
    });
    if (!resp.ok) throw new Error(`GitHub API ${resp.status} (${apiUrl})`);
    return resp.text();
  }
  const rawUrl = `https://raw.githubusercontent.com/${repoFullName}/${sha}/${filePath}`;
  const resp = await fetch(rawUrl, { signal });
  if (!resp.ok)
    throw new Error(
      `raw ${resp.status} (${rawUrl}) — private repo 면 토큰(MEMO_GITHUB_PAT) 필요`,
    );
  return resp.text();
}

/** 일자 digest 파일만 (digests/YYYY-MM-DD.md). INDEX.md/README.md 제외. */
const DATED_DIGEST_RE = /^digests\/\d{4}-\d{2}-\d{2}\.md$/;

/**
 * push payload 의 commit 하나가 dev-digest commit 인지 판별.
 * 조건: message 첫 줄 "chore(digests):" + **added ∪ modified** 중
 * `digests/YYYY-MM-DD.md` 1개.
 * - added 뿐 아니라 **modified 포함**: 같은 날 재실행/백필/수동
 *   `/schedule run` 은 기존 일자파일 *modified* → added-only 면 영구
 *   누락(KAR-004 2차 갭, 2026-05-17 사용자 트리거로 실증).
 * - 일자패턴 한정: `digests/INDEX.md`·`README.md` 오선택 차단(잘못된
 *   파일 fetch → 깨진 게시 방지).
 */
export function isDigestCommit(commit: any): string | null {
  const firstLine = String(commit?.message ?? '').split('\n', 1)[0];
  if (!firstLine.startsWith('chore(digests):')) return null;
  const added: string[] = Array.isArray(commit?.added) ? commit.added : [];
  const modified: string[] = Array.isArray(commit?.modified)
    ? commit.modified
    : [];
  const digestFile = [...added, ...modified].find((p) =>
    DATED_DIGEST_RE.test(p),
  );
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

  try {
    // 1. fetch digest body — **memo 는 private** → 무인증 raw 는 404
    //    (KAR-004 송신0 진짜 근본, 2026-05-17). 토큰 있으면 GitHub API
    //    contents(private OK), 없으면 raw fallback(public github.io 호환).
    let rawBody = '';
    try {
      rawBody = await fetchRepoFile(repoFullName, sha, digestFile);
    } catch (e: any) {
      console.error(
        `[DigestWebhook] digest 본문 fetch 실패 (${repoFullName}@${sha.slice(0, 7)}/${digestFile}):`,
        e?.message ?? e,
      );
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
      // TASK-KAR-145: digest 톤가공 = lite tier (짧은 코멘트·요약, 가격 ~1/3).
      // YAWN_DIGEST_MODEL_ID 명시 시 explicit (resolveGeminiModelId: explicit > tier).
      const { text } = await generateBlobTextFromEnvWithOptions(process.env, userPrompt, {
        systemInstruction: systemPrompt,
        modelId: process.env.YAWN_DIGEST_MODEL_ID,
        tier: process.env.YAWN_DIGEST_MODEL_ID ? undefined : 'lite',
        tag: 'yawnbot/digest',
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
