/**
 * 세계 도감 (TASK-KL-158) — WM 의 설정을 웹에서 읽는 자리.
 *
 * 이 화면은 **WM 문서의 모양을 모른다.** 수집기(`scripts/build-worldbook.mjs`)가 개발 노트의
 * 머리말(frontmatter)에 있는 키를 그대로 실어 주고, 여기서는 있는 것을 순서대로 그린다.
 * 그래서 WM 이 칸을 하나 늘려도 이 파일은 고칠 게 없다 — 다음 배포에 새 칸이 그냥 뜬다.
 * 없는 칸은 조용히 빠진다(문서 하나가 미완성이어도 도감 전체는 산다).
 *
 * 종류(탭)도 열린 집합이다 — 새 폴더가 생기면 새 탭이 자동으로 생긴다.
 *
 * 무엇이 공개되는지는 memo/wm/design/web-policy.json 이 정한다(여기서는 못 정한다).
 */
import { renderMarkdown, escapeHtml } from '../community-markdown';

interface WorldDoc {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  summary: string;
  tags: string[];
  updated: string;
  fields: Record<string, unknown>;
  source: string;
  visibility: 'public' | 'summary';
  body?: string;
}

interface DevlogDay {
  date: string;
  entries: Array<{ sha: string; type: string; typeLabel: string; scope: string; text: string }>;
  quiet: number;
  more: number;
}

interface Devlog {
  source: string;
  counts: { commits: number; days: number; shown: number };
  days: DevlogDay[];
}

interface WorldBook {
  generatedAt: string;
  counts: { docs: number; kinds: number; privateSkipped: number };
  kinds: Array<{ id: string; label: string; count: number }>;
  docs: WorldDoc[];
}

