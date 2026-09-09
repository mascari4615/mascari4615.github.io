/**
 * 패널: 북마크 (1단계, 읽기 전용).
 *
 * 읽는 것은 둘, `data/bookmarks/summary.json` 항목 전부와 `data/bookmarks/axes.json` 축
 * 정의. **축 이름과 축 값 라벨은 코드에 안 박음.** 의도, 영역, 형태의 값 목록은 계속
 * 변경 대상이라 박아 두면 값 하나 늘 때마다 배포 필요. 화면은 axes.json 을 읽어 칩만
 * 만들고, 거기 없는 값이 항목에 있으면 그 값 자체를 라벨로 표시 (미아 은닉 금지).
 *
 * 쓰기 없음. 태깅, 열람 표시, 승격은 3단계 몫. 여기는 사람 판정 대기 건수만 숫자로 표시.
 *
 * 출처 라벨(X, 브라우저, 카톡)만 i18n 소관. `src` 는 축이 아니라 데이터 갈래라
 * axes.json 에 정의 없음. 모르는 갈래는 값 그대로 표시.
 */
import { dashRegistry, esc, httpsUrl } from './kit';
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
    /** 사람 판정 대기 표식. 값이 있으면 의도가 비어 있는 것이 정상이다 */
    pending?: string | null;
    /** 묶음 열쇠. 생성기가 항목에 직접 달거나 `data.bundles` 로 따로 낸다. 둘 다 받는다 */
    bundle?: string | null;
    bundleKey?: string | null;
    axes?: Record<string, unknown>;
    /** 몇 번 남에게 보냈나. 아직 생산자가 없다. 없으면 1 로 본다 */
    shares?: number;
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
  const REVISIT_POOL = 8;
  /** 화면에 세울 필터 축. 여기 없는 축(우선순위, 생애주기, 주제)은 1단계에서 안 쓴다 */
  const FILTER_AXES = ['intent', 'domain', 'form'];
  /** 출처 칸 차례. 나머지는 뒤에 이름순으로 붙는다 */
  const SRC_ORDER = ['x', 'edge', 'kakao'];
  const KST_OFFSET_MS = 9 * 3600000;

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
    if (d <= 0) return t('mydash.bm.baked.today');
    if (d === 1) return t('mydash.bm.baked.yesterday');
    return t('mydash.bm.baked.days', { n: d });
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
    await loadNamespace('mydash');
    const { root, repo, status } = ctx;
    root.innerHTML = '<div class="bm"><div class="tool-status">' + esc(t('mydash.bm.loading')) + '</div></div>';

    const [rawSummary, rawAxes] = await Promise.all([
      repo.readJson<Summary>(SUMMARY_PATH),
      repo.readJson<AxesFile>(AXES_PATH),
    ]);

    const major = schemaMajor(rawSummary.schema);
    if (major !== null && major !== SCHEMA_MAJOR) {
      root.innerHTML =
        '<div class="bm"><div class="tool-status error">' +
        esc(t('mydash.bm.schemaBad', { schema: text(rawSummary.schema) })) +
        '</div></div>';
      return;
    }

    const items = itemsOf(rawSummary);
    const axes = axesOf(rawAxes);
    status(t('mydash.bm.status', { n: items.length, when: bakedAgo(rawSummary.generatedAt) }));

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
      const keys = Array.from(seen.keys()).sort((a, b) => {
        const ai = SRC_ORDER.indexOf(a);
        const bi = SRC_ORDER.indexOf(b);
        if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        return a < b ? -1 : 1;
      });
      if (keys.length) {
        groups.push({
          key: 'src',
          label: t('mydash.bm.filter.src'),
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
        esc(t('mydash.bm.num.total')) + '</span></div>',
    ];
    for (const v of (srcGroup && srcGroup.values) || []) {
      numHtml.push(
        '<div class="bm-num"><b>' + esc(String(v.n)) + '</b><span>' + esc(v.label) + '</span></div>'
      );
    }
    numHtml.push(
      '<div class="bm-num"><b>' + esc(String(pendingCount)) + '</b><span>' +
        esc(t('mydash.bm.num.pending')) + '</span></div>'
    );

    const parseFailed = (rawSummary.counts && rawSummary.counts.parseFailed) || 0;
    const notes: string[] = [];
    if (parseFailed > 0) {
      notes.push('<div class="tool-status error">' + esc(t('mydash.bm.parseFailed', { n: parseFailed })) + '</div>');
    }
    if (pendingCount > 0) {
      notes.push('<div class="tool-status">' + esc(t('mydash.bm.pendingNote', { n: pendingCount })) + '</div>');
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
      esc(t('mydash.bm.search.label')) + '</label>' +
      '<input id="bm-q" type="search" autocomplete="off" placeholder="' +
      esc(t('mydash.bm.search.ph')) + '"></div>' +
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
        const hay = (text(it.label) + ' ' + text(it.author) + ' ' + text(it.note)).toLowerCase();
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
      const label = text(it.label) || text(it.id);
      const url = httpsUrl(it.url);
      if (!url) return '<span class="bm-title">' + esc(label) + '</span>';
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
        bits.push('<span class="tool-chip">' + esc(t('mydash.bm.pendingChip')) + '</span>');
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
      const head =
        '<div class="tool-list-row bm-row">' +
        '<div class="tool-list-key">' + esc(srcLabel(text(u.items[0].src))) + '</div>' +
        '<div class="tool-list-val bm-body">' +
        titleHtml(u.items[0]) +
        '<div class="tool-actions tight"><button type="button" class="btn btn-ghost" data-act="bundle" ' +
        'data-key="' + esc(u.key) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
        esc(t('mydash.bm.bundle', { n: u.items.length })) + ' ' +
        esc(isOpen ? t('mydash.bm.bundleClose') : t('mydash.bm.bundleOpen')) +
        '</button></div></div></div>';
      if (!isOpen) return head;
      return head + u.items.slice(1).map((it) => rowHtml(it, 'bm-kid')).join('');
    }

    /* ── 재발굴 한 칸 ──
       점수는 방치일수 x 미열람 x (1 / 공유횟수). 열람 표시는 아직 생산자가 없어 전부 미열람(1),
       공유횟수도 없어 1 이다. 그래서 지금 점수는 방치일수 그대로다. 필드가 생기면 여기만 는다.
       고르기는 날짜 씨앗이라 하루 동안 안 바뀐다. 필터와 무관하게 전체에서 뽑는다. */
    function revisitPick(): Item | null {
      const scored = items
        .map((it) => {
          const days = idleDays(it.recordedAt);
          const shares = typeof it.shares === 'number' && it.shares > 0 ? it.shares : 1;
          return { it, days, score: days < 0 ? -1 : days / shares };
        })
        .filter((r) => r.score >= 0);
      if (!scored.length) return null;
      scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : text(a.it.id) < text(b.it.id) ? -1 : 1));
      const pool = scored.slice(0, REVISIT_POOL);
      const seed = kstDayKey(Date.now());
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
      return pool[h % pool.length].it;
    }

    function paintRevisit(): void {
      const it = revisitPick();
      if (!it) {
        revisitEl.textContent = '';
        return;
      }
      const days = idleDays(it.recordedAt);
      revisitEl.innerHTML =
        '<div class="tool-sublabel">' + esc(t('mydash.bm.revisit')) + '</div>' +
        '<div class="tool-list">' + rowHtml(it, '') + '</div>' +
        '<div class="tool-hint">' + esc(t('mydash.bm.revisitIdle', { n: days })) + '</div>';
    }

    function paint(): void {
      for (const b of chipEls) {
        const axis = b.getAttribute('data-axis') || '';
        const value = b.getAttribute('data-value') || '';
        b.classList.toggle('active', !!picked[axis] && picked[axis].has(value));
      }
      const list = items.filter(matches).sort(byRecent);
      const units = unitsOf(list);
      countEl.textContent = t('mydash.bm.count', { n: list.length });
      listEl.innerHTML = units.slice(0, shown).map(unitHtml).join('') ||
        '<div class="tool-list-row"><div class="tool-list-val">' + esc(t('mydash.bm.noMatch')) + '</div></div>';
      const rest = units.length - shown;
      moreEl.style.display = rest > 0 ? '' : 'none';
      if (rest > 0) moreBtn.textContent = t('mydash.bm.more', { n: rest });
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
