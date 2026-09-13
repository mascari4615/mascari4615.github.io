/**
 * 패널: PC 성능 (읽기 전용).
 *
 * 읽는 것은 하나. `memo/data/pc-vitals/<host>/summary.json` (봉투 `pc-vitals/1`).
 * 생성기는 `memo/scripts/pc-vitals/summarize.mjs`, 원본은 laptop-ops 의 `/vitals` 와
 * `/vitals/journal`. 판정 규칙 정본은 `memo/laptop-ops/vitals-pc-say.md`.
 *
 * host 를 코드에 안 박음. ai-usage 와 같은 손으로 `data/pc-vitals/` 를 훑어 폴더를 찾음.
 * 폴더가 여럿이면 칩으로 고름 (노트북과 데스크톱 둘이 되는 날 코드를 고치러 오지 않게).
 *
 * **없는 값은 0 이 아님.** journal 의 cpuPct, diskBusyPct, net 은 기준선이 없으면 -1 이고
 * 생성기가 그것을 null 로 넘김. 화면은 null 을 하이픈으로 두고 막대도 안 그림.
 * 0 으로 채우면 놀고 있던 것처럼 보임.
 *
 * 점수와 등급 없음 (나 페이지 설계 3절). 판정 줄은 생성기가 만든 관찰문 그대로.
 * 그림은 Canvas 2D 로 직접 (ai-usage 와 같은 패턴, 새 의존성 없음).
 */
