/**
 * Unity Asset Store Publisher Sale 무료 에셋 알림 (atkup-bot 흡수, TASK-YB-003).
 *
 * - 외부 사이트 폴링 → coupon code / asset name / asset url / og:image 파싱
 * - 동일 쿠폰 코드 dedup (force 옵션 시 무시)
 * - main.ts clientReady 에서 startUnityFreeNotifier(client) 호출 — interval poll 시작
 * - 슬래시 `/atkup unity [force]` 도 동일 send 흐름 사용
 */
import {
  AttachmentBuilder,
  EmbedBuilder,
  type Client,
  type SendableChannels,
} from 'discord.js';
import cheerio from 'cheerio';
import fs from 'fs';
import { channelIdFor } from '../channel-provision';
import path from 'path';
import { PKG_ROOT } from '../../paths';

const PUBLISHER_SALE_URL = 'https://assetstore.unity.com/ko-KR/publisher-sale';
const EMBED_IMAGE_ATTACHMENT = 'atkup-publisher-og.jpg';
const EMBED_COLOR = 0x00bcd4;

export interface PublisherSaleAssetInfo {
  couponCode: string | null;
  assetName: string | null;
  assetUrl: string | null;
  promoText: string | null;
  imageUrl: string | null;
}

function normalizeAssetStoreHref(href: string): string {
  return href.startsWith('http') ? href : `https://assetstore.unity.com${href}`;
}

function textLooksLikeGiftCta(blob: string): boolean {
  const lower = blob.toLowerCase();
  if (/get your (free )?gift/.test(lower)) return true;
  if (/\bfree gift\b/.test(lower)) return true;
  if (/무료\s*선물|선물\s*받기|무료\s*받기/.test(blob)) return true;
  return false;
}

function extractGiftPackageHrefFromRawHtml(html: string): string | null {
  const hrefFirst = /<a\b[^>]*\bhref="(\/packages\/[^"]+)"[^>]*\baria-label="[^"]*(?:gift|선물)[^"]*"/i;
  const ariaFirst = /<a\b[^>]*\baria-label="[^"]*(?:gift|선물)[^"]*"[^>]*\bhref="(\/packages\/[^"]+)"/i;
  const m = html.match(hrefFirst) || html.match(ariaFirst);
  return m ? m[1] : null;
}

function findGiftAssetUrl($: ReturnType<typeof cheerio.load>, html: string): string | null {
  let found: string | null = null;
  $('a[href*="/packages/"]').each((_, el) => {
    if (found) return;
    const $a = $(el);
    const href = $a.attr('href');
    if (!href || !href.includes('/packages/')) return;
    const blob = [$a.text(), $a.attr('aria-label') ?? '', $a.attr('title') ?? ''].join(' ');
    if (textLooksLikeGiftCta(blob)) {
      found = normalizeAssetStoreHref(href);
    }
  });
  if (found) return found;

  const fallback = extractGiftPackageHrefFromRawHtml(html);
  return fallback ? normalizeAssetStoreHref(fallback) : null;
}

