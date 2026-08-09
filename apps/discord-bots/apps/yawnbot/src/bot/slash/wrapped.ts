/**
 * `/결산` — 서버 결산 카드 (TASK-YB-042).
 *
 * 자랑하려고 스샷을 찍게 만드는 게 목적이라, 숫자 나열이 아니라 **칭호**로 읽히게 짠다.
 * (이미지 카드 렌더는 다음 단계 — 지금은 embed 로 루프부터 검증.)
 */
import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from './bot-context';
import {
  getServerStatsRecorder,
  type DebugDump,
  type RankedUser,
  type ServerSummary,
} from '../../services/server-stats';
import {
  coverageDebugLine,
  coverageNotice,
  guildCoverage,
  UNKNOWN_COVERAGE,
  type CoverageReport,
} from '../stats-coverage';

const MEDALS = ['🥇', '🥈', '🥉'];
const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** 24시간 분포를 한 줄 막대로. 최대값 기준 상대 높이. */
export function sparkline(hours: number[]): string {
  const max = Math.max(...hours, 0);
  if (max === 0) return SPARK[0].repeat(hours.length);
  return hours
    .map((count) => {
      if (count === 0) return SPARK[0];
      const level = Math.ceil((count / max) * (SPARK.length - 1));
      return SPARK[level];
    })
    .join('');
}

/** 13 → "오후 1시" 처럼 사람 말로. */
export function hourLabel(hour: number): string {
  if (hour === 0) return '자정';
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return '정오';
  if (hour < 18) return `오후 ${hour - 12}시`;
  return `밤 ${hour - 12}시`;
}

function rankLines(entries: RankedUser[], unit: string): string {
  if (!entries.length) return '_아직 없음_';
  return entries
    .map((entry, index) => `${MEDALS[index] ?? '　'} **${entry.name}** — ${entry.value.toLocaleString('ko-KR')}${unit}`)
    .join('\n');
}

/** 요약 → 카드 embed. Discord 없이도 테스트 가능하도록 순수 함수로 뺀다. */
export function buildWrappedEmbed(
  summary: ServerSummary,
  guildName: string,
  coverage: CoverageReport = UNKNOWN_COVERAGE,
): EmbedBuilder {
  const notice = coverageNotice(coverage, summary.totalMessages);
  const embed = new EmbedBuilder()
    .setTitle(`🎁 ${guildName} 결산`)
    .setColor(0xffc86b)
    .setFooter({ text: `최근 ${summary.days}일 · 기록된 날 ${summary.daysWithData}일 · 메시지 내용은 저장하지 않습니다` });

  if (summary.totalMessages === 0) {
    // 0 이 「아무도 안 떠들었다」인지 「욘이 그 채널을 못 본다」인지 여기서 갈라 준다.
    embed.setDescription(
      notice
        ? [notice, '', '권한을 켜면 그때부터 세기 시작해요 (지나간 대화는 소급 X).'].join('\n')
        : ['아직 셀 게 없어요.', '', '지금부터 세기 시작합니다 — 며칠 떠들고 다시 불러 주세요.'].join('\n'),
    );
    return embed;
  }

  embed.setDescription(
    `**메시지 ${summary.totalMessages.toLocaleString('ko-KR')}개** · **${summary.activeUsers}명**이 떠들었고, ` +
      `글자로는 **${summary.totalChars.toLocaleString('ko-KR')}자**를 썼어요.`,
  );

  embed.addFields({ name: '🏆 수다왕', value: rankLines(summary.topTalkers, '개'), inline: true });

  if (summary.mostReacted.length) {
    embed.addFields({ name: '💖 인기상 (반응 받음)', value: rankLines(summary.mostReacted, '개'), inline: true });
  }
  if (summary.topReactors.length) {
    embed.addFields({ name: '🫶 리액션 요정 (반응 눌러줌)', value: rankLines(summary.topReactors, '번'), inline: true });
  }
  if (summary.nightOwl) {
    embed.addFields({
      name: '🦉 새벽 유령',
      value: `**${summary.nightOwl.name}** — 말한 것의 ${Math.round(summary.nightOwl.ratio * 100)}%가 새벽 0~6시`,
      inline: false,
    });
  }
  if (summary.topEmojis.length) {
    embed.addFields({
      name: '😂 이 서버의 표정',
      value: summary.topEmojis.map((e) => `${e.name} ×${e.count}`).join('　'),
      inline: false,
    });
  }

  const rhythm: string[] = [];
  if (summary.busiestHour) rhythm.push(`가장 붐빈 시각 — **${hourLabel(summary.busiestHour.hour)}**`);
  if (summary.busiestChannel) rhythm.push(`가장 붐빈 채널 — <#${summary.busiestChannel.channelId}>`);
  rhythm.push('```' + sparkline(summary.hours) + '```');
  embed.addFields({ name: '🕐 하루의 리듬 (0시 → 23시)', value: rhythm.join('\n'), inline: false });

  // 숫자가 나오는 카드에도 「일부만 세고 있다」는 사실은 붙어야 한다 — 안 그러면 축소된 값을 진짜로 믿는다.
  if (notice) embed.addFields({ name: '🙈 안 보이는 곳', value: notice, inline: false });

  return embed;
}

