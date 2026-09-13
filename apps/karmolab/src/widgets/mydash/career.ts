/**
 * 패널: 커리어 (읽기 전용).
 *
 * 읽는 것 하나. `data/career/summary.json` (schema `career/1`). 생성기는 memo 의
 * `scripts/career/summarize.mjs` 고 정본은 markdown 둘 (`career/goal/scoreboard.md`,
 * `career/README.md`). 화면은 파생물만.
 *
 * ## 안 하는 것
 *
 * 나 페이지 원칙 3절 (`memo/notes/mydash/docs/나-페이지-설계.md`). 점수, 등급, 성격 판정,
 * 진행률 바 금지. 여기 숫자는 개수와 날짜뿐. 12항목을 5칸으로 세는 것은 세기이지
 * 채점이 아님. 칸은 비율 막대로 안 그림. 빈 칸은 그냥 0.
 *
 * 계기판 3줄도 scoreboard.md 의 규칙 그대로. 등급 마지막 이동일이 없으면 "없음",
 * 축 교체일을 이동일로 대체 금지 (생성기가 이미 null 로 냄).
 *
 * ## 안 박는 것
 *
 * 항목 수, 마일스톤 수, 상태 갈래의 차례만 코드에 있다. 항목 이름과 날짜와 phase 는 전부
 * 파일에서 온다. `board.items` 에 모르는 상태가 오면 숨기지 않고 그 값 자체를 라벨로
 * 마지막 묶음에 붙인다 (미아 은닉 금지).
 */
