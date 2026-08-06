/**
 * 웹 결산 페이지 (TASK-YB-042) — `/w/<공유키>`.
 *
 * 왜 웹인가: 디스코드 embed 는 그 서버 안에서만 보인다. 자랑은 밖에서 일어나야 유입이 된다.
 * 왜 공유키인가: 주소가 서버 ID 면 남의 서버 결산이 추측만으로 열린다. 키는 못 맞힌다.
 *
 * 페이지는 자기 완결(외부 CDN·폰트 0) — 봇 머신에서 바로 뜨고, 스샷 찍기 좋게 세로 카드 비율.
 */
import type { Application, Request, Response } from 'express';
import type { Client } from 'discord.js';
import { getServerStatsRecorder, type DebugDump, type ServerSummary } from '../services/server-stats';

/** 카드에 실을 값 — HTML 과 JSON 이 같은 모양을 쓰도록 한 번 만든다. */
export interface WrappedPageData {
  guildName: string;
  days: number;
  summary: ServerSummary;
  /** 「자세히」 절 — 전원 표·채널별·날짜별. 카드는 top3 만 보여주므로 여기서 전부 편다. */
  detail: DebugDump;
  /** 채널 ID → 사람이 읽는 이름. 모르면 ID 그대로. */
  channelNames: Record<string, string>;
  generatedAt: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 13 → "오후 1시" (embed 쪽과 같은 규칙). */
function hourLabel(hour: number): string {
  if (hour === 0) return '자정';
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return '정오';
  if (hour < 18) return `오후 ${hour - 12}시`;
  return `밤 ${hour - 12}시`;
}

function podium(entries: { name: string; value: number }[], unit: string): string {
  if (!entries.length) return '<p class="empty">아직 없음</p>';
  const medals = ['🥇', '🥈', '🥉'];
  return (
    '<ol class="rank">' +
    entries
      .map(
        (entry, index) =>
          `<li><span class="medal">${medals[index] ?? '·'}</span>` +
          `<span class="who">${escapeHtml(entry.name)}</span>` +
          `<span class="num">${entry.value.toLocaleString('ko-KR')}${unit}</span></li>`,
      )
      .join('') +
    '</ol>'
  );
}

/** 24시간 막대 — 픽셀 그래프 대신 CSS 높이. 스샷에서도 깨지지 않는다. */
function hoursChart(hours: number[]): string {
  const max = Math.max(...hours, 1);
  const bars = hours
    .map((count, hour) => {
      const pct = Math.round((count / max) * 100);
      return `<div class="bar" title="${hourLabel(hour)} · ${count}개"><i style="height:${Math.max(pct, 2)}%"></i></div>`;
    })
    .join('');
  return `<div class="hours">${bars}</div><div class="hours-axis"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span></div>`;
}

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return '<p class="empty">아직 없음</p>';
  const head = headers.map((h, i) => `<th${i ? ' class="r"' : ''}>${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((cells) => '<tr>' + cells.map((c, i) => `<td${i ? ' class="r"' : ''}>${c}</td>`).join('') + '</tr>')
    .join('');
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function num(value: number): string {
  return value.toLocaleString('ko-KR');
}

/**
 * 「자세히」 절 — 카드가 요약이라면 여기는 원본이다.
 * `<details>` 로 접어 둔다: 자랑용 스샷에는 안 걸리고, 궁금하면 펼친다.
 */
function detailSection(data: WrappedPageData): string {
  const { detail, channelNames } = data;

  const people = table(
    ['사람', '메시지', '글자', '평균길이', '새벽', '준 반응', '받은 반응'],
    detail.rows.map((row) => [
      escapeHtml(row.name),
      num(row.msgs),
      num(row.chars),
      row.msgs ? num(Math.round(row.chars / row.msgs)) : '0',
      row.nightMsgs ? `${num(row.nightMsgs)} <span class="dim">(${Math.round((row.nightMsgs / row.msgs) * 100)}%)</span>` : '0',
      num(row.reactionsGiven),
      num(row.reactionsGot),
    ]),
  );

  const totalChannelMsgs = detail.channels.reduce((sum, c) => sum + c.count, 0) || 1;
  const channels = table(
    ['채널', '메시지', '비중'],
    detail.channels.map((c) => [
      escapeHtml(channelNames[c.channelId] ?? c.channelId),
      num(c.count),
      `${Math.round((c.count / totalChannelMsgs) * 100)}%`,
    ]),
  );

  const maxDaily = Math.max(...detail.daily.map((d) => d.msgs), 1);
  const daily = table(
    ['날짜', '메시지', '사람', ''],
    detail.daily
      .slice()
      .reverse()
      .map((d) => [
        escapeHtml(d.dayKey),
        num(d.msgs),
        num(d.users),
        `<span class="minibar" style="width:${Math.max(Math.round((d.msgs / maxDaily) * 100), 2)}%"></span>`,
      ]),
  );

  const hours = table(
    ['시각', '메시지'],
    detail.hours
      .map((count, hour) => ({ count, hour }))
      .filter((h) => h.count > 0)
      .map((h) => [hourLabel(h.hour), num(h.count)]),
  );

  const emojis = table(
    ['이모지', '쓰인 수'],
    detail.emojis.slice(0, 40).map((e) => [escapeHtml(e.name), num(e.count)]),
  );

  const meta = [
    `기록이 있는 날 <b>${detail.dayKeys.length}일</b> · 오늘(KST) ${escapeHtml(detail.todayKey)}`,
    detail.stateFileExists
      ? `마지막 저장 ${escapeHtml(detail.stateFileMtime ?? '')}`
      : '아직 파일로 저장된 적 없음 (첫 저장 전)',
    `아직 저장 안 된 변경 ${detail.dirty ? '있음' : '없음'}`,
  ];

  return `<details class="card detail">
    <summary>📋 자세히 보기</summary>
    <h3>사람별 (${detail.rows.length}명)</h3>${people}
    <h3>채널별</h3>${channels}
    <h3>날짜별</h3>${daily}
    <h3>시각별</h3>${hours}
    <h3>이모지</h3>${emojis}
    <h3>집계 상태</h3><p class="sub">${meta.join('<br>')}</p>
  </details>`;
}

export function renderWrappedPage(data: WrappedPageData): string {
  const { summary, guildName } = data;
  const title = `${guildName} 결산`;

  const body =
    summary.totalMessages === 0
      ? `<section class="card"><h2>아직 셀 게 없어요</h2>
           <p class="empty">봇이 이제 막 세기 시작했어요. 며칠 떠들고 다시 열어 주세요.</p></section>`
      : [
          `<section class="card hero">
             <div class="big">${summary.totalMessages.toLocaleString('ko-KR')}</div>
             <div class="big-label">최근 ${summary.days}일 동안 오간 메시지</div>
             <div class="sub">${summary.activeUsers}명이 ${summary.totalChars.toLocaleString('ko-KR')}자를 썼어요</div>
           </section>`,
          `<section class="card"><h2>🏆 수다왕</h2>${podium(summary.topTalkers, '개')}</section>`,
          summary.mostReacted.length
            ? `<section class="card"><h2>💖 인기상</h2>${podium(summary.mostReacted, '개')}</section>`
            : '',
          summary.topReactors.length
            ? `<section class="card"><h2>🫶 리액션 요정</h2>${podium(summary.topReactors, '번')}</section>`
            : '',
          summary.nightOwl
            ? `<section class="card"><h2>🦉 새벽 유령</h2>
                 <p class="one">${escapeHtml(summary.nightOwl.name)}</p>
                 <p class="sub">말한 것의 ${Math.round(summary.nightOwl.ratio * 100)}%가 새벽 0~6시</p></section>`
            : '',
          summary.topEmojis.length
            ? `<section class="card"><h2>😂 이 서버의 표정</h2>
                 <p class="emojis">${summary.topEmojis
                   .map((e) => `${escapeHtml(e.name)} <b>×${e.count}</b>`)
                   .join('　')}</p></section>`
            : '',
          `<section class="card"><h2>🕐 하루의 리듬</h2>
             ${hoursChart(summary.hours)}
             ${summary.busiestHour ? `<p class="sub">가장 붐빈 시각 — <b>${hourLabel(summary.busiestHour.hour)}</b></p>` : ''}
           </section>`,
        ].join('');

  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="최근 ${summary.days}일 동안 오간 메시지 ${summary.totalMessages.toLocaleString('ko-KR')}개">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px 48px;
    background: radial-gradient(1200px 600px at 50% -10%, #2a2140, #12101a 60%);
    color: #f4f1ea; font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
    display: flex; flex-direction: column; align-items: center; gap: 14px;
  }
  header { text-align: center; margin-bottom: 4px; }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.02em; }
  .range { color: #a79ec4; font-size: 13px; }
  .card {
    width: min(420px, 100%); background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 18px 20px;
  }
  .card h2 { font-size: 15px; margin: 0 0 12px; color: #d9d2ff; font-weight: 600; }
  .hero { text-align: center; background: linear-gradient(160deg, rgba(255,200,107,0.16), rgba(255,255,255,0.03)); }
  .big { font-size: 52px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
  .big-label { margin-top: 8px; font-size: 14px; color: #e6dfd2; }
  .sub { color: #a79ec4; font-size: 13px; margin: 8px 0 0; }
  .one { font-size: 22px; font-weight: 700; margin: 0; }
  ol.rank { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
  ol.rank li { display: flex; align-items: center; gap: 10px; font-size: 15px; }
  .medal { width: 22px; }
  .who { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .num { color: #ffc86b; font-variant-numeric: tabular-nums; }
  .emojis { margin: 0; font-size: 17px; line-height: 1.7; }
  .empty { color: #8f87a8; font-size: 14px; margin: 0; }
  .hours { display: flex; align-items: flex-end; gap: 2px; height: 72px; }
  .hours .bar { flex: 1; height: 100%; display: flex; align-items: flex-end; }
  .hours .bar i { display: block; width: 100%; background: linear-gradient(180deg, #ffc86b, #b98bff); border-radius: 2px; }
  .hours-axis { display: flex; justify-content: space-between; color: #8f87a8; font-size: 11px; margin-top: 6px; }
  /* 표는 카드보다 넓어야 읽힌다 — 자랑용 카드 폭에 억지로 맞추지 않는다. */
  details.detail { padding: 0; width: min(560px, 100%); }
  details.detail summary {
    cursor: pointer; padding: 16px 20px; font-size: 14px; color: #d9d2ff; font-weight: 600;
    list-style: none; user-select: none;
  }
  details.detail summary::-webkit-details-marker { display: none; }
  details.detail summary::after { content: ' ▾'; color: #8f87a8; }
  details.detail[open] summary::after { content: ' ▴'; }
  details.detail > *:not(summary) { padding: 0 20px; }
  details.detail > *:last-child { padding-bottom: 18px; }
  details.detail h3 { font-size: 12px; color: #8f87a8; margin: 16px 0 7px; text-transform: none; font-weight: 600; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 5px 6px; text-align: left; white-space: nowrap; }
  th { color: #8f87a8; font-weight: 500; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.09); }
  td { border-bottom: 1px solid rgba(255,255,255,0.04); }
  th.r, td.r { text-align: right; }
  .dim { color: #8f87a8; }
  .minibar { display: inline-block; height: 7px; background: linear-gradient(90deg, #b98bff, #ffc86b); border-radius: 4px; min-width: 3px; }
  footer { color: #6f688a; font-size: 12px; text-align: center; max-width: 420px; line-height: 1.6; }
  footer a { color: #a79ec4; }
</style>
</head><body>
<header>
  <h1>🎁 ${escapeHtml(title)}</h1>
  <div class="range">최근 ${summary.days}일 · 기록된 날 ${summary.daysWithData}일</div>
</header>
${body}
${detailSection(data)}
<footer>
  메시지 내용은 저장하지 않습니다 — 길이·시각·이모지만 셉니다.<br>
  욘봇이 만든 결산 · <a href="https://mascari4615.github.io/karmolab/">KarmoLab</a>
</footer>
</body></html>`;
}

const ALLOWED_DAYS = new Set([1, 7, 30, 365]);

function parseDays(raw: unknown): number {
  const n = Number(raw);
  return ALLOWED_DAYS.has(n) ? n : 7;
}

export function mountWrappedWeb(app: Application, client: Client | null): void {
  const pageData = (key: string, daysRaw: unknown): WrappedPageData | null => {
    const recorder = getServerStatsRecorder();
    const guildId = recorder.guildIdForShareKey(key);
    if (!guildId) return null;
    const days = parseDays(daysRaw);
    const guild = client?.guilds.cache.get(guildId) ?? null;
    const detail = recorder.debug(guildId, days);

    const channelNames: Record<string, string> = {};
    for (const { channelId } of detail.channels) {
      const channel = guild?.channels.cache.get(channelId);
      channelNames[channelId] = channel && 'name' in channel ? `#${channel.name}` : channelId;
    }

    return {
      guildName: guild?.name ?? '우리 서버',
      days,
      summary: recorder.summarize(guildId, days),
      detail,
      channelNames,
      generatedAt: new Date().toISOString(),
    };
  };

  app.get('/w/:key', (req: Request, res: Response) => {
    const data = pageData(String(req.params.key ?? ''), req.query.days);
    if (!data) {
      res.status(404).type('text/html; charset=utf-8').send('<h1>없는 결산이에요</h1><p>링크를 다시 확인해 주세요.</p>');
      return;
    }
    res.type('text/html; charset=utf-8').send(renderWrappedPage(data));
  });

  app.get('/w/:key/data', (req: Request, res: Response) => {
    const data = pageData(String(req.params.key ?? ''), req.query.days);
    if (!data) {
      res.status(404).json({ error: 'unknown share key' });
      return;
    }
    // 봇 머신의 파일 경로는 밖으로 내보내지 않는다 (페이지에도 안 쓴다).
    const { statePath: _statePath, ...detail } = data.detail;
    res.json({ ...data, detail });
  });
}
