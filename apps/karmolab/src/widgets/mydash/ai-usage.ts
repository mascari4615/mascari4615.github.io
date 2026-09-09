/**
 * 패널: AI 사용 통계 (1단계, 읽기 전용).
 *
 * 왜 이게 첫 패널인가: 데이터가 **이미 커밋돼 있다**. `memo/data/ai-usage/<host>/` 를
 * `memo/scripts/ai-usage/*.mjs` 가 굽는 것. 새로 만들 생산자도, git 쓰기도 없음.
 * 셸이 진짜로 되는지(로그인 → private 읽기 → 폰에서 보임)만 이 패널로 판정.
 *
 * host 를 코드에 안 박는다. `data/ai-usage/` 를 훑어 폴더를 찾는다. 지금은 `mois` 하나지만
 * 노트북이 하나 늘면 그날 코드를 고치러 오고 싶지 않음.
 *
 * 그림은 Canvas 2D 로 직접 그린다 (memo-atlas 와 같은 손. 새 의존성 없음).
 */
import { dashRegistry, esc, hours, short, usd } from './kit';
import type { DashPanelCtx } from './kit';

(function (): void {
  'use strict';

  type Usage = {
    input: number; output: number; cacheCreate: number; cacheRead: number;
    thinking: number; webSearch: number;
  };
  type Bucket = {
    sessions: number; prompts: number; requests: number; cost: number;
    usage: Usage; activeMs: number; toolCalls: number; edits: number; commits: number;
    models: Record<string, number>;
  };
  type Rollups = {
    generatedAt: string;
    host: string;
    byDay: Record<string, Bucket>;
    byMonth: Record<string, Bucket>;
    byRepo: Record<string, Bucket>;
    byModel: Record<string, Bucket>;
    byHour: Record<string, Bucket>;
    coverage?: { lastHistory?: string; firstHistory?: string; claudeTranscripts?: number };
  };

  const ROOT_DIR = 'data/ai-usage';

  /** 보여 줄 것. 폰에서 한 화면에 넷이 한계다. */
  type MetricId = 'cost' | 'sessions' | 'prompts' | 'commits';
  const METRICS: Array<{ id: MetricId; label: string; get: (b: Bucket) => number; fmt: (n: number) => string }> = [
    { id: 'cost', label: '환산가', get: (b) => b.cost, fmt: usd },
    { id: 'sessions', label: '세션', get: (b) => b.sessions, fmt: (n) => short(n) },
    { id: 'prompts', label: '프롬프트', get: (b) => b.prompts, fmt: (n) => short(n) },
    { id: 'commits', label: '커밋', get: (b) => b.commits, fmt: (n) => short(n) },
  ];

  const STYLE_ID = 'mydash-aiusage-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = [
      '.au{display:flex;flex-direction:column;gap:14px}',
      /* 폰이 기본. 두 칸이면 큰 숫자가 안 줄어든다. 넓어지면 넷. */
      '.au-nums{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}',
      '@media(min-width:560px){.au-nums{grid-template-columns:repeat(4,1fr)}}',
      '.au-num{padding:10px 12px;border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.au-num b{display:block;font-size:1.25rem;line-height:1.3;font-variant-numeric:tabular-nums}',
      '.au-num span{font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.au-chips{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch}',
      '.au-chips button{flex:0 0 auto;padding:5px 11px;font:inherit;font-size:var(--font-size-2xs);cursor:pointer;',
      'background:transparent;color:var(--text-secondary);border:1px solid currentColor;border-radius:var(--radius-pill)}',
      '.au-chips button.on{color:var(--text-primary);background:var(--bg-hover)}',
      '.au-chart{width:100%;height:150px;display:block;border-radius:var(--radius-lg);background:var(--bg-secondary);touch-action:pan-y}',
      '@media(min-width:560px){.au-chart{height:200px}}',
      '.au-sec{display:flex;flex-direction:column;gap:6px}',
      '.au-sec h4{margin:0;font-size:var(--font-size-2xs);color:var(--text-tertiary);font-weight:600}',
      '.au-line{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;font-size:var(--font-size-2xs)}',
      '.au-line em{font-style:normal;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.au-line i{font-style:normal;font-variant-numeric:tabular-nums;color:var(--text-primary)}',
      '.au-bar{grid-column:1/-1;height:3px;border-radius:2px;background:var(--accent);opacity:.45}',
      '.au-foot{font-size:var(--font-size-3xs);color:var(--text-tertiary);line-height:1.7}',
    ].join('');
    document.head.appendChild(el);
  }

  function sum(buckets: Bucket[]): Bucket {
    const zero: Bucket = {
      sessions: 0, prompts: 0, requests: 0, cost: 0, activeMs: 0, toolCalls: 0, edits: 0, commits: 0,
      usage: { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, thinking: 0, webSearch: 0 },
      models: {},
    };
    for (const b of buckets) {
      zero.sessions += b.sessions || 0;
      zero.prompts += b.prompts || 0;
      zero.requests += b.requests || 0;
      zero.cost += b.cost || 0;
      zero.activeMs += b.activeMs || 0;
      zero.toolCalls += b.toolCalls || 0;
      zero.edits += b.edits || 0;
      zero.commits += b.commits || 0;
    }
    return zero;
  }

  function daysAgo(iso: string): string {
    const t = Date.parse(iso);
    if (!isFinite(t)) return '';
    const d = Math.floor((Date.now() - t) / 86400000);
    if (d <= 0) return '오늘 구움';
    if (d === 1) return '어제 구움';
    return d + '일 전에 구움';
  }

  /**
   * 막대 그림. **비어 있는 날도 자리를 차지한다**. 안 그러면 쉬었던 구간이 사라져
   * 매일 했던 것처럼 보임. 날짜를 채워 그리기.
   */
  function drawBars(
    canvas: HTMLCanvasElement,
    days: string[],
    byDay: Record<string, Bucket>,
    metric: (b: Bucket) => number
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 150;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!days.length) return;

    const vals = days.map((d) => (byDay[d] ? metric(byDay[d]) : 0));
    let max = 0;
    for (const v of vals) if (v > max) max = v;
    if (max <= 0) max = 1;

    const pad = 6;
    const inner = h - pad * 2;
    const step = (w - pad * 2) / days.length;
    const bw = Math.max(1, Math.min(step - 1, step * 0.8));

    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#6ea8fe';
    const dim = css.getPropertyValue('--text-tertiary').trim() || '#888';

    /* 가운데 눈금 하나만. 폰에서 눈금 넷은 그림보다 눈금이 커진다. */
    ctx.strokeStyle = dim;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(pad, pad + inner / 2);
    ctx.lineTo(w - pad, pad + inner / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = accent;
    for (let i = 0; i < days.length; i++) {
      const v = vals[i];
      if (v <= 0) continue;
      const bh = Math.max(1, (v / max) * inner);
      ctx.globalAlpha = 0.85;
      ctx.fillRect(pad + i * step + (step - bw) / 2, pad + inner - bh, bw, bh);
    }
    ctx.globalAlpha = 1;
  }

  /** 오늘부터 거꾸로 n 일의 키. */
  function lastDays(n: number): string[] {
    const out: string[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      out.push(d.getFullYear() + '-' + m + '-' + day);
    }
    return out;
  }

  function topList(rec: Record<string, Bucket>, pick: (b: Bucket) => number, limit: number): Array<[string, number]> {
    const rows: Array<[string, number]> = [];
    for (const k of Object.keys(rec || {})) rows.push([k, pick(rec[k]) || 0]);
    rows.sort((a, b) => b[1] - a[1]);
    return rows.slice(0, limit);
  }

  function listHtml(title: string, rows: Array<[string, number]>, fmt: (n: number) => string): string {
    if (!rows.length) return '';
    const max = rows[0][1] || 1;
    const body = rows
      .map(
        ([k, v]) =>
          '<div class="au-line"><em>' + esc(k) + '</em><i>' + esc(fmt(v)) + '</i>' +
          '<div class="au-bar" style="width:' + Math.max(2, Math.round((v / max) * 100)) + '%"></div></div>'
      )
      .join('');
    return '<div class="au-sec"><h4>' + esc(title) + '</h4>' + body + '</div>';
  }

  async function render(ctx: DashPanelCtx): Promise<void> {
    ensureStyle();
    const { root, repo, status } = ctx;
    root.innerHTML = '<div class="au"><div class="au-foot">저장소에서 받는 중...</div></div>';

    /* host 찾기. 폴더가 여럿이면 첫 번째. 하나뿐인 지금은 고르는 UI 를 안 만듦
       (없는 선택지를 그리면 화면만 늘고 고를 것이 없다). 늘면 그때 칩을 붙인다. */
    const entries = await repo.list(ROOT_DIR);
    const dirs = entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();
    if (!dirs.length) throw new Error(ROOT_DIR + ' 아래에 host 폴더가 없다');
    const host = dirs[0];

    const roll = await repo.readJson<Rollups>(ROOT_DIR + '/' + host + '/rollups.json');
    status(host + ', ' + daysAgo(roll.generatedAt));

    const wrap = document.createElement('div');
    wrap.className = 'au';
    root.textContent = '';
    root.appendChild(wrap);

    let span = 30;
    let metric: MetricId = 'cost';

    const numsEl = document.createElement('div');
    numsEl.className = 'au-nums';
    const spanEl = document.createElement('div');
    spanEl.className = 'au-chips';
    const metricEl = document.createElement('div');
    metricEl.className = 'au-chips';
    const canvas = document.createElement('canvas');
    canvas.className = 'au-chart';
    const restEl = document.createElement('div');
    restEl.className = 'au';

    wrap.appendChild(spanEl);
    wrap.appendChild(numsEl);
    wrap.appendChild(metricEl);
    wrap.appendChild(canvas);
    wrap.appendChild(restEl);

    for (const s of [30, 90, 365]) {
      const b = document.createElement('button');
      b.textContent = s === 365 ? '1년' : s + '일';
      b.addEventListener('click', () => {
        span = s;
        paint();
      });
      spanEl.appendChild(b);
    }
    for (const m of METRICS) {
      const b = document.createElement('button');
      b.textContent = m.label;
      b.addEventListener('click', () => {
        metric = m.id;
        paint();
      });
      metricEl.appendChild(b);
    }

    function paint(): void {
      const days = lastDays(span);
      const picked = days.filter((d) => roll.byDay[d]).map((d) => roll.byDay[d]);
      const total = sum(picked);
      const m = METRICS.filter((x) => x.id === metric)[0];

      const chips = Array.from(spanEl.querySelectorAll('button'));
      chips.forEach((b, i) => b.classList.toggle('on', [30, 90, 365][i] === span));
      Array.from(metricEl.querySelectorAll('button')).forEach((b, i) =>
        b.classList.toggle('on', METRICS[i].id === metric)
      );

      numsEl.innerHTML =
        '<div class="au-num"><b>' + esc(usd(total.cost)) + '</b><span>환산가</span></div>' +
        '<div class="au-num"><b>' + esc(short(total.sessions)) + '</b><span>세션</span></div>' +
        '<div class="au-num"><b>' + esc(short(total.prompts)) + '</b><span>프롬프트</span></div>' +
        '<div class="au-num"><b>' + esc(hours(total.activeMs)) + '</b><span>붙어 있던 시간</span></div>';

      drawBars(canvas, days, roll.byDay, m.get);

      const months = Object.keys(roll.byMonth || {}).sort().reverse().slice(0, 6);
      const monthRows: Array<[string, number]> = months.map((k) => [k, m.get(roll.byMonth[k]) || 0]);

      restEl.innerHTML =
        listHtml('달마다 (' + m.label + ')', monthRows, m.fmt) +
        listHtml('모델 (세션)', topList(roll.byModel, (b) => b.sessions, 6), (n) => short(n) + '판') +
        listHtml('저장소 (' + m.label + ')', topList(roll.byRepo, m.get, 5), m.fmt) +
        '<div class="au-foot">' +
        esc(
          '환산가는 실제 결제액이 아니라 토큰을 정가로 환산한 값이다. ' +
            host + ', ' + daysAgo(roll.generatedAt) +
            (roll.coverage && roll.coverage.lastHistory
              ? ', 마지막 기록 ' + roll.coverage.lastHistory.slice(0, 10)
              : '')
        ) +
        '</div>';
    }

    paint();

    /* 화면이 돌아가면 캔버스 폭이 바뀐다. 다시 안 그리면 늘어진 그림이 남는다. */
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => paint());
      ro.observe(canvas);
    } catch {
      ro = null;
    }
    ctx.onDispose(() => {
      try {
        ro?.disconnect();
      } catch {
        /* 이미 사라진 판 */
      }
    });
  }

  dashRegistry().register({
    id: 'ai-usage',
    title: 'AI 사용',
    access: 'read',
    paths: [ROOT_DIR + '/<host>/rollups.json'],
    render,
  });
})();

export {};