import { dashRegistry, esc } from './kit';
import type { DashPanelCtx } from './kit';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  'use strict';

  type Target = { name?: string; date?: string };
  type Milestone = { name?: string; date?: string; source?: string };
  type Gauge = {
    lastGradeMoveAt?: string | null;
    measureCount?: number;
    lastMeasureAt?: string | null;
    lastMeasureNote?: string;
  };
  type BoardItem = { name?: string; state?: string };
  type Board = {
    ok?: number;
    evidenceOnly?: number;
    partial?: number;
    none?: number;
    unmeasured?: number;
    items?: BoardItem[];
  };
  type Summary = {
    schema?: string;
    generatedAt?: string;
    counts?: { milestones?: number; items?: number; warnings?: number };
    data?: {
      target?: Target;
      milestones?: Milestone[];
      gauge?: Gauge;
      board?: Board;
      phase?: string;
    };
  };

  const DATA_PATH = 'data/career/summary.json';
  /** 이 패널이 아는 봉투 판. 메이저가 다르면 반쯤 그리지 않는다 */
  const SCHEMA_MAJOR = 1;
  const KST_OFFSET_MS = 9 * 3600000;

  /** 상태 칸 차례. 채워진 쪽부터 빈 쪽으로. 모르는 상태는 이 뒤에 붙는다 */
  const STATES = ['ok', 'evidenceOnly', 'partial', 'none', 'unmeasured'] as const;
  type StateKey = (typeof STATES)[number];

  const STATE_LABEL: Record<StateKey, string> = {
    ok: '충족',
    evidenceOnly: '증거만',
    partial: '일부',
    none: '없음',
    unmeasured: '미측정',
  };

  function stateLabel(key: string): string {
    const fallback = (STATE_LABEL as Record<string, string>)[key];
    return t('mydash.cr.state.' + key, undefined, fallback || key);
  }

  const STYLE_ID = 'mydash-career-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 색, 둥글기, 글자 크기는 전부 스킨 토큰. 여기 직접 적는 것은 손가락 표적 하나뿐 */
    el.textContent = [
      '.cr{--cr-tap:44px;display:flex;flex-direction:column;gap:var(--space-md)}',
      '.cr-sec{display:flex;flex-direction:column;gap:var(--space-sm)}',
      /* 목표 머리. 폰에서 이름과 날짜가 한 줄에 안 들어가 세로로 쌓는다 */
      '.cr-goal{display:flex;flex-direction:column;gap:var(--space-xs);',
      'padding:var(--space-md);border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.cr-goal b{font-size:var(--font-size-title);line-height:1.3;color:var(--text-primary)}',
      '.cr-goal i{font-style:normal;font-size:var(--font-size-title);line-height:1.3;',
      'font-variant-numeric:tabular-nums;color:var(--accent-ink)}',
      '.cr-goal span{font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      /* 폰이 기본 두 칸. 넓어지면 다섯 (상태 갈래가 다섯) */
      '.cr-nums{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-sm)}',
      '@media(min-width:560px){.cr-nums{grid-template-columns:repeat(5,1fr)}}',
      '.cr-num{padding:var(--space-sm);border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.cr-num b{display:block;font-size:var(--font-size-title);line-height:1.3;',
      'font-variant-numeric:tabular-nums}',
      '.cr-num span{display:block;font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      /* 목록 안에 또 스크롤을 만들지 않는다. 판 전체가 스크롤 */
      '.cr-list{max-height:none}',
      '.cr-list .tool-list-row{align-items:flex-start;min-height:var(--cr-tap)}',
      '.cr-list .tool-list-key{min-width:6.5rem}',
      /* 지난 마일스톤. 지웠다고 오해하지 않게 자리는 두고 흐리게만 */
      '.cr-list .cr-past .tool-list-key,.cr-list .cr-past .tool-list-val{color:var(--text-tertiary)}',
      '.cr-val{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:baseline;min-width:0}',
      '.cr-val em{font-style:normal;color:var(--text-primary);word-break:break-word}',
      '.cr-val i{font-style:normal;font-size:var(--font-size-3xs);color:var(--text-tertiary);',
      'font-variant-numeric:tabular-nums}',
      '.cr-note{font-size:var(--font-size-2xs);color:var(--text-secondary);line-height:1.7;',
      'word-break:break-word}',
      '.cr-foot{font-size:var(--font-size-3xs);color:var(--text-tertiary);line-height:1.7}',
    ].join('');
    document.head.appendChild(el);
  }

  function text(v: unknown): string {
    return typeof v === 'string' ? v : '';
  }

  function num(v: unknown): number {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  function schemaMajor(schema: unknown): number | null {
    if (typeof schema !== 'string') return null;
    const at = schema.lastIndexOf('/');
    const n = parseInt(at < 0 ? schema : schema.slice(at + 1), 10);
    return isFinite(n) ? n : null;
  }

  /* ── 날짜 ──────────────────────────────────────────
     정본의 날짜는 전부 `YYYY-MM-DD` 고 시각이 없다. 기기 지역시로 재면 하루가 밀어져
     D-day 가 어긋난다. KST 자정 기준으로만 센다. */

  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  /** KST 자정의 ms. 꼴이 아니면 null */
  function dayMs(day: unknown): number | null {
    const s = text(day).slice(0, 10);
    if (!DAY_RE.test(s)) return null;
    const at = Date.parse(s + 'T00:00:00+09:00');
    return isFinite(at) ? at : null;
  }

  /** KST 오늘 자정의 ms */
  function todayMs(): number {
    const now = new Date(Date.now() + KST_OFFSET_MS);
    const key =
      now.getUTCFullYear() +
      '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getUTCDate()).padStart(2, '0');
    return Date.parse(key + 'T00:00:00+09:00');
  }

  /** 오늘부터 그날까지 남은 날. 지난 날은 음수, 못 읽으면 null */
  function daysLeft(day: unknown): number | null {
    const at = dayMs(day);
    if (at === null) return null;
    return Math.round((at - todayMs()) / 86400000);
  }

  /** D-321, D-day, D+12. 못 읽으면 빈 글자 */
  function dday(day: unknown): string {
    const n = daysLeft(day);
    if (n === null) return '';
    if (n === 0) return t('mydash.cr.dday.today', undefined, 'D-day');
    if (n > 0) return t('mydash.cr.dday.left', { n }, 'D-{n}');
    return t('mydash.cr.dday.past', { n: -n }, 'D+{n}');
  }

  /** 그날이 며칠 전인가. 오늘과 미래는 빈 글자 */
  function agoWords(day: unknown): string {
    const n = daysLeft(day);
    if (n === null || n > 0) return '';
    if (n === 0) return t('mydash.cr.ago.today', undefined, '오늘');
    return t('mydash.cr.ago.days', { n: -n }, '{n}일 전');
  }

  function bakedAgo(iso: unknown): string {
    const at = Date.parse(text(iso));
    if (!isFinite(at)) return '';
    const d = Math.floor((Date.now() - at) / 86400000);
    if (d <= 0) return t('mydash.cr.baked.today', undefined, '오늘 구움');
    if (d === 1) return t('mydash.cr.baked.yesterday', undefined, '어제 구움');
    return t('mydash.cr.baked.days', { n: d }, '{n}일 전에 구움');
  }

  /* ── 조각 ─────────────────────────────────────────── */

  function rowHtml(key: string, valHtml: string, cls?: string): string {
    return (
      '<div class="tool-list-row' + (cls ? ' ' + cls : '') + '">' +
      '<div class="tool-list-key">' + esc(key) + '</div>' +
      '<div class="tool-list-val">' + valHtml + '</div>' +
      '</div>'
    );
  }

  function valHtml(main: string, side: string): string {
    return (
      '<div class="cr-val"><em>' + esc(main) + '</em>' +
      (side ? '<i>' + esc(side) + '</i>' : '') +
      '</div>'
    );
  }

  function secHtml(title: string, body: string, hint?: string): string {
    if (!body) return '';
    return (
      '<div class="cr-sec"><div class="tool-sublabel">' + esc(title) + '</div>' +
      body +
      (hint ? '<div class="tool-hint">' + esc(hint) + '</div>' : '') +
      '</div>'
    );
  }

  /** 목표 머리. 이름과 날짜와 D-day. 날짜를 못 읽으면 D-day 자리를 비운다 */
  function goalHtml(target: Target | undefined, phase: string): string {
    const name = text(target && target.name);
    const date = text(target && target.date).slice(0, 10);
    if (!name && !date) return '';
    const left = dday(date);
    const bits: string[] = [];
    if (date) bits.push(date);
    if (phase) bits.push(phase);
    return (
      '<div class="cr-goal">' +
      (name ? '<b>' + esc(name) + '</b>' : '') +
      (left ? '<i>' + esc(left) + '</i>' : '') +
      (bits.length ? '<span>' + esc(bits.join(', ')) + '</span>' : '') +
      '</div>'
    );
  }

  /** 마일스톤. 날짜순, 날짜 없는 것은 뒤로, 지난 것은 흐리게 */
  function milestonesHtml(list: Milestone[]): string {
    if (!list.length) return '';
    const sorted = list.slice().sort((a, b) => {
      const x = text(a.date).slice(0, 10);
      const y = text(b.date).slice(0, 10);
      if (x !== y) return x && y ? (x < y ? -1 : 1) : x ? -1 : 1;
      return text(a.name) < text(b.name) ? -1 : 1;
    });
    const rows = sorted
      .map((m) => {
        const date = text(m.date).slice(0, 10);
        const n = daysLeft(date);
        const past = n !== null && n < 0;
        return rowHtml(
          date || t('mydash.cr.noDate', undefined, '날짜 없음'),
          valHtml(text(m.name) || t('mydash.cr.noName', undefined, '이름 없음'), dday(date)),
          past ? 'cr-past' : ''
        );
      })
      .join('');
    return '<div class="tool-list cr-list">' + rows + '</div>';
  }

  /**
   * 계기판 3줄. scoreboard.md 의 코드 블록 그대로.
   * 등급 이동일 null 이면 "없음". 측정일을 이동일 자리에 대체 금지.
   */
  function gaugeHtml(g: Gauge | undefined): string {
    const move = text(g && g.lastGradeMoveAt).slice(0, 10);
    const last = text(g && g.lastMeasureAt).slice(0, 10);
    const count = num(g && g.measureCount);
    const rows =
      rowHtml(
        t('mydash.cr.gauge.move', undefined, '등급 이동'),
        valHtml(move || t('mydash.cr.none', undefined, '없음'), move ? agoWords(move) : '')
      ) +
      rowHtml(
        t('mydash.cr.gauge.count', undefined, '측정 누계'),
        valHtml(t('mydash.cr.gauge.countVal', { n: count }, '{n}회'), '')
      ) +
      rowHtml(
        t('mydash.cr.gauge.last', undefined, '마지막 측정'),
        valHtml(last || t('mydash.cr.none', undefined, '없음'), last ? agoWords(last) : '')
      );
    const note = text(g && g.lastMeasureNote);
    return (
      '<div class="tool-list cr-list">' + rows + '</div>' +
      (note ? '<div class="cr-note">' + esc(note) + '</div>' : '')
    );
  }

  /**
   * 상태 칸 다섯. 세는 기준은 `board` 의 수 필드, 항목 목록과 어긋나면 목록 우선
   * (수 필드는 markdown 의 "지금 상태" 블록에서 따로 옴, 표와 갈릴 수 있음).
   * 어긋난 것은 조용히 덮지 않고 아래 한 줄로 표시.
   */
  function tallyOf(board: Board, items: BoardItem[]): { counted: Record<string, number>; order: string[] } {
    const counted: Record<string, number> = {};
    for (const k of STATES) counted[k] = 0;
    const order: string[] = STATES.slice();
    for (const it of items) {
      const k = text(it.state) || 'unmeasured';
      if (!(k in counted)) {
        counted[k] = 0;
        order.push(k);
      }
      counted[k] += 1;
    }
    if (!items.length) {
      for (const k of STATES) counted[k] = num((board as Record<string, unknown>)[k]);
    }
    return { counted, order };
  }

  function numsHtml(counted: Record<string, number>, order: string[]): string {
    return (
      '<div class="cr-nums">' +
      order
        .map(
          (k) =>
            '<div class="cr-num"><b>' + esc(String(counted[k] || 0)) + '</b><span>' +
            esc(stateLabel(k)) + '</span></div>'
        )
        .join('') +
      '</div>'
    );
  }

  /** 항목 목록. 상태별 묶음, 묶음 안은 파일 차례 그대로 (표 차례가 정본) */
  function itemsHtml(items: BoardItem[], order: string[]): string {
    if (!items.length) return '';
    const out: string[] = [];
    for (const k of order) {
      const mine = items.filter((it) => (text(it.state) || 'unmeasured') === k);
      if (!mine.length) continue;
      const rows = mine
        .map((it) =>
          rowHtml(stateLabel(k), valHtml(text(it.name) || t('mydash.cr.noName', undefined, '이름 없음'), ''))
        )
        .join('');
      out.push('<div class="tool-list cr-list">' + rows + '</div>');
    }
    return out.join('');
  }

  /** 수 필드와 항목 셈이 갈리나. 갈리면 사람이 markdown 을 봐야 한다 */
  function mismatchWords(board: Board, counted: Record<string, number>, items: BoardItem[]): string {
    if (!items.length) return '';
    const bad: string[] = [];
    for (const k of STATES) {
      const said = num((board as Record<string, unknown>)[k]);
      if (said !== (counted[k] || 0)) bad.push(stateLabel(k));
    }
    if (!bad.length) return '';
    return t(
      'mydash.cr.mismatch',
      { fields: bad.join(', ') },
      '수 필드와 항목 셈이 다릅니다 ({fields}). markdown 정본 확인'
    );
  }

  async function render(ctx: DashPanelCtx): Promise<void> {
    ensureStyle();
    /* 옮긴 말이 안 와도 그린다. 아래 모든 t 호출에 한국어 원본이 딸려 있다 */
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo, status } = ctx;
    root.innerHTML =
      '<div class="cr"><div class="tool-status">' +
      esc(t('mydash.cr.loading', undefined, '저장소에서 받는 중...')) +
      '</div></div>';

    const raw = await repo.readJson<Summary>(DATA_PATH);

    const major = schemaMajor(raw.schema);
    if (major !== null && major !== SCHEMA_MAJOR) {
      root.innerHTML =
        '<div class="cr"><div class="tool-status error">' +
        esc(
          t(
            'mydash.cr.schemaBad',
            { schema: text(raw.schema) },
            '모르는 판입니다 ({schema}). 대시보드를 다시 배포하세요'
          )
        ) +
        '</div></div>';
      return;
    }

    const d = raw.data || {};
    const board: Board = d.board || {};
    const items = Array.isArray(board.items)
      ? board.items.filter((it): it is BoardItem => !!it && typeof it === 'object')
      : [];
    const milestones = Array.isArray(d.milestones)
      ? d.milestones.filter((m): m is Milestone => !!m && typeof m === 'object')
      : [];
    const phase = text(d.phase);

    const { counted, order } = tallyOf(board, items);
    const mismatch = mismatchWords(board, counted, items);
    const warnings = num(raw.counts && raw.counts.warnings);

    status(
      t(
        'mydash.cr.status',
        { n: items.length, when: bakedAgo(raw.generatedAt) },
        '항목 {n}, {when}'
      )
    );

    const notes: string[] = [];
    if (warnings > 0) {
      notes.push(
        '<div class="tool-status error">' +
          esc(t('mydash.cr.warnings', { n: warnings }, '생성기 경고 {n}건. markdown 형식 확인')) +
          '</div>'
      );
    }
    if (mismatch) {
      notes.push('<div class="tool-status error">' + esc(mismatch) + '</div>');
    }

    const wrap = document.createElement('div');
    wrap.className = 'cr';
    wrap.innerHTML =
      goalHtml(d.target, phase) +
      notes.join('') +
      secHtml(t('mydash.cr.sec.milestones', undefined, '마일스톤'), milestonesHtml(milestones)) +
      secHtml(
        t('mydash.cr.sec.gauge', undefined, '진척 계기판'),
        gaugeHtml(d.gauge),
        t('mydash.cr.gauge.hint', undefined, '등급은 사람이 옮깁니다. 측정은 관찰이고 점수가 아닙니다')
      ) +
      secHtml(
        t('mydash.cr.sec.board', undefined, '항목 상태'),
        numsHtml(counted, order) + itemsHtml(items, order)
      ) +
      '<div class="cr-foot">' +
      esc(
        t(
          'mydash.cr.foot',
          { when: bakedAgo(raw.generatedAt) },
          '정본은 career/goal/scoreboard.md 와 career/README.md 입니다. 이 화면은 파생물, {when}'
        )
      ) +
      '</div>';

    root.textContent = '';
    root.appendChild(wrap);
  }

  dashRegistry().register({
    id: 'career',
    title: '커리어',
    access: 'read',
    paths: [DATA_PATH],
    render,
  });
})();

export {};
