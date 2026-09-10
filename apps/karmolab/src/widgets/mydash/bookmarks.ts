/**
 * 패널: 북마크 (2단계, 읽고 쓰기).
 *
 * 읽는 것은 셋. `data/bookmarks/summary.json` 항목 전부, `data/bookmarks/axes.json` 축
 * 정의, 그리고 이벤트 브랜치의 `bookmarks/events/<YYYY-MM>/*.json`.
 * **축 이름과 축 값 라벨은 코드에 안 박음.** 의도, 영역, 우선순위, 생애주기의 값 목록은 계속
 * 변경 대상이라 박아 두면 값 하나 늘 때마다 배포 필요. 화면은 axes.json 을 읽어 칩만
 * 만들고, 거기 없는 값이 항목에 있으면 그 값 자체를 라벨로 표시 (미아 은닉 금지).
 *
 * `axes.json` 은 **선택.** 못 받으면 빈 정의로 대체, 값 자체가 라벨.
 * 화면을 못 그리게 하는 것은 `summary.json` 실패 하나뿐.
 *
 * 링크는 킷의 `safeLinkUrl` 로 판정. http 도 통과 (실측 2026-09-10: 1,097건 중 22건 http).
 * 거부된 주소는 링크 대신 글자 옆에 "주소 열 수 없음" 표식.
 *
 * ## 쓰기 (2단계)
 *
 * 쓰기는 **append 전용 이벤트 파일**. summary.json 은 생성기 소관이라 화면이 안 건드림.
 * 파일 하나에 이벤트 하나, 경로는 `bookmarks/events/<YYYY-MM>/<epoch-ms>-<device6>.json`,
 * 수정과 삭제 없음. 화면이 보는 값은 summary 의 `foldedThrough` 이후 이벤트를 항목 위에
 * 덮은 결과. 같은 대상에 대해 `at` 이 늦은 이벤트가 이기고, 덮는 범위는 그 이벤트의 type 이
 * 가진 축뿐 (tag 는 intent 와 domain, priority 는 priority, status 는 status, note 는 note).
 * `bundle:<묶음 열쇠>` 대상은 그 묶음 전체에 걸리되 항목 개별 이벤트가 더 늦으면 개별이 승.
 *
 * 파일이 한 벌인 이유는 손이 하나라서. 시트, 선택 모드, 한 장 모드가 모두 같은 `states`
 * 지도와 같은 `sendEvent` 를 씀. 갈라 두면 낙관적 갱신이 세 벌로 갈라져 화면이 어긋남
 * (`memo/rules/quality.md` 의 500줄 상한은 판단 절).
 *
 * 출처 라벨(X, 브라우저, 카톡)만 i18n 소관. `src` 는 축이 아니라 데이터 갈래라
 * axes.json 에 정의 없음. 모르는 갈래는 값 그대로 표시.
 */
