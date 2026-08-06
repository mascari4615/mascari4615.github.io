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
import { renderDashboardPage } from './wrapped-dashboard';
import { renderDevPage } from './wrapped-dev';

/** 카드에 실을 값 — HTML 과 JSON 이 같은 모양을 쓰도록 한 번 만든다. */
export interface WrappedPageData {
  guildName: string;
  days: number;
  summary: ServerSummary;
  /** 「자세히」 절 — 전원 표·채널별·날짜별. 카드는 top3 만 보여주므로 여기서 전부 편다. */
  detail: DebugDump;
  /** 채널 ID → 사람이 읽는 이름. 모르면 ID 그대로. */
  channelNames: Record<string, string>;
  /** 분석판 주소 (`/w/<키>/board`). 없으면 버튼을 안 그린다. */
  boardPath?: string;
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

/**
 * 「이미지로 저장」 — 화면을 캡처하는 대신 캔버스에 **다시 그린다**.
 * 화면 캡처 방식(html2canvas 류)은 외부 라이브러리가 필요하고 글꼴·그림자에서 자주 깨진다.
 * 숫자만 넘겨 직접 그리면 의존성 0에 결과가 항상 같다 — 자랑용이라 이게 중요하다.
 */
function imageScript(data: WrappedPageData): string {
  const { summary, guildName } = data;
  if (summary.totalMessages === 0) return '';

  // JSON 을 <script> 안에 넣을 때 `<` 를 그대로 두면 닉네임에 `</script>` 를 넣어
  // 스크립트 블록을 탈출할 수 있다 (실제로 시험이 잡아낸 구멍). 유니코드 escape 로 막는다.
  const payload = JSON.stringify({
    title: `${guildName} 결산`,
    range: `최근 ${summary.days}일`,
    total: summary.totalMessages,
    people: summary.activeUsers,
    chars: summary.totalChars,
    talkers: summary.topTalkers.map((t) => ({ name: t.name, value: t.value })),
    nightOwl: summary.nightOwl ? { name: summary.nightOwl.name, pct: Math.round(summary.nightOwl.ratio * 100) } : null,
    emojis: summary.topEmojis,
    hours: summary.hours,
  })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\u003e');

  return `<script>
  var CARD = ${payload};
  var btn = document.getElementById('save-image');
  if (btn) btn.addEventListener('click', function () {
    var W = 1080, H = 1350, S = 2; // 세로 카드 — SNS 에 그대로 올라가는 비율
    var c = document.createElement('canvas');
    c.width = W * S; c.height = H * S;
    var g = c.getContext('2d');
    g.scale(S, S);
    var F = '600 __px system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif';
    var font = function (size, weight) { return F.replace('600', weight || '600').replace('__', size); };

    var bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#2a2140'); bg.addColorStop(1, '#12101a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    g.fillStyle = '#a79ec4'; g.font = font(30);
    g.fillText(CARD.range, 80, 128);
    g.fillStyle = '#f4f1ea'; g.font = font(60, '700');
    g.fillText('🎁 ' + CARD.title, 80, 205);

    g.fillStyle = '#ffc86b'; g.font = font(190, '800');
    g.fillText(String(CARD.total.toLocaleString('ko-KR')), 80, 420);
    g.fillStyle = '#e6dfd2'; g.font = font(34);
    g.fillText('개의 메시지 · ' + CARD.people + '명 · ' + CARD.chars.toLocaleString('ko-KR') + '자', 80, 480);

    var y = 590;
    g.fillStyle = '#d9d2ff'; g.font = font(32, '600');
    g.fillText('🏆 수다왕', 80, y); y += 26;
    var medals = ['🥇', '🥈', '🥉'];
    CARD.talkers.slice(0, 3).forEach(function (t, i) {
      y += 66;
      g.fillStyle = '#f4f1ea'; g.font = font(40);
      g.fillText(medals[i] + '  ' + t.name, 80, y);
      g.fillStyle = '#ffc86b'; g.font = font(40, '700');
      var label = t.value.toLocaleString('ko-KR') + '개';
      g.fillText(label, W - 80 - g.measureText(label).width, y);
    });

    y += 90;
    if (CARD.nightOwl) {
      g.fillStyle = '#d9d2ff'; g.font = font(32, '600');
      g.fillText('🦉 새벽 유령', 80, y); y += 60;
      g.fillStyle = '#f4f1ea'; g.font = font(42, '700');
      g.fillText(CARD.nightOwl.name, 80, y);
      g.fillStyle = '#a79ec4'; g.font = font(30);
      g.fillText('말한 것의 ' + CARD.nightOwl.pct + '%가 새벽', 80, y + 46);
      y += 120;
    }

    if (CARD.emojis.length) {
      g.fillStyle = '#d9d2ff'; g.font = font(32, '600');
      g.fillText('😂 이 서버의 표정', 80, y); y += 66;
      g.fillStyle = '#f4f1ea'; g.font = font(44);
      g.fillText(CARD.emojis.map(function (e) { return e.name + ' ×' + e.count; }).join('   '), 80, y);
      y += 90;
    }

    // 하루의 리듬 — 24개 막대
    var bw = (W - 160) / 24, max = Math.max.apply(null, CARD.hours) || 1;
    var base = H - 150;
    CARD.hours.forEach(function (v, i) {
      var h = Math.round((v / max) * 150);
      var grad = g.createLinearGradient(0, base - h, 0, base);
      grad.addColorStop(0, '#ffc86b'); grad.addColorStop(1, '#b98bff');
      g.fillStyle = grad;
      g.fillRect(80 + i * bw + 2, base - h, bw - 4, Math.max(h, 3));
    });
    g.fillStyle = '#8f87a8'; g.font = font(26);
    g.fillText('0시', 80, base + 44);
    g.fillText('23시', W - 80 - g.measureText('23시').width, base + 44);
    g.fillStyle = '#6f688a'; g.font = font(24);
    g.fillText('메시지 내용은 저장하지 않습니다 · 욘봇', 80, H - 48);

    c.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '결산.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  });
</script>`;
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
             ${
               summary.busiestChannel
                 ? // 디스코드 embed 는 `<#id>` 멘션을 쓰지만 브라우저는 그걸 모르는 태그로 먹어 지운다.
                   //  웹에서는 채널 *이름* 을 글자로 넣는다.
                   `<p class="sub">가장 붐빈 채널 — <b>${escapeHtml(
                     data.channelNames[summary.busiestChannel.channelId] ?? summary.busiestChannel.channelId,
                   )}</b></p>`
                 : ''
             }
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
  .header-links { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 10px; }
  .board-link {
    display: inline-block; padding: 7px 14px; border-radius: 999px;
    font-size: 13px; text-decoration: none; color: #f4f1ea; cursor: pointer;
    background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14);
    font-family: inherit;
  }
  .board-link:hover { background: rgba(255,255,255,0.12); }
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
  <div class="header-links">
    ${data.boardPath ? `<a class="board-link" href="${escapeHtml(data.boardPath)}">📊 대시보드 열기</a>` : ''}
    ${summary.totalMessages > 0 ? '<button type="button" class="board-link" id="save-image">🖼 이미지로 저장</button>' : ''}
  </div>
</header>
${body}
${detailSection(data)}
<footer>
  메시지 내용은 저장하지 않습니다 — 길이·시각·이모지만 셉니다.<br>
  욘봇이 만든 결산 · <a href="https://mascari4615.github.io/karmolab/">KarmoLab</a>
</footer>
${imageScript(data)}
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
      boardPath: `/w/${key}/board`,
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

