import express from 'express';
import { EmbedBuilder, Status } from 'discord.js';
import type { Client } from 'discord.js';
import type { GameDataService } from '../services/gamedata';
import { getChannelsForRepo } from '../services/webhook-routes';
import { isDigestCommit, handleDigestCommit } from '../services/digest-webhook';
import { syncTaskStatusOnPrMerge } from '../services/task-status-sync';

export function createGithubWebhookApp(client: Client, gameData: GameDataService) {
  const app = express();
  app.use(express.json());

  // YB-020 Step 2 — gateway 가 살아있어도 dispatch 가 멈춘 zombie 상태 관측용.
  // discord.js 는 op0 dispatch 마다 'raw' emit. 503 판정엔 안 쓰고 (조용한
  // 시간대 false disconnected 위험) observability 신호로만 노출.
  let lastDispatchAt: number | null = null;
  client.on('raw', () => {
    lastDispatchAt = Date.now();
  });

  app.get('/health', (_req, res) => {
    const gatewayUp = client.isReady() && client.ws.status === Status.Ready;
    res.status(gatewayUp ? 200 : 503).json({
      ok: gatewayUp,
      gateway: gatewayUp ? 'connected' : 'disconnected',
      uptime_sec: Math.floor(process.uptime()),
      ws_status: client.ws.status,
      ws_ping_ms: client.ws.ping,
      ready_at: client.readyAt?.toISOString() ?? null,
      last_dispatch_at: lastDispatchAt ? new Date(lastDispatchAt).toISOString() : null,
      deps: {
        game_data_users: Object.keys(gameData.users ?? {}).length,
      },
    });
  });

  app.post('/webhook/github', async (req, res) => {
    try {
      const event = req.headers['x-github-event'];
      const payload = req.body;
      console.log(`[Webhook] Received: ${event}`);

      const repoFullName: string | undefined = payload.repository?.full_name;
      const channelIds = getChannelsForRepo(repoFullName);

      // TASK-KAR-092: PR merge → TASK status 자동 sync (디스코드 채널 무관 — 매핑
      // 없는 repo 도 KAR-092 가 작동해야 자가발전 루프 폐쇄). 2026-05-22 fix:
      // 이전엔 채널 매칭 없으면 early return → KAR-092 미발동 → fake/외부 webhook
      // 검증 불가능 + 새 repo 추가 시 sync 누락.
      if (event === 'pull_request' && payload.action === 'closed' && payload.pull_request?.merged) {
        const pr = payload.pull_request;
        void syncTaskStatusOnPrMerge(process.env, {
          prNumber: pr.number,
          prTitle: pr.title,
          prBody: pr.body,
        })
          .then(async (r) => {
            console.log(`[task-status-sync] ${r.outcome}: pushed=${r.pushed} skipped=${r.skipped} errors=${r.errors.length}`);
            if (!r.summaryLine) return;
            for (const channelId of channelIds) {
              const channel = await client.channels.fetch(channelId).catch(() => null);
              if (channel?.isSendable()) {
                await channel.send({ content: r.summaryLine }).catch(() => {});
              }
            }
          })
          .catch((e) => console.error('[task-status-sync] error:', e?.message ?? e));
      }

      if (channelIds.length === 0) {
        console.warn(
          `[Webhook] ${repoFullName ?? '?'} 매칭 채널 없음 — 디스코드 전송 생략 (data/webhook-routes.json 확인)`,
        );
        res.sendStatus(200);
        return;
      }

      const embed = new EmbedBuilder()
        .setAuthor({ name: payload.sender?.login || 'GitHub', iconURL: payload.sender?.avatar_url })
        .setColor(0x4caf50)
        .setFooter({ text: payload.repository?.full_name || '' })
        .setTimestamp();

      if (event === 'ping') {
        embed.setTitle(gameData.getMessage('Webhook_Ping_Title')).setDescription(gameData.getMessage('Webhook_Ping_Desc'));
      } else if (event === 'push') {
        if (!payload.commits || !payload.commits.length) {
          res.sendStatus(200);
          return;
        }

        // TASK-YB-004 — dev-digest commit 감지: chore(digests): + digests/*.md added.
        // 해당 commit 발견 시 Yawn AI 가공 후 별도 embed 전송 + regular embed skip.
        const digestCommit = payload.commits.find((c: any) => isDigestCommit(c));
        if (digestCommit) {
          res.sendStatus(200);
          // async 이므로 res 먼저 보내고 AI 처리 (최대 수 초 소요)
          void handleDigestCommit(client, digestCommit, repoFullName ?? '', channelIds);
          return;
        }

        embed.setTitle(gameData.getMessage('Webhook_Push_Title', payload.commits.length));
        const desc = payload.commits
          .slice(0, 5)
          .map((c: any) => `- [\`${c.id.slice(0, 7)}\`](${c.url}) ${c.message}`)
          .join('\n');
        embed.setDescription(desc);

        // TASK-WM-093 Phase F — claude-audit auto-fix push 시각 분리.
        // 모든 commit 의 subject 첫 줄이 `chore(audit-fix):` prefix 면 회색 (자동 배경 작업 톤).
        // 사람 손 push (default 초록 0x4caf50) 과 자동 fix push 디스코드 채널에서 즉시 구분.
        const isAuditFixPush = payload.commits.every((c: any) => {
          const firstLine = String(c.message ?? '').split('\n', 1)[0];
          return firstLine.startsWith('chore(audit-fix):');
        });
        if (isAuditFixPush) {
          embed.setColor(0x808080);
        }
      } else if (event === 'issues') {
        embed
          .setTitle(gameData.getMessage('Webhook_Issue_Title', payload.issue?.number, payload.action))
          .setDescription(gameData.getMessage('Webhook_Issue_Desc', payload.issue?.title, payload.issue?.html_url))
          .setColor(payload.action === 'opened' ? 0xff9800 : 0x4285f4);
      } else if (event === 'pull_request') {
        const pr = payload.pull_request;
        if (!pr) {
          res.sendStatus(200);
          return;
        }
        let action: string = payload.action;
        if (action === 'closed' && pr.merged) action = 'merged';

        const colorByAction: Record<string, number> = {
          opened: 0x2cbe4e,
          reopened: 0xff9800,
          merged: 0x6f42c1,
          closed: 0xcb2431,
          ready_for_review: 0x4285f4,
        };
        if (!(action in colorByAction)) {
          console.log(`[Webhook] PR action 무시: ${action}`);
          res.sendStatus(200);
          return;
        }

        embed
          .setTitle(gameData.getMessage('Webhook_PR_Title', pr.number, action))
          .setDescription(
            gameData.getMessage(
              'Webhook_PR_Desc',
              pr.title,
              pr.html_url,
              pr.head?.ref ?? '?',
              pr.base?.ref ?? '?',
            ),
          )
          .setColor(colorByAction[action]);
      } else if (event === 'release') {
        const release = payload.release;
        if (!release || payload.action !== 'published') {
          console.log(`[Webhook] Release action 무시: ${payload.action}`);
          res.sendStatus(200);
          return;
        }
        embed
          .setTitle(gameData.getMessage('Webhook_Release_Title', release.tag_name))
          .setDescription(
            gameData.getMessage(
              'Webhook_Release_Desc',
              release.name || release.tag_name,
              release.html_url,
            ),
          )
          .setColor(release.prerelease ? 0xff9800 : 0x6f42c1);
      } else {
        console.log(`[Webhook] 처리 안 함(디스코드 미전송): ${String(event)} — push|issues|pull_request|release|ping 만 임베드`);
        res.sendStatus(200);
        return;
      }

      for (const channelId of channelIds) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel?.isSendable()) {
          await channel.send({ embeds: [embed] }).catch((e: any) =>
            console.error('[Webhook] 채널 전송 실패:', channelId, e?.message ?? e),
          );
        }
      }

      res.sendStatus(200);
    } catch (err: any) {
      console.error('[Webhook] Error:', err?.message ?? err);
      res.sendStatus(500);
    }
  });

  return app;
}

