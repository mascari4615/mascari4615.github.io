/**
 * 주간 결산 자동 게시 (TASK-YB-042).
 *
 * 왜: 명령을 쳐야만 나오는 결산은 습관이 되지 않는다. 월요일 아침에 먼저 와야
 * 사람들이 "지난주 우리 뭐 했지" 를 열어 본다 — 재방문은 거기서 생긴다.
 *
 * 시각이 딱 맞을 때만 보내면 봇이 잠깐 꺼져 있던 주는 통째로 사라진다.
 * 그래서 판단은 「월요일 10시(KST) 이후 + 이번 주 몫 미발송」 이고, 켜질 때 따라잡는다.
 */
import { EmbedBuilder, type Client, type TextBasedChannel } from 'discord.js';
import { getServerStatsRecorder } from '../server-stats';
import { buildWrappedEmbed, wrappedUrl } from '../../bot/slash/wrapped';

const TICK_MS = 10 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

function isSendable(channel: unknown): channel is TextBasedChannel & { send: (o: unknown) => Promise<unknown> } {
  return !!channel && typeof (channel as { send?: unknown }).send === 'function';
}

export async function runWeeklyWrappedTick(client: Client, now = new Date()): Promise<number> {
  const recorder = getServerStatsRecorder();
  const due = recorder.dueWeekly(now);
  let posted = 0;

  for (const { guildId, channelId } of due) {
    try {
      const guild = client.guilds.cache.get(guildId);
      // 봇이 쫓겨난 서버는 조용히 건너뛴다 (설정은 남겨 둔다 — 다시 부르면 이어진다).
      if (!guild) continue;
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!isSendable(channel)) continue;

      const summary = recorder.summarize(guildId, 7, now);
      // 한 주 내내 아무 말도 없었으면 굳이 빈 카드를 들이밀지 않는다.
      if (summary.totalMessages === 0) {
        recorder.markWeeklyPosted(guildId, now);
        continue;
      }

      const embed: EmbedBuilder = buildWrappedEmbed(summary, guild.name);
      const url = wrappedUrl(recorder.shareKey(guildId), 7);
      if (url) embed.addFields({ name: '🔗 웹에서 보기', value: url, inline: false });

      await channel.send({ content: '지난 한 주, 이 방의 기록.', embeds: [embed] });
      recorder.markWeeklyPosted(guildId, now);
      posted += 1;
    } catch (e) {
      // 한 서버가 실패해도 나머지는 계속 보낸다.
      console.warn('[WeeklyWrapped] 게시 실패', guildId, e instanceof Error ? e.message : e);
    }
  }

  if (posted > 0) console.log(`[WeeklyWrapped] ${posted}개 서버에 주간 결산 게시`);
  return posted;
}

export function startWeeklyWrapped(client: Client): void {
  if (timer) return;
  timer = setInterval(() => {
    void runWeeklyWrappedTick(client);
  }, TICK_MS);
  timer.unref?.();
  console.log('[WeeklyWrapped] 주간 결산 자동 게시 활성 (월요일 오전 10시 KST 이후, 10분 간격 확인)');
  // 부팅 직후에도 한 번 본다 — 주말 내내 꺼져 있었으면 지금이 그 시각이다.
  void runWeeklyWrappedTick(client);
}

export function stopWeeklyWrapped(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
