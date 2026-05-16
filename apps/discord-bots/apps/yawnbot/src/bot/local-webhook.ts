/**
 * 로컬 기기·앱이 보낸 webhook 수신 (TASK-WM-087).
 *
 * GitHub webhook (`/webhook/github`) 과 같은 express app 에 mount.
 * 정본 = `webhook-routes.json` 의 `localRoutes` (kind 별 채널) + fallback `localDefault` → `default`.
 *
 * 신뢰 모델:
 *   - 같은 머신 (KarmoLab Tauri ↔ yawnbot NSSM) 또는 신뢰 LAN 내부 호출 가정.
 *   - `LOCAL_WEBHOOK_SECRET` env 박혀있으면 `X-Yawnbot-Secret` header 와 정합 검증 — 미박힘 시 dev 모드 (auth bypass + warn).
 *
 * 첫 사용처: KarmoLab Tauri 의 `wm_log_watcher.rs` (Editor.log → error CS\d+ 발견 시 POST).
 * 미래 사용처: KarmoLab 다른 알림 (메트릭 / 사고 / 발견) 도 같은 endpoint 재사용 — kind 만 분기.
 */
import type { Application } from 'express';
import { EmbedBuilder } from 'discord.js';
import type { Client } from 'discord.js';

import { getLocalChannels, hasAnyLocalRoute } from '../services/webhook-routes';

interface LocalEventField {
  name: string;
  value: string;
  inline?: boolean;
}

interface LocalEventPayload {
  /** 이벤트 종류. webhook-routes.json 의 localRoutes key 와 매칭 (예: 'wm-compile-error'). */
  kind: string;
  /** 보낸 출처 표시 (footer). 예: 'karmolab-tauri/wm_log_watcher'. */
  source?: string;
  /** Discord embed title. ≤256 char. */
  title: string;
  /** Discord embed description. ≤4000 char. */
  summary?: string;
  /** color 분기. 'info' 초록 / 'warning' 주황 / 'error' 빨강. */
  level?: 'info' | 'warning' | 'error';
  /** embed.url. */
  url?: string;
  /** ≤10 fields. */
  fields?: LocalEventField[];
}

const COLOR_BY_LEVEL: Record<NonNullable<LocalEventPayload['level']>, number> = {
  info: 0x4caf50,
  warning: 0xff9800,
  error: 0xcb2431,
};

/**
 * webhook-routes(localRoutes→localDefault→default) 해석 + embed 송신.
 * HTTP 핸들러와 에이전트 팀 NotifyFn 의 *단일 송신 경로* (평행정의0).
 * @returns 실제 전송된 채널 수.
 */
export async function sendLocalEvent(
  client: Client,
  payload: LocalEventPayload,
  channelOverride?: string[],
): Promise<number> {
  const channelIds =
    channelOverride && channelOverride.length > 0
      ? channelOverride
      : getLocalChannels(payload.kind);
  if (channelIds.length === 0) return 0;

  const level = payload.level ?? 'info';
  const color = COLOR_BY_LEVEL[level] ?? COLOR_BY_LEVEL.info;
  const embed = new EmbedBuilder()
    .setTitle(payload.title.slice(0, 256))
    .setColor(color)
    .setTimestamp();
  if (payload.summary) embed.setDescription(payload.summary.slice(0, 4000));
  if (payload.url) embed.setURL(payload.url);
  if (payload.source) embed.setFooter({ text: payload.source.slice(0, 256) });
  if (Array.isArray(payload.fields) && payload.fields.length > 0) {
    embed.addFields(
      payload.fields.slice(0, 10).map((f) => ({
        name: String(f?.name ?? '').slice(0, 256),
        value: String(f?.value ?? '').slice(0, 1024),
        inline: !!f?.inline,
      })),
    );
  }

  let sent = 0;
  for (const channelId of channelIds) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel?.isSendable()) {
      const ok = await channel
        .send({ embeds: [embed] })
        .then(() => true)
        .catch((e: any) => {
          console.error('[LocalWebhook] 채널 전송 실패:', channelId, e?.message ?? e);
          return false;
        });
      if (ok) sent++;
    }
  }
  return sent;
}

export function mountLocalWebhook(app: Application, client: Client): void {
  const expectedSecret = process.env.LOCAL_WEBHOOK_SECRET?.trim() || '';

  app.post('/webhook/local', async (req, res) => {
    try {
      if (expectedSecret) {
        const provided = req.headers['x-yawnbot-secret'];
        if (typeof provided !== 'string' || provided !== expectedSecret) {
          console.warn('[LocalWebhook] secret mismatch — reject');
          res.sendStatus(401);
          return;
        }
      }

      const payload = req.body as Partial<LocalEventPayload> | undefined;
      if (!payload || typeof payload.kind !== 'string' || typeof payload.title !== 'string') {
        res.status(400).json({ error: 'kind + title 필수 (string)' });
        return;
      }

      const sent = await sendLocalEvent(client, payload as LocalEventPayload);
      if (sent === 0) {
        console.warn(
          `[LocalWebhook] kind="${payload.kind}" 매칭 채널 없음/전송 0 — 생략 (data/webhook-routes.json 확인)`,
        );
      }
      res.sendStatus(200);
    } catch (err: any) {
      console.error('[LocalWebhook] Error:', err?.message ?? err);
      res.sendStatus(500);
    }
  });

  if (!hasAnyLocalRoute()) {
    console.warn(
      '[LocalWebhook] data/webhook-routes.json 의 localRoutes·localDefault 가 모두 비어있고 default 도 비면 — 모든 local 요청은 noop 됩니다.',
    );
  }
  if (!expectedSecret) {
    console.warn(
      '[LocalWebhook] LOCAL_WEBHOOK_SECRET 미설정 — 인증 bypass (dev 모드). prod 에선 NSSM AppEnvironmentExtra 로 박을 것.',
    );
  }
}