(function (): void {
  const DATA_URL = '/apps/karmolab/data/worldbook.json';
  const DEVLOG_URL = '/apps/karmolab/data/devlog.json';
  const TASKS_URL = '/apps/karmolab/data/wm-tasks.json';

  /** 머리말 키 → 사람이 읽는 이름. 여기 없는 키도 **그대로** 보여 준다(모르는 칸도 그린다). */
  const FIELD_LABEL: Record<string, string> = {
    status: '상태',
    updated: '고친 날',
    tags: '꼬리표',
    aliases: '다른 이름',
    owner: '담당',
    depends: '기대는 것',
    parent: '윗 문서',
  };

  let book: WorldBook | null = null;
  let loadError = '';

  async function ensureBook(): Promise<WorldBook | null> {
    if (book) return book;
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      book = (await res.json()) as WorldBook;
      loadError = '';
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      book = null;
    }
    return book;
  }

  let devlog: Devlog | null = null;
  let devlogError = '';

  async function ensureDevlog(): Promise<Devlog | null> {
    if (devlog) return devlog;
    try {
      const res = await fetch(DEVLOG_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      devlog = (await res.json()) as Devlog;
      devlogError = '';
    } catch (err) {
      devlogError = err instanceof Error ? err.message : String(err);
      devlog = null;
    }
    return devlog;
  }

  /** 소식 — 게임 저장소의 커밋이 그대로 「오늘 뭐가 달라졌나」가 된다. */
  function newsHtml(log: Devlog): string {
    return `
      <p class="wb-lead">개발 저장소에 올라간 변화입니다 — 최근 ${log.counts.days}일 · ${log.counts.shown}건.</p>
      <div class="wm-news">${log.days
        .map(
          (d) => `<section class="wm-news-day">
            <h3 class="wm-news-date">${escapeHtml(d.date)}</h3>
            <ul class="wm-news-list">${d.entries
              .map(
                (e) => `<li><span class="wm-news-kind wm-news-${escapeHtml(e.type || 'etc')}">${escapeHtml(e.typeLabel)}</span>
                  <span class="wm-news-text">${escapeHtml(e.text)}</span></li>`
              )
              .join('')}</ul>
            ${d.more > 0 || d.quiet > 0
              ? `<p class="wm-news-quiet">그 밖에 ${d.more > 0 ? `변화 ${d.more}건 · ` : ''}손질 ${d.quiet}건</p>`
              : ''}
          </section>`
        )
        .join('')}</div>`;
  }

  interface TaskGroup {
    status: string;
    label: string;
    count: number;
    items: Array<{ id: string; title: string; status: string; statusLabel: string; priority: string }>;
  }

  interface TaskBoard {
    counts: { docs: number; groups: number; shown: number; hidden: number };
    groups: TaskGroup[];
  }

  let board: TaskBoard | null = null;
  let boardError = '';

  async function ensureBoard(): Promise<TaskBoard | null> {
    if (board) return board;
    try {
      const res = await fetch(TASKS_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      board = (await res.json()) as TaskBoard;
      boardError = '';
    } catch (err) {
      boardError = err instanceof Error ? err.message : String(err);
      board = null;
    }
    return board;
  }

  /** 만드는 중 — 개발 노트의 TASK 머리말이 그대로 공개 보드가 된다(본문은 안 나간다). */
  function boardHtml(b: TaskBoard): string {
    return `
      <p class="wb-lead">지금 만들고 있는 것들입니다 — ${b.counts.shown}건.</p>
      <div class="wm-board">${b.groups
        .map(
          (g) => `<section class="wm-board-group">
            <h3 class="wm-board-status">${escapeHtml(g.label)} <span class="wb-chip">${g.count}</span></h3>
            <ul class="wm-board-list">${g.items
              .map(
                (t) => `<li><span class="wm-board-id">${escapeHtml(t.id)}</span>
                  <span class="wm-board-title">${escapeHtml(t.title)}</span></li>`
              )
              .join('')}</ul>
          </section>`
        )
        .join('')}</div>`;
  }

  /* ── 공간 지도 (TASK-KL-159) ─────────────────────────────────────────────────────────
   * 정본은 문서 안의 **표**다(`world/spaces.md`). 표의 칸 이름을 모른 채 읽는다 —
   * 첫 칸을 이름으로 쓰고 나머지는 있는 대로 붙인다. 표 모양이 바뀌어 못 읽으면
   * 지도 자리에 그 문서로 가는 길만 남긴다(빈 화면 대신).
   */
  interface TableRow { cells: string[]; }

  function firstTable(body: string): { head: string[]; rows: TableRow[] } {
    const lines = body.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*\|/.test(lines[i])) continue;
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) continue;
      const cut = (l: string): string[] =>
        l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cut(lines[i]);
      const rows: TableRow[] = [];
      for (let j = i + 2; j < lines.length; j++) {
        if (!/^\s*\|/.test(lines[j])) break;
        rows.push({ cells: cut(lines[j]) });
      }
      return { head, rows };
    }
    return { head: [], rows: [] };
  }

  function mapHtml(loaded: WorldBook): string {
    const spaces = loaded.docs.find((d) => d.id === 'world/spaces');
    const home = loaded.docs.find((d) => d.id === 'world/home-structure');
    const table = spaces?.body ? firstTable(spaces.body) : { head: [], rows: [] };

    if (table.rows.length === 0) {
      return `<p class="wb-empty">공간 표를 읽지 못했습니다. ${
        spaces ? `<a href="/karmolab/?wb=${encodeURIComponent(spaces.id)}#wm">원문 보기</a>` : '원문도 아직 없습니다.'
      }</p>`;
    }

    const cards = table.rows
      .map((r) => {
        const name = r.cells[0] || '';
        const rest = r.cells.slice(1).filter((c) => c !== '');
        return `<article class="wm-place">
            <h4>${escapeHtml(name)}</h4>
            ${rest.map((c) => `<p>${escapeHtml(c)}</p>`).join('')}
          </article>`;
      })
      .join('');

    const homeRooms = home?.body ? firstTable(home.body) : { head: [], rows: [] };
    const rooms = homeRooms.rows
      .map((r) => `<li><b>${escapeHtml(r.cells[0] || '')}</b> ${escapeHtml(r.cells[1] || '')}</li>`)
      .join('');

    return `
      <p class="wb-lead">이 세계에 있는 곳들입니다. 표가 늘어나면 여기도 늘어납니다.</p>
      <div class="wm-places">${cards}</div>
      ${rooms
        ? `<section class="wm-in-block">
             <h3>욘의 집 안</h3>
             <ul class="wm-rooms">${rooms}</ul>
             ${home ? `<p class="wb-source"><a href="/karmolab/?wb=${encodeURIComponent(home.id)}#wm">집 구조 원문 →</a></p>` : ''}
           </section>`
        : ''}
      ${spaces ? `<p class="wb-source"><a href="/karmolab/?wb=${encodeURIComponent(spaces.id)}#wm">공간 원문 →</a></p>` : ''}`;
  }

  function fieldValueHtml(value: unknown): string {
    if (Array.isArray(value)) {
      return value.map((v) => `<span class="wb-chip">${escapeHtml(v)}</span>`).join(' ');
    }
    if (value !== null && typeof value === 'object') {
      return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
    }
    return escapeHtml(value);
  }

  function detailHtml(doc: WorldDoc): string {
    const fields = Object.entries(doc.fields).filter(([, v]) => v !== '' && v != null);
    const rows = fields
      .map(
        ([k, v]) =>
          `<div class="wb-field"><dt>${escapeHtml(FIELD_LABEL[k] || k)}</dt><dd>${fieldValueHtml(v)}</dd></div>`
      )
      .join('');
    // 문서의 첫 큰제목은 곧 이 문서의 제목이다 — 위에 이미 걸었으니 본문에서는 뺀다(두 번 안 보이게).
    const body = doc.body ? doc.body.replace(/^#\s+.+\n+/, '') : '';
    const bodyHtml = body
      ? renderMarkdown(body)
      : `<p class="wb-locked">이 문서는 <b>제목과 한 줄</b>만 공개돼 있습니다. (아직 다듬는 중이거나, 이야기를 미리 알려 주지 않으려는 것)</p>`;
    return `
      <article class="wb-detail">
        <button type="button" class="btn btn-ghost wb-back">← 목록</button>
        <p class="wb-detail-kind">${escapeHtml(doc.kindLabel)}</p>
        <h2 class="wb-detail-title">${escapeHtml(doc.title)}</h2>
        ${doc.summary ? `<p class="wb-detail-lead">${escapeHtml(doc.summary)}</p>` : ''}
        ${rows ? `<dl class="wb-fields">${rows}</dl>` : ''}
        <div class="wb-body">${bodyHtml}</div>
        <p class="wb-source">출처: <code>${escapeHtml(doc.source)}</code></p>
      </article>`;
  }

  function cardHtml(doc: WorldDoc): string {
    return `
      <button type="button" class="wb-card" data-id="${escapeHtml(doc.id)}">
        <span class="wb-card-kind">${escapeHtml(doc.kindLabel)}</span>
        <span class="wb-card-title">${escapeHtml(doc.title)}</span>
        ${doc.summary ? `<span class="wb-card-sum">${escapeHtml(doc.summary)}</span>` : ''}
        ${doc.tags.length > 0 ? `<span class="wb-card-tags">${doc.tags.slice(0, 4).map((t) => `<span class="wb-chip">${escapeHtml(t)}</span>`).join('')}</span>` : ''}
      </button>`;
  }

  function matches(doc: WorldDoc, q: string): boolean {
    if (q === '') return true;
    const hay = [doc.title, doc.summary, doc.tags.join(' '), doc.id, doc.body || '']
      .join('\n')
      .toLowerCase();
    return hay.includes(q);
  }

  /** 소개 탭 — 이야기에 들어오는 순서대로. 없는 인물은 그 칸만 빠진다. */
  const CAST_ORDER = ['characters/yawn', 'characters/ring', 'characters/alisa', 'characters/fourth'];

  function sectionOf(doc: WorldDoc | undefined, headingRe: RegExp): string {
    if (!doc || !doc.body) return '';
    const lines = doc.body.split('\n');
    let start = -1;
    let level = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = /^(#{2,4})\s+(.+)$/.exec(lines[i]);
      if (!m) continue;
      if (start < 0 && headingRe.test(m[2])) { start = i + 1; level = m[1].length; continue; }
      if (start >= 0 && m[1].length <= level) return lines.slice(start, i).join('\n').trim();
    }
    return start >= 0 ? lines.slice(start).join('\n').trim() : '';
  }

  function introHtml(loaded: WorldBook): string {
    const byIdMap = new Map(loaded.docs.map((d) => [d.id, d]));
    const oneLiner = byIdMap.get('vision/one-liner');
    const tagline = sectionOf(oneLiner, /한 줄 정의/) || oneLiner?.summary || '';
    const theme = (oneLiner?.body || '').match(/^>\s*(.+)$/m)?.[1]?.replace(/\*\*/g, '') || '';
    const cast = CAST_ORDER.map((id) => byIdMap.get(id)).filter((d): d is WorldDoc => Boolean(d));
    return `
      <section class="wm-in-hero">
        <p class="wm-in-kicker">Witch-Mendokusai</p>
        <h2 class="wm-in-title">귀찮은 마녀</h2>
        ${tagline ? `<p class="wm-in-tagline">${escapeHtml(tagline)}</p>` : ''}
        ${theme ? `<blockquote class="wm-in-theme">${escapeHtml(theme)}</blockquote>` : ''}
        <div class="wm-in-cta">
          <button type="button" class="btn btn-primary" data-go="all">세계 도감 열기</button>
          <button type="button" class="btn btn-ghost" data-go="news">개발 소식</button>
          <a class="btn btn-ghost" href="/karmolab/wm/">소개 페이지</a>
          <a class="btn btn-ghost" href="https://github.com/Mascari4615/Witch-Mendokusai" rel="noopener">개발 저장소</a>
        </div>
      </section>
      <section class="wm-in-block">
        <h3>사는 사람들</h3>
        <div class="wb-list">${cast
          .map(
            (d) => `<button type="button" class="wb-card wm-jump" data-id="${escapeHtml(d.id)}">
              <span class="wb-card-kind">${escapeHtml(d.kindLabel)}</span>
              <span class="wb-card-title">${escapeHtml(d.title)}</span>
              ${d.summary ? `<span class="wb-card-sum">${escapeHtml(d.summary)}</span>` : ''}
            </button>`
          )
          .join('')}</div>
      </section>
      <p class="wb-source">문서 ${loaded.counts.docs}건 · 개발 노트(<code>memo/wm/design</code>)에서 자동으로 옵니다</p>`;
  }

  /* ── 이 페이지 자체 ───────────────────────────────────────────────────────────────────
   * 커뮤니티(`?p=<글id>#community`)와 같은 규칙을 쓴다: 앱은 한 페이지라 **물음표로**
   * 지금 보고 있는 것을 가리키고, 뒤로 가기로 오간다.
   *   /karmolab/#wm                     소개
   *   /karmolab/?wb=all#wm              도감 목록
   *   /karmolab/?wb=characters/yawn#wm  그 항목
   */

  let host: HTMLElement | null = null;

  function currentRoute(): string {
    try {
      return new URLSearchParams(location.search).get('wb') || '';
    } catch (_) {
      return '';
    }
  }

  function go(route: string, push = true): void {
    if (push) {
      const url = location.pathname + (route ? `?wb=${encodeURIComponent(route)}` : '') + '#wm';
      history.pushState({ wm: route }, '', url);
    }
    render();
  }

  function navHtml(route: string): string {
    const known = ['news', 'map', 'board'];
    const here = route === '' ? '' : known.includes(route) ? route : 'book';
    const on = (r: string): string => (r === here ? ' is-on' : '');
    return `<nav class="wm-nav">
        <button type="button" class="wm-nav-btn${on('')}" data-go="">소개</button>
        <button type="button" class="wm-nav-btn${on('book')}" data-go="all">세계 도감</button>
        <button type="button" class="wm-nav-btn${on('map')}" data-go="map">공간</button>
        <button type="button" class="wm-nav-btn${on('news')}" data-go="news">소식</button>
        <button type="button" class="wm-nav-btn${on('board')}" data-go="board">만드는 중</button>
        <a class="wm-nav-link" href="/karmolab/wm/">바깥 소개 페이지</a>
        <a class="wm-nav-link" href="https://github.com/Mascari4615/Witch-Mendokusai" rel="noopener">개발 저장소</a>
      </nav>`;
  }

  function bookHtml(loaded: WorldBook): string {
    return `
      <div class="wb-toolbar">
        <input type="search" id="wbSearch" placeholder="이름·꼬리표로 찾기" autocomplete="off">
        <div class="wb-kinds" id="wbKinds"></div>
      </div>
      <p class="tool-status" id="wbStatus" aria-live="polite"></p>
      <div class="wb-list" id="wbList"></div>`;
  }

  function wireBook(root: HTMLElement, loaded: WorldBook): void {
    const search = root.querySelector<HTMLInputElement>('#wbSearch');
    const kindsBox = root.querySelector<HTMLElement>('#wbKinds');
    const status = root.querySelector<HTMLElement>('#wbStatus');
    const list = root.querySelector<HTMLElement>('#wbList');
    if (!search || !kindsBox || !status || !list) return;
    let kind = 'all';

    function draw(): void {
      const q = search!.value.trim().toLowerCase();
      const shown = loaded.docs.filter((d) => (kind === 'all' || d.kind === kind) && matches(d, q));
      list!.innerHTML = shown.length > 0
        ? shown.map(cardHtml).join('')
        : '<p class="wb-empty">찾는 것이 없습니다. 다른 낱말로 찾아보세요.</p>';
      status!.textContent =
        `${shown.length}건 / 전체 ${loaded.counts.docs}건 · 종류 ${loaded.counts.kinds}개` +
        (loaded.counts.privateSkipped > 0 ? ` · 비공개 ${loaded.counts.privateSkipped}건 제외` : '');
    }

    kindsBox.innerHTML =
      `<button type="button" class="wb-kind is-on" data-kind="all">전체 ${loaded.counts.docs}</button>` +
      loaded.kinds
        .map((k) => `<button type="button" class="wb-kind" data-kind="${escapeHtml(k.id)}">${escapeHtml(k.label)} ${k.count}</button>`)
        .join('');
    kindsBox.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>('.wb-kind');
      if (!btn) return;
      kind = btn.dataset.kind || 'all';
      kindsBox.querySelectorAll('.wb-kind').forEach((b) => b.classList.toggle('is-on', b === btn));
      draw();
    });
    search.addEventListener('input', draw);
    draw();
  }

  function render(): void {
    if (!host || !host.isConnected) return;
    const route = currentRoute();
    const loaded = book;
    if (!loaded) {
      host.innerHTML = `<p class="tool-status">${loadError ? `못 불러왔습니다 (${escapeHtml(loadError)})` : '불러오는 중…'}</p>`;
      return;
    }
    if (route === 'board') {
      host.innerHTML = navHtml(route) + '<div class="wm-body"><p class="tool-status">불러오는 중…</p></div>';
      void ensureBoard().then((b) => {
        const body = host?.querySelector<HTMLElement>('.wm-body');
        if (!body || currentRoute() !== 'board') return;
        body.innerHTML = b
          ? boardHtml(b)
          : `<p class="tool-status">보드를 못 불러왔습니다 (${escapeHtml(boardError)}).</p>`;
      });
      return;
    }
    if (route === 'news') {
      host.innerHTML = navHtml(route) + '<div class="wm-body"><p class="tool-status">불러오는 중…</p></div>';
      void ensureDevlog().then((log) => {
        const body = host?.querySelector<HTMLElement>('.wm-body');
        if (!body || currentRoute() !== 'news') return;
        body.innerHTML = log
          ? newsHtml(log)
          : `<p class="tool-status">소식을 못 불러왔습니다 (${escapeHtml(devlogError)}).</p>`;
      });
      return;
    }
    const doc = route && route !== 'all' && route !== 'map' ? loaded.docs.find((d) => d.id === route) : undefined;
    const main = doc
      ? detailHtml(doc)
      : route === 'all'
        ? bookHtml(loaded)
        : route === 'map'
          ? mapHtml(loaded)
          : introHtml(loaded);
    host.innerHTML = navHtml(route) + `<div class="wm-body">${main}</div>`;
    const body = host.querySelector<HTMLElement>('.wm-body');
    if (route === 'all' && body) wireBook(body, loaded);
    if (route !== '' && route !== 'all' && route !== 'map' && !doc && body) {
      body.innerHTML = '<p class="wb-empty">그런 항목이 없습니다. 도감에서 찾아보세요.</p>';
    }
  }

  function build(container: HTMLElement): void {
    host = container;
    container.classList.add('wm-page');
    container.innerHTML = '<p class="tool-status">불러오는 중…</p>';

    container.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement;
      const nav = target.closest<HTMLElement>('[data-go]');
      if (nav) { go(nav.dataset.go || ''); return; }
      const card = target.closest<HTMLElement>('.wb-card');
      if (card?.dataset.id) { go(card.dataset.id); return; }
      if (target.closest('.wb-back')) { go('all'); }
    });

    const onPop = (): void => { if (host?.isConnected) render(); };
    window.addEventListener('popstate', onPop);
    Toolbox.onDispose?.(() => {
      window.removeEventListener('popstate', onPop);
      host = null;
    });

    void ensureBook().then(() => render());
  }

  Toolbox.register({
    id: 'wm',
    title: 'Witch-Mendokusai',
    category: 'tool',
    desc: '만들고 있는 게임 — 소개 · 세계 도감(인물 · 세계 · 규칙). 개발 노트에서 바로 옵니다',
    // 커뮤니티와 같은 자리다 — 「위젯이 아닐 뿐」. 넓게 쓰고 위젯 제목 카드·탭 줄을 안 그린다.
    // 화면 구조는 이 페이지가 제 것으로 갖는다(아래 nav · 섹션 · 주소).
    layout: 'wide',
    noHero: true,
    icon:
      '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 7.5h6M9 11h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [{ id: 'wm-main', label: 'WM', build }],
  });
})();
