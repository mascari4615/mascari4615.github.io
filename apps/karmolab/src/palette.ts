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
};

type Hit = {
  entry: Entry;
  score: number;
  /** 이름에서 일치한 구간 [시작, 끝) — 강조에 쓴다 */
  range: [number, number] | null;
};

const RECENT_KEY = 'toolbox_recent_tools';
const FAVORITES_KEY = 'toolbox_favorites';
const RECENT_MAX = 8;
const RESULT_MAX = 40;

const CHO_TABLE = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/** 한글 음절을 초성으로. 한글이 아니면 그대로 (영문·숫자도 같이 쳐질 수 있으므로). */
function toCho(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) out += CHO_TABLE[Math.floor(code / 588)];
    else out += ch;
  }
  return out;
}

/** 찾기 비교용 정규화 — 대소문자·공백을 지운다. 「글자수 세기」와 「글자수세기」가 같아야 한다. */
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, '');
}

/** 입력이 초성만으로 이뤄졌나 (「ㄱㅈㅅ」). 그럴 때만 초성 대조를 켠다 —
 *  안 그러면 「사」가 「ㅅ」으로 잘못 걸린다. */
function isChoQuery(q: string): boolean {
  return /^[ㄱ-ㅎ]+$/.test(q);
}

const KarmoPalette = (() => {
  let entries: Entry[] = [];
  let aliasMap: Record<string, string> = {};
  let aliasLoaded = false;

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
      }));
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
    hits.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'ko-KR'));
    return hits.slice(0, RESULT_MAX);
  }

  /* ── 화면 ─────────────────────────────────────────────────── */

  type Instance = {
    root: HTMLElement;
    input: HTMLInputElement;
    list: HTMLElement;
    mode: 'inline' | 'overlay';
    rows: Array<{ el: HTMLElement; id: string }>;
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

  function addRow(inst: Instance, e: Entry, range: [number, number] | null, badge?: string): void {
    const row = document.createElement('div');
    row.className = 'kp-row';
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

  /** 빈 입력일 때 보여 주는 것 — 최근 → 즐겨찾기 → 둘러보기. */
  function renderResting(inst: Instance): void {
    const seen = new Set<string>();

    const recent = getRecent()
      .map(byId)
      .filter((e): e is Entry => !!e)
      .slice(0, RECENT_MAX);
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
      .slice(0, 8);
    if (favs.length) {
      inst.list.appendChild(sectionEl('즐겨찾기'));
      favs.forEach((e) => {
        seen.add(e.id);
        addRow(inst, e, null);
      });
    }

    // 아직 아무것도 안 써 본 사람에게는 최근도 즐겨찾기도 비어 있다.
    // 그때 빈 화면을 주면 안 된다 — 갈래별 개수로 「여기에 이만큼 있다」를 보여 준다.
    if (!recent.length && !favs.length) {
      const cats =
        typeof Toolbox !== 'undefined' && Toolbox.getCategories ? Toolbox.getCategories() : [];
      inst.list.appendChild(sectionEl('둘러보기'));
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
        // 갈래를 누르면 그 갈래만 나열한다 — 「무엇이 있는지 모르겠다」의 출구.
        b.addEventListener('click', () => {
          inst.input.value = '';
          renderCategory(inst, c.id, c.label);
        });
        wrap.appendChild(b);
      });
      inst.list.appendChild(wrap);
    }

    setActive(inst, inst.rows.length ? 0 : -1);
  }

  function renderCategory(inst: Instance, catId: string, label: string): void {
    resetList(inst);
    const list = entries
      .filter((e) => e.category === catId)
      .sort((a, b) => a.title.localeCompare(b.title, 'ko-KR'));
    inst.list.appendChild(sectionEl(label + ' ' + list.length));
    list.forEach((e) => addRow(inst, e, null));
    setActive(inst, inst.rows.length ? 0 : -1);
  }

  function resetList(inst: Instance): void {
    inst.list.innerHTML = '';
    inst.rows = [];
    inst.active = -1;
  }

  function render(inst: Instance): void {
    const q = inst.input.value.trim();
    resetList(inst);

    if (!q) {
      renderResting(inst);
      announce(inst);
      return;
    }

    const hits = search(q);
    if (!hits.length) {
      // 안 나왔을 때 막다른 길로 끝내지 않는다 — 목록 페이지가 별칭·본문까지 훑는다.
      const empty = document.createElement('div');
      empty.className = 'kp-empty';
      empty.innerHTML =
        '<p>「' + esc(q) + '」 로 찾은 도구가 없어요.</p>' +
        '<a class="kp-empty-link" href="/karmolab/t/?q=' + encodeURIComponent(q) + '">전체 목록에서 찾아보기 →</a>';
      inst.list.appendChild(empty);
      announce(inst);
      return;
    }

    hits.forEach((h) => addRow(inst, h.entry, h.range));
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
        choose(inst, inst.rows[inst.active].id);
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
    root.className = 'kp kp-' + mode;

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

  /** 도구가 새로 등록되면(지연 로드) 인덱스를 다시 만든다. */
  function refresh(): void {
    buildIndex();
    if (inline) render(inline);
    if (overlay) render(overlay);
  }

  return { mountInline, focusInline, open, close, toggle, isOpen, noteOpen, refresh, getRecent };
})();

(window as unknown as { KarmoPalette: typeof KarmoPalette }).KarmoPalette = KarmoPalette;
