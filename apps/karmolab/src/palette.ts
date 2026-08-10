/**
 * 명령 팔레트 (TASK-KL-099)
 *
 * 왜 있나: 등록된 도구가 160개인데 앱 안에 찾는 입력이 **하나도 없었다**. 찾는 길은
 * 123개짜리 드롭다운을 훑거나, 앱을 나가서 목록 페이지로 가는 것뿐이었다(그 검색은
 * 검색엔진 유입용으로 만든 정적 페이지다). 첫 화면조차 「상단 메뉴에서 카테고리를 열고
 * 도구를 선택하세요」라고 적혀 있었다 — 찾는 부담을 사람에게 떠넘기는 문구다.
 *
 * 어떻게: 표면은 **하나**다. 첫 화면에서는 그 자리에 박혀 있고(inline), 도구를 보는
 * 중에는 `Ctrl/⌘+K` 로 같은 것이 떠오른다(overlay). 헤더에 상시 검색창은 두지 않는다 —
 * 사용자가 명시적으로 거부한 항목이고, 그럴 필요도 없다: 첫 화면에서 이미 배우기 때문에
 * 「⌘K 라는 게 있다」를 따로 가르칠 힌트가 필요 없다.
 *
 * 찾기 대상은 이름·한 줄 설명·별칭·초성이다. 별칭 파일은 이미 있었는데(`tool-aliases.json`)
 * 목록 페이지만 쓰고 앱은 안 쓰고 있었다. 초성은 한국어 입력에서 제일 빠른 길이다 —
 * 「ㄱㅈㅅ」로 「글자수 세기」가 나온다.
 *
 * 묶음의 탭으로 들어간 도구(예: base64)는 메뉴에서 숨겨져 있지만 여기서는 찾아진다.
 * `Toolbox.switchPage` 가 묶음으로 보내고 그 탭을 열어 주므로, 메뉴에 없다는 것이
 * 「닿을 수 없다」를 뜻하지 않게 된다. 메뉴 123개 대 찾기 160개의 차이가 여기서 난다.
 */
import { initials as toCho } from './core/jamo';

type PaletteTool = {
  id: string;
  title?: string;
  desc?: string;
  category?: string;
  icon?: string;
  hidden?: boolean;
  desktopOnly?: boolean;
};

type Entry = {
  id: string;
  title: string;
  desc: string;
  category: string;
  icon: string;
  /** 찾기에만 쓰이고 화면에는 안 보이는 다른 이름들 */
  alias: string;
  /** 이름의 초성 (한글만) — 「ㄱㅈㅅ」 같은 입력용 */
  cho: string;
  /** 이 도구가 어느 묶음의 탭인지 (아니면 null). 둘러보기에서 부모 밑에 붙인다. */
  bundle: string | null;
};

type Hit = {
  entry: Entry;
  score: number;
  /** 이름에서 일치한 구간 [시작, 끝) — 강조에 쓴다 */
  range: [number, number] | null;
};

const RECENT_KEY = 'toolbox_recent_tools';
const FAVORITES_KEY = 'toolbox_favorites';
/** 도구 목록에서 별로 꽂은 것 — 저절로 쌓이는 「최근」과 달리 사람이 고른 것 (TASK-KL-129) */
const PINNED_KEY = 'toolbox_pinned_tools';
const RECENT_MAX = 8;
const RESULT_MAX = 40;
/* 첫 화면에 박힌 드롭다운은 **스크롤이 안 생겨야 한다** (TASK-KL-136, 사용자 요청).
 * 그래서 높이를 CSS 로 자르는 대신 **줄 수를 여기서 자른다** — 잘라낸 것은 「전체 목록에서
 * 찾아보기 →」가 받는다. 잘라 놓고 안에서 또 스크롤하게 두면 잘린 줄도 못 보고 화면도 길다.
 * ⌘K 로 뜨는 쪽은 그대로다 — 그건 찾으려고 연 창이라 길어도 된다. */
const INLINE_ROW_MAX = 5;
const INLINE_RESULT_MAX = 8;

/* 초성 뽑기는 `core/jamo.ts` 가 한다 — 표를 여기 한 벌 더 적으면 언젠가 한쪽만 고쳐진다. */

/** 찾기 비교용 정규화 — 대소문자·공백을 지운다. 「글자수 세기」와 「글자수세기」가 같아야 한다. */
function norm(s: unknown): string {
  /* 별칭은 한 줄 글월이 보통이지만 **목록으로 적힌 것도 있다**(`chain`). 글월로만 알고 다루면
   * 찾기 알맹이가 통째로 터져 이름 바꾸기까지 멈춘다 — 실제로 그렇게 6개가 안 바뀌었다. */
  const text = Array.isArray(s) ? s.join(' ') : s == null ? '' : String(s);
  return text.toLowerCase().replace(/\s+/g, '');
}

/** 입력이 초성만으로 이뤄졌나 (「ㄱㅈㅅ」). 그럴 때만 초성 대조를 켠다 —
 *  안 그러면 「사」가 「ㅅ」으로 잘못 걸린다. */
function isChoQuery(q: string): boolean {
  return /^[ㄱ-ㅎ]+$/.test(q);
}

