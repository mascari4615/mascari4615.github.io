/**
 * 개발자 스터디 맵 (TASK-KL-STUDYMAP)
 *
 * 로드맵 사이트는 많다. 그런데 대부분 **네모와 화살표**만 준다 — 「이걸 왜 배우나」와
 * 「어디까지 하면 넘어가도 되나」가 없다. 그게 없으면 지도가 아니라 목록이다.
 *
 * 그래서 노드 하나가 네 가지를 다 들고 있다: 무엇을 · 왜 · 언제 넘어가나 · 어디서 읽나.
 * 표는 `data/studymap.json` 한 곳이고 여기는 그리기만 한다 — 주제를 늘릴 때 코드를 안 건드린다.
 *
 * 진도는 이 브라우저에만 남는다(localStorage). 로그인·서버 없음 —
 * 「체크하려고 가입」이 지도를 안 열게 만드는 가장 흔한 이유라서.
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

interface SmLink { label: string; url: string }
interface SmTool { id: string; label: string }
interface SmNode { id: string; title: string; why: string; check?: string; tool?: SmTool; links?: SmLink[]; prereq?: string[] }
interface SmStage { id: string; title: string; nodes: SmNode[] }
interface SmTrack { id: string; title: string; emoji: string; lead: string; stages: SmStage[] }
interface SmData { tracks: SmTrack[] }

/** 다른 언어 덧씌우기 표 — id 로만 짝을 짓는다(순서·구조를 다시 적지 않는다). */
interface SmOverlay {
  tracks?: Record<string, { title?: string; lead?: string }>;
  stages?: Record<string, string>;
  nodes?: Record<string, { title?: string; why?: string; check?: string; links?: string[]; tool?: string }>;
}

function applyOverlay(data: SmData, over: SmOverlay): SmData {
  const tracks = data.tracks.map((track) => {
    const tOver = over.tracks?.[track.id];
    return {
      ...track,
      title: tOver?.title ?? track.title,
      lead: tOver?.lead ?? track.lead,
      stages: track.stages.map((stage) => ({
        ...stage,
        title: over.stages?.[stage.id] ?? stage.title,
        nodes: stage.nodes.map((node) => {
          const nOver = over.nodes?.[node.id];
          if (!nOver) return node;
          return {
            ...node,
            title: nOver.title ?? node.title,
            why: nOver.why ?? node.why,
            check: nOver.check ?? node.check,
            tool: node.tool && nOver.tool ? { ...node.tool, label: nOver.tool } : node.tool,
            /* 링크 이름만 바꾼다 — 주소는 정본 한 곳에서만 관리한다(둘로 갈리면 죽은 주소가 숨는다). */
            links: node.links?.map((link, at) => ({ ...link, label: nOver.links?.[at] ?? link.label })),
          };
        }),
      })),
    };
  });
  return { ...data, tracks };
}

