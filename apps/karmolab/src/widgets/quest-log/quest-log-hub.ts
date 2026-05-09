/**
 * quest-log-hub — QuestLog 의 Hub 섹션 (TASK-KL-035 — KarmoDDrine 대시보드 흡수).
 *
 * QuestLog 페이지 끝에 「활성 세션 / 최근 commit / 도구 인벤토리 / 룰 단일 출처 /
 * 파일 소유권 그래프 / 룰 네트워크」 6 섹션 세로 스크롤. 데이터 = Rust 명령
 * `get_questlog_hub` 가 ~/repos/karmoddrine/ 로컬 파일 + 3 레포 git log 에서 수집.
 * 10초 폴링.
 *
 * 본 모듈은 quest-log.ts 가 사용하는 sub-script.
 *   window.KARMOLAB_QUESTLOG_HUB = { renderHub(container) }
 * quest-log.ts 의 build() 끝에서 호출. 별 위젯 register 안 함.
 *
 * CSS 정본 = quest-log.ts 안 `.kl-quest-log .hub*` vocabulary.
 *   - hubWrap 이 .kl-quest-log 안 자식이라 magazine 톤 변수 (`--ink`/`--paper`/`--accent`) 그대로 상속.
 *   - 본 모듈은 클래스만 박고 CSS 안 박음.
 *
 * github.io 공개 사이트엔 표시 X (Tauri 데스크톱만 — !window.__KARMOLAB_DESKTOP__ → placeholder).
 */