/* ── 바로 답하기 (TASK-KL-110) ────────────────────────────────
 *
 * 도구를 쓰는 길은 늘 넷이었다: 찾고 → 열고 → 넣고 → 읽는다. 그런데 자주 묻는 것 중에는
 * **한 줄이면 끝나는** 질문이 많다 — 24px 이 몇 rem 인지, 1024KB 가 몇 MB 인지, 이 색의
 * RGB 값이 뭔지. 그걸 위해 매번 도구를 여는 것은 네 걸음을 걷는 일이다.
 *
 * 그래서 친 그대로가 질문이면 목록 맨 위에 답을 놓는다. Enter 를 치면 그 답이 복사된다
 * (값을 본 다음 하는 일은 대개 붙여넣기다). 도구가 필요하면 그 아래 줄이 그대로 있다.
 *
 * **작게 시작한다** — 셋뿐이다. 여기서 쓸모가 확인되면 늘린다. 답을 내는 규칙이 도구와
 * 어긋나면 그게 더 나쁘므로(같은 질문에 두 답), 도구와 값이 같은지 검사로 묶어 둔다.
 */
type Answer = { label: string; value: string; hint?: string; toolId: string };

/** 숫자를 사람이 읽기 좋게 — 끝의 0 은 지운다 (1.5000 → 1.5) */
function num(n: number): string {
  if (!isFinite(n)) return '';
  const r = Math.round(n * 10000) / 10000;
  return String(r);
}

/** px ↔ rem (뿌리 글자 크기 16 기준 — cssunit 도구의 기본값과 같다) */
function answerCssUnit(q: string): Answer[] {
  const m = /^(-?\d+(?:\.\d+)?)\s*(px|rem|em)\b(?:\s*(?:to|→|>)\s*(px|rem|em))?$/i.exec(q.trim());
  if (!m) return [];
  const v = parseFloat(m[1]);
  const from = m[2].toLowerCase();
  const to = (m[3] || '').toLowerCase();
  const ROOT = 16;
  const px = from === 'px' ? v : v * ROOT;
  const all: Record<string, string> = { px: num(px) + 'px', rem: num(px / ROOT) + 'rem', em: num(px / ROOT) + 'em' };
  if (to && to !== from) return [{ label: `${m[1]}${from} → ${to}`, value: all[to], hint: '뿌리 16px 기준', toolId: 'cssunit' }];
  return Object.keys(all)
    .filter((u) => u !== from)
    .map((u) => ({ label: `${m[1]}${from} → ${u}`, value: all[u], hint: '뿌리 16px 기준', toolId: 'cssunit' }));
}

/** 바이트 크기 — 1024 배(KiB 계열)와 1000 배(KB 계열)를 함께 보여 준다 */
function answerByteSize(q: string): Answer[] {
  const m = /^(-?\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb|kib|mib|gib|tib)$/i.exec(q.trim());
  if (!m) return [];
  const v = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const bin = ['b', 'kib', 'mib', 'gib', 'tib'];
  const dec = ['b', 'kb', 'mb', 'gb', 'tb'];
  const isBin = bin.indexOf(unit) >= 0;
  const idx = isBin ? bin.indexOf(unit) : dec.indexOf(unit);
  const bytes = v * Math.pow(isBin ? 1024 : 1000, idx);
  const out: Answer[] = [];
  const label = ['B', 'KB', 'MB', 'GB', 'TB'];
  const labelBin = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  for (let i = 1; i < 5; i++) {
    const d = bytes / Math.pow(1000, i);
    // 친 단위 그대로를 답이라고 내밀지 않는다 — 「1024kb → 1024 KB」 는 답이 아니라 메아리다.
    if (label[i].toLowerCase() !== unit && d >= 0.001 && d < 10000) {
      out.push({ label: `${m[1]}${unit} → ${label[i]}`, value: num(d) + ' ' + label[i], toolId: 'bytesize' });
    }
    const b = bytes / Math.pow(1024, i);
    if (labelBin[i].toLowerCase() !== unit && b >= 0.001 && b < 10000) {
      out.push({ label: `${m[1]}${unit} → ${labelBin[i]}`, value: num(b) + ' ' + labelBin[i], toolId: 'bytesize' });
    }
  }
  return out.slice(0, 4);
}

/** 색 — #hex 를 RGB 로 (반대 방향은 색 도구가 더 잘 한다) */
function answerColor(q: string): Answer[] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(q.trim());
  if (!m) return [];
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return [{ label: `#${hex.toLowerCase()} → RGB`, value: `rgb(${r}, ${g}, ${b})`, toolId: 'colorconv' }];
}

const ANSWER_PROVIDERS = [answerCssUnit, answerByteSize, answerColor];

function answersFor(q: string): Answer[] {
  const out: Answer[] = [];
  for (const p of ANSWER_PROVIDERS) {
    try {
      out.push(...p(q));
    } catch (_) {
      /* 한 규칙이 넘어져도 나머지 찾기는 계속돼야 한다 */
    }
  }
  return out.slice(0, 4);
}

