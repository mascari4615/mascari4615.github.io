/**
 * 「욘이 이 서버에서 어느 채널을 볼 수 있나」 (TASK-YB-042).
 *
 * 왜 필요한가: 봇이 채널을 못 보면 메시지 이벤트 자체가 안 온다 → 결산이 0 으로 나온다.
 * 그런데 0 은 「아무도 안 떠들었다」와 생김새가 같다. 실제로 그래서 며칠치 대화가 통째로
 * 안 세지는 동안 카드는 "며칠 떠들고 다시 오세요" 라고 안내했다 — 원인을 정반대로 가리킨 셈.
 * → 0 을 보여줄 때는 **볼 수 있는 채널이 있는지**를 같이 말해야 정보가 된다.
 *
 * 판정 기준 = `채널 보기(View Channel)` 하나. 메시지 수신에 필요한 건 이것뿐이고,
 * 「메시지 기록 보기」는 과거를 읽는 권한이라 실시간 집계와 무관하다.
 */
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { Guild, GuildBasedChannel } from 'discord.js';

/** 사람이 떠들 수 있는 채널만 센다 (카테고리·목소리 전용 칸 제외). */
const COUNTED_TYPES: ChannelType[] = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
];

export interface ChannelVisibility {
  channelId: string;
  /** `#` 없는 채널 이름 */
  name: string;
  visible: boolean;
}

export interface CoverageReport {
  /** 봇 연결 정보로 실제 확인했는가. false 면 아래 수치는 의미 없음(모름). */
  known: boolean;
  /** 사람이 떠들 수 있는 채널 수 */
  total: number;
  /** 그중 욘이 보는 채널 수 */
  visible: number;
  /** 못 보는 채널 (이름 표시용) */
  blind: { channelId: string; name: string }[];
}

export const UNKNOWN_COVERAGE: CoverageReport = { known: false, total: 0, visible: 0, blind: [] };

export function summarizeCoverage(channels: ChannelVisibility[]): CoverageReport {
  const blind = channels.filter((c) => !c.visible).map((c) => ({ channelId: c.channelId, name: c.name }));
  return {
    known: true,
    total: channels.length,
    visible: channels.length - blind.length,
    blind,
  };
}

/** discord.js 어댑터 — 순수 판정은 위 함수가 하고, 여기서는 권한만 읽는다. */
export function guildCoverage(guild: Guild | null | undefined): CoverageReport {
  const me = guild?.members?.me;
  if (!guild || !me) return UNKNOWN_COVERAGE;
  const channels: ChannelVisibility[] = [];
  for (const raw of guild.channels.cache.values()) {
    const channel = raw as GuildBasedChannel | null;
    if (!channel || !COUNTED_TYPES.includes(channel.type)) continue;
    const perms = channel.permissionsFor(me);
    channels.push({
      channelId: channel.id,
      name: channel.name,
      visible: perms?.has(PermissionFlagsBits.ViewChannel) ?? false,
    });
  }
  return summarizeCoverage(channels);
}

function channelList(blind: { name: string }[], max = 4): string {
  const shown = blind.slice(0, max).map((c) => `#${c.name}`).join(', ');
  return blind.length > max ? `${shown} 외 ${blind.length - max}개` : shown;
}

/**
 * 사람 말 한 줄. 「기록이 왜 없나」에 답이 되는 문장만 돌려주고, 문제 없으면 null.
 *
 * - 볼 수 있는 채널 0개  → 결산이 영원히 0. 이건 알려야 한다(메시지 수와 무관).
 * - 일부만 못 봄 + 기록 0 → 십중팔구 사람들은 그 안 보이는 채널에서 떠들고 있다.
 * - 일부만 못 봄 + 기록 O → 수치가 실제보다 적다는 주석.
 */
export function coverageNotice(coverage: CoverageReport, totalMessages: number): string | null {
  if (!coverage.known) return null;
  if (coverage.visible === 0 && coverage.total > 0) {
    return (
      `🙈 욘이 이 서버에서 **볼 수 있는 채널이 하나도 없어요** (${coverage.total}개 전부 가려짐). ` +
      '이러면 무슨 말을 해도 안 세집니다 — 채널 설정 → 권한에서 욘에게 「채널 보기」를 켜 주세요.'
    );
  }
  if (coverage.blind.length === 0) return null;
  if (totalMessages === 0) {
    return (
      `🙈 욘이 못 보는 채널이 ${coverage.blind.length}개 있어요 (${channelList(coverage.blind)}). ` +
      '거기 대화는 세지 못합니다 — 채널 권한에서 욘에게 「채널 보기」를 켜 주세요.'
    );
  }
  return `🙈 못 보는 채널 ${coverage.blind.length}개 (${channelList(coverage.blind)}) — 이 숫자에는 안 들어갔어요.`;
}

/** 「자세히」·개발 콘솔용 한 줄 — 진단이라 상태를 그대로 적는다. */
export function coverageDebugLine(coverage: CoverageReport): string {
  if (!coverage.known) return '■ 채널 시야: 확인 못 함 (봇 연결 정보 없음)';
  const head = `■ 채널 시야: 봄 ${coverage.visible} / 전체 ${coverage.total}`;
  if (!coverage.blind.length) return `${head} · 가려진 채널 없음`;
  return `${head} · 가려짐: ${channelList(coverage.blind, 6)}`;
}