(function (): void {
  const DONE_KEY = 'karmolab-studymap-done';
  const TRACK_KEY = 'karmolab-studymap-track';

  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ── 진도 ── */
  function readDone(): Set<string> {
    try {
      const raw = JSON.parse(localStorage.getItem(DONE_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch {
      return new Set();
    }
  }
  function writeDone(done: Set<string>): void {
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
    } catch {
      /* 사생활 보호 모드 등 — 진도만 안 남고 지도는 그대로 쓴다 */
    }
  }

  function injectStyles(): void {
    if (document.getElementById('studymap-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'studymap-widget-styles';
    style.textContent = `
/* 스터디 맵 — 읽는 화면이다. 글줄 길이와 여백이 첫 번째 기능. */
.sm-wrap { display: flex; flex-direction: column; gap: 20px; }

.sm-head { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; justify-content: space-between; }
.sm-lead { color: var(--text-secondary); font-size: var(--font-size-xs); line-height: 1.6; max-width: 62ch; margin: 6px 0 0; }
.sm-title { font-size: var(--font-size-lg); font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; gap: 10px; }
.sm-title .sm-emoji { font-size: 1.15em; }

.sm-meter { min-width: 200px; }
.sm-meter-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: var(--font-size-2xs); color: var(--text-secondary); margin-bottom: 6px; }
.sm-meter-top b { color: var(--accent); font-size: var(--font-size-sm); font-variant-numeric: tabular-nums; }
.sm-bar { height: 6px; border-radius: 999px; background: var(--bg-tertiary); overflow: hidden; }
.sm-meter-all { margin-top: 6px; text-align: right; font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.sm-found { font-size: var(--font-size-2xs); color: var(--text-secondary); margin-bottom: 14px; }
.sm-stage-find::before { display: none; }
.sm-bar i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--secondary), var(--accent)); transition: width .35s cubic-bezier(.2,.8,.2,1); }

.sm-body { display: grid; grid-template-columns: 1fr; gap: 20px; }
@media (min-width: 900px) { .sm-body { grid-template-columns: 216px minmax(0, 1fr); gap: 28px; align-items: start; } }
.sm-main { min-width: 0; }
.sm-tracks { display: flex; flex-wrap: wrap; gap: 8px; }
@media (min-width: 900px) {
  /* 갈래 17개를 알약으로 깔면 첫 화면이 목록에 덮인다 — 넓은 화면에선 옆으로 세운다. */
  .sm-tracks { position: sticky; top: 12px; flex-direction: column; flex-wrap: nowrap; gap: 2px; max-height: calc(100vh - 40px); overflow-y: auto; padding-right: 4px; }
  .sm-track-btn { width: 100%; justify-content: flex-start; border-color: transparent; background: none; border-radius: var(--radius-lg); padding: 7px 10px; }
  .sm-track-btn .sm-count { margin-left: auto; }
  .sm-track-btn.is-on { background: var(--accent-subtle); border-color: var(--accent); }
}
.sm-track-btn { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; font: inherit; font-size: var(--font-size-2xs); transition: border-color .15s, color .15s, background .15s; }
.sm-track-btn:hover { border-color: var(--border-hover); color: var(--text-primary); }
.sm-track-btn.is-on { border-color: var(--accent); color: var(--text-primary); background: var(--accent-subtle); }
.sm-track-btn .sm-count { font-variant-numeric: tabular-nums; opacity: .7; font-size: 11px; }

.sm-search { width: 100%; padding: 10px 14px; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-size: var(--font-size-2xs); }
.sm-search:focus { outline: none; border-color: var(--accent); }

/* 단계 = 왼쪽 등뼈 한 줄. 세로로 이어지는 게 「지도」의 뼈대다. */
.sm-stage { position: relative; padding-left: 26px; }
.sm-stage::before { content: ''; position: absolute; left: 7px; top: 6px; bottom: -18px; width: 2px; background: linear-gradient(180deg, var(--secondary), var(--border)); opacity: .5; }
.sm-stage.is-clear::before { background: linear-gradient(180deg, var(--success), var(--border)); opacity: .6; }
.sm-stage:last-child::before { bottom: 12px; }
.sm-stage-dot { position: absolute; left: 0; top: 3px; width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border-hover); background: var(--bg-primary); }
.sm-stage.is-clear .sm-stage-dot { border-color: var(--success); background: var(--success); }
.sm-stage-name { font-size: var(--font-size-xs); font-weight: 650; margin-bottom: 2px; }
.sm-stage-sub { font-size: 11px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
.sm-nodes { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 14px 0 26px; }

.sm-node { position: relative; display: flex; gap: 12px; padding: 14px; border-radius: var(--radius-xl); border: 1px solid var(--border); background: var(--bg-secondary); transition: border-color .15s, transform .15s, background .15s; }
.sm-node:hover { border-color: var(--border-hover); transform: translateY(-1px); }
.sm-node.is-done { background: var(--bg-primary); border-color: var(--success-subtle); }
.sm-node.is-done .sm-node-title { color: var(--text-tertiary); text-decoration: line-through; text-decoration-color: var(--text-tertiary); }
.sm-node.is-done .sm-node-why, .sm-node.is-done .sm-node-check { opacity: .45; }
.sm-node.is-next { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-dim), 0 6px 20px -12px var(--accent-glow); }

.sm-check { appearance: none; flex: 0 0 auto; width: 20px; height: 20px; margin-top: 2px; border-radius: 6px; border: 2px solid var(--border-hover); background: transparent; cursor: pointer; position: relative; transition: border-color .15s, background .15s; }
.sm-check:hover { border-color: var(--accent); }
.sm-check:checked { background: var(--success); border-color: var(--success); }
.sm-check:checked::after { content: ''; position: absolute; left: 5px; top: 1px; width: 4px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.sm-check:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.sm-node-body { min-width: 0; flex: 1; }
.sm-node-title { font-size: var(--font-size-2xs); font-weight: 650; line-height: 1.45; }
.sm-node-why { font-size: 12px; color: var(--text-secondary); line-height: 1.65; margin-top: 6px; }
.sm-node-check { font-size: 11px; color: var(--text-tertiary); line-height: 1.6; margin-top: 8px; padding-left: 10px; border-left: 2px solid var(--border-hover); }
.sm-node-check b { color: var(--secondary); font-weight: 600; }
.sm-prereq { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
.sm-prereq-label { font-size: 10px; color: var(--text-tertiary); letter-spacing: .03em; }
.sm-prereq-btn { font-size: 11px; padding: 3px 8px; border-radius: 999px; border: 1px dashed var(--border-hover); background: none; color: var(--text-secondary); cursor: pointer; font-family: inherit; }
.sm-prereq-btn:hover { border-style: solid; border-color: var(--secondary); color: var(--secondary); }
.sm-prereq-btn.is-done { border-color: var(--success-subtle); color: var(--text-tertiary); text-decoration: line-through; }
.sm-node.is-flash { animation: sm-flash 1.4s ease-out; }
@keyframes sm-flash { 0%,40% { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); } 100% { box-shadow: none; } }
.sm-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.sm-link { font-size: 11px; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--border); color: var(--text-secondary); text-decoration: none; transition: border-color .15s, color .15s; }
.sm-link:hover { border-color: var(--accent); color: var(--accent); }
.sm-tool { border-color: var(--accent); color: var(--accent); background: var(--accent-subtle); font-weight: 600; }
.sm-tool:hover { background: var(--accent-dim); }
.sm-next-tag { position: absolute; top: -8px; right: 12px; font-size: 10px; font-weight: 700; letter-spacing: .04em; padding: 2px 8px; border-radius: 999px; background: var(--accent); color: var(--bg-void); }

.sm-empty { padding: 28px; text-align: center; color: var(--text-tertiary); font-size: var(--font-size-2xs); }
.sm-foot { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.sm-reset { background: none; border: 1px solid var(--border); color: var(--text-tertiary); font: inherit; font-size: 11px; padding: 6px 12px; border-radius: 999px; cursor: pointer; }
.sm-reset:hover { border-color: var(--error); color: var(--error); }

@media (prefers-reduced-motion: reduce) {
  .sm-node, .sm-bar i, .sm-track-btn, .sm-check { transition: none; }
  .sm-node.is-flash { animation: none; border-color: var(--accent); }
}

@media (max-width: 600px) {
  .sm-nodes { grid-template-columns: 1fr; }
  .sm-stage { padding-left: 20px; }
}`;
    document.head.appendChild(style);
  }

  function buildStudymap(container: HTMLElement): void {
    injectStyles();
    container.innerHTML = `<div class="sm-empty">${esc(t('studymap.loading', undefined, '지도를 펴는 중…'))}</div>`;

    /* 내용 정본은 한국어 한 벌(`studymap.json`)이고, 다른 언어는 **덧씌우는 표**로 온다
       (`studymap.<언어>.json`). 아직 안 옮긴 칸은 한국어가 그대로 보인다 — 빈 칸보다 낫고,
       무엇이 안 옮겨졌는지도 그 자리에서 드러난다. */
    const code = locale();
    const base = fetch('/apps/karmolab/data/studymap.json').then((r) => r.json());
    const over =
      code === 'ko'
        ? Promise.resolve(null)
        : fetch(`/apps/karmolab/data/studymap.${code}.json`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);

    Promise.all([base, over])
      .then(([data, overlay]: [SmData, SmOverlay | null]) => render(container, overlay ? applyOverlay(data, overlay) : data))
      .catch(() => {
        container.innerHTML = `<div class="sm-empty">${esc(t('studymap.failed', undefined, '지도를 못 불러왔다. 새로고침해 보라.'))}</div>`;
      });
  }

  function render(container: HTMLElement, data: SmData): void {
    const tracks = data.tracks || [];
    if (tracks.length === 0) {
      container.innerHTML = `<div class="sm-empty">${esc(t('studymap.failed', undefined, '지도를 못 불러왔다. 새로고침해 보라.'))}</div>`;
      return;
    }

    const done = readDone();
    let query = '';
    let current = localStorage.getItem(TRACK_KEY) || tracks[0].id;
    if (!tracks.some((tr) => tr.id === current)) current = tracks[0].id;

    container.innerHTML = `
      <div class="sm-wrap">
        <div class="sm-head">
          <div>
            <div class="sm-title"><span class="sm-emoji" data-sm="emoji"></span><span data-sm="title"></span></div>
            <p class="sm-lead" data-sm="lead"></p>
          </div>
          <div class="sm-meter">
            <div class="sm-meter-top"><span>${esc(t('studymap.progress', undefined, '이 갈래 진도'))}</span><span><b data-sm="pdone">0</b> / <span data-sm="ptotal">0</span></span></div>
            <div class="sm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-sm="pmeter"><i data-sm="pbar" style="width:0%"></i></div>
            <div class="sm-meter-all" data-sm="pall"></div>
          </div>
        </div>
        <input class="sm-search" type="search" name="studymap-search" data-sm="search"
               placeholder="${esc(t('studymap.search', undefined, '주제 찾기 — 예: rebase, 인덱스, 캐시'))}"
               aria-label="${esc(t('studymap.search', undefined, '주제 찾기 — 예: rebase, 인덱스, 캐시'))}">
        <div class="sm-body">
          <nav class="sm-tracks" data-sm="tracks" aria-label="${esc(t('studymap.tracks', undefined, '갈래'))}"></nav>
          <div class="sm-main" data-sm="stages" aria-live="polite"></div>
        </div>
        <div class="sm-foot">
          <button type="button" class="sm-reset" data-sm="export">${esc(t('studymap.export', undefined, '진도 내보내기'))}</button>
          <button type="button" class="sm-reset" data-sm="import">${esc(t('studymap.import', undefined, '진도 가져오기'))}</button>
          <button type="button" class="sm-reset" data-sm="reset">${esc(t('studymap.reset', undefined, '이 갈래 진도 지우기'))}</button>
        </div>
      </div>`;

    const q = <T extends HTMLElement>(key: string): T => container.querySelector(`[data-sm="${key}"]`) as T;
    const elTracks = q<HTMLDivElement>('tracks');
    const elStages = q<HTMLDivElement>('stages');
    const elSearch = q<HTMLInputElement>('search');

    /* 선수 관계는 갈래를 넘는다 — id 하나로 어느 갈래의 어느 칸인지 바로 찾을 표를 만든다. */
    const whereIs = new Map<string, { node: SmNode; trackId: string }>();
    for (const tr of tracks) for (const st of tr.stages) for (const n of st.nodes) whereIs.set(n.id, { node: n, trackId: tr.id });

    const trackOf = (id: string): SmTrack => tracks.find((tr) => tr.id === id) || tracks[0];
    const nodesOf = (tr: SmTrack): SmNode[] => tr.stages.flatMap((s) => s.nodes);
    const hits = (n: SmNode): boolean => {
      if (!query) return true;
      const hay = `${n.title} ${n.why} ${n.check || ''} ${(n.links || []).map((l) => l.label).join(' ')}`.toLowerCase();
      return hay.includes(query);
    };

    function paintTracks(): void {
      elTracks.innerHTML = tracks
        .map((tr) => {
          const all = nodesOf(tr);
          const d = all.filter((n) => done.has(n.id)).length;
          return `<button type="button" class="sm-track-btn${tr.id === current ? ' is-on' : ''}" data-track="${esc(tr.id)}"${tr.id === current ? ' aria-current="true"' : ''}>
            <span>${esc(tr.emoji)}</span><span>${esc(tr.title)}</span><span class="sm-count">${d}/${all.length}</span>
          </button>`;
        })
        .join('');
    }

    /** 칸 한 장. 찾기 결과에서도 같은 카드를 쓴다 — 두 벌로 그리면 곧 어긋난다. */
    function cardHtml(n: SmNode, nextId: string | null): string {
      const isDone = done.has(n.id);
      const isNext = n.id === nextId;
      /* 도구가 붙은 칸은 **여기서 바로 해 볼 수 있다** — 읽고 끝나면 안 남는다. */
      const tool = n.tool ? `<a class="sm-link sm-tool" href="#${esc(n.tool.id)}">▶ ${esc(n.tool.label)}</a>` : '';
      const links =
        tool +
        (n.links || [])
          .map((l) => `<a class="sm-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`)
          .join('');
      /* 「먼저 이것」 — 못 하면 여기서 막힌다는 뜻이 아니라, 막혔을 때 돌아갈 자리를 알려 준다. */
      const prereq = (n.prereq || [])
        .map((id) => {
          const found = whereIs.get(id);
          if (!found) return '';
          const d = done.has(id);
          const label = `${t('studymap.prereq', undefined, '먼저')}: ${found.node.title}`;
          return `<button type="button" class="sm-prereq-btn${d ? ' is-done' : ''}" data-goto="${esc(id)}" aria-label="${esc(label)}">${esc(found.node.title)}</button>`;
        })
        .join('');

      return `<div class="sm-node${isDone ? ' is-done' : ''}${isNext ? ' is-next' : ''}" data-id="${esc(n.id)}">
        ${isNext ? `<span class="sm-next-tag">${esc(t('studymap.next', undefined, '다음'))}</span>` : ''}
        <input type="checkbox" class="sm-check" name="studymap-done-${esc(n.id)}" data-node="${esc(n.id)}" ${isDone ? 'checked' : ''}
               aria-label="${esc(n.title)}">
        <div class="sm-node-body">
          <div class="sm-node-title">${esc(n.title)}</div>
          <div class="sm-node-why">${esc(n.why)}</div>
          ${n.check ? `<div class="sm-node-check"><b>${esc(t('studymap.check', undefined, '넘어가도 될 때'))}</b> — ${esc(n.check)}</div>` : ''}
          ${prereq ? `<div class="sm-prereq"><span class="sm-prereq-label">${esc(t('studymap.prereq', undefined, '먼저'))}</span>${prereq}</div>` : ''}
          ${links ? `<div class="sm-links">${links}</div>` : ''}
        </div>
      </div>`;
    }

    /** 찾기는 **지도 전체**를 본다. 갈래 안에서만 찾으면 「없다」는 답이 거짓말이 된다. */
    function searchHtml(): string {
      const groups = tracks
        .map((tr) => ({ tr, found: nodesOf(tr).filter(hits) }))
        .filter((g) => g.found.length > 0);
      if (groups.length === 0) {
        return `<div class="sm-empty">${esc(t('studymap.nohit', undefined, '지도 어디에도 그런 주제가 없다. 다른 말로 찾아 보라.'))}</div>`;
      }
      const total = groups.reduce((s, g) => s + g.found.length, 0);
      return (
        `<div class="sm-found">${esc(t('studymap.found', { n: total, tracks: groups.length }, '지도 전체에서 {n}칸 · {tracks}갈래'))}</div>` +
        groups
          .map(
            (g) => `<section class="sm-stage sm-stage-find">
              <span class="sm-stage-dot"></span>
              <div class="sm-stage-name">${esc(g.tr.emoji)} ${esc(g.tr.title)}</div>
              <div class="sm-stage-sub">${g.found.filter((n) => done.has(n.id)).length} / ${g.found.length}</div>
              <div class="sm-nodes">${g.found.map((n) => cardHtml(n, null)).join('')}</div>
            </section>`,
          )
          .join('')
      );
    }

    function paint(): void {
      const tr = trackOf(current);
      const all = nodesOf(tr);
      const d = all.filter((n) => done.has(n.id)).length;
      const everyNode = tracks.flatMap(nodesOf);
      const everyDone = everyNode.filter((n) => done.has(n.id)).length;

      q<HTMLElement>('emoji').textContent = tr.emoji;
      q<HTMLElement>('title').textContent = tr.title;
      q<HTMLElement>('lead').textContent = tr.lead;
      q<HTMLElement>('pdone').textContent = String(d);
      q<HTMLElement>('ptotal').textContent = String(all.length);
      const pct = all.length ? Math.round((d / all.length) * 100) : 0;
      q<HTMLElement>('pbar').style.width = `${pct}%`;
      const meter = q<HTMLElement>('pmeter');
      meter.setAttribute('aria-valuenow', String(pct));
      meter.setAttribute('aria-label', t('studymap.progress', undefined, '이 갈래 진도'));
      q<HTMLElement>('pall').textContent = t('studymap.all', { done: everyDone, total: everyNode.length }, '지도 전체 {done} / {total}');

      /* 「다음 한 칸」 = 아직 안 한 첫 노드. 지도를 열자마자 할 일이 하나 보여야 한다. */
      const next = all.find((n) => !done.has(n.id));

      if (query) {
        elStages.innerHTML = searchHtml();
        paintTracks();
        return;
      }

      elStages.innerHTML = tr.stages
        .map((st) => {
          const clear = st.nodes.every((n) => done.has(n.id));
          const sd = st.nodes.filter((n) => done.has(n.id)).length;
          const cards = st.nodes.map((n) => cardHtml(n, next ? next.id : null)).join('');
          return `<section class="sm-stage${clear ? ' is-clear' : ''}">
            <span class="sm-stage-dot"></span>
            <div class="sm-stage-name">${esc(st.title)}</div>
            <div class="sm-stage-sub">${sd} / ${st.nodes.length}</div>
            <div class="sm-nodes">${cards}</div>
          </section>`;
        })
        .join('');
      paintTracks();
    }

    elTracks.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-track]') as HTMLElement | null;
      if (!btn) return;
      current = btn.dataset.track || current;
      try {
        localStorage.setItem(TRACK_KEY, current);
      } catch {
        /* 저장 못 해도 이번 화면은 바뀐다 */
      }
      paint();
    });

    elStages.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-goto]') as HTMLElement | null;
      if (!btn) return;
      const id = btn.dataset.goto || '';
      const found = whereIs.get(id);
      if (!found) return;
      current = found.trackId;
      query = '';
      elSearch.value = '';
      paint();
      const card = elStages.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (card instanceof HTMLElement) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('is-flash');
        setTimeout(() => card.classList.remove('is-flash'), 1500);
      }
    });

    elStages.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      const id = box.dataset?.node;
      if (!id) return;
      if (box.checked) done.add(id);
      else done.delete(id);
      writeDone(done);
      paint();
      if (box.checked && typeof Mdd !== 'undefined' && Mdd.linePreset) {
        const all = nodesOf(trackOf(current));
        const cleared = all.every((n) => done.has(n.id));
        Mdd.linePreset('success', {
          msg: cleared
            ? t('studymap.mdd.clear', undefined, '한 갈래를 끝까지 걸었어요. 다음 갈래 가 볼까요?')
            : t('studymap.mdd.step', undefined, '한 칸 나아갔어요.'),
        });
      }
    });

    elSearch.addEventListener('input', () => {
      query = elSearch.value.trim().toLowerCase();
      paint();
    });

    /* 진도는 이 브라우저에만 있다 — 기기를 바꾸면 사라진다. 서버를 두는 대신
       **한 줄로 들고 다니게** 한다(가입 없이 옮기는 가장 싼 방법). */
    q<HTMLButtonElement>('export').addEventListener('click', () => {
      const code = [...done].join(' ');
      if (!code) {
        alert(t('studymap.export.empty', undefined, '아직 체크한 칸이 없다.'));
        return;
      }
      if (typeof Toolbox !== 'undefined' && Toolbox.copyText) {
        Toolbox.copyText(code, { message: t('studymap.export.done', undefined, '진도를 복사했다. 다른 기기에서 「진도 가져오기」에 붙여 넣어라.') });
        return;
      }
      prompt(t('studymap.export.done', undefined, '진도를 복사했다. 다른 기기에서 「진도 가져오기」에 붙여 넣어라.'), code);
    });

    q<HTMLButtonElement>('import').addEventListener('click', () => {
      const raw = prompt(t('studymap.import.ask', undefined, '내보낸 진도를 붙여 넣어라. (지금 진도에 더해진다)'));
      if (raw == null) return;
      const known = new Set(tracks.flatMap(nodesOf).map((n) => n.id));
      const ids = raw.split(/[\s,]+/).map((v) => v.trim()).filter((v) => known.has(v));
      if (ids.length === 0) {
        alert(t('studymap.import.bad', undefined, '알아볼 수 있는 칸이 없다. 내보내기로 만든 글만 된다.'));
        return;
      }
      ids.forEach((id) => done.add(id));
      writeDone(done);
      paint();
      alert(t('studymap.import.done', { n: ids.length }, '{n}칸을 가져왔다.'));
    });

    q<HTMLButtonElement>('reset').addEventListener('click', () => {
      const all = nodesOf(trackOf(current));
      if (!all.some((n) => done.has(n.id))) return;
      if (!confirm(t('studymap.reset.confirm', undefined, '이 갈래의 체크를 전부 지운다. 계속할까?'))) return;
      all.forEach((n) => done.delete(n.id));
      writeDone(done);
      paint();
    });

    paint();
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta!('studymap'),
    tabs: [
      {
        id: 'studymap',
        label: t('studymap.tab', undefined, '스터디 맵'),
        build: function (container: HTMLElement): void {
          void loadNamespace('studymap').then(function () {
            buildStudymap(container);
          });
        },
      },
    ],
  });
})();