const KarmoPalette = (() => {
  let entries: Entry[] = [];
  let aliasMap: Record<string, string> = {};
  let aliasLoaded = false;
  /** 이번 주에 많이 쓴 도구 id — 실측이다. toolbox 가 통계를 받아 넘겨준다 (TASK-KL-136). */
  let popularIds: string[] = [];

  /* ── 최근 쓴 도구 ─────────────────────────────────────────── */

  function getRecent(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  /** 도구를 열 때마다 toolbox 가 부른다. 맨 앞으로 올리고 중복은 지운다. */
  function noteOpen(id: string): void {
    if (!id || id === 'home') return;
    try {
      const list = getRecent().filter((x) => x !== id);
      list.unshift(id);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
    } catch (_) {
      /* 저장이 막혀 있어도 찾기 자체는 돌아야 한다 */
    }
  }

  /** 도구 목록(`/karmolab/t/`)에서 별로 꽂아 둔 것 — 사람이 직접 고른 목록 (TASK-KL-129) */
  function getPinnedToolIds(): string[] {
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  /** 즐겨찾기에 넣어 둔 것 중 이 앱의 도구인 것만 */
  function getFavoriteToolIds(): string[] {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (!raw) return [];
      const groups = JSON.parse(raw);
      if (!Array.isArray(groups)) return [];
      const ids: string[] = [];
      for (const g of groups) {
        for (const it of (g && g.items) || []) {
          if (it && typeof it.toolId === 'string') ids.push(it.toolId);
        }
      }
      return ids;
    } catch (_) {
      return [];
    }
  }

  /* ── 인덱스 ───────────────────────────────────────────────── */

  /** 별칭은 있으면 좋고 없어도 도는 것 — 못 받아도 조용히 넘어간다. */
  async function loadAliases(): Promise<void> {
    if (aliasLoaded) return;
    aliasLoaded = true;
    try {
      const res = await fetch('/apps/karmolab/data/tool-aliases.json');
      if (!res.ok) return;
      const json = await res.json();
      if (json && json.aliases && typeof json.aliases === 'object') {
        aliasMap = json.aliases as Record<string, string>;
        entries = entries.map((e) => ({ ...e, alias: norm(aliasMap[e.id] || '') }));
      }
    } catch (_) {
      /* 오프라인이면 이름·설명으로만 찾는다 */
    }
  }

  function buildIndex(): void {
    const all = (typeof Toolbox !== 'undefined' ? Toolbox.getTools() : []) as PaletteTool[];
    const isDesktop = typeof Toolbox !== 'undefined' && Toolbox.isDesktopApp ? Toolbox.isDesktopApp() : false;
    entries = all
      // 데스크톱 앱 전용 도구는 브라우저에서 열 수 없다 — 찾아져 봐야 빈 화면이다.
      .filter((t) => !(t.desktopOnly || t.category === 'desktop') || isDesktop)
      // 「내 정보」는 헤더에 제 버튼이 있다. 여기서 또 나오면 결과가 지저분해진다.
      .filter((t) => t.id !== 'user')
      .map((t) => ({
        id: t.id,
        title: t.title || t.id,
        desc: t.desc || '',
        category: t.category || '기타',
        icon: t.icon || '',
        alias: norm(aliasMap[t.id] || ''),
        cho: toCho(norm(t.title || t.id)),
        bundle: bundleOf(t.id),
      }));
  }

  /** 묶음 소속은 매니페스트가 안다 (toolbox 의 findBundleFor 와 같은 출처). */
  function bundleOf(id: string): string | null {
    const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
    const b = meta[id] && (meta[id] as { bundle?: string }).bundle;
    return b || null;
  }

  /* ── 점수 ─────────────────────────────────────────────────── */

  /**
   * 높을수록 위. 자리를 이름 안에서 어디서 맞췄는지까지 본다 —
   * 「pdf」를 쳤을 때 이름이 「PDF 편집」인 것이 설명에만 pdf 가 있는 것보다 위여야 한다.
   */
  function scoreOf(e: Entry, q: string): Hit | null {
    const nq = norm(q);
    if (!nq) return null;

    const nTitle = norm(e.title);

    if (e.id === nq) return { entry: e, score: 1000, range: null };
    if (nTitle === nq) return { entry: e, score: 900, range: [0, e.title.length] };

    const ti = nTitle.indexOf(nq);
    if (ti === 0) return { entry: e, score: 800 - nTitle.length, range: titleRange(e.title, nq, 0) };
    if (ti > 0) return { entry: e, score: 600 - ti, range: titleRange(e.title, nq, ti) };

    // 초성은 이름을 다 치기 전에 닿는 길이다. 이름 일치보다는 아래, 설명보다는 위.
    if (isChoQuery(nq)) {
      const ci = e.cho.indexOf(nq);
      if (ci === 0) return { entry: e, score: 500, range: null };
      if (ci > 0) return { entry: e, score: 400 - ci, range: null };
    }

    if (e.id.indexOf(nq) >= 0) return { entry: e, score: 350, range: null };
    if (e.alias.indexOf(nq) >= 0) return { entry: e, score: 300, range: null };

    const di = norm(e.desc).indexOf(nq);
    if (di >= 0) return { entry: e, score: 200 - Math.min(di, 150), range: null };

    return null;
  }

  /**
   * 정규화된 자리(공백 제거)를 원래 이름의 자리로 되돌린다.
   * 이것을 안 하면 「글자수 세기」에서 공백 때문에 강조가 한 칸씩 밀린다.
   */
  function titleRange(title: string, nq: string, normStart: number): [number, number] | null {
    let seen = 0;
    let start = -1;
    for (let i = 0; i < title.length; i++) {
      const isSpace = /\s/.test(title[i]);
      if (!isSpace) {
        if (seen === normStart && start < 0) start = i;
        seen++;
        if (start >= 0 && seen === normStart + nq.length) return [start, i + 1];
      }
    }
    return null;
  }

  function search(q: string): Hit[] {
    const hits: Hit[] = [];
    for (const e of entries) {
      const h = scoreOf(e, q);
      if (h) hits.push(h);
    }
    /* 자르는 일은 부르는 쪽이 한다 (TASK-KL-136) — 자리마다 담을 수 있는 줄 수가 다르고,
     * 여기서 미리 자르면 「몇 개 중 몇 개」의 앞 숫자가 진짜 개수가 아니게 된다. */
    hits.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'ko-KR'));
    return hits;
  }

  /* ── 화면 ─────────────────────────────────────────────────── */

  type Instance = {
    root: HTMLElement;
    input: HTMLInputElement;
    list: HTMLElement;
    mode: 'inline' | 'overlay';
    /** id 가 있으면 도구 줄, copy 가 있으면 답 줄 (TASK-KL-110) */
    rows: Array<{ el: HTMLElement; id?: string; copy?: string }>;
    active: number;
    restoreFocus: Element | null;
  };

  let overlay: Instance | null = null;
  let inline: Instance | null = null;

  function esc(s: string): string {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
    );
  }

  /** 일치한 구간만 굵게. 어디가 걸렸는지 눈으로 확인시켜 준다. */
  function titleHtml(title: string, range: [number, number] | null): string {
    if (!range) return esc(title);
    const [a, b] = range;
    return esc(title.slice(0, a)) + '<mark class="kp-mark">' + esc(title.slice(a, b)) + '</mark>' + esc(title.slice(b));
  }

  function iconHtml(icon: string): string {
    if (!icon) return '<span class="kp-icon" aria-hidden="true"></span>';
    return (
      '<span class="kp-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></span>'
    );
  }

  function rowHtml(e: Entry, range: [number, number] | null, badge?: string): string {
    return (
      iconHtml(e.icon) +
      '<span class="kp-row-text">' +
      '<span class="kp-row-title">' + titleHtml(e.title, range) + '</span>' +
      (e.desc ? '<span class="kp-row-desc">' + esc(e.desc) + '</span>' : '') +
      '</span>' +
      (badge ? '<span class="kp-row-badge">' + esc(badge) + '</span>' : '')
    );
  }

  function byId(id: string): Entry | undefined {
    return entries.find((e) => e.id === id);
  }

  function sectionEl(label: string): HTMLElement {
    const h = document.createElement('div');
    h.className = 'kp-section';
    h.setAttribute('role', 'presentation');
    h.textContent = label;
    return h;
  }

  function addRow(inst: Instance, e: Entry, range: [number, number] | null, badge?: string, child = false): void {
    const row = document.createElement('div');
    row.className = 'kp-row' + (child ? ' kp-row-child' : '');
    row.id = 'kp-row-' + inst.mode + '-' + inst.rows.length;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    row.innerHTML = rowHtml(e, range, badge);
    // 마우스로 훑는 동안 키보드 하이라이트가 따라와야 둘이 안 어긋난다.
    row.addEventListener('mousemove', () => setActive(inst, inst.rows.findIndex((r) => r.el === row)));
    row.addEventListener('click', () => choose(inst, e.id));
    inst.list.appendChild(row);
    inst.rows.push({ el: row, id: e.id });
  }

  /**
   * 답 한 줄 (TASK-KL-110). 도구 줄과 같은 모양이되 값이 주인공이라 크게 놓는다.
   * 누르거나 Enter 를 치면 **복사**된다 — 값을 본 다음 하는 일은 대개 붙여넣기다.
   */
  function addAnswerRow(inst: Instance, a: Answer): void {
    const row = document.createElement('div');
    row.className = 'kp-row kp-row-answer';
    row.id = 'kp-row-' + inst.mode + '-' + inst.rows.length;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    row.innerHTML =
      '<span class="kp-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>' +
      '<span class="kp-row-text">' +
      '<span class="kp-answer-value">' + esc(a.value) + '</span>' +
      '<span class="kp-row-desc">' + esc(a.label) + (a.hint ? ' · ' + esc(a.hint) : '') + '</span>' +
      '</span>' +
      '<span class="kp-row-badge">Enter 복사</span>';
    row.addEventListener('mousemove', () => setActive(inst, inst.rows.findIndex((r) => r.el === row)));
    row.addEventListener('click', () => copyAnswer(inst, a.value));
    inst.list.appendChild(row);
    inst.rows.push({ el: row, copy: a.value });
  }

  function copyAnswer(inst: Instance, value: string): void {
    if (typeof Toolbox !== 'undefined' && Toolbox.copyText) {
      void Toolbox.copyText(value, { message: '복사했어요 — ' + value });
    }
    if (inst.mode === 'overlay') close();
  }

  /**
   * 빈 입력일 때 보여 주는 것 — 이번 주 인기 → 내 것 → 최근 → 즐겨찾기 → 둘러보기.
   *
   * 첫 화면에서는 **줄이 스크롤 없이 다 보여야 한다** (TASK-KL-136). 그래서 줄로 나가는
   * 세 가지(내 것·최근·즐겨찾기)는 합쳐서 `INLINE_ROW_MAX` 줄까지만 나간다 — 앞의 것이
   * 자리를 다 쓰면 뒤의 것은 이번 화면에 안 나온다. 칩으로 나가는 둘(인기·둘러보기)은
   * 한 줄씩이라 그 셈에서 빠진다.
   */
  function renderResting(inst: Instance): void {
    const seen = new Set<string>();
    const rowBudget = inst.mode === 'inline' ? INLINE_ROW_MAX : 8 + RECENT_MAX + 8;
    const left = (): number => Math.max(0, rowBudget - inst.rows.length);

    /* 이번 주에 많이 쓴 도구 (TASK-KL-136, 사용자 요청 — 첫 화면 칩 줄에서 여기로 옮겼다).
     * 도구로 가는 길이 화면 여기저기 흩어져 있으면 어디를 봐야 하는지 매번 고르게 된다.
     * 실측이 없으면(서버에 못 닿거나 이번 주에 아무도 안 썼으면) 이 자리는 안 생긴다. */
    /* 넷까지다 — 여섯이면 넓은 화면에서도 칩이 두 줄로 접힌다(실측). 한 줄이 규칙이다. */
    const popular = popularIds
      .map(byId)
      .filter((e): e is Entry => !!e)
      .slice(0, 4);
    if (popular.length) {
      inst.list.appendChild(sectionEl('이번 주에 많이 쓴 도구'));
      inst.list.appendChild(toolChips(inst, popular));
    }

    /* 도구 목록에서 별로 꽂아 둔 것 (TASK-KL-129).
     * 사람이 **직접 고른** 것이라 저절로 쌓이는 「최근」보다 앞에 온다.
     * 「즐겨찾기」와 다르다 — 그쪽은 모든 도구를 자동으로 담는 화면이라 고른 티가 안 난다. */
    const pinned = getPinnedToolIds()
      .map(byId)
      .filter((e): e is Entry => !!e)
      .slice(0, left());
    if (pinned.length) {
      inst.list.appendChild(sectionEl('내 것'));
      pinned.forEach((e) => {
        seen.add(e.id);
        addRow(inst, e, null);
      });
    }

    const recent = getRecent()
      .filter((id) => !seen.has(id))
      .map(byId)
      .filter((e): e is Entry => !!e)
      .slice(0, Math.min(RECENT_MAX, left()));
    if (recent.length) {
      inst.list.appendChild(sectionEl('최근'));
      recent.forEach((e) => {
        seen.add(e.id);
        addRow(inst, e, null);
      });
    }

    const favs = getFavoriteToolIds()
      .map(byId)
      .filter((e): e is Entry => !!e && !seen.has(e.id))
      .slice(0, Math.min(8, left()));
    if (favs.length) {
      inst.list.appendChild(sectionEl('즐겨찾기'));
      favs.forEach((e) => {
        seen.add(e.id);
        addRow(inst, e, null);
      });
    }

    // 둘러보기는 **언제나** 있다. 예전에는 최근·즐겨찾기가 비었을 때만 보여 줬는데,
    // 그러면 도구를 한 번이라도 쓴 순간 둘러볼 길이 통째로 사라졌다(실측: 최근이 생기자
    // 칩 4개 → 0개). 「이름을 알아야만 닿는다」가 되는 지점이 바로 여기였다.
    inst.list.appendChild(sectionEl('둘러보기'));
    inst.list.appendChild(browseChips(inst));

    setActive(inst, inst.rows.length ? 0 : -1);
  }

  /** 도구 칩 한 줄 — 줄(row)보다 훨씬 낮아서 좁은 자리에 여럿 담긴다 (TASK-KL-136). */
  function toolChips(inst: Instance, list: Entry[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'kp-browse kp-browse-tools';
    wrap.setAttribute('role', 'presentation');
    list.forEach((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kp-browse-chip';
      b.textContent = e.title;
      b.title = e.desc || e.title;
      b.addEventListener('click', () => choose(inst, e.id));
      wrap.appendChild(b);
    });
    return wrap;
  }

  /** 갈래 칩 한 줄 — 「여기에 이만큼 있다」 + 그 갈래로 들어가는 문. */
  function browseChips(inst: Instance): HTMLElement {
    const cats = typeof Toolbox !== 'undefined' && Toolbox.getCategories ? Toolbox.getCategories() : [];
    const wrap = document.createElement('div');
    wrap.className = 'kp-browse';
    wrap.setAttribute('role', 'presentation');
    cats.forEach((c) => {
      const n = entries.filter((e) => e.category === c.id).length;
      if (!n) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kp-browse-chip';
      b.innerHTML = esc(c.label) + ' <span class="kp-browse-n">' + n + '</span>';
      b.addEventListener('click', () => {
        /* 갈래 하나가 123줄인 것도 있다 — 첫 화면에 박힌 칸에 그걸 펼치면 화면이 통째로
         * 목록이 된다 (TASK-KL-136). 펼치는 일은 **떠오르는 창**이 맡는다: 거기는 찾으려고
         * 연 창이라 길어도 되고 스크롤도 제자리다. 첫 화면 칸은 짧게 유지된다. */
        if (inst.mode === 'inline') {
          open();
          if (overlay) renderCategory(overlay, c.id, c.label);
          return;
        }
        inst.input.value = '';
        renderCategory(inst, c.id, c.label);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  /**
   * 한 갈래 전체를 펼친다.
   *
   * 그냥 이름순으로 늘어놓으면 「도구」 갈래가 123줄짜리 벽이 된다 — 그중 대부분은
   * 묶음 안의 탭이라, 부모와 떨어져 나오면 무엇의 일부인지 알 수 없다. 그래서
   * **부모 밑에 자식을 붙여** 낸다. 눈으로 훑을 때 묶음이 한 덩어리로 읽힌다.
   */
  function renderCategory(inst: Instance, catId: string, label: string): void {
    resetList(inst);

    // 되돌아갈 길. 이게 없으면 갈래를 한 번 누른 사람이 막다른 골목에 갇힌다
    // (입력을 지워도 안 돌아왔다 — 실측으로 확인하고 넣었다).
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'kp-back';
    back.innerHTML = '<span aria-hidden="true">←</span> 둘러보기';
    back.addEventListener('click', () => render(inst));
    inst.list.appendChild(back);

    const inCat = entries.filter((e) => e.category === catId);
    const byKo = (a: Entry, b: Entry) => a.title.localeCompare(b.title, 'ko-KR');
    const parents = inCat.filter((e) => !e.bundle).sort(byKo);
    const kids = new Map<string, Entry[]>();
    inCat.forEach((e) => {
      if (!e.bundle) return;
      const arr = kids.get(e.bundle) || [];
      arr.push(e);
      kids.set(e.bundle, arr);
    });

    inst.list.appendChild(sectionEl(label + ' ' + inCat.length));
    parents.forEach((p) => {
      addRow(inst, p, null);
      (kids.get(p.id) || []).sort(byKo).forEach((k) => addRow(inst, k, null, undefined, true));
      kids.delete(p.id);
    });
    // 부모가 이 갈래에 없는 자식(부모가 다른 갈래인 경우) — 빠뜨리지 않는다.
    [...kids.values()].flat().sort(byKo).forEach((k) => addRow(inst, k, null));

    setActive(inst, inst.rows.length ? 0 : -1);
  }

  function resetList(inst: Instance): void {
    inst.list.innerHTML = '';
    inst.rows = [];
    inst.active = -1;
  }


  /* ── 말로 부리기 (TASK-KL-196 E) ─────────────────────────────────────────
   *
   * 이름으로 못 찾은 그 자리에서만 뜬다. **누를 때 데려온다**(`src/ask.ts`) — 첫 화면 부팅
   * JS 천장(40KB gz)에 이미 닿아 있어서, 눌러 본 사람만 받는 것이 맞다.
   */
  function askWire(inst: Instance, host: HTMLElement, q: string): void {
    const button = host.querySelector<HTMLButtonElement>('.kp-ask');
    if (!button) return;
    if (!(window as any).KarmoAccount?.apiBase) {
      button.remove(); // 서버가 없으면 이 길 자체가 없다 — 눌러도 아무 일 없는 단추가 제일 나쁘다
      return;
    }
    const run = (): void => {
      button.disabled = true;
      button.textContent = '고르는 중…';
      /* `?.` 로 부르면 **묶음이 안 만들어진다** — 빌드가 부르는 곳을 글자로 찾는데
         (`entry-points.mjs`) 그 모양은 안 잡힌다. 잡히는 모양으로 적고 있는지는 위에서 본다. */
      const bring = Toolbox.ensureScript;
      if (!bring) return;
      void Toolbox.ensureScript('root/ask')
        .then(() => (window as any).KarmoAsk?.run({ host, q, close, byId, esc, go: (id: string) => Toolbox.switchPage(id) }))
        .catch(() => {
          button.disabled = false;
          button.textContent = '하려는 일로 찾기 →';
        });
    };
    button.addEventListener('click', run);
    /* 빈 자리에서 Enter = 같은 뜻. 이미 고른 물음이면 그 도구로 바로 간다(서버를 또 안 두들긴다). */
    inst.input.onkeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const known = (window as any).KarmoAsk?.known?.(q);
      if (known) {
        close();
        Toolbox.switchPage(known);
        return;
      }
      run();
    };
  }

  function render(inst: Instance): void {
    const q = inst.input.value.trim();
    resetList(inst);
    /* 「말로 찾기」가 걸어 둔 Enter 는 **그 빈 자리에서만** 산다. 안 지우면 결과가 나온
       뒤에도 Enter 가 그쪽으로 가서, 첫 줄을 고르는 평소 동작이 조용히 사라진다. */
    inst.input.onkeydown = null;

    if (!q) {
      renderResting(inst);
      announce(inst);
      return;
    }

    // 답이 있으면 맨 위에 (TASK-KL-110). 도구 줄은 그대로 아래에 남는다 —
    // 더 손보고 싶으면 그리로 가면 된다.
    const answers = answersFor(q);
    if (answers.length) {
      inst.list.appendChild(sectionEl('답'));
      answers.forEach((a) => addAnswerRow(inst, a));
    }

    /* 첫 화면 칸은 결과도 짧게 자른다 (TASK-KL-136) — 40줄이 나오면 그 자리에서 스크롤이
     * 생기고, 화면이 아래로 한참 길어진다. 잘린 것은 아래 「전체 목록에서 찾아보기 →」가 받는다. */
    const cap = inst.mode === 'inline' ? INLINE_RESULT_MAX : RESULT_MAX;
    const all = search(q);
    const hits = all.slice(0, cap);
    if (!hits.length && !answers.length) {
      // 안 나왔을 때 막다른 길로 끝내지 않는다 — 목록 페이지가 별칭·본문까지 훑는다.
      const empty = document.createElement('div');
      empty.className = 'kp-empty';
      empty.innerHTML =
        '<p>「' + esc(q) + '」 로 찾은 도구가 없어요.</p>' +
        '<button type="button" class="kp-ask">하려는 일로 찾기 →</button>' +
        '<a class="kp-empty-link" href="/karmolab/t/?q=' + encodeURIComponent(q) + '">전체 목록에서 찾아보기 →</a>';
      inst.list.appendChild(empty);
      askWire(inst, empty, q);
      announce(inst);
      return;
    }

    /* 답을 낸 그 도구는 **반드시** 아래에 세운다.
     * 「24px to rem」 같은 식은 도구 이름과 안 겹쳐서 찾기에는 하나도 안 걸린다 — 그러면
     * 답만 덩그러니 남고 「더 손보러 갈 길」이 막힌다(검사가 이걸 잡았다). 답은 한 줄짜리
     * 질문에만 대답하므로, 더 하고 싶은 사람에게는 도구가 필요하다. */
    const extra: Entry[] = [];
    const shown = new Set(hits.map((h) => h.entry.id));
    for (const a of answers) {
      if (shown.has(a.toolId)) continue;
      const e = byId(a.toolId);
      if (e) {
        shown.add(a.toolId);
        extra.push(e);
      }
    }

    if (hits.length || extra.length) {
      // 답이 위에 있으면 그 아래 도구 줄에 이름표를 달아 준다 — 안 그러면 답과 도구가
      // 한 덩어리로 보여, 첫 줄을 눌렀을 때 무엇이 일어날지 헷갈린다.
      if (answers.length) inst.list.appendChild(sectionEl('도구'));
      extra.forEach((e) => addRow(inst, e, null));
      hits.forEach((h) => addRow(inst, h.entry, h.range));
    }
    /* 잘라낸 것이 있으면 **말해 준다** — 안 그러면 「이게 전부」로 읽힌다 (TASK-KL-136).
     * 첫 화면 칸에서는 ⌘K 창이 이어받고, 그 창마저 넘치면 전체 목록 페이지로 보낸다. */
    if (all.length > hits.length) {
      const query = inst.input.value;
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'kp-more';
      more.textContent = '결과 ' + all.length + '개 중 ' + hits.length + '개 · 더 보기 →';
      more.addEventListener('click', () => {
        if (inst.mode === 'inline') {
          open();
          if (overlay) {
            overlay.input.value = query;
            render(overlay);
          }
          return;
        }
        location.href = '/karmolab/t/?q=' + encodeURIComponent(query);
      });
      inst.list.appendChild(more);
    }
    setActive(inst, 0);
    announce(inst);
  }

  /** 화면을 못 보는 사람에게 결과 수가 바뀐 것을 알린다. */
  function announce(inst: Instance): void {
    const live = inst.root.querySelector('.kp-live');
    if (live) live.textContent = inst.rows.length ? inst.rows.length + '개 결과' : '결과 없음';
  }

  /**
   * 포커스는 입력이 계속 쥐고, 목록에서는 표시만 옮긴다 (ARIA combobox).
   * 진짜 포커스를 목록으로 옮기면 타이핑이 끊긴다.
   */
  function setActive(inst: Instance, i: number): void {
    if (inst.active >= 0 && inst.rows[inst.active]) {
      inst.rows[inst.active].el.classList.remove('is-active');
      inst.rows[inst.active].el.setAttribute('aria-selected', 'false');
    }
    inst.active = i;
    if (i >= 0 && inst.rows[i]) {
      const row = inst.rows[i].el;
      row.classList.add('is-active');
      row.setAttribute('aria-selected', 'true');
      inst.input.setAttribute('aria-activedescendant', row.id);
      row.scrollIntoView({ block: 'nearest' });
    } else {
      inst.input.removeAttribute('aria-activedescendant');
    }
  }

  function move(inst: Instance, delta: number): void {
    if (!inst.rows.length) return;
    const n = inst.rows.length;
    setActive(inst, (inst.active + delta + n) % n);
  }

  function choose(inst: Instance, id: string): void {
    if (inst.mode === 'overlay') close();
    if (typeof Toolbox !== 'undefined') Toolbox.switchPage(id);
  }

  /** 지금 짚은 줄을 실행한다 — 도구면 열고, 답이면 복사한다. */
  function activate(inst: Instance, i: number): void {
    const r = inst.rows[i];
    if (!r) return;
    if (r.copy !== undefined) copyAnswer(inst, r.copy);
    else if (r.id) choose(inst, r.id);
  }

  function onKey(inst: Instance, e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(inst, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(inst, -1);
    } else if (e.key === 'Enter') {
      if (inst.active >= 0 && inst.rows[inst.active]) {
        e.preventDefault();
        activate(inst, inst.active);
      }
    } else if (e.key === 'Escape') {
      if (inst.mode === 'overlay') {
        e.preventDefault();
        close();
      } else if (inst.input.value) {
        // 첫 화면에서는 닫을 것이 없다 — 대신 입력을 비운다.
        e.preventDefault();
        inst.input.value = '';
        render(inst);
      }
    }
  }

  /** 입력 + 목록 한 벌. 첫 화면과 떠오르는 창이 **같은 것**을 쓴다. */
  function buildSurface(mode: 'inline' | 'overlay'): Instance {
    const root = document.createElement('div');
    /* 첫 화면 쪽은 **만들 때부터 접어 둔다** (TASK-KL-201 후속).
     *
     * 접는 일은 아래에서 `collapse()` 가 하는데, 그건 목록을 다 만든 **뒤에** 불린다. 그래서
     * 한 프레임 동안 목록이 펼쳐진 채로 그려졌다가 접힌다 — 실측: 팔레트가 429px 로 나타났다
     * 65px 로 줄고, 그 바람에 아래 카드 줄이 **364px 위로 튀었다**(밀림 0.075, 전체의 대부분).
     * 클래스를 처음부터 달아 두면 펼쳐진 순간 자체가 없다. */
    root.className = 'kp kp-' + mode + (mode === 'inline' ? ' kp-collapsed' : '');

    const box = document.createElement('div');
    box.className = 'kp-box';

    const inputWrap = document.createElement('div');
    inputWrap.className = 'kp-input-wrap';
    inputWrap.innerHTML =
      '<svg class="kp-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'kp-input';
    input.placeholder = '무엇을 하시겠어요?';
    input.autocomplete = 'off';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-label', '도구 찾기');
    input.setAttribute('aria-controls', 'kp-list-' + mode);
    inputWrap.appendChild(input);

    if (mode === 'inline') {
      const kbd = document.createElement('kbd');
      kbd.className = 'kp-kbd';
      // 여기서 한 번만 알려 주면 된다. 다른 화면에서는 헤더에 아무것도 안 띄운다.
      kbd.textContent = isMac() ? '⌘K' : 'Ctrl K';
      inputWrap.appendChild(kbd);
    } else {
      /* 눈에 보이는 닫기 (TASK-KL-101).
       * 지금까지 닫는 길은 Esc 키와 바깥 누르기뿐이었다. 폰에는 Esc 가 없고, 화면이 좁아
       * 바깥이 거의 안 보인다 — 열고 나면 **검색을 해야만 빠져나올 수 있었다.**
       * 키보드에만 있는 조작은 폰에서는 없는 기능이다. */
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'kp-close';
      closeBtn.setAttribute('aria-label', '찾기 닫기');
      closeBtn.title = '닫기 (Esc)';
      closeBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      closeBtn.addEventListener('click', () => close());
      inputWrap.appendChild(closeBtn);
    }

    const list = document.createElement('div');
    list.className = 'kp-list';
    list.id = 'kp-list-' + mode;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '찾은 도구');

    const live = document.createElement('div');
    live.className = 'kp-live';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('role', 'status');

    box.appendChild(inputWrap);
    box.appendChild(list);
    box.appendChild(live);
    root.appendChild(box);

    const inst: Instance = { root, input, list, mode, rows: [], active: -1, restoreFocus: null };

    input.addEventListener('input', () => render(inst));
    input.addEventListener('keydown', (e) => onKey(inst, e));

    /* 첫 화면에서는 **누르기 전까지 목록을 접어 둔다** (TASK-KL-129, 사용자 요청).
     * 예전에는 열린 채로 있어서 첫 화면의 절반을 목록이 차지했다 — 아직 아무것도 안 물어봤는데
     * 답이 먼저 펼쳐져 있는 셈이다. 찾을 마음이 있을 때(입력을 누를 때) 펼친다.
     * ⌘K 로 뜨는 쪽은 그대로 열려 있다 — 그건 찾으려고 연 것이다. */
    if (mode === 'inline') {
      const collapse = (): void => {
        if (inst.input.value) return;         // 친 글이 있으면 결과를 접지 않는다
        root.classList.add('kp-collapsed');
        input.setAttribute('aria-expanded', 'false');
      };
      const expand = (): void => {
        root.classList.remove('kp-collapsed');
        input.setAttribute('aria-expanded', 'true');
      };
      collapse();
      input.addEventListener('focus', expand);
      input.addEventListener('blur', collapse);
      /* 목록을 누를 때 입력에서 포커스가 빠지면 **접히면서 클릭이 사라진다**.
       * 누르는 순간의 기본 동작(포커스 이동)만 막으면 포커스는 입력에 남고 클릭은 그대로 간다. */
      list.addEventListener('mousedown', (e) => e.preventDefault());
    }

    return inst;
  }

  function isMac(): boolean {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  }

  /* ── 바깥 통로 ─────────────────────────────────────────────── */

  /** 첫 화면 안에 박아 넣는다 (TASK-KL-099 — 여기가 기본 진입로다). */
  function mountInline(container: HTMLElement): void {
    if (!entries.length) buildIndex();
    void loadAliases().then(() => {
      if (inline && !inline.input.value) render(inline);
    });
    inline = buildSurface('inline');
    container.appendChild(inline.root);
    render(inline);
  }

  /** 첫 화면이 실제로 보일 때 포커스를 준다. 화면 밖에서 포커스를 주면 페이지가 튄다. */
  function focusInline(): void {
    if (!inline) return;
    // 손가락으로 쓰는 화면에서는 자동 포커스가 키보드를 밀어 올려 화면을 반쯤 덮는다.
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
    inline.input.focus();
  }

  function isOpen(): boolean {
    return !!overlay;
  }

  function open(): void {
    if (overlay) {
      overlay.input.select();
      return;
    }
    if (!entries.length) buildIndex();
    void loadAliases();

    const inst = buildSurface('overlay');
    inst.restoreFocus = document.activeElement;

    const scrim = document.createElement('div');
    scrim.className = 'kp-scrim';
    scrim.addEventListener('mousedown', (e) => {
      if (e.target === scrim) close();
    });
    scrim.appendChild(inst.root);
    document.body.appendChild(scrim);
    inst.root.dataset.scrim = '1';
    overlay = inst;

    render(inst);
    inst.input.focus();
  }

  function close(): void {
    if (!overlay) return;
    const restore = overlay.restoreFocus;
    const scrim = overlay.root.parentElement;
    if (scrim && scrim.classList.contains('kp-scrim')) scrim.remove();
    else overlay.root.remove();
    overlay = null;
    // 열기 전에 보던 자리로 되돌려 준다 — 안 그러면 키보드 사용자가 문서 맨 위로 떨어진다.
    if (restore && typeof (restore as HTMLElement).focus === 'function') {
      (restore as HTMLElement).focus();
    }
  }

  function toggle(): void {
    if (overlay) close();
    else open();
  }

  /**
   * 이번 주에 많이 쓴 도구를 넘겨받는다 (TASK-KL-136). 실측 통계를 받아 오는 곳은
   * `toolbox.fillHomePulse` 한 곳이다 — 같은 것을 여기서 또 물으면 「도구를 열었다」를 세는
   * 서버를 두 번 두드리게 된다. 쉬는 화면(빈 입력)일 때만 다시 그린다.
   */
  function setPopular(ids: string[]): void {
    popularIds = Array.isArray(ids) ? ids.filter((x) => typeof x === 'string') : [];
    if (!entries.length) buildIndex();
    if (inline && !inline.input.value) render(inline);
    if (overlay && !overlay.input.value) render(overlay);
  }

  /** 도구가 새로 등록되면(지연 로드) 인덱스를 다시 만든다. */
  function refresh(): void {
    buildIndex();
    if (inline) render(inline);
    if (overlay) render(overlay);
  }

  return { mountInline, focusInline, open, close, toggle, isOpen, noteOpen, refresh, getRecent, setPopular };
})();

(window as unknown as { KarmoPalette: typeof KarmoPalette }).KarmoPalette = KarmoPalette;