import { dashRegistry, esc } from './kit';
import type { DashPanelCtx } from './kit';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  'use strict';

  type Latest = {
    at?: string;
    memUsedPct?: number | null;
    memUnexplainedPct?: number | null;
    cpuPct?: number | null;
    diskFreeGb?: number | null;
    netKbps?: number | null;
    uptimeH?: number | null;
  };
  type Day = {
    day?: string;
    samples?: number;
    memUsedPctAvg?: number | null;
    memUsedPctMax?: number | null;
    memUnexplainedPctMax?: number | null;
    cpuPctAvg?: number | null;
    diskFreeGbMin?: number | null;
  };
  type Verdict = { day?: string; kind?: string; text?: string };
  type Vitals = {
    schema?: string;
    generatedAt?: string;
    generator?: string;
    source?: unknown;
    counts?: { days?: number; samples?: number; verdicts?: number };
    data?: { host?: string; latest?: Latest; days?: Day[]; verdicts?: Verdict[] };
  };

  const ROOT_DIR = 'data/pc-vitals';
  /** 이 패널이 아는 봉투 판. 메이저가 다르면 반쯤 그리지 않고 다시 배포하라고 적음 */
  const SCHEMA_MAJOR = 1;
  /** 판정 목록에 보이는 줄 수. 최근 것부터 */
  const VERDICT_SHOW = 10;
  /** 막대 축의 최대 날짜 수. 장부가 길어져도 폰에서 한 획이 1px 아래로 안 내려가게 */
  const AXIS_MAX = 120;
  /** 이 시간이 넘으면 옛 자료라고 알림 */
  const STALE_MS = 86400000;
  const DAY_MS = 86400000;
  const KST_OFFSET_MS = 9 * 3600000;
  const DASH = '-';

  const STYLE_ID = 'mydash-pcvitals-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 색과 둥글기와 글자 크기는 전부 스킨 토큰. 여기 직접 적는 것은 손가락 표적과 그림 높이뿐 */
    el.textContent = [
      '.pv{--pv-tap:44px;display:flex;flex-direction:column;gap:var(--space-md)}',
      /* 폰이 기본. 두 칸이면 큰 숫자가 안 줄어듦. 넓어지면 다섯 */
      '.pv-nums{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-sm)}',
      '@media(min-width:560px){.pv-nums{grid-template-columns:repeat(5,1fr)}}',
      '.pv-num{padding:var(--space-sm);border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.pv-num b{display:block;font-size:var(--font-size-title);line-height:1.3;',
      'font-variant-numeric:tabular-nums;color:var(--text-primary)}',
      '.pv-num span{display:block;font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      /* 손가락 최소 44px. 칩은 킷 것을 쓰고 높이만 벌림 */
      '.pv .tool-chip{min-height:var(--pv-tap);display:inline-flex;align-items:center}',
      '.pv-chart{width:100%;height:150px;display:block;border-radius:var(--radius-lg);',
      'background:var(--bg-secondary);touch-action:pan-y}',
      '@media(min-width:560px){.pv-chart{height:200px}}',
      '.pv-sec{display:flex;flex-direction:column;gap:var(--space-xs)}',
      '.pv-row{display:grid;grid-template-columns:auto 1fr;gap:var(--space-sm);align-items:baseline}',
      '.pv-row em{font-style:normal;font-variant-numeric:tabular-nums;color:var(--text-tertiary);',
      'font-size:var(--font-size-3xs)}',
      '.pv-row i{font-style:normal;color:var(--text-secondary);font-size:var(--font-size-2xs);',
      'word-break:break-word}',
      '.pv-foot{font-size:var(--font-size-3xs);color:var(--text-tertiary);line-height:1.7}',
    ].join('');
    document.head.appendChild(el);
  }

  /* 읽기 ------------------------------------------------------------- */

  function text(v: unknown): string {
    return typeof v === 'string' ? v : '';
  }

  /** 숫자인가. null 과 NaN 과 글자를 한 자리에서 거름 */
  function numOf(v: unknown): number | null {
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function schemaMajor(schema: unknown): number | null {
    if (typeof schema !== 'string') return null;
    const at = schema.lastIndexOf('/');
    const n = parseInt(at < 0 ? schema : schema.slice(at + 1), 10);
    return isFinite(n) ? n : null;
  }

  /* 꼴 만들기 -------------------------------------------------------- */

  /** 소수 한 자리까지. 정수면 정수 그대로 */
  function num1(n: number): string {
    return String(Math.round(n * 10) / 10);
  }

  function comma(n: number): string {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function pct(v: unknown): string {
    const n = numOf(v);
    return n === null ? DASH : num1(n) + '%';
  }

  function gb(v: unknown): string {
    const n = numOf(v);
    return n === null ? DASH : num1(n) + 'GB';
  }

  /** KST 벽시계 시각. 기기 지역시로 찍으면 노트북 장부와 시각이 어긋남 */
  function kstClock(iso: string): string {
    const ms = Date.parse(iso);
    if (!isFinite(ms)) return DASH;
    const d = new Date(ms + KST_OFFSET_MS);
    return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }

  /** 얼마나 지난 것인가. 분, 시간, 일 순으로 굵어짐 */
  function agoText(iso: string): string {
    const ms = Date.parse(iso);
    if (!isFinite(ms)) return '';
    const gapMs = Date.now() - ms;
    if (gapMs < 60000) return t('mydash.pv.ago.now', undefined, '방금');
    const min = Math.floor(gapMs / 60000);
    if (min < 60) return t('mydash.pv.ago.min', { n: min }, '{n}분 전');
    const hour = Math.floor(min / 60);
    if (hour < 24) return t('mydash.pv.ago.hour', { n: hour }, '{n}시간 전');
    return t('mydash.pv.ago.day', { n: Math.floor(hour / 24) }, '{n}일 전');
  }

  /** 며칠 지난 자료인가. 못 읽으면 -1 */
  function ageDays(iso: string): number {
    const ms = Date.parse(iso);
    if (!isFinite(ms)) return -1;
    return Math.floor((Date.now() - ms) / DAY_MS);
  }

  /** 판정 갈래 이름. 모르는 갈래는 값 그대로 (미아 은닉 금지) */
  function kindLabel(kind: string): string {
    if (kind === 'unexplained') return t('mydash.pv.kind.unexplained', undefined, '설명 안 되는 메모리');
    if (kind === 'nonpaged') return t('mydash.pv.kind.nonpaged', undefined, '비페이지 풀');
    if (kind === 'lowfree') return t('mydash.pv.kind.lowfree', undefined, '여유 메모리');
    if (kind === 'commit') return t('mydash.pv.kind.commit', undefined, '커밋');
    return kind;
  }

  /* 날짜 축 ---------------------------------------------------------- */

  function dayMs(day: string): number {
    return Date.parse(day + 'T00:00:00+09:00');
  }

  function dayKey(ms: number): string {
    const d = new Date(ms + KST_OFFSET_MS);
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return d.getUTCFullYear() + '-' + m + '-' + day;
  }

  /**
   * 첫 날부터 끝 날까지 하루도 빠짐없는 축.
   * **표본이 없는 날도 자리를 차지함.** 있는 날만 붙여 그리면 노트북이 꺼져 있던 구간이
   * 사라져 매일 켜 둔 것처럼 보임.
   */
  function axisDays(days: Day[]): string[] {
    const keys = days.map((d) => text(d.day)).filter((k) => isFinite(dayMs(k)));
    if (!keys.length) return [];
    keys.sort();
    const from = dayMs(keys[0]);
    const to = dayMs(keys[keys.length - 1]);
    const span = Math.floor((to - from) / DAY_MS) + 1;
    if (span > AXIS_MAX) {
      /* 장부가 길면 끝에서 AXIS_MAX 일만. 앞을 자르는 쪽이 맞음 (지금이 궁금한 화면) */
      const out: string[] = [];
      for (let i = AXIS_MAX - 1; i >= 0; i--) out.push(dayKey(to - i * DAY_MS));
      return out;
    }
    const out: string[] = [];
    for (let i = 0; i < span; i++) out.push(dayKey(from + i * DAY_MS));
    return out;
  }

  /**
   * 하루 두 값 막대. 최대를 연하게 깔고 평균을 그 위에 진하게.
   * 두 캔버스로 나누면 폰에서 그림이 화면 하나를 다 먹음.
   */
  function drawBars(
    canvas: HTMLCanvasElement,
    keys: string[],
    avg: Record<string, number | null>,
    max: Record<string, number | null>
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
    if (!keys.length) return;

    let top = 0;
    for (const k of keys) {
      const a = numOf(avg[k]);
      const b = numOf(max[k]);
      if (a !== null && a > top) top = a;
      if (b !== null && b > top) top = b;
    }
    if (top <= 0) top = 1;

    const pad = 6;
    const inner = h - pad * 2;
    const step = (w - pad * 2) / keys.length;
    const bw = Math.max(1, Math.min(step - 1, step * 0.8));

    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#6ea8fe';
    const dim = css.getPropertyValue('--text-tertiary').trim() || '#888';

    /* 가운데 눈금 하나만. 폰에서 눈금 넷은 그림보다 눈금이 커짐 */
    ctx.strokeStyle = dim;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(pad, pad + inner / 2);
    ctx.lineTo(w - pad, pad + inner / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = accent;
    for (let i = 0; i < keys.length; i++) {
      const x = pad + i * step + (step - bw) / 2;
      const hi = numOf(max[keys[i]]);
      if (hi !== null && hi > 0) {
        const bh = Math.max(1, (hi / top) * inner);
        ctx.globalAlpha = 0.3;
        ctx.fillRect(x, pad + inner - bh, bw, bh);
      }
      const mid = numOf(avg[keys[i]]);
      if (mid !== null && mid > 0) {
        const bh = Math.max(1, (mid / top) * inner);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, pad + inner - bh, bw, bh);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* 그리기 ----------------------------------------------------------- */

  async function render(ctx: DashPanelCtx): Promise<void> {
    ensureStyle();
    /* 옮긴 말이 안 와도 그림. 아래 모든 t 호출에 한국어 원본이 딸림 */
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo, status } = ctx;
    const loading = t('mydash.pv.loading', undefined, '저장소에서 받는 중...');
    root.innerHTML = '<div class="pv"><div class="tool-status">' + esc(loading) + '</div></div>';

    const entries = await repo.list(ROOT_DIR);
    const hosts = entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();
    if (!hosts.length) throw new Error(ROOT_DIR + ' 아래에 host 폴더가 없다');
    let host = hosts[0];

    const wrap = document.createElement('div');
    wrap.className = 'pv';
    root.textContent = '';
    root.appendChild(wrap);

    /* 뼈대. host 칩은 폴더가 둘 이상일 때만. 고를 것이 하나면 칩은 화면만 먹음 */
    wrap.innerHTML =
      (hosts.length > 1
        ? '<div><div class="tool-sublabel">' +
          esc(t('mydash.pv.hostLabel', undefined, '기기')) +
          '</div><div class="tool-chips" data-hosts="1"></div></div>'
        : '') +
      '<div class="tool-status" data-stale="1" hidden></div>' +
      '<div class="pv-nums" data-nums="1"></div>' +
      '<div class="tool-sublabel" data-chartlabel="1"></div>' +
      '<canvas class="pv-chart" data-chart="1"></canvas>' +
      '<div class="pv-sec" data-verdicts="1"></div>' +
      '<div class="pv-foot" data-foot="1"></div>';

    const hostsEl = wrap.querySelector('[data-hosts]') as HTMLElement | null;
    const staleEl = wrap.querySelector('[data-stale]') as HTMLElement;
    const numsEl = wrap.querySelector('[data-nums]') as HTMLElement;
    const chartLabelEl = wrap.querySelector('[data-chartlabel]') as HTMLElement;
    const canvas = wrap.querySelector('[data-chart]') as HTMLCanvasElement;
    const verdictsEl = wrap.querySelector('[data-verdicts]') as HTMLElement;
    const footEl = wrap.querySelector('[data-foot]') as HTMLElement;

    if (hostsEl) {
      for (const name of hosts) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tool-chip';
        b.textContent = name;
        b.addEventListener('click', () => {
          if (host === name) return;
          host = name;
          void load();
        });
        hostsEl.appendChild(b);
      }
    }

    /* 지금 그린 자료. 다시 그리기(화면 회전)에서 다시 받지 않게 여기 둠 */
    let axis: string[] = [];
    let avgOf: Record<string, number | null> = {};
    let maxOf: Record<string, number | null> = {};

    function markHost(): void {
      if (!hostsEl) return;
      const list = Array.from(hostsEl.querySelectorAll('button'));
      list.forEach((b, i) => b.classList.toggle('active', hosts[i] === host));
    }

    function paintNums(latest: Latest): void {
      const at = text(latest.at);
      const cells: Array<[string, string]> = [
        [pct(latest.memUsedPct), t('mydash.pv.num.mem', undefined, '메모리')],
        [pct(latest.memUnexplainedPct), t('mydash.pv.num.unexplained', undefined, '설명 안 되는 양')],
        [pct(latest.cpuPct), t('mydash.pv.num.cpu', undefined, 'CPU')],
        [gb(latest.diskFreeGb), t('mydash.pv.num.disk', undefined, '디스크 여유')],
        [
          at ? kstClock(at) : DASH,
          at ? agoText(at) : t('mydash.pv.num.sampleAt', undefined, '마지막 표본'),
        ],
      ];
      numsEl.innerHTML = cells
        .map(
          ([big, small]) =>
            '<div class="pv-num"><b>' + esc(big) + '</b><span>' + esc(small) + '</span></div>'
        )
        .join('');
    }

    function paintVerdicts(list: Verdict[]): void {
      const rows = list.slice(-VERDICT_SHOW).reverse();
      const head =
        '<h4 class="tool-sublabel">' +
        esc(t('mydash.pv.verdict.head', undefined, '판정')) +
        '</h4>';
      if (!rows.length) {
        verdictsEl.innerHTML =
          head +
          '<div class="tool-hint">' +
          esc(t('mydash.pv.verdict.none', undefined, '걸린 판정 없음')) +
          '</div>';
        return;
      }
      verdictsEl.innerHTML =
        head +
        rows
          .map(
            (v) =>
              '<div class="pv-row"><em>' +
              esc(text(v.day)) +
              '</em><i>' +
              esc(kindLabel(text(v.kind))) +
              ', ' +
              esc(text(v.text)) +
              '</i></div>'
          )
          .join('');
    }

    function repaintChart(): void {
      drawBars(canvas, axis, avgOf, maxOf);
    }

    async function load(): Promise<void> {
      markHost();
      status(host + ', ' + loading);
      const raw = await repo.readJson<Vitals>(ROOT_DIR + '/' + host + '/summary.json');

      const major = schemaMajor(raw.schema);
      if (major !== null && major !== SCHEMA_MAJOR) {
        wrap.innerHTML =
          '<div class="tool-status error">' +
          esc(
            t(
              'mydash.pv.schemaBad',
              { schema: text(raw.schema) },
              '모르는 판입니다 ({schema}). 대시보드를 다시 배포하세요'
            )
          ) +
          '</div>';
        return;
      }

      const data = raw.data || {};
      const latest: Latest = data.latest || {};
      const days: Day[] = Array.isArray(data.days) ? data.days.filter((d) => !!d) : [];
      const verdicts: Verdict[] = Array.isArray(data.verdicts) ? data.verdicts.filter((v) => !!v) : [];
      const shownHost = text(data.host) || host;

      axis = axisDays(days);
      avgOf = {};
      maxOf = {};
      let samples = 0;
      for (const d of days) {
        const key = text(d.day);
        if (!key) continue;
        avgOf[key] = numOf(d.memUsedPctAvg);
        maxOf[key] = numOf(d.memUsedPctMax);
        samples += numOf(d.samples) || 0;
      }
      const countSamples = numOf(raw.counts && raw.counts.samples);
      if (countSamples !== null) samples = countSamples;

      /* 신선도. 마지막 표본이 정본, 없으면 구운 시각 */
      const freshIso = text(latest.at) || text(raw.generatedAt);
      const age = ageDays(freshIso);
      if (age >= 1) {
        staleEl.hidden = false;
        staleEl.className = 'tool-status error';
        staleEl.textContent = t('mydash.pv.stale', { n: age }, '{n}일 전 자료');
      } else {
        staleEl.hidden = true;
        staleEl.textContent = '';
      }

      paintNums(latest);
      chartLabelEl.textContent = t(
        'mydash.pv.chart.label',
        { n: axis.length },
        '메모리 {n}일. 진한 것이 하루 평균, 연한 것이 하루 최대'
      );
      repaintChart();
      paintVerdicts(verdicts);

      const foot: string[] = [
        shownHost,
        t('mydash.pv.foot.samples', { n: comma(samples) }, '표본 {n}건'),
        t('mydash.pv.foot.days', { n: days.length }, '{n}일'),
      ];
      const bakedIso = text(raw.generatedAt);
      if (bakedIso) {
        foot.push(t('mydash.pv.foot.baked', { when: agoText(bakedIso) }, '{when}에 구움'));
      }
      const uptime = numOf(latest.uptimeH);
      if (uptime !== null) {
        foot.push(t('mydash.pv.foot.uptime', { n: num1(uptime) }, '켜 둔 지 {n}시간'));
      }
      footEl.textContent = foot.join(', ');

      status(
        t(
          'mydash.pv.status',
          { host: shownHost, when: agoText(freshIso) },
          '{host}, 마지막 표본 {when}'
        )
      );
    }

    await load();

    /* 화면이 돌아가면 캔버스 폭이 바뀜. 다시 안 그리면 늘어진 그림이 남음 */
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => repaintChart());
      ro.observe(canvas);
    } catch {
      ro = null;
    }
    ctx.onDispose(() => {
      try {
        ro?.disconnect();
      } catch {
        /* 이미 사라진 자리 */
      }
    });
  }

  dashRegistry().register({
    id: 'pc-vitals',
    title: 'PC 성능',
    access: 'read',
    paths: [ROOT_DIR + '/<host>/summary.json'],
    render,
  });
})();

export {};