/**
 * 원시 수치 창 — 카드가 이상할 때 "집계가 틀렸나 표시가 틀렸나"를 가른다.
 * 표시용 가공을 최소로 하고, 저장 상태(파일 존재·마지막 저장 시각)까지 같이 보여준다.
 */
export function buildDebugText(
  dump: DebugDump,
  days: number,
  coverage: CoverageReport = UNKNOWN_COVERAGE,
): string {
  const lines: string[] = [];
  lines.push(`■ 범위 ${days}일 · 오늘(KST) = ${dump.todayKey}`);
  lines.push(coverageDebugLine(coverage));
  lines.push(`■ 기록 있는 날 ${dump.dayKeys.length}개: ${dump.dayKeys.slice(0, 8).join(', ') || '(없음)'}`);
  lines.push(
    `■ 저장: ${dump.stateFileExists ? `있음 (마지막 ${dump.stateFileMtime})` : '아직 없음 (첫 저장 전)'}` +
      ` · 미저장 변경 ${dump.dirty ? '있음' : '없음'}`,
  );
  lines.push('');

  if (!dump.rows.length) {
    // 「안 보이는 채널」이 있으면 그게 0 의 원인일 확률이 높다 — 엉뚱한 안내부터 하지 않는다.
    lines.push(
      coverage.known && coverage.blind.length
        ? `아직 잡힌 사람 없음 — 가려진 채널 ${coverage.blind.length}개부터 의심. 채널 권한에서 욘에게 「채널 보기」를 켜라.`
        : '아직 잡힌 사람 없음. 아무 채널에나 한 마디 하고 다시 쳐 보세요.',
    );
  } else {
    lines.push('사람      메시지  글자   새벽  준반응  받은반응');
    for (const row of dump.rows.slice(0, 15)) {
      const name = row.name.length > 8 ? `${row.name.slice(0, 7)}…` : row.name;
      lines.push(
        [
          name.padEnd(9),
          String(row.msgs).padStart(6),
          String(row.chars).padStart(6),
          String(row.nightMsgs).padStart(5),
          String(row.reactionsGiven).padStart(7),
          String(row.reactionsGot).padStart(9),
        ].join(''),
      );
    }
  }

  lines.push('');
  lines.push(`■ 시각별: ${dump.hours.map((c, h) => (c ? `${h}시:${c}` : null)).filter(Boolean).join(' ') || '(없음)'}`);
  lines.push(
    `■ 채널별: ${dump.channels.slice(0, 6).map((c) => `${c.channelId}:${c.count}`).join(' ') || '(없음)'}`,
  );

  return lines.join('\n');
}

export async function handleWrapped(_ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: '서버 안에서 써 주세요 — 서버 단위 결산이에요.' });
    return;
  }

  const days = interaction.options.getInteger('기간') ?? 7;
  const recorder = getServerStatsRecorder();

  // 매주 자동으로 받을지 — 켠 사람이 명령을 친 그 채널로 간다.
  const auto = interaction.options.getBoolean('매주');
  if (auto !== null) {
    recorder.setWeekly(interaction.guildId, auto ? interaction.channelId : null);
    await interaction.reply({
      content: auto
        ? '📬 매주 월요일 아침, 이 채널로 지난 한 주 결산을 보냅니다.'
        : '📭 주간 자동 결산을 껐습니다.',
    });
    return;
  }

  if (interaction.options.getBoolean('자세히')) {
    // 눈으로 파일을 확인할 수 있게 즉시 저장한 뒤 덤프한다 (20초 대기 X).
    recorder.flushNow();
    const text = buildDebugText(recorder.debug(interaction.guildId, days), days, guildCoverage(interaction.guild));

    // 개발 콘솔 주소는 *서버를 관리하는 사람에게만*, 그것도 나만 보이는 답으로 준다.
    // 이 주소는 카드 공유 키와 다른 열쇠라, 카드를 남에게 줘도 콘솔은 안 열린다.
    const canManage = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
    const devUrl = canManage ? devConsoleUrl(recorder.devKey(interaction.guildId), days) : null;

    await interaction.reply({
      content:
        '```\n' + text.slice(0, 1700) + '\n```' +
        (devUrl ? `\n🔧 개발 콘솔 (나만 보임 · 공유 금지): ${devUrl}` : ''),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const summary = recorder.summarize(interaction.guildId, days);
  const guildName = interaction.guild?.name ?? '우리 서버';
  const embed = buildWrappedEmbed(summary, guildName, guildCoverage(interaction.guild));

  // 자랑은 디스코드 밖에서 일어나야 유입이 된다 → 링크를 항상 같이 준다.
  const url = wrappedUrl(recorder.shareKey(interaction.guildId), days);
  if (url) embed.addFields({ name: '🔗 웹에서 보기', value: url, inline: false });

  await interaction.reply({ embeds: [embed] });
}

/** 공유 키 → 웹 결산 주소. 공개 주소가 설정 안 됐으면 null (링크 생략). */
export function wrappedUrl(shareKey: string, days: number): string | null {
  const base = (process.env.YAWNBOT_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return days === 7 ? `${base}/w/${shareKey}` : `${base}/w/${shareKey}?days=${days}`;
}

/** 개발 콘솔 주소 — 공유 키가 아니라 *개발 키* 로 만든다. */
export function devConsoleUrl(devKey: string, days: number): string | null {
  const base = (process.env.YAWNBOT_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/w/${devKey}/dev?days=${days}`;
}