import { dashRegistry, esc, safeLinkUrl } from './kit';
import type { DashPanelCtx, DashRepoWrite } from './kit';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  'use strict';

  type AxisValue = { key: string; label?: string; hint?: string; retired?: boolean };
  type Axis = {
    key: string;
    label?: string;
    multi?: boolean;
    /** 값별 상한. 우선순위 축의 `now` 만 씀 */
    cap?: Record<string, number>;
    values?: AxisValue[];
  };
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
    /** 생성기가 여기까지의 이벤트를 이미 접어 넣음. 화면은 이 뒤만 읽음 */
    foldedThrough?: string;
    counts?: { items?: number; parseFailed?: number };
    data?: { items?: Item[]; bundles?: BundleDef[] };
    items?: Item[];
  };

  /** 이벤트가 건드리는 축 갈래. 갈래 하나가 파일 하나 */
  type EvType = 'tag' | 'status' | 'priority' | 'note';
  type DashEvent = {
    v: number;
    at: string;
    device: string;
    type: EvType;
    /** 항목 id 또는 `bundle:<묶음 열쇠>` */
    target: string;
    intent?: string[];
    domain?: string | null;
    priority?: string | null;
    status?: string;
    note?: string;
  };

  /** 이벤트를 다 덮은 뒤의 한 항목. 화면과 필터가 보는 값은 전부 여기서 나옴 */
  type ItemState = {
    intent: string[];
    domain: string | null;
    priority: string | null;
    status: string;
    note: string;
    /** tag 이벤트가 한 번이라도 걸렸나. 판정 대기 해제 판정에 씀 */
    tagged: boolean;
  };

  const DATA_DIR = 'data/bookmarks';
  const SUMMARY_PATH = DATA_DIR + '/summary.json';
  const AXES_PATH = DATA_DIR + '/axes.json';
  /** 이벤트 뿌리. 이 아래가 `<YYYY-MM>/<epoch-ms>-<device6>.json` */
  const EVENTS_DIR = 'bookmarks/events';

  /** 이 패널이 아는 봉투 판. 메이저가 다르면 반쯤 그리지 않고 다시 배포하라고 적는다 */
  const SCHEMA_MAJOR = 1;
  /** 이벤트 봉투 판 */
  const EVENT_V = 1;
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
  /** 항목 축으로 거르는 칸. 값 목록은 실제 데이터에서 나옴 */
  const FILTER_AXES = ['intent', 'domain', 'form'];
  /** 이벤트로 바뀌는 축. 값 목록은 axes.json 정의 전부 (0건이어도 칩을 세움) */
  const STATE_AXES = ['status', 'priority'];
  /** 시트에서 고를 수 있는 생애주기. unsorted 와 tagged 는 사람이 직접 고르는 값 아님 */
  const PICKABLE_STATUS = ['opened', 'promoted', 'dropped'];
  /** 기본 목록에서 뺄 생애주기. 아카이브 무한 증식 방지, 필터로 켜야 보임 */
  const HIDDEN_STATUS = ['dropped', 'promoted'];
  /** axes.json 에 상한이 없을 때 쓰는 `now` 상한 */
  const NOW_CAP_FALLBACK = 8;
  /** 한 달 폴더 안에서 동시에 읽을 이벤트 파일 수. 수백 건이 한 번에 나가는 것 방지 */
  const EVENT_READ_LIMIT = 8;
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
      /* 머리 버튼 줄. 선택 모드와 한 장 모드로 드는 문 */
      '.bm-head-acts{display:flex;flex-wrap:wrap;gap:var(--space-sm);align-items:center}',
      /* 고르기 칸. 손가락 표적이라 칸 전체가 44px */
      '.bm-check{width:var(--bm-tap);height:var(--bm-tap);flex:none;margin:0}',
      '.bm-row.is-pick{cursor:pointer}',
      /* 아래에서 올라오는 시트. 폰은 바닥에 붙고 넓은 화면은 가운데 */
      '.bm-sheet{position:fixed;inset:0;z-index:3000;display:flex;flex-direction:column;justify-content:flex-end}',
      '.bm-scrim{position:absolute;inset:0;background:var(--modal-scrim)}',
      '.bm-sheet-card{position:relative;max-height:85vh;overflow:auto;background:var(--bg-secondary);',
      'border-top:1px solid var(--border);border-radius:var(--radius-lg) var(--radius-lg) 0 0;',
      'padding:var(--space-md);display:flex;flex-direction:column;gap:var(--space-md)}',
      '@media(min-width:560px){.bm-sheet{justify-content:center;align-items:center}',
      '.bm-sheet-card{width:100%;max-width:34rem;border-radius:var(--radius-lg);border-top:0}}',
      '.bm-sheet-head{display:flex;gap:var(--space-sm);align-items:flex-start;justify-content:space-between}',
      '.bm-sheet-title{color:var(--text-primary);word-break:break-word;flex:1}',
      '.bm-sheet-foot{display:flex;gap:var(--space-sm);align-items:center;',
      'justify-content:space-between;flex-wrap:wrap}',
      '.bm-sheet-sec{display:flex;flex-direction:column;gap:var(--space-xs)}',
      '.bm-nowlist{display:flex;flex-direction:column;gap:var(--space-xs);',
      'padding:var(--space-sm);border-radius:var(--radius-md);background:var(--bg-tertiary)}',
      '.bm-nowrow{display:flex;gap:var(--space-sm);align-items:center;justify-content:space-between}',
      /* 선택 모드 아래 띠. 목록 끝이 가리지 않게 판에 바닥 여백을 준다 */
      '.bm-bar{position:fixed;left:0;right:0;bottom:0;z-index:2900;background:var(--bg-secondary);',
      'border-top:1px solid var(--border);padding:var(--space-sm);display:flex;',
      'flex-direction:column;gap:var(--space-sm)}',
      '.bm.has-bar{padding-bottom:calc(var(--bm-tap) * 4)}',
      '.bm-judge{display:flex;flex-direction:column;gap:var(--space-md)}',
      '.bm-judge-title{color:var(--text-primary);word-break:break-word}',
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
   * 차례는 셋. label, 없으면 메모 앞 40자, 그래도 없으면 작은 제목과 작성자와 집 이름.
   * 메모는 사람이 note 이벤트로 덮을 수 있어 **덮은 뒤 값**을 받는다 (안 주면 원본 note).
   * 검색도 이 문자열 대상 (보이는 글자로 못 찾는 것 방지).
   */
  function displayLabel(it: Item, note?: string): string {
    const label = text(it.label).trim();
    if (label) return label;
    const memo = (typeof note === 'string' ? note : text(it.note)).trim();
    if (memo) return memo.length > NOTE_HEAD ? memo.slice(0, NOTE_HEAD) + '...' : memo;
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

  /* ── 이벤트 ────────────────────────────────────────
     읽을 때는 파일 이름의 epoch 로 먼저 자른다. `foldedThrough` 이전 것은 summary 에 이미
     들어 있어 다시 받을 이유 없음. 이름으로 못 자른 것만 받아서 `at` 으로 다시 잰다. */

  const EV_TYPES: EvType[] = ['tag', 'priority', 'status', 'note'];

  function evAt(ev: DashEvent): number {
    const n = Date.parse(text(ev.at));
    return isFinite(n) ? n : 0;
  }

  /** 봉투가 이 화면이 아는 판이고 필수 칸이 찼나. 아니면 조용히 버림 (미아 은닉 아님, 로그로 셈) */
  function isEvent(v: unknown): v is DashEvent {
    if (!v || typeof v !== 'object') return false;
    const e = v as Record<string, unknown>;
    if (e.v !== EVENT_V) return false;
    if (typeof e.at !== 'string' || typeof e.target !== 'string' || !e.target) return false;
    return EV_TYPES.indexOf(e.type as EvType) >= 0;
  }

  /** 파일 이름 앞머리의 epoch. 못 읽으면 -1 (그때는 안 자르고 받아 본다) */
  function stampOfName(name: string): number {
    const m = /^(\d{10,})-/.exec(name);
    return m ? parseInt(m[1], 10) : -1;
  }

  /** 동시 실행 수를 묶어 도는 map. 한 달에 수백 건이 한 번에 나가는 것 방지 */
  async function mapLimit<A, B>(list: A[], limit: number, fn: (a: A) => Promise<B>): Promise<B[]> {
    const out: B[] = [];
    for (let i = 0; i < list.length; i += limit) {
      const part = await Promise.all(list.slice(i, i + limit).map(fn));
      for (const r of part) out.push(r);
    }
    return out;
  }

  function monthKey(ms: number): string {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }

  /* ── 화면 ─────────────────────────────────────────── */

  type Group = { key: string; label: string; values: Array<{ key: string; label: string }> };
  type Unit = { key: string; items: Item[] };
  /** 시트가 지금 무엇을 고치고 있나. 묶음이면 items 가 그 묶음 전부 */
  type SheetTarget = { target: string; items: Item[]; bundle: boolean };

  function srcLabel(key: string): string {
    /* 아는 갈래 셋만 옮긴 말이 있다. 새 갈래는 값 그대로 보인다. */
    return t('mydash.bm.src.' + key, undefined, key);
  }

  function sameSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    for (const v of b) if (!s.has(v)) return false;
    return true;
  }

  /** 쓰기 권한 없음인가. 403 이면 큐에 안 남기고 사람에게 설정을 고치라고 알림 */
  function isPermError(e: unknown): boolean {
    const st = e && typeof e === 'object' ? (e as Record<string, unknown>).status : undefined;
    if (st === 403 || st === 401) return true;
    const msg = e instanceof Error ? e.message : String(e || '');
    return /\b(403|401)\b/.test(msg);
  }

  async function render(ctx: DashPanelCtx<DashRepoWrite>): Promise<void> {
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
    const foldedMs = Date.parse(text(rawSummary.foldedThrough));
    const foldedThrough = isFinite(foldedMs) ? foldedMs : -1;
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

    const itemById = new Map<string, Item>();
    for (const it of items) itemById.set(text(it.id), it);
    const bundleMembers = new Map<string, Item[]>();
    for (const it of items) {
      const k = bundleKey(it);
      if (!k) continue;
      const list = bundleMembers.get(k);
      if (list) list.push(it);
      else bundleMembers.set(k, [it]);
    }

    /* ── 축 정의 ── */
    const axisByKey = new Map<string, Axis>();
    for (const a of axes) if (a && typeof a.key === 'string') axisByKey.set(a.key, a);

    function axisLabel(key: string): string {
      const a = axisByKey.get(key);
      return (a && text(a.label)) || key;
    }
    /** 그 축에서 고를 수 있는 값. retired 는 새로 못 고름 (이미 달린 항목에는 그대로 보임) */
    function axisPicks(key: string): Array<{ key: string; label: string }> {
      const a = axisByKey.get(key);
      const out: Array<{ key: string; label: string }> = [];
      for (const v of (a && a.values) || []) {
        if (!v || typeof v.key !== 'string' || v.retired) continue;
        out.push({ key: v.key, label: text(v.label) || v.key });
      }
      return out;
    }
    function valueLabel(axisKey: string, value: string): string {
      const a = axisByKey.get(axisKey);
      for (const v of (a && a.values) || []) {
        if (v && v.key === value) return text(v.label) || v.key;
      }
      return value;
    }
    /** `now` 상한. axes.json 의 값이 있으면 그것, 없으면 8 */
    function nowCap(): number {
      const a = axisByKey.get('priority');
      const n = a && a.cap ? a.cap.now : undefined;
      return typeof n === 'number' && n > 0 ? n : NOW_CAP_FALLBACK;
    }

    /* ── 이벤트를 덮은 상태 ──
       `latest` 는 대상별, 갈래별로 가장 늦은 이벤트 하나. 항목 상태는 여기서 계산한다.
       낙관적 갱신도 같은 지도에 이벤트를 하나 넣고 다시 계산하는 것이라 화면이 안 갈라진다. */
    const latest = new Map<string, Map<EvType, DashEvent>>();
    const states = new Map<string, ItemState>();

    function noteEvent(ev: DashEvent): void {
      let m = latest.get(ev.target);
      if (!m) {
        m = new Map<EvType, DashEvent>();
        latest.set(ev.target, m);
      }
      const cur = m.get(ev.type);
      if (!cur || evAt(ev) >= evAt(cur)) m.set(ev.type, ev);
    }

    function baseState(it: Item): ItemState {
      const domain = axisValues(it, 'domain')[0];
      return {
        intent: axisValues(it, 'intent'),
        domain: domain || null,
        priority: axisValues(it, 'priority')[0] || null,
        status: axisValues(it, 'status')[0] || 'unsorted',
        note: text(it.note),
        tagged: false,
      };
    }

    function applyEvent(s: ItemState, ev: DashEvent): void {
      if (ev.type === 'tag') {
        if (Array.isArray(ev.intent)) s.intent = ev.intent.filter((x) => typeof x === 'string');
        if (ev.domain !== undefined) s.domain = typeof ev.domain === 'string' ? ev.domain : null;
        s.tagged = true;
        if (s.status === 'unsorted') s.status = 'tagged';
      } else if (ev.type === 'priority') {
        s.priority = typeof ev.priority === 'string' ? ev.priority : null;
      } else if (ev.type === 'status') {
        if (typeof ev.status === 'string' && ev.status) s.status = ev.status;
      } else if (ev.type === 'note') {
        s.note = typeof ev.note === 'string' ? ev.note : '';
      }
    }

    function computeState(it: Item): ItemState {
      const s = baseState(it);
      const mine = latest.get(text(it.id));
      const key = bundleKey(it);
      const theirs = key ? latest.get('bundle:' + key) : undefined;
      for (const type of EV_TYPES) {
        const a = mine ? mine.get(type) : undefined;
        const b = theirs ? theirs.get(type) : undefined;
        /* 같은 갈래에 둘 다 있으면 늦은 쪽. 시각이 같으면 개별이 이긴다 */
        const win = !a ? b : !b ? a : evAt(a) >= evAt(b) ? a : b;
        if (win) applyEvent(s, win);
      }
      return s;
    }

    function rebuildStates(only?: Item[]): void {
      for (const it of only || items) states.set(text(it.id), computeState(it));
    }

    /** 이벤트가 닿는 항목들. 낙관적 갱신에서 다시 계산할 범위 */
    function touched(target: string): Item[] {
      if (target.indexOf('bundle:') === 0) return bundleMembers.get(target.slice(7)) || [];
      const it = itemById.get(target);
      return it ? [it] : [];
    }

    function stateOf(it: Item): ItemState {
      return states.get(text(it.id)) || baseState(it);
    }

    /* ── 이벤트 받아오기 ── */
    const skippedMonths: string[] = [];
    let eventCount = 0;

    async function loadEvents(): Promise<void> {
      skippedMonths.length = 0;
      eventCount = 0;
      latest.clear();
      const ref = repo.eventsBranch;
      const months = await repo.list(EVENTS_DIR, { ref }).catch(() => []);
      const dirs = months.filter((e) => e.type === 'dir');
      /* 달 단위로 병렬. 한 달이 실패해도 나머지는 그린다 (침묵 금지, 아래에서 한 줄로 알림) */
      const perMonth = await Promise.all(
        dirs.map(async (d) => {
          try {
            const files = await repo.list(d.path, { ref });
            const want = files.filter(
              (f) =>
                f.type === 'file' &&
                /\.json$/i.test(f.name) &&
                (foldedThrough < 0 || stampOfName(f.name) < 0 || stampOfName(f.name) > foldedThrough)
            );
            const read = await mapLimit(want, EVENT_READ_LIMIT, (f) =>
              repo.readJson<unknown>(f.path, { ref }).catch(() => null)
            );
            return read;
          } catch {
            skippedMonths.push(d.name);
            return [] as unknown[];
          }
        })
      );
      for (const bag of perMonth) {
        for (const raw of bag) {
          if (!isEvent(raw)) continue;
          if (foldedThrough >= 0 && evAt(raw) <= foldedThrough) continue;
          noteEvent(raw);
          eventCount++;
        }
      }
      rebuildStates();
    }

    await loadEvents();

    /* ── 뼈대 ── */
    const wrap = document.createElement('div');
    wrap.className = 'bm';
    root.textContent = '';
    root.appendChild(wrap);

    /** 지금 판정 대기인가. tag 를 받았거나 버려졌으면 화면에서 해제 */
    function isPending(it: Item): boolean {
      if (!text(it.pending)) return false;
      const s = stateOf(it);
      return !s.tagged && s.status !== 'dropped';
    }

    const groups: Group[] = [];
    {
      const seen = new Set<string>();
      for (const it of items) if (text(it.src)) seen.add(text(it.src));
      const keys = Array.from(seen).sort(bySrcOrder);
      if (keys.length) {
        groups.push({
          key: 'src',
          label: t('mydash.bm.filter.src', undefined, '출처'),
          values: keys.map((k) => ({ key: k, label: srcLabel(k) })),
        });
      }
    }
    for (const key of FILTER_AXES) {
      const seen = new Set<string>();
      for (const it of items) for (const v of valuesFor(it, key)) seen.add(v);
      if (!seen.size) continue;
      /* axes.json 차례를 먼저 따르고, 정의에 없는 값은 뒤에 붙인다. 미아를 숨기지 않는다. */
      const ordered: string[] = [];
      for (const v of axisPicks(key)) if (seen.has(v.key)) ordered.push(v.key);
      for (const k of Array.from(seen).sort()) if (ordered.indexOf(k) < 0) ordered.push(k);
      groups.push({
        key,
        label: axisLabel(key),
        values: ordered.map((k) => ({ key: k, label: valueLabel(key, k) })),
      });
    }
    for (const key of STATE_AXES) {
      /* 이 두 축은 0건이어도 칩을 세운다. 버림과 승격은 기본 목록에서 빠져 있어
         칩이 없으면 그 항목을 다시 꺼낼 길이 화면에 없다. */
      const picks = axisPicks(key);
      const seen = new Set<string>();
      for (const it of items) for (const v of valuesFor(it, key)) seen.add(v);
      const ordered = picks.map((p) => p.key);
      for (const k of Array.from(seen).sort()) if (ordered.indexOf(k) < 0) ordered.push(k);
      if (!ordered.length) continue;
      groups.push({
        key,
        label: axisLabel(key),
        values: ordered.map((k) => ({ key: k, label: valueLabel(key, k) })),
      });
    }

    /** 그 항목이 그 축에서 가진 값. 이벤트로 바뀌는 축은 덮은 뒤 값 */
    function valuesFor(it: Item, key: string): string[] {
      if (key === 'src') return text(it.src) ? [text(it.src)] : [];
      const s = stateOf(it);
      if (key === 'intent') return s.intent;
      if (key === 'domain') return s.domain ? [s.domain] : [];
      if (key === 'status') return [s.status];
      if (key === 'priority') return s.priority ? [s.priority] : [];
      return axisValues(it, key);
    }

    const numHtml: string[] = [
      '<div class="bm-num"><b>' + esc(String(items.length)) + '</b><span>' +
        esc(t('mydash.bm.num.total', undefined, '전체')) + '</span></div>',
    ];
    {
      const bySrc = new Map<string, number>();
      for (const it of items) bySrc.set(text(it.src), (bySrc.get(text(it.src)) || 0) + 1);
      const srcGroup = groups.filter((g) => g.key === 'src')[0];
      for (const v of (srcGroup && srcGroup.values) || []) {
        numHtml.push(
          '<div class="bm-num"><b>' + esc(String(bySrc.get(v.key) || 0)) + '</b><span>' +
            esc(v.label) + '</span></div>'
        );
      }
    }
    numHtml.push(
      '<div class="bm-num" data-pending-num="1"><b>0</b><span>' +
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
    if (skippedMonths.length) {
      notes.push(
        '<div class="tool-status error">' +
          esc(
            t(
              'mydash.bm.events.skipped',
              { n: skippedMonths.length, months: skippedMonths.join(', ') },
              '이벤트 {n}달을 못 읽었습니다 ({months}). 그만큼 옛 값으로 보입니다'
            )
          ) +
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
                esc(v.key) + '">' + esc(v.label) + ' <span data-n="' + esc(g.key) + ':' +
                esc(v.key) + '">0</span></button>'
            )
            .join('') +
          '</div>' +
          (g.key === 'status'
            ? '<div class="tool-hint">' +
              esc(
                t(
                  'mydash.bm.filter.hiddenNote',
                  undefined,
                  '버림과 승격은 기본 목록에서 빠집니다. 칩을 켜야 보입니다'
                )
              ) +
              '</div>'
            : '') +
          '</div>'
      )
      .join('');

    wrap.innerHTML =
      '<div class="bm-nums">' + numHtml.join('') + '</div>' +
      notes.join('') +
      '<div class="tool-status" data-evline="1"></div>' +
      '<div class="bm-head-acts">' +
      '<button type="button" class="btn btn-ghost" data-act="select"></button>' +
      '<button type="button" class="btn btn-ghost" data-act="judge"></button>' +
      '</div>' +
      '<div class="bm-groups">' + groupHtml + '</div>' +
      '<div class="field-group"><label class="field-label" for="bm-q">' +
      esc(t('mydash.bm.search.label', undefined, '검색')) + '</label>' +
      '<input id="bm-q" type="search" autocomplete="off" placeholder="' +
      esc(t('mydash.bm.search.ph', undefined, '제목, 작성자, 메모')) + '"></div>' +
      '<div class="bm-revisit" data-revisit="1"></div>' +
      '<div class="tool-status" data-count="1"></div>' +
      '<div class="tool-list bm-list" data-list="1"></div>' +
      '<div class="tool-actions" data-more="1">' +
      '<button type="button" class="btn btn-ghost" data-act="more"></button></div>' +
      '<div class="bm-judge" data-judge="1" hidden></div>' +
      '<div class="bm-bar" data-bar="1" hidden></div>' +
      '<div class="bm-sheet" data-sheet="1" hidden></div>';

    const qEl = wrap.querySelector('#bm-q') as HTMLInputElement;
    const evLineEl = wrap.querySelector('[data-evline]') as HTMLElement;
    const revisitEl = wrap.querySelector('[data-revisit]') as HTMLElement;
    const countEl = wrap.querySelector('[data-count]') as HTMLElement;
    const listEl = wrap.querySelector('[data-list]') as HTMLElement;
    const moreEl = wrap.querySelector('[data-more]') as HTMLElement;
    const moreBtn = wrap.querySelector('[data-act="more"]') as HTMLElement;
    const selectBtn = wrap.querySelector('[data-act="select"]') as HTMLElement;
    const judgeBtn = wrap.querySelector('[data-act="judge"]') as HTMLElement;
    const judgeEl = wrap.querySelector('[data-judge]') as HTMLElement;
    const barEl = wrap.querySelector('[data-bar]') as HTMLElement;
    const sheetEl = wrap.querySelector('[data-sheet]') as HTMLElement;
    const searchEl = qEl.parentElement as HTMLElement;
    const groupsEl = wrap.querySelector('.bm-groups') as HTMLElement;
    const numsEl = wrap.querySelector('.bm-nums') as HTMLElement;
    const headActsEl = wrap.querySelector('.bm-head-acts') as HTMLElement;

    const picked: Record<string, Set<string>> = {};
    for (const g of groups) picked[g.key] = new Set<string>();
    const opened = new Set<string>();
    let query = '';
    let shown = PAGE;

    /* 선택 모드. 고른 것과 바에서 고른 의도 */
    let selectMode = false;
    const selected = new Set<string>();
    const barIntent = new Set<string>();
    let barBusy = '';

    /* 한 장 모드 */
    type Judge = { list: Item[]; at: number; picks: Set<string>; lastAuthor: string; lastIntent: string[] };
    let judge: Judge | null = null;

    /* 시트 */
    let sheet: SheetTarget | null = null;
    let draft: ItemState | null = null;
    let draftBase: ItemState | null = null;
    let sheetMsg = '';
    let sheetMsgBad = false;
    let showNowList = false;

    /* ── 쓰기 ──
       파일 이름의 epoch 가 겹치면 putNewJson 이 던진다 (append 전용). 한 번 저장에 최대
       네 벌이 나가므로 시각을 세션 안에서 단조 증가로 뽑는다. */
    let lastStamp = 0;
    function nextStamp(): number {
      const now = Date.now();
      lastStamp = now > lastStamp ? now : lastStamp + 1;
      return lastStamp;
    }

    /** 보낼 이벤트 한 벌. 경로는 만들 때 정해진다 (파일 이름이 곧 시각과 기기) */
    type Outgoing = { ev: DashEvent; path: string };

    function makeEvent(type: EvType, target: string, fields: Partial<DashEvent>): Outgoing {
      const ms = nextStamp();
      const ev: DashEvent = {
        v: EVENT_V,
        at: new Date(ms).toISOString(),
        device: repo.deviceId,
        type,
        target,
      };
      if (fields.intent) ev.intent = fields.intent;
      if (fields.domain !== undefined) ev.domain = fields.domain;
      if (fields.priority !== undefined) ev.priority = fields.priority;
      if (fields.status !== undefined) ev.status = fields.status;
      if (fields.note !== undefined) ev.note = fields.note;
      const path = EVENTS_DIR + '/' + monthKey(ms) + '/' + ms + '-' + repo.deviceId + '.json';
      return { ev, path };
    }

    type SendResult = 'sent' | 'queued' | 'denied';

    /**
     * 이벤트 하나 보내기. 네트워크 실패는 큐로, 권한 없음은 큐에 안 남기고 알림.
     * 보냈든 큐에 넣었든 화면은 바로 갱신 (낙관적).
     */
    async function sendEvent(out: Outgoing): Promise<SendResult> {
      const { ev, path } = out;
      const message = 'dash: ' + ev.type + ' ' + ev.target;
      try {
        await repo.putNewJson(path, ev, message);
        noteEvent(ev);
        rebuildStates(touched(ev.target));
        return 'sent';
      } catch (e) {
        if (isPermError(e)) return 'denied';
        repo.enqueueJson(path, ev, message);
        noteEvent(ev);
        rebuildStates(touched(ev.target));
        return 'queued';
      }
    }

    function sendWord(r: SendResult): string {
      if (r === 'sent') return t('mydash.bm.save.ok', undefined, '저장함');
      if (r === 'queued') {
        return t('mydash.bm.save.queued', undefined, '네트워크 실패. 큐에 넣었고 다음에 다시 보냅니다');
      }
      return t(
        'mydash.bm.save.denied',
        undefined,
        '쓰기 권한이 없습니다. GitHub App 권한 Contents 를 Read & write 로 바꾸고 설치에서 승인하세요'
      );
    }

    /* ── 고르기 ── */
    function matches(it: Item): boolean {
      const s = stateOf(it);
      /* 버림과 승격은 아카이브다. 필터를 안 켜면 기본 목록에서 뺀다 */
      if (!picked.status || !picked.status.size) {
        if (HIDDEN_STATUS.indexOf(s.status) >= 0) return false;
      }
      for (const g of groups) {
        const set = picked[g.key];
        if (!set.size) continue;
        const vals = valuesFor(it, g.key);
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
        const hay = (displayLabel(it, s.note) + ' ' + text(it.author) + ' ' + s.note).toLowerCase();
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
      const s = stateOf(it);
      const label = displayLabel(it, s.note) || text(it.id);
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
      const s = stateOf(it);
      const bits: string[] = [];
      const author = text(it.author);
      if (author) bits.push('<span>' + esc(author) + '</span>');
      const day = text(it.recordedAt).slice(0, 10);
      if (day) bits.push('<span>' + esc(day) + '</span>');
      if (isPending(it)) {
        bits.push(
          '<span class="tool-chip">' + esc(t('mydash.bm.pendingChip', undefined, '판정 대기')) + '</span>'
        );
      } else {
        for (const v of s.intent) {
          bits.push('<span class="tool-chip">' + esc(valueLabel('intent', v)) + '</span>');
        }
      }
      if (s.priority) {
        bits.push('<span class="tool-chip">' + esc(valueLabel('priority', s.priority)) + '</span>');
      }
      if (s.status !== 'unsorted' && s.status !== 'tagged') {
        bits.push('<span class="tool-chip">' + esc(valueLabel('status', s.status)) + '</span>');
      }
      return '<div class="bm-meta">' + bits.join('') + '</div>';
    }

    /** 시트를 여는 버튼. 선택 모드에서는 칸을 누르는 것이 일이라 안 그린다 */
    function openBtnHtml(target: string): string {
      if (selectMode) return '';
      return (
        '<div class="tool-actions tight"><button type="button" class="btn btn-ghost" ' +
        'data-act="open" data-target="' + esc(target) + '">' +
        esc(t('mydash.bm.row.open', undefined, '분류')) + '</button></div>'
      );
    }

    function checkHtml(it: Item): string {
      if (!selectMode) return '';
      const on = selected.has(text(it.id)) ? ' checked' : '';
      return (
        '<input type="checkbox" class="bm-check" data-pick="' + esc(text(it.id)) + '"' + on +
        ' aria-label="' + esc(displayLabel(it, stateOf(it).note)) + '">'
      );
    }

    function rowHtml(it: Item, extra: string): string {
      const cls = 'tool-list-row bm-row' + (extra ? ' ' + extra : '') + (selectMode ? ' is-pick' : '');
      const rowAct = selectMode ? ' data-act="pick" data-id="' + esc(text(it.id)) + '"' : '';
      return (
        '<div class="' + cls + '"' + rowAct + '>' +
        checkHtml(it) +
        '<div class="tool-list-key">' + esc(srcLabel(text(it.src))) + '</div>' +
        '<div class="tool-list-val bm-body">' + titleHtml(it) + metaHtml(it) +
        openBtnHtml(text(it.id)) + '</div>' +
        '</div>'
      );
    }

    function unitHtml(u: Unit): string {
      if (u.items.length < 2) return rowHtml(u.items[0], '');
      const isOpen = opened.has(u.key);
      const head0 = u.items[0];
      /* 머리 줄도 항목 하나. 자식과 같은 meta (날짜, 작성자, 의도 칩, 판정 대기 칩) 를 부착.
         접힌 상태에서 보이는 것이 이 줄뿐이라, 빠지면 묶음 첫 항목만 정보 결여. */
      const head =
        '<div class="tool-list-row bm-row' + (selectMode ? ' is-pick' : '') + '"' +
        (selectMode ? ' data-act="pick" data-id="' + esc(text(head0.id)) + '"' : '') + '>' +
        checkHtml(head0) +
        '<div class="tool-list-key">' + esc(srcLabel(text(head0.src))) + '</div>' +
        '<div class="tool-list-val bm-body">' +
        titleHtml(head0) +
        metaHtml(head0) +
        '<div class="tool-actions tight"><button type="button" class="btn btn-ghost" data-act="bundle" ' +
        'data-key="' + esc(u.key) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
        esc(t('mydash.bm.bundle', { n: u.items.length }, '묶음 {n}건')) + ' ' +
        esc(
          isOpen
            ? t('mydash.bm.bundleClose', undefined, '접기')
            : t('mydash.bm.bundleOpen', undefined, '펼치기')
        ) +
        '</button>' +
        (selectMode
          ? ''
          : '<button type="button" class="btn btn-ghost" data-act="open" data-target="bundle:' +
            esc(u.key) + '">' +
            esc(t('mydash.bm.row.openBundle', undefined, '묶음 분류')) + '</button>') +
        '</div></div></div>';
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
       그 자리에서 기록해, 같은 날 다시 열면 그 다음 것이 노출. 필터와 무관하게 전체 대상.
       버린 것과 승격한 것은 후보에서 뺌 (다시 파낼 이유 없음). */
    function revisitPool(): Item[] {
      const live = items.filter((it) => HIDDEN_STATUS.indexOf(stateOf(it).status) < 0);
      const lo = new Map<string, number>();
      const hi = new Map<string, number>();
      for (const it of live) {
        const days = idleDays(it.recordedAt);
        if (days < 0) continue;
        const src = text(it.src);
        const a = lo.get(src);
        const b = hi.get(src);
        if (a === undefined || days < a) lo.set(src, days);
        if (b === undefined || days > b) hi.set(src, days);
      }
      const bySrc = new Map<string, Array<{ it: Item; score: number }>>();
      for (const it of live) {
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

    let revisitId = '';
    function paintRevisit(): void {
      const it = revisitId ? itemById.get(revisitId) || revisitPick() : revisitPick();
      if (!it) {
        revisitEl.textContent = '';
        return;
      }
      revisitId = text(it.id);
      const days = idleDays(it.recordedAt);
      revisitEl.innerHTML =
        '<div class="tool-sublabel">' + esc(t('mydash.bm.revisit', undefined, '재발굴')) + '</div>' +
        '<div class="tool-list">' + rowHtml(it, '') + '</div>' +
        '<div class="tool-hint">' + esc(t('mydash.bm.revisitIdle', { n: days }, '{n}일 방치')) + '</div>';
      markSeen(revisitId);
    }

    /* ── 우선순위 상한 ──
       `now` 는 자리가 여덟이다. 아홉 번째를 올리려 하면 지금 여덟을 보여 하나를 내리게 한다.
       화면이 지킨다 (저장소에는 규칙이 없다). */
    function nowItems(exclude: Set<string>): Item[] {
      return items.filter((it) => stateOf(it).priority === 'now' && !exclude.has(text(it.id)));
    }

    /* ── 칩 숫자 ── */
    function paintChipCounts(): void {
      const tally = new Map<string, number>();
      for (const it of items) {
        for (const g of groups) {
          for (const v of valuesFor(it, g.key)) {
            const k = g.key + ':' + v;
            tally.set(k, (tally.get(k) || 0) + 1);
          }
        }
      }
      const spans = Array.from(wrap.querySelectorAll('[data-n]')) as HTMLElement[];
      for (const s of spans) s.textContent = String(tally.get(s.getAttribute('data-n') || '') || 0);
    }

    function paintHead(): void {
      const n = items.filter(isPending).length;
      const num = wrap.querySelector('[data-pending-num] b') as HTMLElement | null;
      if (num) num.textContent = String(n);
      judgeBtn.textContent = t('mydash.bm.act.judge', { n }, '판정 대기 {n}건');
      (judgeBtn as HTMLButtonElement).disabled = n === 0 && !judge;
      selectBtn.textContent = selectMode
        ? t('mydash.bm.act.selectOff', undefined, '선택 끄기')
        : t('mydash.bm.act.select', undefined, '선택');
      evLineEl.textContent = eventCount
        ? t('mydash.bm.events.applied', { n: eventCount }, '이벤트 {n}건 반영')
        : '';
      evLineEl.hidden = !eventCount;
    }

    function paint(): void {
      const chipEls = Array.from(wrap.querySelectorAll('.bm-groups .tool-chip')) as HTMLElement[];
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
      paintChipCounts();
      paintHead();
      paintBar();
    }

    /* ── 시트 ──
       화면 아래에서 올라오고, 저장은 **바뀐 축만** 이벤트로 낸다. 한 번에 최대 네 벌
       (tag, priority, status, note). */

    function openSheet(target: string): void {
      const list = touched(target);
      if (!list.length) return;
      sheet = { target, items: list, bundle: target.indexOf('bundle:') === 0 };
      const s = stateOf(list[0]);
      draftBase = { intent: s.intent.slice(), domain: s.domain, priority: s.priority, status: s.status, note: s.note, tagged: s.tagged };
      draft = { intent: s.intent.slice(), domain: s.domain, priority: s.priority, status: s.status, note: s.note, tagged: s.tagged };
      sheetMsg = '';
      sheetMsgBad = false;
      showNowList = false;
      paintSheet();
    }

    function closeSheet(): void {
      sheet = null;
      draft = null;
      draftBase = null;
      sheetEl.hidden = true;
      sheetEl.innerHTML = '';
    }

    function chipsHtml(axisKey: string, on: (v: string) => boolean, act: string): string {
      const picks = axisPicks(axisKey);
      if (!picks.length) return '';
      return (
        '<div class="bm-sheet-sec"><div class="tool-sublabel">' + esc(axisLabel(axisKey)) +
        '</div><div class="tool-chips">' +
        picks
          .map(
            (p) =>
              '<button type="button" class="tool-chip' + (on(p.key) ? ' active' : '') +
              '" data-act="' + esc(act) + '" data-value="' + esc(p.key) + '">' + esc(p.label) +
              '</button>'
          )
          .join('') +
        '</div></div>'
      );
    }

    function paintSheet(): void {
      if (!sheet || !draft || !draftBase) {
        sheetEl.hidden = true;
        return;
      }
      const head = sheet.items[0];
      const url = safeLinkUrl(head.url);
      const title = sheet.bundle
        ? t('mydash.bm.sheet.bundle', { n: sheet.items.length }, '묶음 {n}건 전체에 적용')
        : displayLabel(head, draft.note);

      /* now 상한. 이 대상이 새로 차지할 자리 수만큼 미리 잰다 */
      const mine = new Set(sheet.items.map((it) => text(it.id)));
      const cap = nowCap();
      const others = nowItems(mine);
      const overflow = draft.priority === 'now' && others.length + sheet.items.length > cap;

      /* 사람이 고르는 생애주기 셋. axes.json 에 없는 값은 제외
         (없는 값을 쓰게 두면 필터 칩에 안 잡히는 미아 발생). 정의 통째로 없으면 셋 다 */
      const known = axisPicks('status');
      const statusPicks = known.length
        ? PICKABLE_STATUS.filter((k) => known.some((p) => p.key === k))
        : PICKABLE_STATUS.slice();
      const needNote = draft.status === 'promoted';

      const nowListHtml =
        overflow || showNowList
          ? '<div class="bm-nowlist"><div class="tool-sublabel">' +
            esc(
              t(
                'mydash.bm.prio.capHead',
                { n: cap },
                '지금 자리는 {n}개입니다. 하나를 곧 으로 내리세요'
              )
            ) +
            '</div>' +
            (others.length
              ? others
                  .map(
                    (it) =>
                      '<div class="bm-nowrow"><span>' +
                      esc(displayLabel(it, stateOf(it).note)) +
                      '</span><button type="button" class="btn btn-ghost" data-act="s-demote" data-id="' +
                      esc(text(it.id)) + '">' +
                      esc(t('mydash.bm.prio.demote', undefined, '곧 으로')) + '</button></div>'
                  )
                  .join('')
              : '<div class="tool-hint">' +
                esc(t('mydash.bm.prio.capEmpty', undefined, '지금 으로 올린 것이 없습니다')) +
                '</div>') +
            '</div>'
          : '';

      sheetEl.innerHTML =
        '<div class="bm-scrim" data-act="sheet-close"></div>' +
        '<div class="bm-sheet-card" role="dialog" aria-modal="true">' +
        '<div class="bm-sheet-head"><div class="bm-sheet-title">' + esc(title) + '</div>' +
        '<button type="button" class="btn btn-ghost" data-act="sheet-close">' +
        esc(t('mydash.bm.sheet.close', undefined, '닫기')) + '</button></div>' +
        (url
          ? '<div><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(t('mydash.bm.sheet.link', undefined, '링크 열기')) + '</a></div>'
          : '') +
        chipsHtml('intent', (v) => (draft as ItemState).intent.indexOf(v) >= 0, 's-intent') +
        chipsHtml('domain', (v) => (draft as ItemState).domain === v, 's-domain') +
        '<div class="bm-sheet-sec"><div class="tool-sublabel">' + esc(axisLabel('priority')) +
        '</div><div class="tool-chips">' +
        axisPicks('priority')
          .map(
            (p) =>
              '<button type="button" class="tool-chip' +
              ((draft as ItemState).priority === p.key ? ' active' : '') +
              '" data-act="s-prio" data-value="' + esc(p.key) + '">' + esc(p.label) + '</button>'
          )
          .join('') +
        '</div>' + nowListHtml + '</div>' +
        '<div class="bm-sheet-sec"><div class="tool-sublabel">' + esc(axisLabel('status')) +
        '</div><div class="tool-chips">' +
        statusPicks
          .map(
            (k) =>
              '<button type="button" class="tool-chip' +
              ((draft as ItemState).status === k ? ' active' : '') +
              '" data-act="s-status" data-value="' + esc(k) + '">' + esc(valueLabel('status', k)) +
              '</button>'
          )
          .join('') +
        '</div></div>' +
        '<div class="field-group"><label class="field-label" for="bm-note">' +
        esc(
          needNote
            ? t('mydash.bm.note.promote', undefined, '이걸로 뭘 알게 됐나')
            : t('mydash.bm.note.label', undefined, '메모')
        ) +
        '</label><input id="bm-note" type="text" autocomplete="off" value="' +
        esc(draft.note) + '"></div>' +
        '<div class="bm-sheet-foot">' +
        '<div class="tool-status' + (sheetMsgBad ? ' error' : '') + '">' + esc(sheetMsg) + '</div>' +
        '<button type="button" class="btn btn-primary" data-act="sheet-save">' +
        esc(t('mydash.bm.sheet.save', undefined, '저장')) + '</button></div>' +
        '</div>';
      sheetEl.hidden = false;
      const noteEl = sheetEl.querySelector('#bm-note') as HTMLInputElement | null;
      if (noteEl) {
        noteEl.addEventListener('input', () => {
          if (draft) draft.note = noteEl.value;
        });
      }
    }

    /** 시트의 초안과 지금 상태를 견줘 낼 이벤트를 만든다. 안 바뀐 축은 안 낸다 */
    function sheetEvents(): Outgoing[] {
      if (!sheet || !draft || !draftBase) return [];
      const out: Outgoing[] = [];
      const tagChanged = !sameSet(draft.intent, draftBase.intent) || draft.domain !== draftBase.domain;
      if (tagChanged) {
        out.push(makeEvent('tag', sheet.target, { intent: draft.intent.slice(), domain: draft.domain }));
      }
      if (draft.priority !== draftBase.priority) {
        out.push(makeEvent('priority', sheet.target, { priority: draft.priority }));
      }
      if (draft.status !== draftBase.status) {
        out.push(makeEvent('status', sheet.target, { status: draft.status }));
      }
      if (draft.note !== draftBase.note) {
        out.push(makeEvent('note', sheet.target, { note: draft.note }));
      }
      return out;
    }

    async function saveSheet(): Promise<void> {
      if (!sheet || !draft) return;
      if (draft.status === 'promoted' && !draft.note.trim()) {
        sheetMsg = t(
          'mydash.bm.promote.need',
          undefined,
          '승격하려면 이걸로 뭘 알게 됐는지 한 줄 적으세요'
        );
        sheetMsgBad = true;
        paintSheet();
        return;
      }
      const mine = new Set(sheet.items.map((it) => text(it.id)));
      if (draft.priority === 'now' && nowItems(mine).length + sheet.items.length > nowCap()) {
        sheetMsg = t('mydash.bm.prio.capBlock', { n: nowCap() }, '지금 은 {n}개까지입니다. 하나를 내리세요');
        sheetMsgBad = true;
        showNowList = true;
        paintSheet();
        return;
      }
      const evs = sheetEvents();
      if (!evs.length) {
        sheetMsg = t('mydash.bm.save.none', undefined, '바뀐 것이 없습니다');
        sheetMsgBad = false;
        paintSheet();
        return;
      }
      let worst: SendResult = 'sent';
      for (const ev of evs) {
        const r = await sendEvent(ev);
        if (r === 'denied') worst = 'denied';
        else if (r === 'queued' && worst !== 'denied') worst = 'queued';
      }
      paint();
      if (worst === 'denied') {
        sheetMsg = sendWord('denied');
        sheetMsgBad = true;
        paintSheet();
        return;
      }
      closeSheet();
    }

    /* ── 선택 모드 ── */
    function paintBar(): void {
      if (!selectMode) {
        barEl.hidden = true;
        barEl.innerHTML = '';
        wrap.classList.remove('has-bar');
        return;
      }
      wrap.classList.add('has-bar');
      barEl.hidden = false;
      barEl.innerHTML =
        '<div class="tool-chips">' +
        axisPicks('intent')
          .map(
            (p) =>
              '<button type="button" class="tool-chip' + (barIntent.has(p.key) ? ' active' : '') +
              '" data-act="b-intent" data-value="' + esc(p.key) + '">' + esc(p.label) + '</button>'
          )
          .join('') +
        '</div>' +
        '<div class="tool-actions">' +
        '<button type="button" class="btn btn-primary" data-act="b-apply">' +
        esc(t('mydash.bm.sel.applyIntent', undefined, '의도 적용')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="b-drop">' +
        esc(t('mydash.bm.sel.drop', undefined, '버림')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="b-cancel">' +
        esc(t('mydash.bm.sel.cancel', undefined, '취소')) + '</button>' +
        '</div>' +
        '<div class="tool-status">' +
        esc(
          barBusy ||
            t('mydash.bm.sel.picked', { n: selected.size }, '고른 것 {n}건')
        ) +
        '</div>';
    }

    /** 고른 것마다 이벤트 하나씩 순차로. 실패한 것만 큐로 (그건 sendEvent 안에서) */
    async function runBulk(make: (it: Item) => Outgoing): Promise<void> {
      const ids = Array.from(selected);
      if (!ids.length) {
        barBusy = t('mydash.bm.sel.none', undefined, '고른 것이 없습니다');
        paintBar();
        return;
      }
      let done = 0;
      for (const id of ids) {
        const it = itemById.get(id);
        if (!it) {
          done++;
          continue;
        }
        const r = await sendEvent(make(it));
        done++;
        if (r === 'denied') {
          barBusy = sendWord('denied');
          paint();
          return;
        }
        barBusy = t('mydash.bm.sel.progress', { n: done, m: ids.length }, '{n}/{m}');
        paintBar();
      }
      selected.clear();
      barBusy = '';
      paint();
    }

    /* ── 한 장 모드 ──
       판정 대기만 한 장씩. 차례는 작성자별로 모아 같은 작가가 연달아 오게 한다 (같은 그림쟁이
       스물몇 장을 매번 새로 판단하는 것 방지). 같은 작가면 앞에서 고른 의도를 미리 체크. */
    function judgeList(): Item[] {
      return items.filter(isPending).sort((a, b) => {
        const x = text(a.author);
        const y = text(b.author);
        if (x !== y) return x < y ? -1 : 1;
        return byRecent(a, b);
      });
    }

    function enterJudge(): void {
      const list = judgeList();
      judge = { list, at: 0, picks: new Set<string>(), lastAuthor: '', lastIntent: [] };
      if (selectMode) toggleSelect(false);
      paintJudge();
    }

    function exitJudge(): void {
      judge = null;
      paintJudge();
      paint();
    }

    /** 한 장 모드에서는 목록 쪽을 통째로 감춘다. 화면에 판단할 것 하나만 남기려는 것 */
    function setListVisible(on: boolean): void {
      for (const el of [numsEl, groupsEl, searchEl, revisitEl, countEl, listEl, moreEl]) {
        if (el) el.hidden = !on;
      }
      headActsEl.hidden = !on;
    }

    function paintJudge(): void {
      if (!judge) {
        judgeEl.hidden = true;
        judgeEl.innerHTML = '';
        setListVisible(true);
        return;
      }
      setListVisible(false);
      judgeEl.hidden = false;
      const total = judge.list.length;
      if (judge.at >= total) {
        judgeEl.innerHTML =
          '<div class="tool-status ok">' +
          esc(t('mydash.bm.judge.done', undefined, '판정 대기를 다 봤습니다')) + '</div>' +
          '<div class="tool-actions"><button type="button" class="btn btn-primary" data-act="j-exit">' +
          esc(t('mydash.bm.judge.exit', undefined, '나가기')) + '</button></div>';
        return;
      }
      const it = judge.list[judge.at];
      const url = safeLinkUrl(it.url);
      const s = stateOf(it);
      judgeEl.innerHTML =
        '<div class="tool-status">' +
        esc(t('mydash.bm.judge.progress', { k: judge.at + 1, n: total }, '{k}/{n}')) + '</div>' +
        '<div class="bm-judge-title">' + esc(displayLabel(it, s.note)) + '</div>' +
        '<div class="bm-meta">' +
        (text(it.author) ? '<span>' + esc(text(it.author)) + '</span>' : '') +
        (text(it.subhead) ? '<span>' + esc(text(it.subhead)) + '</span>' : '') +
        '</div>' +
        (url
          ? '<div><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(t('mydash.bm.sheet.link', undefined, '링크 열기')) + '</a></div>'
          : '') +
        '<div class="tool-chips">' +
        axisPicks('intent')
          .map(
            (p) =>
              '<button type="button" class="tool-chip' +
              ((judge as Judge).picks.has(p.key) ? ' active' : '') +
              '" data-act="j-intent" data-value="' + esc(p.key) + '">' + esc(p.label) + '</button>'
          )
          .join('') +
        '</div>' +
        '<div class="tool-actions">' +
        '<button type="button" class="btn btn-primary" data-act="j-save">' +
        esc(t('mydash.bm.judge.saveNext', undefined, '저장하고 다음')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="j-skip">' +
        esc(t('mydash.bm.judge.skip', undefined, '건너뛰기')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="j-drop">' +
        esc(t('mydash.bm.judge.drop', undefined, '버림')) + '</button>' +
        '<button type="button" class="btn btn-ghost" data-act="j-exit">' +
        esc(t('mydash.bm.judge.exit', undefined, '나가기')) + '</button>' +
        '</div>' +
        '<div class="tool-status" data-jmsg="1"></div>';
    }

    function judgeAdvance(): void {
      if (!judge) return;
      judge.at++;
      const next = judge.list[judge.at];
      judge.picks = new Set<string>();
      /* 같은 작가면 앞에서 고른 의도를 미리 체크. 다른 작가면 빈칸에서 시작 */
      if (next && judge.lastAuthor && text(next.author) === judge.lastAuthor) {
        for (const v of judge.lastIntent) judge.picks.add(v);
      }
      paintJudge();
    }

    function judgeMsg(msg: string, bad: boolean): void {
      const el = judgeEl.querySelector('[data-jmsg]') as HTMLElement | null;
      if (!el) return;
      el.textContent = msg;
      el.classList.toggle('error', bad);
    }

    async function judgeSave(): Promise<void> {
      if (!judge) return;
      const it = judge.list[judge.at];
      if (!it) return;
      if (!judge.picks.size) {
        judgeMsg(t('mydash.bm.judge.needIntent', undefined, '의도를 하나 이상 고르세요'), true);
        return;
      }
      const picks = Array.from(judge.picks);
      const s = stateOf(it);
      const r = await sendEvent(makeEvent('tag', text(it.id), { intent: picks, domain: s.domain }));
      if (r === 'denied') {
        judgeMsg(sendWord('denied'), true);
        return;
      }
      judge.lastAuthor = text(it.author);
      judge.lastIntent = picks;
      judgeAdvance();
      paintHead();
    }

    async function judgeDrop(): Promise<void> {
      if (!judge) return;
      const it = judge.list[judge.at];
      if (!it) return;
      const r = await sendEvent(makeEvent('status', text(it.id), { status: 'dropped' }));
      if (r === 'denied') {
        judgeMsg(sendWord('denied'), true);
        return;
      }
      judgeAdvance();
      paintHead();
    }

    function toggleSelect(on: boolean): void {
      selectMode = on;
      if (!on) {
        selected.clear();
        barIntent.clear();
        barBusy = '';
      }
      paint();
    }

    /* ── 손 ── */
    wrap.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      /* 제목 링크는 링크로 둔다. 시트를 여는 것은 그 밖의 자리 */
      if (target.closest('a')) return;
      const el = target.closest('[data-axis],[data-act],[data-pick]') as HTMLElement | null;
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
      if (act === 'select') {
        toggleSelect(!selectMode);
        return;
      }
      if (act === 'judge') {
        enterJudge();
        return;
      }
      if (act === 'open') {
        openSheet(el.getAttribute('data-target') || '');
        return;
      }
      if (act === 'pick' || el.hasAttribute('data-pick')) {
        const id = el.getAttribute('data-id') || el.getAttribute('data-pick') || '';
        if (!id) return;
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        /* 목록을 다시 안 그린다. 백 줄을 매번 다시 그리면 폰에서 끊기고, 다시 그리는 순간
           아직 안 누른 칸이 새 노드로 갈려 연달아 고르기가 끊긴다. 칸과 띠만 맞춘다 */
        /* 같은 항목이 목록과 재발굴 칸에 두 번 떠 있을 수 있다. 둘 다 맞춘다 */
        const boxes = Array.from(
          wrap.querySelectorAll('[data-pick="' + id + '"]')
        ) as HTMLInputElement[];
        for (const box of boxes) box.checked = selected.has(id);
        paintBar();
        return;
      }
      if (act === 'sheet-close') {
        closeSheet();
        return;
      }
      if (act === 'sheet-save') {
        void saveSheet();
        return;
      }
      if (act === 's-intent' && draft) {
        const v = el.getAttribute('data-value') || '';
        const at = draft.intent.indexOf(v);
        if (at >= 0) draft.intent.splice(at, 1);
        else draft.intent.push(v);
        paintSheet();
        return;
      }
      if (act === 's-domain' && draft) {
        const v = el.getAttribute('data-value') || '';
        draft.domain = draft.domain === v ? null : v;
        paintSheet();
        return;
      }
      if (act === 's-prio' && draft) {
        const v = el.getAttribute('data-value') || '';
        draft.priority = draft.priority === v ? null : v;
        showNowList = false;
        sheetMsg = '';
        sheetMsgBad = false;
        paintSheet();
        return;
      }
      if (act === 's-status' && draft) {
        const v = el.getAttribute('data-value') || '';
        draft.status = draft.status === v ? (draftBase as ItemState).status : v;
        sheetMsg = '';
        sheetMsgBad = false;
        paintSheet();
        return;
      }
      if (act === 's-demote') {
        const id = el.getAttribute('data-id') || '';
        void (async () => {
          const r = await sendEvent(makeEvent('priority', id, { priority: 'soon' }));
          if (r === 'denied') {
            sheetMsg = sendWord('denied');
            sheetMsgBad = true;
          } else {
            sheetMsg = '';
            sheetMsgBad = false;
          }
          paint();
          paintSheet();
        })();
        return;
      }
      if (act === 'b-intent') {
        const v = el.getAttribute('data-value') || '';
        if (barIntent.has(v)) barIntent.delete(v);
        else barIntent.add(v);
        barBusy = '';
        paintBar();
        return;
      }
      if (act === 'b-apply') {
        if (!barIntent.size) {
          barBusy = t('mydash.bm.sel.pickIntent', undefined, '의도를 고르세요');
          paintBar();
          return;
        }
        const picks = Array.from(barIntent);
        void runBulk((it) => makeEvent('tag', text(it.id), { intent: picks, domain: stateOf(it).domain }));
        return;
      }
      if (act === 'b-drop') {
        void runBulk((it) => makeEvent('status', text(it.id), { status: 'dropped' }));
        return;
      }
      if (act === 'b-cancel') {
        toggleSelect(false);
        return;
      }
      if (act === 'j-intent' && judge) {
        const v = el.getAttribute('data-value') || '';
        if (judge.picks.has(v)) judge.picks.delete(v);
        else judge.picks.add(v);
        paintJudge();
        return;
      }
      if (act === 'j-save') {
        void judgeSave();
        return;
      }
      if (act === 'j-skip') {
        judgeAdvance();
        return;
      }
      if (act === 'j-drop') {
        void judgeDrop();
        return;
      }
      if (act === 'j-exit') {
        exitJudge();
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

    /* 밀린 쓰기 비우기. 보낸 것이 있으면 브랜치가 바뀐 것이라 이벤트를 다시 읽는다 */
    void (async () => {
      try {
        const r = await repo.flushOutbox();
        if (r && r.sent > 0) {
          await loadEvents();
          paint();
          evLineEl.hidden = false;
          evLineEl.textContent = t('mydash.bm.outbox.sent', { n: r.sent }, '밀린 저장 {n}건 보냈습니다');
        }
      } catch {
        /* 큐 비우기는 화면을 막지 않는다. 다음 로드나 online 에서 다시 */
      }
    })();
  }

  /* 탭 이름은 **등록하는 순간** 셸 소관, 그 자리는 기다릴 곳 없어 되받을 글 동봉 방식.
     묶음 받기를 여기서 미리 걸어 두면 로그인 뒤 칩이 그려질 때는 대개 옮긴 말 도착. */
  void loadNamespace('mydash').catch(() => undefined);

  dashRegistry().register({
    id: 'bookmarks',
    get title(): string {
      return t('mydash.bm.title', undefined, '북마크');
    },
    access: 'write',
    paths: [SUMMARY_PATH, AXES_PATH, EVENTS_DIR],
    render,
  });
})();

export {};
