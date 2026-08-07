/**
 * 서버 대시보드 (TASK-YB-042) — `/w/<공유키>/board`.
 *
 * 결산 카드가 *자랑용 요약*이라면 이 페이지는 *분석판*이다 — 방문 통계 도구를 보는 감각.
 * KPI 타일(직전 같은 기간 대비 증감) · 날짜별 추이 · 요일×시각 히트맵 · 사람/채널/이모지 표.
 *
 * 색 규칙(dataviz): 한 계열 막대 = 한 색, 히트맵 = 파랑 단일 계열 5단계(검증 통과 —
 * 이 페이지의 어두운 표면 기준 단조·간격·최저대비 전부 PASS). 색은 크기만 나타내고,
 * 정체(사람·채널)는 색이 아니라 이름표로 구분한다.
 */
import type { Analytics } from '../services/server-stats';

/** 검증된 파랑 단일 계열 — 어두운 순(작다) → 밝은 순(크다). */
const RAMP = ['#184f95', '#2a78d6', '#5598e7', '#9ec5f4', '#cde2fb'];
/** 한 계열 막대의 색. */
const SERIES = '#3987e5';

export interface DashboardData {
  guildName: string;
  analytics: Analytics;
  channelNames: Record<string, string>;
  /** 기간 전환 링크의 앞부분 (`/w/<키>/board`) */
  basePath: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(value: number): string {
  return value.toLocaleString('ko-KR');
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function hourLabel(hour: number): string {
  if (hour === 0) return '자정';
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return '정오';
  if (hour < 18) return `오후 ${hour - 12}시`;
  return `밤 ${hour - 12}시`;
}

/**
 * 증감 표시. 이전 기간이 0 이면 퍼센트가 무한이 되므로 그때는 "새로 시작" 으로 적는다.
 * 화살표만 쓰지 않고 말(늘었다/줄었다)을 붙인다 — 색만으로 뜻을 전달하지 않기 위해.
 */
function delta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? '<span class="flat">변화 없음</span>' : '<span class="up">새로 시작</span>';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return '<span class="flat">지난 기간과 같음</span>';
  const sign = pct > 0 ? '▲' : '▼';
  const word = pct > 0 ? '늘었다' : '줄었다';
  return `<span class="${pct > 0 ? 'up' : 'down'}">${sign} ${Math.abs(pct)}% ${word}</span>`;
}

function tile(label: string, value: string, sub: string): string {
  return `<div class="tile"><div class="tile-label">${escapeHtml(label)}</div>
    <div class="tile-value">${value}</div><div class="tile-sub">${sub}</div></div>`;
}

/**
 * 값 옆에 붙는 비중 막대. 표 칸 너비에 % 를 걸면 좁은 칸에서 점처럼 줄어들어 안 보인다
 * → 고정 폭 트랙 안을 채우게 한다.
 */
function shareBar(ratio: number): string {
  const pct = Math.max(Math.round(ratio * 100), 2);
  return `<span class="track"><i style="width:${pct}%;background:${SERIES}"></i></span>`;
}

/** 날짜별 세로 막대 — 한 계열이라 범례가 필요 없다(제목이 계열 이름). */
function dailyChart(analytics: Analytics): string {
  const max = Math.max(...analytics.daily.map((d) => d.msgs), 1);
  const bars = analytics.daily
    .map((d) => {
      const pct = (d.msgs / max) * 100;
      const label = `${d.dayKey} (${WEEKDAYS[weekdayOfKey(d.dayKey)]}) · 메시지 ${num(d.msgs)}개 · ${num(d.users)}명`;
      return `<div class="dbar" title="${escapeHtml(label)}" tabindex="0" aria-label="${escapeHtml(label)}">
        <i style="height:${d.msgs === 0 ? 0 : Math.max(pct, 3)}%"></i></div>`;
    })
    .join('');
  const first = analytics.daily[0]?.dayKey ?? '';
  const last = analytics.daily[analytics.daily.length - 1]?.dayKey ?? '';
  return `<div class="dchart">${bars}</div>
    <div class="axis"><span>${escapeHtml(first)}</span><span>최대 ${num(max)}개</span><span>${escapeHtml(last)}</span></div>`;
}

function weekdayOfKey(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 요일×시각 히트맵 — 크기를 5단계로 끊어 칠한다. 0 은 칠하지 않는다(빈칸 = 없음). */
function heatmap(analytics: Analytics): string {
  const flat = analytics.weekdayHour.flat();
  const max = Math.max(...flat, 0);
  const rows = analytics.weekdayHour
    .map((hours, weekday) => {
      const cells = hours
        .map((count, hour) => {
          const step = max === 0 || count === 0 ? -1 : Math.min(Math.floor((count / max) * RAMP.length), RAMP.length - 1);
          const style = step < 0 ? '' : ` style="background:${RAMP[step]}"`;
          const label = `${WEEKDAYS[weekday]}요일 ${hourLabel(hour)} · ${num(count)}개`;
          return `<i class="cell${step < 0 ? ' zero' : ''}"${style} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"></i>`;
        })
        .join('');
      return `<div class="hrow"><span class="hlabel">${WEEKDAYS[weekday]}</span>${cells}</div>`;
    })
    .join('');
  const legend = RAMP.map((hex) => `<i style="background:${hex}"></i>`).join('');
  return `<div class="heat">${rows}
    <div class="hfoot"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span></div>
    <div class="hlegend">적음 ${legend} 많음 <span class="dim">(최대 ${num(max)}개)</span></div></div>`;
}

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return '<p class="empty">아직 없음</p>';
  const head = headers.map((h, i) => `<th${i ? ' class="r"' : ''}>${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((cells) => '<tr>' + cells.map((c, i) => `<td${i ? ' class="r"' : ''}>${c}</td>`).join('') + '</tr>')
    .join('');
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const RANGES: { days: number; label: string }[] = [
  { days: 1, label: '오늘' },
  { days: 7, label: '7일' },
  { days: 30, label: '30일' },
  { days: 365, label: '올해' },
];

export function renderDashboardPage(data: DashboardData): string {
  const { analytics: a, guildName, channelNames, basePath } = data;
  const dayCount = Math.max(a.daily.length, 1);
  const perDay = Math.round(a.current.messages / dayCount);

  const ranges = RANGES.map(
    (r) =>
      `<a class="range${r.days === a.days ? ' on' : ''}" href="${escapeHtml(basePath)}?days=${r.days}">${r.label}</a>`,
  ).join('');

  const tiles = [
    tile('메시지', num(a.current.messages), delta(a.current.messages, a.previous.messages)),
    tile('참여한 사람', num(a.current.activeUsers), delta(a.current.activeUsers, a.previous.activeUsers)),
    tile('반응', num(a.current.reactions), delta(a.current.reactions, a.previous.reactions)),
    tile('하루 평균', num(perDay), `<span class="dim">${dayCount}일 기준</span>`),
    tile('처음 온 사람', num(a.newUsers), `<span class="dim">돌아온 사람 ${num(a.returningUsers)}</span>`),
    tile(
      '가장 바빴던 날',
      a.busiestDay ? escapeHtml(a.busiestDay.dayKey.slice(5)) : '—',
      a.busiestDay ? `<span class="dim">메시지 ${num(a.busiestDay.msgs)}개</span>` : '<span class="dim">아직 없음</span>',
    ),
  ].join('');

  const totalChannel = a.channels.reduce((sum, c) => sum + c.count, 0) || 1;

  const topMsgs = Math.max(...a.people.map((p) => p.msgs), 1);
  const people = table(
    ['사람', '메시지', '', '평균 길이', '새벽', '준 반응', '받은 반응'],
    a.people.map((row) => [
      escapeHtml(row.name),
      num(row.msgs),
      shareBar(row.msgs / topMsgs),
      row.msgs ? `${num(Math.round(row.chars / row.msgs))}자` : '0자',
      row.msgs ? `${Math.round((row.nightMsgs / row.msgs) * 100)}%` : '0%',
      num(row.reactionsGiven),
      num(row.reactionsGot),
    ]),
  );

  const channels = table(
    ['채널', '메시지', '비중', ''],
    a.channels.map((c) => [
      escapeHtml(channelNames[c.channelId] ?? c.channelId),
      num(c.count),
      `${Math.round((c.count / totalChannel) * 100)}%`,
      shareBar(c.count / totalChannel),
    ]),
  );

  // 이모지는 표보다 칩이 읽기 쉽다 — 한 줄에 여럿 들어가 카드가 비지 않는다.
  const emojis = a.emojis.length
    ? `<div class="chips">${a.emojis
        .slice(0, 24)
        .map((e) => `<span class="chip"><b>${escapeHtml(e.name)}</b> ${num(e.count)}</span>`)
        .join('')}</div>`
    : '<p class="empty">아직 없음</p>';

  // 30일이면 30줄 — 펴 두면 표가 페이지를 통째로 삼킨다(위 그래프가 이미 같은 값을 보여줌).
  const dailyTable = `<details><summary>날짜별 표 펼치기 (${a.daily.length}일)</summary>${table(
    ['날짜', '요일', '메시지', '사람'],
    a.daily
      .slice()
      .reverse()
      .map((d) => [escapeHtml(d.dayKey), WEEKDAYS[weekdayOfKey(d.dayKey)], num(d.msgs), num(d.users)]),
  )}</details>`;

  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(guildName)} 대시보드</title>
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 22px 18px 56px; background: #16131f; color: #f4f1ea;
    font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  }
  .wrap { max-width: 940px; margin: 0 auto; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; justify-content: space-between; margin-bottom: 18px; }
  h1 { font-size: 21px; margin: 0; letter-spacing: -0.02em; }
  .period { color: #8f87a8; font-size: 13px; margin-top: 4px; }
  .ranges { display: flex; gap: 6px; }
  .range {
    padding: 6px 12px; border-radius: 999px; font-size: 13px; text-decoration: none;
    color: #c3c2b7; border: 1px solid rgba(255,255,255,0.12);
  }
  .range.on { background: #3987e5; border-color: #3987e5; color: #fff; font-weight: 600; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 10px; margin-bottom: 22px; }
  .tile { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 14px 16px; }
  .tile-label { font-size: 12px; color: #8f87a8; }
  .tile-value { font-size: 27px; font-weight: 700; letter-spacing: -0.03em; margin: 4px 0 3px; }
  /* 두 줄로 접히면 타일 높이가 제각각이 된다 — 넘치면 줄이지 말고 잘라 낸다. */
  .tile-sub { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .up { color: #0ca30c; } .down { color: #e66767; } .flat, .dim { color: #8f87a8; }
  section { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 16px 18px; margin-bottom: 14px; }
  section h2 { font-size: 14px; margin: 0 0 14px; color: #d9d2ff; font-weight: 600; }
  .dchart { display: flex; align-items: flex-end; gap: 3px; height: 128px; }
  .dbar { flex: 1; height: 100%; display: flex; align-items: flex-end; min-width: 4px; }
  .dbar i { display: block; width: 100%; background: ${SERIES}; border-radius: 4px 4px 0 0; }
  .dbar:hover i, .dbar:focus i { background: #9ec5f4; outline: none; }
  .axis { display: flex; justify-content: space-between; color: #8f87a8; font-size: 11px; margin-top: 7px; }
  .heat { overflow-x: auto; }
  .hrow { display: flex; gap: 2px; align-items: center; margin-bottom: 2px; }
  .hlabel { width: 18px; font-size: 11px; color: #8f87a8; flex: none; }
  .cell { flex: 1; min-width: 9px; height: 15px; border-radius: 3px; background: rgba(255,255,255,0.05); }
  .cell.zero { background: rgba(255,255,255,0.035); }
  .hfoot { display: flex; justify-content: space-between; color: #8f87a8; font-size: 11px; margin: 6px 0 10px 18px; }
  .hlegend { display: flex; align-items: center; gap: 4px; color: #8f87a8; font-size: 11px; }
  .hlegend i { width: 16px; height: 9px; border-radius: 2px; display: inline-block; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 6px 7px; text-align: left; white-space: nowrap; }
  th { color: #8f87a8; font-weight: 500; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.1); }
  td { border-bottom: 1px solid rgba(255,255,255,0.045); }
  th.r, td.r { text-align: right; }
  /* 고정 폭 트랙 — 표 칸이 좁아도 막대 길이가 뜻을 잃지 않는다. */
  .track { display: inline-block; width: 64px; height: 7px; border-radius: 4px; background: rgba(255,255,255,0.08); vertical-align: middle; }
  .track i { display: block; height: 100%; border-radius: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 7px; }
  .chip { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09); border-radius: 999px; padding: 5px 11px; font-size: 13px; }
  .chip b { font-weight: 400; }
  details summary { cursor: pointer; color: #a79ec4; font-size: 13px; padding: 4px 0; user-select: none; }
  /* 표가 잘렸다는 걸 알려 주는 그림자. 넓은 화면에서는 잘릴 일이 없는데 마지막 열을
     덮어 버리므로, 실제로 잘리는 좁은 화면에서만 켠다. */
  .scroll { position: relative; }
  @media (max-width: 700px) {
    .scroll::after {
      content: ''; position: absolute; top: 0; right: 0; width: 24px; height: 100%;
      background: linear-gradient(90deg, rgba(22,19,31,0), rgba(22,19,31,0.92)); pointer-events: none;
    }
  }
  .empty { color: #8f87a8; font-size: 13px; margin: 0; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
  .two section { margin-bottom: 0; }
  footer { color: #6f688a; font-size: 12px; text-align: center; margin-top: 22px; line-height: 1.7; }
  footer a { color: #a79ec4; }
</style>
</head><body><div class="wrap">
<header>
  <div><h1>📊 ${escapeHtml(guildName)} 대시보드</h1>
    <div class="period">${escapeHtml(a.from)} ~ ${escapeHtml(a.to)} · 직전 같은 기간과 비교</div></div>
  <nav class="ranges">${ranges}</nav>
</header>

<div class="tiles">${tiles}</div>

<section><h2>날짜별 메시지</h2>${dailyChart(a)}</section>
<section><h2>요일 × 시각</h2>${heatmap(a)}</section>

<div class="two">
  <section><h2>사람별 (${a.people.length}명)</h2>${people}</section>
  <section><h2>채널별</h2>${channels}</section>
</div>
<div class="two">
  <section><h2>날짜별 표</h2>${dailyTable}</section>
  <section><h2>이모지</h2>${emojis}</section>
</div>

<footer>
  메시지 내용은 저장하지 않습니다 — 길이·시각·이모지만 셉니다.<br>
  <a href="${escapeHtml(basePath.replace(/\/board$/, ''))}">← 결산 카드로</a> ·
  욘봇 · <a href="https://mascari4615.github.io/karmolab/">KarmoLab</a>
</footer>
</div></body></html>`;
}