async function fetchUnityAssetImage(assetUrl: string): Promise<string | null> {
  try {
    const res = await fetch(assetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      try {
        return new URL(ogImage, assetUrl).href;
      } catch {
        return ogImage.startsWith('http') ? ogImage : null;
      }
    }

    const firstImg = $('img').first().attr('src');
    if (firstImg) {
      try {
        return new URL(firstImg, assetUrl).href;
      } catch {
        return firstImg.startsWith('http') ? firstImg : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchPublisherSaleAssetInfo(): Promise<PublisherSaleAssetInfo | null> {
  const res = await fetch(PUBLISHER_SALE_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!res.ok) {
    throw new Error(`Unity Publisher Sale 페이지 요청 실패: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  const couponMatch = bodyText.match(/coupon code\s+([A-Z0-9]+)/i);
  const couponCode = couponMatch ? couponMatch[1] : null;

  const nameMatch = bodyText.match(/Add\s+(.+?)\s+to your cart/i);
  const assetName = nameMatch ? nameMatch[1].trim() : null;

  const assetUrl = findGiftAssetUrl($, html);

  let promoText: string | null = null;
  const promoMatch = bodyText.match(/promotion end[s]?\s+[^.]+?\./i);
  if (promoMatch) {
    promoText = promoMatch[0].trim();
  }

  if (!couponCode && !assetUrl) {
    return null;
  }

  const imageUrl = assetUrl ? await fetchUnityAssetImage(assetUrl) : null;

  return { couponCode, assetName, assetUrl, promoText, imageUrl };
}

async function tryOgImageAttachment(imageUrl: string | null): Promise<AttachmentBuilder | null> {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64 || buf.length > 8 * 1024 * 1024) return null;
    return new AttachmentBuilder(buf, { name: EMBED_IMAGE_ATTACHMENT });
  } catch {
    return null;
  }
}

function buildPublisherSaleEmbed(info: PublisherSaleAssetInfo, imageFromAttachment: boolean): EmbedBuilder {
  const title = info.assetName
    ? `🎁 이번 주 Unity 무료 에셋: ${info.assetName}`
    : '🎁 이번 주 Unity 무료 에셋';

  const lines: string[] = [];
  if (info.couponCode) lines.push(`✅ **쿠폰 코드**: \`${info.couponCode}\``);
  if (info.promoText) lines.push(`ℹ️ ${info.promoText}`);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.join('\n') || ' ')
    .setColor(EMBED_COLOR)
    .setFooter({ text: 'YawnBot · Unity Publisher Sale' });
  if (info.assetUrl) embed.setURL(info.assetUrl);
  if (imageFromAttachment) {
    embed.setImage(`attachment://${EMBED_IMAGE_ATTACHMENT}`);
  } else if (info.imageUrl) {
    embed.setImage(info.imageUrl);
  }
  return embed;
}

export async function sendPublisherSaleToChannel(
  channel: SendableChannels,
  info: PublisherSaleAssetInfo,
): Promise<void> {
  const ogAttach = await tryOgImageAttachment(info.imageUrl);
  const embed = buildPublisherSaleEmbed(info, !!ogAttach);
  const files = ogAttach ? [ogAttach] : [];
  const content =
    info.assetUrl != null && info.assetUrl.length > 0
      ? `에셋 페이지(탭에서 열기): ${info.assetUrl}`
      : undefined;
  try {
    await channel.send({ content, embeds: [embed], files });
  } catch (err: unknown) {
    if (ogAttach && files.length > 0) {
      console.warn('[UnityFree] 이미지 첨부 전송 실패(권한·용량 등), 외부 URL 이미지로 재시도:', err);
      const fallback = buildPublisherSaleEmbed(info, false);
      await channel.send({ content, embeds: [fallback] });
      return;
    }
    throw err;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

// 봇 재시작·재배포 후에도 dedup 유지. 쿠폰 없는 주는 assetUrl 으로 fallback.
// TASK-YB-007 — module-level let lastSentCoupon (TASK-YB-003) 휘발 + couponCode null 주 skip 두 케이스 fix.
interface UnityFreeState {
  lastCoupon: string | null;
  lastAssetUrl: string | null;
  lastSentAt: string | null;
}

const STATE_PATH = path.join(PKG_ROOT, 'data', 'unity-free-state.json');

function loadState(): UnityFreeState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<UnityFreeState>;
      return {
        lastCoupon: typeof parsed.lastCoupon === 'string' ? parsed.lastCoupon : null,
        lastAssetUrl: typeof parsed.lastAssetUrl === 'string' ? parsed.lastAssetUrl : null,
        lastSentAt: typeof parsed.lastSentAt === 'string' ? parsed.lastSentAt : null,
      };
    }
  } catch (err) {
    console.warn('[UnityFree] dedup state 읽기 실패 — 새 state 로 시작:', err);
  }
  return { lastCoupon: null, lastAssetUrl: null, lastSentAt: null };
}

function saveState(state: UnityFreeState): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf-8');
  } catch (err) {
    // dedup 깨지더라도 알림 자체는 살림 — 권한 사고 시 안전 degrade.
    console.warn('[UnityFree] dedup state 저장 실패:', err);
  }
}

function isDuplicate(state: UnityFreeState, info: PublisherSaleAssetInfo): boolean {
  if (info.couponCode != null && info.couponCode.length > 0) {
    return state.lastCoupon === info.couponCode;
  }
  if (info.assetUrl != null && info.assetUrl.length > 0) {
    return state.lastAssetUrl === info.assetUrl;
  }
  return false;
}

async function pollOnce(client: Client, channelId: string, force: boolean): Promise<{
  status: 'sent' | 'no_data' | 'dedup' | 'channel_unreachable' | 'fetch_failed';
  info: PublisherSaleAssetInfo | null;
  error?: string;
}> {
  let info: PublisherSaleAssetInfo | null;
  try {
    info = await fetchPublisherSaleAssetInfo();
  } catch (err: any) {
    console.error('[UnityFree] Unity 페이지 요청/파싱 실패:', err?.message ?? err);
    return { status: 'fetch_failed', info: null, error: String(err?.message ?? err) };
  }

  if (!info) {
    return { status: 'no_data', info: null };
  }

  const state = loadState();
  if (!force && isDuplicate(state, info)) {
    return { status: 'dedup', info };
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) {
    console.error('[UnityFree] 채널을 찾을 수 없거나 메시지를 보낼 수 없습니다:', channelId);
    return { status: 'channel_unreachable', info };
  }

  await sendPublisherSaleToChannel(channel, info);
  saveState({
    lastCoupon: info.couponCode,
    lastAssetUrl: info.assetUrl,
    lastSentAt: new Date().toISOString(),
  });
  return { status: 'sent', info };
}

/**
 * 환경변수:
 * - YAWNBOT_UNITY_FREE_CHANNEL_ID — 알림 채널 (미설정 시 폴링 비활성)
 * - YAWNBOT_UNITY_FREE_INTERVAL_MIN — 폴링 간격 (분, 기본 60, 최소 5)
 */
export function startUnityFreeNotifier(client: Client): void {
  stopUnityFreeNotifier();

  const channelId = channelIdFor('unity-free');
  if (!channelId) {
    console.warn('[UnityFree] YAWNBOT_UNITY_FREE_CHANNEL_ID 미설정 — Unity 무료 에셋 알림 비활성');
    return;
  }

  const intervalMin = Math.max(5, parseInt(process.env.YAWNBOT_UNITY_FREE_INTERVAL_MIN || '60', 10));
  const intervalMs = intervalMin * 60 * 1000;

  console.log(`[UnityFree] Unity 무료 에셋 알림 활성 (채널: ${channelId}, 간격: ${intervalMin}분)`);

  void pollOnce(client, channelId, false);
  timer = setInterval(() => {
    void pollOnce(client, channelId, false);
  }, intervalMs);
}

export function stopUnityFreeNotifier(): void {
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 슬래시 `/atkup unity [force]` 진입점.
 * 결과 status 를 반환해 슬래시 핸들러가 적절히 응답.
 */
export async function triggerUnityFreeOnce(
  client: Client,
  options: { force?: boolean } = {},
): Promise<{ status: 'sent' | 'no_data' | 'dedup' | 'channel_unreachable' | 'fetch_failed' | 'no_channel'; info: PublisherSaleAssetInfo | null; error?: string }> {
  const channelId = channelIdFor('unity-free');
  if (!channelId) {
    return { status: 'no_channel', info: null };
  }
  return pollOnce(client, channelId, !!options.force);
}
