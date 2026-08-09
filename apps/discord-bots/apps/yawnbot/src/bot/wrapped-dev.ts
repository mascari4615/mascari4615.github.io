/**
 * 결산 개발 콘솔 (TASK-YB-042) — `/w/<공유키>/dev`.
 *
 * QA 할 때 디스코드 명령을 계속 치는 건 느리고, 무엇보다 *기다려야 하는 것*(월요일 아침,
 * 20초 저장 주기)을 확인할 방법이 없다. 이 페이지는 그 둘을 없앤다:
 *  - 기준 시각을 직접 넣어 「그때라면 어떻게 나오나」를 지금 본다
 *  - 저장 상태·주간 예약·다음 발송 시각을 한 화면에 편다
 *
 * 쓰기 동작은 「지금 저장」 하나뿐이다. 남의 채널로 메시지를 보내는 종류의 버튼은
 * 여기 두지 않는다 — 주소만 알면 누구나 누를 수 있는 자리라서.
 */
import type { Analytics, DebugDump, ServerSummary, WeeklySchedule } from '../services/server-stats';
import { WEEKLY_POST_HOUR, kstDayKey, weekdayOf } from '../services/server-stats';
import { UNKNOWN_COVERAGE, type CoverageReport } from './stats-coverage';

export interface DevPageData {
  guildName: string;
  guildId: string;
  shareKey: string;
  /** 기준 시각 (기본 = 지금). QA 가 「월요일 아침」 같은 시점을 흉내 낼 때 쓴다. */
  at: Date;
  atInput: string;
  days: number;
  summary: ServerSummary;
  analytics: Analytics;
  detail: DebugDump;
  weekly: WeeklySchedule | null;
  channelNames: Record<string, string>;
  /** 원시 상태 요약 (서버별 기록 일수). */
  guildDayCounts: { guildId: string; days: number }[];
  /** 채널 시야 — 「0 인데 왜 0 인가」의 1순위 용의자. */
  coverage?: CoverageReport;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(v: number): string {
  return v.toLocaleString('ko-KR');
}

/** 다음 주간 게시가 언제인지 — 「이번 주 몫을 보냈나」까지 반영해 사람 말로. */
export function nextWeeklyText(weekly: WeeklySchedule | null, at: Date): string {
  if (!weekly) return '꺼짐 — 서버에서 <code>/결산 매주:켜기</code>';
  const dayKey = kstDayKey(at);
  const daysSinceMonday = (weekdayOf(dayKey) + 6) % 7;
  const mondayKey = kstDayKey(new Date(at.getTime() - daysSinceMonday * 86400000));
  if (weekly.lastPostedDayKey === mondayKey) return `이번 주 몫 발송 완료 (${mondayKey} 기준) · 다음 주 월요일`;
  const hour = (at.getUTCHours() + 9) % 24;
  if (daysSinceMonday === 0 && hour < WEEKLY_POST_HOUR) return `오늘 오전 ${WEEKLY_POST_HOUR}시 이후`;
  return '지금 보내야 함 (다음 확인에서 발송)';
}

/** 채널 시야 한 칸 — 가려진 채널이 있으면 그 이름까지 편다(진단 자리라 다 보여준다). */
function coverageRow(coverage: CoverageReport): string {
  if (!coverage.known) return '<span class="dim">확인 못 함</span>';
  const head = `${coverage.visible} / ${coverage.total}`;
  if (!coverage.blind.length) return `<span class="ok">${head}</span>`;
  const names = coverage.blind.map((c) => escapeHtml('#' + c.name)).join(', ');
  return `<span class="warn">${head}</span> · 가려짐: ${names}`;
}

function row(label: string, value: string): string {
  return `<div class="r"><span class="k">${escapeHtml(label)}</span><span class="v">${value}</span></div>`;
}

function jsonBlock(title: string, value: unknown): string {
  const text = escapeHtml(JSON.stringify(value, null, 2));
  return `<details><summary>${escapeHtml(title)}</summary><pre>${text}</pre></details>`;
}

const RANGES = [1, 7, 30, 365];

export function renderDevPage(data: DevPageData): string {
  const { summary, analytics: a, detail, weekly, shareKey } = data;
  const base = `/w/${shareKey}`;
  const link = (days: number) =>
    `<a class="chip${days === data.days ? ' on' : ''}" href="${base}/dev?days=${days}&at=${encodeURIComponent(data.atInput)}">${days === 1 ? '오늘' : days === 365 ? '올해' : days + '일'}</a>`;

  const people = detail.rows.length
    ? `<table><thead><tr><th>사람</th><th class="ta-r">메시지</th><th class="ta-r">글자</th><th class="ta-r">새벽</th><th class="ta-r">준</th><th class="ta-r">받은</th></tr></thead><tbody>${detail.rows
        .map(
          (p) =>
            `<tr><td>${escapeHtml(p.name)}</td><td class="ta-r">${num(p.msgs)}</td><td class="ta-r">${num(p.chars)}</td><td class="ta-r">${num(p.nightMsgs)}</td><td class="ta-r">${num(p.reactionsGiven)}</td><td class="ta-r">${num(p.reactionsGot)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="dim">아직 아무도 없음</p>';

  const channels = detail.channels.length
    ? detail.channels
        .map((c) => `<span class="pill">${escapeHtml(data.channelNames[c.channelId] ?? c.channelId)} ${num(c.count)}</span>`)
        .join('')
    : '<span class="dim">없음</span>';

  return `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>결산 개발 콘솔 — ${escapeHtml(data.guildName)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px 16px 60px; background:#0f0f13; color:#e8e6e1;
         font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:13px; line-height:1.6; }
  .wrap { max-width: 980px; margin: 0 auto; }
  h1 { font-size:17px; margin:0 0 4px; font-family: system-ui, sans-serif; }
  .sub { color:#7d7a86; margin:0 0 18px; }
  section { border:1px solid rgba(255,255,255,0.09); border-radius:10px; padding:14px 16px; margin-bottom:12px; background:rgba(255,255,255,0.02); }
  h2 { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:#7d7a86; margin:0 0 10px; }
  .r { display:flex; gap:12px; justify-content:space-between; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
  .k { color:#7d7a86; }
  .v { text-align:right; word-break:break-all; }
  .chip, .btn { display:inline-block; padding:5px 11px; margin:0 5px 5px 0; border-radius:6px; text-decoration:none;
         color:#e8e6e1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12);
         font-family:inherit; font-size:12px; cursor:pointer; }
  .chip.on { background:#3987e5; border-color:#3987e5; color:#fff; }
  .btn:hover, .chip:hover { background:rgba(255,255,255,0.13); }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { padding:4px 6px; text-align:left; border-bottom:1px solid rgba(255,255,255,0.05); white-space:nowrap; }
  th { color:#7d7a86; font-weight:400; }
  th.ta-r, td.ta-r { text-align:right; }
  .pill { display:inline-block; padding:3px 9px; margin:0 5px 5px 0; border-radius:999px; background:rgba(255,255,255,0.06); font-size:12px; }
  .dim { color:#7d7a86; }
  pre { background:#08080b; border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:12px; overflow:auto; max-height:420px; font-size:11.5px; }
  details summary { cursor:pointer; color:#8fb7ea; padding:4px 0; }
  input[type=text] { background:#08080b; border:1px solid rgba(255,255,255,0.14); border-radius:6px; color:#e8e6e1;
         padding:6px 9px; font-family:inherit; font-size:12px; width:230px; }
  .ok { color:#0ca30c; } .warn { color:#e0a336; }
  form { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
</style>
</head><body><div class="wrap">
<h1>🔧 결산 개발 콘솔</h1>
<p class="sub">${escapeHtml(data.guildName)} · 서버 ${escapeHtml(data.guildId)}</p>

<section>
  <h2>기준 시각</h2>
  <form method="get" action="${base}/dev">
    <input type="text" name="at" value="${escapeHtml(data.atInput)}" placeholder="2026-08-10T10:00 (비우면 지금)">
    <input type="hidden" name="days" value="${data.days}">
    <button class="btn" type="submit">이 시각으로 보기</button>
    <a class="btn" href="${base}/dev?days=${data.days}">지금으로</a>
  </form>
  <p class="dim" style="margin:8px 0 0">KST 기준. 월요일 아침을 넣으면 주간 게시 판단이 어떻게 되는지 기다리지 않고 볼 수 있다.</p>
  ${row('해석된 시각 (KST)', escapeHtml(kstDayKey(data.at) + ' ' + String((data.at.getUTCHours() + 9) % 24).padStart(2, '0') + '시'))}
</section>

<section>
  <h2>범위</h2>
  ${RANGES.map(link).join('')}
</section>

<section>
  <h2>집계 상태</h2>
  ${row('기록 있는 날', `${detail.dayKeys.length}일`)}
  ${row('오늘(KST)', escapeHtml(detail.todayKey))}
  ${row('상태 파일', detail.stateFileExists ? `있음 · 마지막 저장 ${escapeHtml(detail.stateFileMtime ?? '')}` : '<span class="warn">아직 없음</span>')}
  ${row('미저장 변경', detail.dirty ? '<span class="warn">있음</span>' : '<span class="ok">없음</span>')}
  ${row('채널 시야 (봄/전체)', coverageRow(data.coverage ?? UNKNOWN_COVERAGE))}
  ${row('이 서버 총 메시지 (범위 내)', num(summary.totalMessages))}
  ${row('참여자', num(summary.activeUsers))}
  ${row('직전 같은 기간', `${num(a.previous.messages)} → ${num(a.current.messages)}`)}
  <p style="margin:10px 0 0"><button class="btn" id="flush">지금 저장</button> <span id="flush-msg" class="dim"></span></p>
</section>

<section>
  <h2>주간 자동 게시</h2>
  ${row('상태', weekly ? '<span class="ok">켜짐</span>' : '<span class="dim">꺼짐</span>')}
  ${weekly ? row('채널', escapeHtml(data.channelNames[weekly.channelId] ?? weekly.channelId)) : ''}
  ${weekly ? row('마지막 발송 기준일', escapeHtml(weekly.lastPostedDayKey ?? '없음')) : ''}
  ${row('다음 발송', nextWeeklyText(weekly, data.at))}
</section>

<section>
  <h2>사람별 (범위 내)</h2>
  ${people}
</section>

<section>
  <h2>채널별</h2>
  ${channels}
</section>

<section>
  <h2>서버 목록 (봇이 기록 중인 전부)</h2>
  ${data.guildDayCounts.map((g) => row(g.guildId, `${g.days}일`)).join('') || '<p class="dim">없음</p>'}
</section>

<section>
  <h2>원본</h2>
  ${jsonBlock('요약 (카드가 쓰는 값)', summary)}
  ${jsonBlock('분석 (대시보드가 쓰는 값)', a)}
  ${jsonBlock('원시 카운터', detail)}
</section>

<section>
  <h2>바로가기</h2>
  <a class="chip" href="${base}">카드</a>
  <a class="chip" href="${base}/board?days=${data.days}">대시보드</a>
  <a class="chip" href="${base}/data?days=${data.days}">JSON</a>
</section>

<script>
  document.getElementById('flush').addEventListener('click', function () {
    var msg = document.getElementById('flush-msg');
    msg.textContent = '저장 중...';
    fetch('${base}/dev/flush', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (j) { msg.textContent = '저장됨 · ' + (j.mtime || ''); })
      .catch(function () { msg.textContent = '실패'; });
  });
</script>
</div></body></html>`;
}
