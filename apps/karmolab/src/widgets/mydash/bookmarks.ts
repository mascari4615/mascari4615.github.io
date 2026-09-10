/**
 * 패널: 북마크 (1단계, 읽기 전용).
 *
 * 읽는 것은 둘, `data/bookmarks/summary.json` 항목 전부와 `data/bookmarks/axes.json` 축
 * 정의. **축 이름과 축 값 라벨은 코드에 안 박음.** 의도, 영역, 형태의 값 목록은 계속
 * 변경 대상이라 박아 두면 값 하나 늘 때마다 배포 필요. 화면은 axes.json 을 읽어 칩만
 * 만들고, 거기 없는 값이 항목에 있으면 그 값 자체를 라벨로 표시 (미아 은닉 금지).
 *
 * `axes.json` 은 **선택.** 못 받으면 빈 정의로 대체, 값 자체가 라벨.
 * 화면을 못 그리게 하는 것은 `summary.json` 실패 하나뿐.
 *
 * 링크는 킷의 `safeLinkUrl` 로 판정. http 도 통과 (실측 2026-09-10: 1,097건 중 22건 http).
 * 거부된 주소는 링크 대신 글자 옆에 "주소 열 수 없음" 표식.
 *
 * 저장소 쓰기 없음. 태깅, 열람 표시, 승격은 3단계 몫. 여기는 사람 판정 대기 건수만 숫자 표시.
 * 이 기기에만 남는 것 하나는 재발굴로 이미 보여 준 id (localStorage). 순수 보기 편의라 저장소와
 * 무관, 저장이 막힌 브라우저에서도 화면은 그대로 동작.
 *
 * 출처 라벨(X, 브라우저, 카톡)만 i18n 소관. `src` 는 축이 아니라 데이터 갈래라
 * axes.json 에 정의 없음. 모르는 갈래는 값 그대로 표시.
 */