// @ts-nocheck — Toolbox/Mdd/window.__TAURI__ 글로벌은 ambient 타입에 다 안 잡혀 있음.
(function (): void {
  // ── 타입 (Rust struct camelCase) ─────────────────────────────────
  interface BoardRow { start: string; topic: string; targets: string; status: string; }
  interface BoardData { raw: string; rows: BoardRow[]; }
  interface CommitInfo { hash: string; date: string; subject: string; }
  interface RuleRow { category: string; canonical: string; cite: string; }
  interface ToolsData { commands: string[]; hooks: string[]; settingsHooks: Record<string, string>; }
  interface QuestlogHub {
    generatedAtUnix: number;
    home: string | null;
    umbrella: string | null;
    board: BoardData | null;
    commits: Record<string, CommitInfo[]>;
    rules: RuleRow[];
    tools: ToolsData;
  }

  const POLL_INTERVAL_MS = 10_000;
  const REPOS = ['memo', 'Mascari4615.github.io', 'WitchMendokusai'];

  function isKarmolabDesktop(): boolean {
    return typeof window !== 'undefined' && !!window.__KARMOLAB_DESKTOP__;
  }

  // 진단: 첫 호출 stuck 추적 — backend sync command (#[tauri::command]) 가 cold start 시
  // git log × 3 repo + JSON parse + dir walk = 10~30초 가능. 30초 timeout 후 명확 메시지.
  let lastError: { msg: string; t: number } | null = null;
  async function fetchState(): Promise<QuestlogHub | null> {
    const invoke = window.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') {
      lastError = { msg: 'window.__TAURI__.core.invoke 없음 (Tauri 환경 X)', t: Date.now() };
      return null;
    }
    const TIMEOUT_MS = 30_000;
    const t0 = Date.now();
    try {
      const result = await Promise.race([
        invoke('get_questlog_hub'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout ${TIMEOUT_MS / 1000}s — backend hang 의심 (git log / JSON / dir walk 어디서 막힘)`)), TIMEOUT_MS)
        )
      ]);
      lastError = null;
      return result as QuestlogHub;
    } catch (e) {
      const elapsed = Date.now() - t0;
      const msg = `${(e as Error).message ?? String(e)} (${(elapsed / 1000).toFixed(1)}s 경과)`;
      console.error('get_questlog_hub 실패', e);
      lastError = { msg, t: Date.now() };
      (window as any).__lastQuestlogError = e;
      return null;
    }
  }

  // ── Mermaid CDN (한 번만 로드) ──────────────────────────────────
  let mermaidPromise: Promise<any> | null = null;
  function loadMermaid(): Promise<any> {
    if (mermaidPromise) return mermaidPromise;
    mermaidPromise = new Promise((resolve, reject) => {
      if ((window as any).mermaid) { resolve((window as any).mermaid); return; }
      const script = document.createElement('script');
      script.type = 'module';
      script.textContent = `
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
        window.mermaid = mermaid;
        window.dispatchEvent(new Event('kl-ql-mermaid-loaded'));
      `;
      window.addEventListener('kl-ql-mermaid-loaded', () => resolve((window as any).mermaid), { once: true });
      setTimeout(() => reject(new Error('mermaid load timeout')), 15000);
      document.head.appendChild(script);
    }).then((m: any) => {
      // QuestLog magazine 톤 — `.kl-quest-log` 의 paper/ink/accent 변수 매핑.
      m.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          background: '#12151c',          // --paper
          primaryColor: '#171a22',        // --paper-2
          primaryTextColor: '#f2f2ee',    // --ink
          primaryBorderColor: '#3d4557',  // --line-3
          lineColor: '#55555a',           // --ink-3
          secondaryColor: '#1f242d',      // --line
          tertiaryColor: '#0f1218',       // --bg-2
          edgeLabelBackground: '#171a22',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '11.5px',
        },
      });
      return m;
    });
    return mermaidPromise;
  }

  // ── 헬퍼 ─────────────────────────────────────────────────────────
  function esc(s: string): string {
    return Toolbox.escapeHtml ? Toolbox.escapeHtml(s) : s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(s: string): string {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }
  function statusClass(status: string): string {
    if (/-?done$|done$/.test(status)) return 'hub-pill hub-pill--done';
    if (/committing|pending-?commit|진입|대기/.test(status)) return 'hub-pill hub-pill--active';
    if (/verify|pending/.test(status)) return 'hub-pill hub-pill--warn';
    return 'hub-pill hub-pill--other';
  }
  function escMermaid(s: string): string {
    return s.replace(/[<>"`]/g, '').replace(/\n/g, ' ').replace(/\|/g, '/');
  }
  function hash6(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 6);
  }

  // ── 폴링 상태 ────────────────────────────────────────────────────
  let pollTimer: number | null = null;

  // ── 셸 ──────────────────────────────────────────────────────────
  function renderShell(container: HTMLElement): void {
    if (!isKarmolabDesktop()) {
      container.innerHTML = `<div class="hub-disabled">QuestLog Hub 는 Tauri 데스크톱 앱 전용입니다.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="hub">
        <div class="hub-meta" data-hub="meta">로딩 중…</div>
        <section class="hub-section"><h2>활성 세션</h2><div data-hub="board"></div></section>
        <section class="hub-section"><h2>최근 commit (3 레포)</h2><div data-hub="commits" class="hub-3col"></div></section>
        <section class="hub-section"><h2>도구 인벤토리</h2><div data-hub="tools" class="hub-cards"></div></section>
        <section class="hub-section"><h2>룰 단일 출처</h2><div data-hub="rules"></div></section>
        <section class="hub-section"><h2>파일 소유권 그래프 — 충돌 = 두 세션이 같은 파일 잡음</h2><div data-hub="ownership" class="hub-graph"></div></section>
        <section class="hub-section"><h2>룰 단일 출처 네트워크</h2><div data-hub="rules-graph" class="hub-graph"></div></section>
      </div>
    `;
  }

  // ── 폴링 ────────────────────────────────────────────────────────
  function startPolling(container: HTMLElement): void {
    if (!isKarmolabDesktop()) return;
    void refresh(container);
    if (pollTimer != null) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      if (!container.isConnected) {
        if (pollTimer != null) { window.clearInterval(pollTimer); pollTimer = null; }
        return;
      }
      void refresh(container);
    }, POLL_INTERVAL_MS);
  }

  async function refresh(container: HTMLElement): Promise<void> {
    const meta = container.querySelector('[data-hub="meta"]') as HTMLElement | null;
    if (meta) meta.textContent = '불러오는 중… (첫 호출 cold start 5~30초 가능)';
    const state = await fetchState();
    if (!state) {
      if (meta) {
        const errInfo = lastError ? ` · ${lastError.msg}` : '';
        meta.innerHTML = `데이터 가져오기 실패${esc(errInfo)} <button data-hub="retry" style="margin-left:8px; padding:2px 10px; background:transparent; border:1px solid var(--accent); color:var(--accent); cursor:pointer; font-family:'JetBrains Mono', monospace; font-size:10.5px; letter-spacing:0.16em; text-transform:uppercase;">다시 시도</button>`;
        const retry = meta.querySelector('[data-hub="retry"]') as HTMLButtonElement | null;
        if (retry) retry.onclick = () => { void refresh(container); };
      }
      return;
    }
    renderMeta(container, state);
    renderBoard(container, state);
    renderCommits(container, state);
    renderTools(container, state);
    renderRules(container, state);
    void renderOwnership(container, state);
    void renderRulesGraph(container, state);
  }

  // ── 섹션 렌더 ──────────────────────────────────────────────────
  function renderMeta(container: HTMLElement, state: QuestlogHub): void {
    const meta = container.querySelector('[data-hub="meta"]') as HTMLElement | null;
    if (!meta) return;
    const generated = state.generatedAtUnix > 0 ? new Date(state.generatedAtUnix * 1000).toLocaleString('ko-KR') : '?';
    meta.innerHTML = `생성: ${esc(generated)} · umbrella: <code>${esc(state.umbrella ?? '?')}</code> · 폴링: ${POLL_INTERVAL_MS / 1000}s`;
  }

  function renderBoard(container: HTMLElement, state: QuestlogHub): void {
    const root = container.querySelector('[data-hub="board"]') as HTMLElement | null;
    if (!root) return;
    if (!state.board || state.board.rows.length === 0) {
      root.innerHTML = `<p class="hub-empty">(보드 비어있음)</p>`;
      return;
    }
    root.innerHTML = `<div class="hub-cards">${state.board.rows.map(r => `
      <div class="hub-card">
        <div class="hub-card-head">
          <span class="hub-card-start">${esc(r.start)}</span>
          <span class="${statusClass(r.status)}">${esc(r.status)}</span>
        </div>
        <div class="hub-card-topic">${inline(r.topic)}</div>
        <div class="hub-card-targets">${inline(r.targets)}</div>
      </div>
    `).join('')}</div>`;
  }

  function renderCommits(container: HTMLElement, state: QuestlogHub): void {
    const root = container.querySelector('[data-hub="commits"]') as HTMLElement | null;
    if (!root) return;
    root.innerHTML = REPOS.map(repo => {
      const list = state.commits[repo] ?? [];
      if (list.length === 0) return `<div><h3>${esc(repo)}</h3><p class="hub-empty">(없음)</p></div>`;
      return `<div><h3>${esc(repo)}</h3><ul class="hub-list">${list.map(c => `
        <li><span class="hub-hash">${esc(c.hash)}</span><span class="hub-date">${esc(c.date)}</span><span>${inline(c.subject)}</span></li>
      `).join('')}</ul></div>`;
    }).join('');
  }

  function renderTools(container: HTMLElement, state: QuestlogHub): void {
    const root = container.querySelector('[data-hub="tools"]') as HTMLElement | null;
    if (!root) return;
    const cmd = state.tools.commands;
    const hk = state.tools.hooks;
    const sh = state.tools.settingsHooks;
    root.innerHTML = `
      <div class="hub-card">
        <h3>~/.claude/commands/ (슬래시 커맨드)</h3>
        ${cmd.length === 0 ? '<p class="hub-empty">(없음)</p>' : `<ul class="hub-tool-list">${cmd.map(f => `<li><code>/${esc(f.replace(/\.md$/, ''))}</code></li>`).join('')}</ul>`}
      </div>
      <div class="hub-card">
        <h3>~/.claude/hooks/ (hook 스크립트)</h3>
        ${hk.length === 0 ? '<p class="hub-empty">(없음)</p>' : `<ul class="hub-tool-list">${hk.map(f => `<li><code>${esc(f)}</code></li>`).join('')}</ul>`}
      </div>
      <div class="hub-card">
        <h3>settings.json hooks 등록</h3>
        ${Object.keys(sh).length === 0 ? '<p class="hub-empty">(없음)</p>' : `<ul class="hub-tool-list">${Object.entries(sh).map(([k, v]) => `<li><strong>${esc(k)}</strong>: <code>${esc(v)}</code></li>`).join('')}</ul>`}
      </div>
    `;
  }

  function renderRules(container: HTMLElement, state: QuestlogHub): void {
    const root = container.querySelector('[data-hub="rules"]') as HTMLElement | null;
    if (!root) return;
    if (state.rules.length === 0) {
      root.innerHTML = `<p class="hub-empty">(룰 없음)</p>`;
      return;
    }
    root.innerHTML = `<table class="hub-table">
      <thead><tr><th>카테고리</th><th>Canonical</th><th>Cite/포인터</th></tr></thead>
      <tbody>${state.rules.map(r => `
        <tr><td class="hub-cat">${inline(r.category)}</td><td>${inline(r.canonical)}</td><td>${inline(r.cite)}</td></tr>
      `).join('')}</tbody>
    </table>`;
  }

  // ── 그래프: 파일 소유권 ─────────────────────────────────────────
  async function renderOwnership(container: HTMLElement, state: QuestlogHub): Promise<void> {
    const root = container.querySelector('[data-hub="ownership"]') as HTMLElement | null;
    if (!root) return;
    if (!state.board || state.board.rows.length === 0) {
      root.innerHTML = `<p class="hub-empty">(세션 없음)</p>`;
      return;
    }
    interface Edge { sess: string; file: string; }
    const edges: Edge[] = [];
    const sessFileMap = new Map<string, Set<string>>();
    state.board.rows.forEach((r, idx) => {
      const sessId = `S${idx}`;
      extractFiles(r.targets).forEach(f => {
        edges.push({ sess: sessId, file: f });
        if (!sessFileMap.has(f)) sessFileMap.set(f, new Set());
        sessFileMap.get(f)!.add(sessId);
      });
    });
    if (edges.length === 0) {
      root.innerHTML = `<p class="hub-empty">(타겟 파일 없음)</p>`;
      return;
    }
    const sessNodes = state.board.rows.map((r, idx) => {
      const label = (r.topic.split(/[—:.\n]/)[0] ?? r.topic).slice(0, 28).trim();
      const cls = /-?done$|done$/.test(r.status) ? ':::done'
        : /committing|pending|진입|대기/.test(r.status) ? ':::active'
        : /verify/.test(r.status) ? ':::warn' : ':::other';
      return `S${idx}["${escMermaid(label)}<br/>(${escMermaid(r.status)})"]${cls}`;
    });
    const fileIdMap = new Map<string, string>();
    sessFileMap.forEach((_, f) => { fileIdMap.set(f, `F${hash6(f)}`); });
    const fileNodes: string[] = [];
    sessFileMap.forEach((sessSet, f) => {
      const id = fileIdMap.get(f)!;
      const conflict = sessSet.size > 1;
      const safe = escMermaid(f.length > 38 ? f.slice(0, 36) + '…' : f);
      fileNodes.push(`${id}["${safe}"]${conflict ? ':::conflict' : ''}`);
    });
    const links = edges.map(e => `${e.sess} --- ${fileIdMap.get(e.file)}`);
    // magazine 톤 — accent (#d4a849), ink (#f2f2ee), paper (#12151c).
    const code = [
      'graph LR',
      ...sessNodes,
      ...fileNodes,
      ...links,
      'classDef done fill:#f2f2ee,stroke:#f2f2ee,color:#0b0d12',
      'classDef active fill:#d4a849,stroke:#d4a849,color:#0b0d12',
      'classDef warn fill:#12151c,stroke:#d4a849,color:#d4a849,stroke-dasharray:3 3',
      'classDef other fill:#12151c,stroke:#3d4557,color:#9a9a94,stroke-dasharray:3 3',
      'classDef conflict fill:#12151c,stroke:#d4a849,color:#d4a849,stroke-width:2px',
    ].join('\n');
    await renderMermaid(root, 'kl-ql-ownership', code);
  }

  // ── 그래프: 룰 단일 출처 네트워크 ───────────────────────────────
  async function renderRulesGraph(container: HTMLElement, state: QuestlogHub): Promise<void> {
    const root = container.querySelector('[data-hub="rules-graph"]') as HTMLElement | null;
    if (!root) return;
    if (state.rules.length === 0) {
      root.innerHTML = `<p class="hub-empty">(룰 없음)</p>`;
      return;
    }
    const nodes = new Set<string>();
    const edges: string[] = [];
    state.rules.forEach((r, idx) => {
      const canonicalKey = (r.canonical.match(/^([KSWM])\b/)?.[1]) ?? `R${idx}`;
      const ruleLabel = escMermaid(r.category.replace(/\*\*/g, '').slice(0, 26));
      nodes.add(`R${idx}["${ruleLabel}"]`);
      nodes.add(`${canonicalKey}((${escMermaid(canonicalKey)}))`);
      edges.push(`${canonicalKey} -->|정본| R${idx}`);
      const citeText = r.cite.replace(/\*\*/g, '').trim();
      if (citeText && !/cite 없음|repo-specific|S repo-specific/.test(citeText)) {
        const citeShort = escMermaid(citeText.slice(0, 30));
        const citeId = `C${idx}`;
        nodes.add(`${citeId}["${citeShort}"]`);
        edges.push(`R${idx} -.->|cite| ${citeId}`);
      }
    });
    const code = ['graph LR', ...Array.from(nodes), ...edges].join('\n');
    await renderMermaid(root, 'kl-ql-rules-net', code);
  }

  // ── Mermaid 렌더 ────────────────────────────────────────────────
  let mermaidCounter = 0;
  async function renderMermaid(root: HTMLElement, idPrefix: string, code: string): Promise<void> {
    try {
      const m = await loadMermaid();
      mermaidCounter++;
      const id = `${idPrefix}-${mermaidCounter}`;
      const { svg } = await m.render(id, code);
      root.innerHTML = svg;
    } catch (e) {
      console.error('mermaid 렌더 실패', e);
      root.innerHTML = `<p class="hub-empty">그래프 렌더 실패: ${esc(String(e))}</p><pre>${esc(code)}</pre>`;
    }
  }

  // ── 백틱 안 파일 추출 ───────────────────────────────────────────
  function extractFiles(targets: string): string[] {
    const set = new Set<string>();
    const re = /`([^`]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(targets)) !== null) {
      const inner = m[1].trim();
      if (inner.length > 0 && inner.length < 200) set.add(inner);
    }
    return Array.from(set);
  }

  // ── 외부 노출 — quest-log.ts 가 build() 끝에서 호출 ──────────────
  // CSS 정본 = quest-log.ts. injectStyles 폐기.
  (window as any).KARMOLAB_QUESTLOG_HUB = {
    renderHub(container: HTMLElement): void {
      renderShell(container);
      startPolling(container);
    }
  };
})();