  // 분석판 — 카드가 요약이면 이쪽은 방문 통계 도구 감각의 대시보드.
  app.get('/w/:key/board', (req: Request, res: Response) => {
    const recorder = getServerStatsRecorder();
    const key = String(req.params.key ?? '');
    const guildId = recorder.guildIdForShareKey(key);
    if (!guildId) {
      res.status(404).type('text/html; charset=utf-8').send('<h1>없는 결산이에요</h1><p>링크를 다시 확인해 주세요.</p>');
      return;
    }
    const days = parseDays(req.query.days);
    const guild = client?.guilds.cache.get(guildId) ?? null;
    const analytics = recorder.analytics(guildId, days);

    const channelNames: Record<string, string> = {};
    for (const { channelId } of analytics.channels) {
      const channel = guild?.channels.cache.get(channelId);
      channelNames[channelId] = channel && 'name' in channel ? `#${channel.name}` : channelId;
    }

    res.type('text/html; charset=utf-8').send(
      renderDashboardPage({
        guildName: guild?.name ?? '우리 서버',
        analytics,
        channelNames,
        basePath: `/w/${key}/board`,
      }),
    );
  });

  // 개발 콘솔 — 기준 시각을 바꿔가며 볼 수 있어 「월요일 아침」을 기다리지 않아도 된다.
  app.get('/w/:key/dev', (req: Request, res: Response) => {
    const recorder = getServerStatsRecorder();
    const key = String(req.params.key ?? '');
    const guildId = recorder.guildIdForShareKey(key);
    if (!guildId) {
      res.status(404).type('text/html; charset=utf-8').send('<h1>없는 결산이에요</h1>');
      return;
    }
    const days = parseDays(req.query.days);
    const atInput = typeof req.query.at === 'string' ? req.query.at.trim() : '';
    // 입력은 KST 벽시계로 읽는다 — QA 가 머릿속으로 시차를 계산하지 않게.
    const parsed = atInput ? new Date(`${atInput}${atInput.length <= 16 ? ':00' : ''}+09:00`) : null;
    const at = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

    const guild = client?.guilds.cache.get(guildId) ?? null;
    const detail = recorder.debug(guildId, days, at);
    const channelNames: Record<string, string> = {};
    for (const { channelId } of detail.channels) {
      const channel = guild?.channels.cache.get(channelId);
      channelNames[channelId] = channel && 'name' in channel ? `#${channel.name}` : channelId;
    }
    const weekly = recorder.weeklyOf(guildId);
    if (weekly) {
      const ch = guild?.channels.cache.get(weekly.channelId);
      channelNames[weekly.channelId] = ch && 'name' in ch ? `#${ch.name}` : weekly.channelId;
    }

    const state = recorder.load();
    res.type('text/html; charset=utf-8').send(
      renderDevPage({
        guildName: guild?.name ?? '우리 서버',
        guildId,
        shareKey: key,
        at,
        atInput,
        days,
        summary: recorder.summarize(guildId, days, at),
        analytics: recorder.analytics(guildId, days, at),
        detail,
        weekly,
        channelNames,
        guildDayCounts: Object.entries(state.guilds).map(([id, g]) => ({
          guildId: id,
          days: Object.keys(g.days).length,
        })),
      }),
    );
  });

  // 저장 주기를 기다리지 않고 즉시 파일로 떨군다 (읽기 외 유일한 동작).
  app.post('/w/:key/dev/flush', (req: Request, res: Response) => {
    const recorder = getServerStatsRecorder();
    const guildId = recorder.guildIdForShareKey(String(req.params.key ?? ''));
    if (!guildId) {
      res.status(404).json({ error: 'unknown share key' });
      return;
    }
    recorder.flushNow();
    res.json({ ok: true, mtime: recorder.debug(guildId, 1).stateFileMtime });
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