import { dashRegistry, esc, safeLinkUrl } from './kit';
import type { DashPanelCtx } from './kit';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  'use strict';

  type AxisValue = { key: string; label?: string; hint?: string; retired?: boolean };
  type Axis = { key: string; label?: string; multi?: boolean; values?: AxisValue[] };
  type AxesFile = { schema?: string; axes?: Axis[]; data?: { axes?: Axis[] } };

  type Item = {
    id: string;
    src?: string;
    url?: string | null;
    label?: string | null;
    author?: string | null;
    recordedAt?: string | null;
    note?: string | null;
    /** 원본 줄의 작은 제목. label 이 비었을 때 표시 문자열의 첫 조각이 된다 */
    subhead?: string | null;
    /** 사람 판정 대기 표식. 값이 있으면 의도가 비어 있는 것이 정상이다 */
    pending?: string | null;
    /** 묶음 열쇠. 생성기가 항목에 직접 달거나 `data.bundles` 로 따로 낸다. 둘 다 받는다 */
    bundle?: string | null;
    bundleKey?: string | null;
    axes?: Record<string, unknown>;
    /**
     * 같은 주소가 다른 출처에서 또 나온 기록. 생성기가 배열로 낸다 (`shares` 라는 이름의
     * 숫자 필드는 스키마에 없음). 재발굴 점수에서 이 배열 길이를 나눗수로 사용.
     */
    shared?: unknown[];
  };
  type BundleDef = { key?: string; id?: string; items?: string[] };
  type Summary = {
    schema?: string;
    generatedAt?: string;
    counts?: { items?: number; parseFailed?: number };
    data?: { items?: Item[]; bundles?: BundleDef[] };
    items?: Item[];
  };

  const DATA_DIR = 'data/bookmarks';
  const SUMMARY_PATH = DATA_DIR + '/summary.json';
  const AXES_PATH = DATA_DIR + '/axes.json';

  /** 이 패널이 아는 봉투 판. 메이저가 다르면 반쯤 그리지 않고 다시 배포하라고 적는다 */
  const SCHEMA_MAJOR = 1;
  /** 한 번에 보이는 줄 수. 묶음은 접힌 채로 한 줄이다 */
  const PAGE = 100;
  /** 재발굴 후보 크기. 여기서 날짜 씨앗으로 하나 뽑는다 */
  const REVISIT_POOL = 40;
  /** 이 기기에서 이미 보여 준 재발굴 id. 순수 보기 편의라 기기마다 따로 둔다 */
  const SEEN_KEY = 'karmolab.mydash.bm.seen';
  /** 기억할 id 수. 넘치면 오래된 것부터 버린다 */
  const SEEN_MAX = 200;
  /** note 로 제목을 대신할 때 잘라 쓰는 길이 */
  const NOTE_HEAD = 40;
  /** 화면에 세울 필터 축. 여기 없는 축(우선순위, 생애주기, 주제)은 1단계에서 안 쓴다 */
  const FILTER_AXES = ['intent', 'domain', 'form'];
  /** 출처 칸 차례. 나머지는 뒤에 이름순으로 붙는다 */
  const SRC_ORDER = ['x', 'edge', 'kakao'];
  const KST_OFFSET_MS = 9 * 3600000;

  /** 출처 차례 재는 자. 칩 줄과 재발굴 후보가 같은 차례를 쓴다 */
  function bySrcOrder(a: string, b: string): number {
    const ai = SRC_ORDER.indexOf(a);
    const bi = SRC_ORDER.indexOf(b);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return a < b ? -1 : 1;
  }

  const STYLE_ID = 'mydash-bookmarks-style';
  function ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    /* 색, 둥글기, 글자 크기는 전부 스킨 토큰이다. 여기 직접 적는 것은 손가락 표적 하나뿐이고
       그 값도 이름을 붙여 한 곳에서만 쓴다. */
    el.textContent = [
      '.bm{--bm-tap:44px;display:flex;flex-direction:column;gap:var(--space-md)}',
      /* 폰이 기본. 두 칸이면 숫자가 안 줄어든다. 넓어지면 다섯. */
      '.bm-nums{display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-sm)}',
      '@media(min-width:560px){.bm-nums{grid-template-columns:repeat(5,1fr)}}',
      '.bm-num{padding:var(--space-sm);border-radius:var(--radius-lg);background:var(--bg-tertiary)}',
      '.bm-num b{display:block;font-size:var(--font-size-title);line-height:1.3;font-variant-numeric:tabular-nums}',
      '.bm-num span{display:block;font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.bm-groups{display:flex;flex-direction:column;gap:var(--space-sm)}',
      /* 누르는 칩만 44px 로 벌린다. 줄 안의 의도 칩은 표식이라 킷 크기 그대로. */
      '.bm-groups .tool-chip{min-height:var(--bm-tap);display:inline-flex;align-items:center}',
      '.bm .btn{min-height:var(--bm-tap)}',
      /* 검색칸은 킷 기본이 38px 언저리다. 폰에서 누르는 것은 전부 같은 표적 크기로 벌린다. */
      '.bm .field-group input{min-height:var(--bm-tap)}',
      /* 킷 목록의 기본 높이 제한은 목록 안에 또 스크롤을 만든다. 이 패널은 목록이 본문이라
         판 전체가 스크롤이어야 한다. */
      '.bm-list{max-height:none}',
      '.bm-list .tool-list-row{align-items:flex-start}',
      /* 킷의 열쇠 칸은 키, 값 표를 위한 폭이다. 여기 열쇠는 출처 표식 한 낱말이라 폭을 안 잡는다. */
      '.bm-list .tool-list-key{min-width:0;padding-top:var(--space-xs)}',
      '.bm-body{display:flex;flex-direction:column;gap:var(--space-xs);min-width:0;flex:1}',
      '.bm-title{display:flex;align-items:center;min-height:var(--bm-tap);',
      'color:var(--text-primary);word-break:break-word}',
      /* 열 수 없는 주소 표식. 글자 옆에 붙어 왜 링크가 아닌지 말한다. */
      '.bm-badurl{margin-left:var(--space-sm);font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.bm-meta{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center;',
      'font-size:var(--font-size-3xs);color:var(--text-tertiary)}',
      '.bm-row .bm-meta .tool-chip{pointer-events:none}',
      '.bm-kid .tool-list-key{padding-left:var(--space-md)}',
      '.bm-revisit{display:flex;flex-direction:column;gap:var(--space-xs)}',
    ].join('');
    document.head.appendChild(el);
  }

  /* ── 데이터 읽기. 생성기가 아직 굳지 않아 **둘 다 받는다** ─────────── */

  function itemsOf(raw: Summary): Item[] {
    const list = (raw && raw.data && raw.data.items) || (raw && raw.items) || [];
    return Array.isArray(list) ? list.filter((it) => !!it && typeof it === 'object') : [];
  }

  function axesOf(raw: AxesFile): Axis[] {
    const list = (raw && raw.axes) || (raw && raw.data && raw.data.axes) || [];
    return Array.isArray(list) ? list : [];
  }

  function schemaMajor(schema: unknown): number | null {
    if (typeof schema !== 'string') return null;
    const at = schema.lastIndexOf('/');
    const n = parseInt(at < 0 ? schema : schema.slice(at + 1), 10);
    return isFinite(n) ? n : null;
  }

  /** 항목이 그 축에 가진 값들. 하나만 담는 축은 글자, 여럿은 배열로 온다 */
  function axisValues(it: Item, key: string): string[] {
    const v = it.axes ? (it.axes as Record<string, unknown>)[key] : undefined;
    if (typeof v === 'string') return v ? [v] : [];
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && !!x);
    return [];
  }

  function text(v: unknown): string {
    return typeof v === 'string' ? v : '';
  }

  /** 주소의 집 이름. 표시 문자열의 마지막 조각으로 쓴다 */
  function hostOf(url: unknown): string {
    const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(text(url).trim());
    return m ? m[1].replace(/^www\./i, '').toLowerCase() : '';
  }

  /**
   * 화면에 보일 제목. 원본에 제목이 없는 항목이 193건이라 그대로 두면 원시 id 노출.
   * 차례는 셋. label, 없으면 note 앞 40자, 그래도 없으면 작은 제목과 작성자와 집 이름.
   * 검색도 이 문자열 대상 (보이는 글자로 못 찾는 것 방지).
   */
  function displayLabel(it: Item): string {
    const label = text(it.label).trim();
    if (label) return label;
    const note = text(it.note).trim();
    if (note) return note.length > NOTE_HEAD ? note.slice(0, NOTE_HEAD) + '...' : note;
    const bits: string[] = [text(it.subhead).trim() || t('mydash.bm.noTitle', undefined, '제목 없음')];
    const author = text(it.author).trim();
    if (author) bits.push(author);
    const host = hostOf(it.url);
    if (host) bits.push(host);
    return bits.join(', ');
  }

  /* ── 이 기기에서 이미 보여 준 재발굴 ──────────────────
     쓰기는 저장소가 아니라 이 브라우저다. 사생활 보호 창처럼 저장이 막힌 판에서는
     읽기도 쓰기도 조용히 실패하고, 재발굴은 미룸 없이 그냥 돈다. */

  function seenIds(): string[] {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]') as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  function markSeen(id: string): void {
    if (!id) return;
    try {
      const next = seenIds().filter((x) => x !== id);
      next.push(id);
      window.localStorage.setItem(SEEN_KEY, JSON.stringify(next.slice(-SEEN_MAX)));
    } catch {
      /* 저장이 막힌 브라우저. 다음에도 같은 것이 나올 뿐 화면은 안 죽는다 */
    }
  }

  /* ── 날짜 ─────────────────────────────────────────── */

  function kstDayKey(ms: number): string {
    const d = new Date(ms + KST_OFFSET_MS);
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return d.getUTCFullYear() + '-' + m + '-' + day;
  }

  /** 기록일이 며칠 전인가. 못 읽으면 -1 */
  function idleDays(recordedAt: unknown): number {
    const s = text(recordedAt).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return -1;
    const at = Date.parse(s + 'T00:00:00+09:00');
    if (!isFinite(at)) return -1;
    return Math.max(0, Math.floor((Date.now() - at) / 86400000));
  }

  function bakedAgo(iso: unknown): string {
    const at = Date.parse(text(iso));
    if (!isFinite(at)) return '';
    const d = Math.floor((Date.now() - at) / 86400000);
    if (d <= 0) return t('mydash.bm.baked.today', undefined, '오늘 구움');
    if (d === 1) return t('mydash.bm.baked.yesterday', undefined, '어제 구움');
    return t('mydash.bm.baked.days', { n: d }, '{n}일 전에 구움');
  }

  /* ── 화면 ─────────────────────────────────────────── */

  type Group = { key: string; label: string; values: Array<{ key: string; label: string; n: number }> };
  type Unit = { key: string; items: Item[] };

  function srcLabel(key: string): string {
    /* 아는 갈래 셋만 옮긴 말이 있다. 새 갈래는 값 그대로 보인다. */
    return t('mydash.bm.src.' + key, undefined, key);
  }

  async function render(ctx: DashPanelCtx): Promise<void> {
    ensureStyle();
    /* 옮긴 말이 안 와도 그린다. 아래 모든 t 호출에 한국어 원본이 딸려 있다 */
    await loadNamespace('mydash').catch(() => undefined);
    const { root, repo, status } = ctx;
    root.innerHTML =
      '<div class="bm"><div class="tool-status">' +
      esc(t('mydash.bm.loading', undefined, '저장소에서 받는 중...')) +
      '</div></div>';

    /* 필수는 summary 하나. axes 는 칩 라벨과 차례만 정하는 파일이라, 못 받으면 빈 정의로
       가고 값 자체를 라벨로 보인다 (미아 은닉 금지와 같은 손). summary 실패만 오류다. */
    const [rawSummary, rawAxes] = await Promise.all([
      repo.readJson<Summary>(SUMMARY_PATH),
      repo.readJson<AxesFile>(AXES_PATH).catch((): AxesFile => ({})),
    ]);

    const major = schemaMajor(rawSummary.schema);
    if (major !== null && major !== SCHEMA_MAJOR) {
      root.innerHTML =
        '<div class="bm"><div class="tool-status error">' +
        esc(
          t(
            'mydash.bm.schemaBad',
            { schema: text(rawSummary.schema) },
            '모르는 판입니다 ({schema}). 대시보드를 다시 배포하세요'
          )
        ) +
        '</div></div>';
      return;
    }

    const items = itemsOf(rawSummary);
    const axes = axesOf(rawAxes);
    status(
      t('mydash.bm.status', { n: items.length, when: bakedAgo(rawSummary.generatedAt) }, '{n}건, {when}')
    );

    /* 묶음 열쇠. 항목에 달려 오면 그대로, `data.bundles` 로 오면 표로 뒤집어 붙인다. */
    const bundleOf = new Map<string, string>();
    const defs = (rawSummary.data && rawSummary.data.bundles) || [];
    if (Array.isArray(defs)) {
      for (const d of defs) {
        const key = text(d && (d.key || d.id));
        const ids = d && Array.isArray(d.items) ? d.items : [];
        if (!key) continue;
        for (const id of ids) if (typeof id === 'string') bundleOf.set(id, key);
      }
    }
    const bundleKey = (it: Item): string => {
      const own = text(it.bundle || it.bundleKey);
      return own || bundleOf.get(text(it.id)) || '';
    };

    /* ── 필터 축 만들기. 라벨은 axes.json, 값 차례도 axes.json ── */
    const axisByKey = new Map<string, Axis>();
    for (const a of axes) if (a && typeof a.key === 'string') axisByKey.set(a.key, a);

    function countValues(pick: (it: Item) => string[]): Map<string, number> {
      const m = new Map<string, number>();
      for (const it of items) for (const v of pick(it)) m.set(v, (m.get(v) || 0) + 1);
      return m;
    }

    const groups: Group[] = [];
    {
      const seen = countValues((it) => (text(it.src) ? [text(it.src)] : []));
      const keys = Array.from(seen.keys()).sort(bySrcOrder);
      if (keys.length) {
        groups.push({
          key: 'src',
          label: t('mydash.bm.filter.src', undefined, '출처'),
          values: keys.map((k) => ({ key: k, label: srcLabel(k), n: seen.get(k) || 0 })),
        });
      }
    }
    for (const key of FILTER_AXES) {
      const axis = axisByKey.get(key);
      const seen = countValues((it) => axisValues(it, key));
      if (!seen.size) continue;
      /* axes.json 차례를 먼저 따르고, 정의에 없는 값은 뒤에 붙인다. 미아를 숨기지 않는다. */
      const ordered: string[] = [];
      for (const v of (axis && axis.values) || []) {
        if (v && typeof v.key === 'string' && seen.has(v.key)) ordered.push(v.key);
      }
      for (const k of Array.from(seen.keys()).sort()) if (ordered.indexOf(k) < 0) ordered.push(k);
      const labelOf = new Map<string, string>();
      for (const v of (axis && axis.values) || []) {
        if (v && typeof v.key === 'string') labelOf.set(v.key, text(v.label) || v.key);
      }
      groups.push({
        key,
        label: (axis && text(axis.label)) || key,
        values: ordered.map((k) => ({ key: k, label: labelOf.get(k) || k, n: seen.get(k) || 0 })),
      });
    }

    /* 의도 라벨은 줄 안의 칩에서도 쓴다. 여기 한 번만 모아 둔다. */
    const intentLabel = new Map<string, string>();
    for (const v of (axisByKey.get('intent') && axisByKey.get('intent')!.values) || []) {
      if (v && typeof v.key === 'string') intentLabel.set(v.key, text(v.label) || v.key);
    }

    /* ── 뼈대 ── */
    const wrap = document.createElement('div');
    wrap.className = 'bm';
    root.textContent = '';
    root.appendChild(wrap);

    const pendingCount = items.filter((it) => !!text(it.pending)).length;
    const srcGroup = groups.filter((g) => g.key === 'src')[0];
    const numHtml: string[] = [
      '<div class="bm-num"><b>' + esc(String(items.length)) + '</b><span>' +
        esc(t('mydash.bm.num.total', undefined, '전체')) + '</span></div>',
    ];
    for (const v of (srcGroup && srcGroup.values) || []) {
      numHtml.push(
        '<div class="bm-num"><b>' + esc(String(v.n)) + '</b><span>' + esc(v.label) + '</span></div>'
      );
    }
    numHtml.push(
      '<div class="bm-num"><b>' + esc(String(pendingCount)) + '</b><span>' +
        esc(t('mydash.bm.num.pending', undefined, '판정 대기')) + '</span></div>'
    );

    const parseFailed = (rawSummary.counts && rawSummary.counts.parseFailed) || 0;
    const notes: string[] = [];
    if (parseFailed > 0) {
      notes.push(
        '<div class="tool-status error">' +
          esc(t('mydash.bm.parseFailed', { n: parseFailed }, '못 읽은 줄 {n}건. 생성기 확인')) +
          '</div>'
      );
    }
    if (pendingCount > 0) {
      notes.push(
        '<div class="tool-status">' +
          esc(t('mydash.bm.pendingNote', { n: pendingCount }, '판정 대기 {n}건. 의도는 사람이 고른다')) +
          '</div>'
      );
    }

    const groupHtml = groups
      .map(
        (g) =>
          '<div><div class="tool-sublabel">' + esc(g.label) + '</div><div class="tool-chips">' +
          g.values
            .map(
              (v) =>
                '<button type="button" class="tool-chip" data-axis="' + esc(g.key) + '" data-value="' +
                esc(v.key) + '">' + esc(v.label) + ' ' + esc(String(v.n)) + '</button>'
            )
            .join('') +
          '</div></div>'
      )
      .join('');

    wrap.innerHTML =
      '<div class="bm-nums">' + numHtml.join('') + '</div>' +
      notes.join('') +
      '<div class="bm-groups">' + groupHtml + '</div>' +
      '<div class="field-group"><label class="field-label" for="bm-q">' +
      esc(t('mydash.bm.search.label', undefined, '검색')) + '</label>' +
      '<input id="bm-q" type="search" autocomplete="off" placeholder="' +
      esc(t('mydash.bm.search.ph', undefined, '제목, 작성자, 메모')) + '"></div>' +
      '<div class="bm-revisit" data-revisit="1"></div>' +
      '<div class="tool-status" data-count="1"></div>' +
      '<div class="tool-list bm-list" data-list="1"></div>' +
      '<div class="tool-actions" data-more="1">' +
      '<button type="button" class="btn btn-ghost" data-act="more"></button></div>';

    const qEl = wrap.querySelector('#bm-q') as HTMLInputElement;
    const revisitEl = wrap.querySelector('[data-revisit]') as HTMLElement;
    const countEl = wrap.querySelector('[data-count]') as HTMLElement;
    const listEl = wrap.querySelector('[data-list]') as HTMLElement;
    const moreEl = wrap.querySelector('[data-more]') as HTMLElement;
    const moreBtn = wrap.querySelector('[data-act="more"]') as HTMLElement;
    const chipEls = Array.from(wrap.querySelectorAll('.tool-chip')) as HTMLElement[];

    const picked: Record<string, Set<string>> = {};
    for (const g of groups) picked[g.key] = new Set<string>();
    const opened = new Set<string>();
    let query = '';
    let shown = PAGE;

    /* ── 고르기 ── */
    function matches(it: Item): boolean {
      for (const g of groups) {
        const set = picked[g.key];
        if (!set.size) continue;
        const vals = g.key === 'src' ? (text(it.src) ? [text(it.src)] : []) : axisValues(it, g.key);
        let hit = false;
        for (const v of vals) {
          if (set.has(v)) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      }
      if (query) {
        /* 보이는 글자를 그대로 찾는다. label 이 빈 항목은 화면에 대체 문자열이 떠 있어
           원본 label 로만 재면 눈에 보이는 말로 못 찾는다. */
        const hay = (displayLabel(it) + ' ' + text(it.author) + ' ' + text(it.note)).toLowerCase();
        if (hay.indexOf(query) < 0) return false;
      }
      return true;
    }

    /** 기록일 내림차순. 날짜가 없는 것은 뒤로 */
    function byRecent(a: Item, b: Item): number {
      const x = text(a.recordedAt);
      const y = text(b.recordedAt);
      if (x !== y) return x && y ? (x < y ? 1 : -1) : x ? -1 : 1;
      return text(a.id) < text(b.id) ? -1 : 1;
    }

    /** 묶음으로 접는다. 크기 2 이상만 묶음이고 나머지는 낱개 */
    function unitsOf(list: Item[]): Unit[] {
      const out: Unit[] = [];
      const at = new Map<string, number>();
      for (const it of list) {
        const key = bundleKey(it);
        if (!key) {
          out.push({ key: '', items: [it] });
          continue;
        }
        const seen = at.get(key);
        if (seen === undefined) {
          at.set(key, out.length);
          out.push({ key, items: [it] });
        } else {
          out[seen].items.push(it);
        }
      }
      return out;
    }

    /* ── 줄 그리기 ── */
    function titleHtml(it: Item): string {
      const label = displayLabel(it) || text(it.id);
      const url = safeLinkUrl(it.url);
      if (!url) {
        /* 주소가 있는데 거부된 것과, 애초에 주소가 없는 것을 가른다. 거부는 표식으로 말한다 */
        const mark = text(it.url).trim()
          ? '<span class="bm-badurl">' + esc(t('mydash.bm.badUrl', undefined, '주소 열 수 없음')) + '</span>'
          : '';
        return '<span class="bm-title">' + esc(label) + mark + '</span>';
      }
      return (
        '<a class="bm-title" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(label) + '</a>'
      );
    }

    function metaHtml(it: Item): string {
      const bits: string[] = [];
      const author = text(it.author);
      if (author) bits.push('<span>' + esc(author) + '</span>');
      const day = text(it.recordedAt).slice(0, 10);
      if (day) bits.push('<span>' + esc(day) + '</span>');
      if (text(it.pending)) {
        bits.push(
          '<span class="tool-chip">' + esc(t('mydash.bm.pendingChip', undefined, '판정 대기')) + '</span>'
        );
      } else {
        for (const v of axisValues(it, 'intent')) {
          bits.push('<span class="tool-chip">' + esc(intentLabel.get(v) || v) + '</span>');
        }
      }
      return '<div class="bm-meta">' + bits.join('') + '</div>';
    }

    function rowHtml(it: Item, extra: string): string {
      return (
        '<div class="tool-list-row bm-row' + (extra ? ' ' + extra : '') + '">' +
        '<div class="tool-list-key">' + esc(srcLabel(text(it.src))) + '</div>' +
        '<div class="tool-list-val bm-body">' + titleHtml(it) + metaHtml(it) + '</div>' +
        '</div>'
      );
    }

    function unitHtml(u: Unit): string {
      if (u.items.length < 2) return rowHtml(u.items[0], '');
      const isOpen = opened.has(u.key);
      /* 머리 줄도 항목 하나. 자식과 같은 meta (날짜, 작성자, 의도 칩, 판정 대기 칩) 를 부착.
         접힌 상태에서 보이는 것이 이 줄뿐이라, 빠지면 묶음 첫 항목만 정보 결여. */
      const head =
        '<div class="tool-list-row bm-row">' +
        '<div class="tool-list-key">' + esc(srcLabel(text(u.items[0].src))) + '</div>' +
        '<div class="tool-list-val bm-body">' +
        titleHtml(u.items[0]) +
        metaHtml(u.items[0]) +
        '<div class="tool-actions tight"><button type="button" class="btn btn-ghost" data-act="bundle" ' +
        'data-key="' + esc(u.key) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
        esc(t('mydash.bm.bundle', { n: u.items.length }, '묶음 {n}건')) + ' ' +
        esc(
          isOpen
            ? t('mydash.bm.bundleClose', undefined, '접기')
            : t('mydash.bm.bundleOpen', undefined, '펼치기')
        ) +
        '</button></div></div></div>';
      if (!isOpen) return head;
      return head + u.items.slice(1).map((it) => rowHtml(it, 'bm-kid')).join('');
    }

    /* ── 재발굴 한 칸 ──
       방치일수는 **날것으로 재면 안 됨**. 출처마다 모은 기간이 다름 (실측 2026-09-10:
       카톡은 2025-08 부터 1년치, X 와 브라우저는 2026-08 한 주치). 날것 점수로는
       상위 8건이 영원히 카톡 고정.

       방치일수를 **그 출처 안에서** 0~1 로 정규화하는 것만으로도 미해결. 정규화 점수로
       한 줄 세워 상위 40 을 끊으면 폭이 좁은 출처가 독점 (실측 2026-09-10: 브라우저
       82건이 전부 같은 날짜라 폭이 0, 만점 처리 시 후보 40 이 전부 브라우저. 폭 0 을 0.5 로
       낮추면 이번엔 X 39 에 카톡 1). 한 자로 재서 한 줄로 세우는 한 데이터가 제일 고른
       출처의 독점.

       그래서 순위는 **출처 안에서만** 매기고, 후보 40 은 출처를 번갈아 채움 (실측 결과
       브라우저 14, 카톡 13, X 13). 점수는 정규화 방치도 / 공유 횟수, 공유 횟수는 `shared`
       배열 길이 (없으면 1).

       고르기는 날짜 씨앗이라 같은 후보 목록에서 같은 날 같은 자리를 지정. 다만 보여 준 id 를
       그 자리에서 기록해, 같은 날 다시 열면 그 다음 것이 노출. 필터와 무관하게 전체 대상. */
    function revisitPool(): Item[] {
      const lo = new Map<string, number>();
      const hi = new Map<string, number>();
      for (const it of items) {
        const days = idleDays(it.recordedAt);
        if (days < 0) continue;
        const src = text(it.src);
        const a = lo.get(src);
        const b = hi.get(src);
        if (a === undefined || days < a) lo.set(src, days);
        if (b === undefined || days > b) hi.set(src, days);
      }
      const bySrc = new Map<string, Array<{ it: Item; score: number }>>();
      for (const it of items) {
        const days = idleDays(it.recordedAt);
        if (days < 0) continue;
        const src = text(it.src);
        const a = lo.get(src) as number;
        const b = hi.get(src) as number;
        const span = b - a;
        /* 한 출처의 날짜가 하나뿐이면 나눌 폭이 없다. 그 출처 안에서는 전부 같은 값이고
           출처끼리는 안 겨루므로 만점으로 둔다 */
        const norm = span > 0 ? (days - a) / span : 1;
        const shared = Array.isArray(it.shared) ? it.shared.length : 0;
        const row = { it, score: norm / (shared > 0 ? shared : 1) };
        const list = bySrc.get(src);
        if (list) list.push(row);
        else bySrc.set(src, [row]);
      }
      const srcs = Array.from(bySrc.keys()).sort(bySrcOrder);
      for (const s of srcs) {
        (bySrc.get(s) as Array<{ it: Item; score: number }>).sort((x, y) =>
          y.score !== x.score ? y.score - x.score : text(x.it.id) < text(y.it.id) ? -1 : 1
        );
      }
      const pool: Item[] = [];
      for (let i = 0; pool.length < REVISIT_POOL; i++) {
        let added = false;
        for (const s of srcs) {
          const list = bySrc.get(s) as Array<{ it: Item; score: number }>;
          if (i >= list.length) continue;
          pool.push(list[i].it);
          added = true;
          if (pool.length >= REVISIT_POOL) break;
        }
        if (!added) break;
      }
      return pool;
    }

    function revisitPick(): Item | null {
      const pool = revisitPool();
      if (!pool.length) return null;
      /* 이 기기에서 이미 보여 준 것은 후보 뒤로. 전부 봤으면 다시 처음부터 돈다 */
      const seen = new Set(seenIds());
      const fresh = pool.filter((it) => !seen.has(text(it.id)));
      const use = fresh.length ? fresh : pool;
      const seed = kstDayKey(Date.now());
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
      return use[h % use.length];
    }

    function paintRevisit(): void {
      const it = revisitPick();
      if (!it) {
        revisitEl.textContent = '';
        return;
      }
      const days = idleDays(it.recordedAt);
      revisitEl.innerHTML =
        '<div class="tool-sublabel">' + esc(t('mydash.bm.revisit', undefined, '재발굴')) + '</div>' +
        '<div class="tool-list">' + rowHtml(it, '') + '</div>' +
        '<div class="tool-hint">' + esc(t('mydash.bm.revisitIdle', { n: days }, '{n}일 방치')) + '</div>';
      markSeen(text(it.id));
    }

    function paint(): void {
      for (const b of chipEls) {
        const axis = b.getAttribute('data-axis') || '';
        const value = b.getAttribute('data-value') || '';
        b.classList.toggle('active', !!picked[axis] && picked[axis].has(value));
      }
      const list = items.filter(matches).sort(byRecent);
      const units = unitsOf(list);
      /* 건수 줄과 더 보기가 서로 다른 것을 세면 숫자가 안 맞는다 (전에는 항목 수와 묶음 수).
         둘 다 항목 수와 묶음 수를 같이 보인다. shown 이 세는 것은 묶음이다. */
      countEl.textContent = t(
        'mydash.bm.count',
        { n: list.length, m: units.length },
        '항목 {n} (묶음 {m})'
      );
      listEl.innerHTML = units.slice(0, shown).map(unitHtml).join('') ||
        '<div class="tool-list-row"><div class="tool-list-val">' +
          esc(t('mydash.bm.noMatch', undefined, '조건에 맞는 것이 없습니다')) +
          '</div></div>';
      const restUnits = units.length - shown;
      const restItems = units.slice(shown).reduce((n, u) => n + u.items.length, 0);
      moreEl.style.display = restUnits > 0 ? '' : 'none';
      if (restUnits > 0) {
        moreBtn.textContent = t(
          'mydash.bm.more',
          { n: restItems, m: restUnits },
          '더 보기 항목 {n} (묶음 {m})'
        );
      }
    }

    wrap.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement | null)?.closest('[data-axis],[data-act]') as HTMLElement | null;
      if (!el) return;
      const act = el.getAttribute('data-act');
      if (act === 'more') {
        shown += PAGE;
        paint();
        return;
      }
      if (act === 'bundle') {
        const key = el.getAttribute('data-key') || '';
        if (opened.has(key)) opened.delete(key);
        else opened.add(key);
        paint();
        return;
      }
      const axis = el.getAttribute('data-axis');
      if (!axis || !picked[axis]) return;
      const value = el.getAttribute('data-value') || '';
      if (picked[axis].has(value)) picked[axis].delete(value);
      else picked[axis].add(value);
      shown = PAGE;
      paint();
    });

    qEl.addEventListener('input', () => {
      query = qEl.value.trim().toLowerCase();
      shown = PAGE;
      paint();
    });

    paintRevisit();
    paint();
  }

  /* 탭 이름은 **등록하는 순간** 셸 소관, 그 자리는 기다릴 곳 없어 되받을 글 동봉 방식.
     묶음 받기를 여기서 미리 걸어 두면 로그인 뒤 칩이 그려질 때는 대개 옮긴 말 도착. */
  void loadNamespace('mydash').catch(() => undefined);

  dashRegistry().register({
    id: 'bookmarks',
    get title(): string {
      return t('mydash.bm.title', undefined, '북마크');
    },
    access: 'read',
    paths: [SUMMARY_PATH, AXES_PATH],
    render,
  });
})();

export {};
