/**
 * karmoddrine-map — umbrella 아키텍처 (Tauri 데스크톱 전용).
 *
 * TASK-KAR-091 Phase 1 — 미니멀 문서. 색·아이콘·카드 강조 X. 헤딩 + 표만.
 */
(function (): void {
  if (typeof Toolbox === 'undefined') return;
  const tb = Toolbox;

  type Cluster = 'umbrella' | 'wm' | 'kl' | 'yb' | 'kar' | 'life' | 'infra';
  type EdgeKind = 'deploys' | 'depends' | 'mcp' | 'webhook' | 'data' | 'rule';

  interface MapNode { id: string; label: string; cluster: Cluster; desc?: string; link?: string; }
  interface CrossEdge { source: string; target: string; kind: EdgeKind; note?: string; }
  interface ClusterDef { id: Cluster; label: string; body: string; }

  const CLUSTERS: ClusterDef[] = [
    { id: 'umbrella', label: 'umbrella', body: '로컬 디렉토리 (git X). 3 핵심 독립 git repo co-located.' },
    { id: 'wm', label: 'WM', body: 'Witch-Mendokusai Unity 인디게임.' },
    { id: 'kl', label: 'KL', body: 'KarmoLab. Tauri 데스크톱 + 웹 위젯 + AI.' },
    { id: 'yb', label: 'YB', body: 'YawnBot. Discord 봇 (욘봇).' },
    { id: 'kar', label: 'KAR', body: '메타 인프라. 룰 / TASK / hooks / skills / commands.' },
    { id: 'life', label: 'LIFE', body: '음성 캡처 + 데이터 레이크.' },
    { id: 'infra', label: 'infra', body: '공유 외부 시스템 + 3 레포 자체.' }
  ];

  const NODES: MapNode[] = [
    { id: 'karmoddrine', label: 'karmoddrine', cluster: 'umbrella', desc: '3 레포 + 외부 시스템 묶음.' },

    { id: 'wm-repo', label: 'Witch-Mendokusai', cluster: 'wm', desc: 'git repo. main 직접 push.', link: 'WitchMendokusai/' },
    { id: 'wm-unity', label: 'Unity 게임', cluster: 'wm', desc: 'HomeInside hub. 욘 + 알리사 + 링 + Fourth.' },
    { id: 'wm-memo', label: 'memo/wm', cluster: 'wm', desc: '디자인 / 캐릭터 / framework.', link: 'memo/wm/' },

    { id: 'kl-tauri', label: 'KarmoLab Tauri', cluster: 'kl', desc: '데스크톱 앱. 위젯 호스트.' },
    { id: 'kl-web', label: 'apps/karmolab', cluster: 'kl', desc: '웹 위젯 (TS). WebView 컨텐츠.' },
    { id: 'kl-ai', label: 'karmolab-ai', cluster: 'kl', desc: 'Vertex AI / Google Cloud 유틸 패키지.' },
    { id: 'kl-sm', label: 'Server Monitor', cluster: 'kl', desc: 'dev 카드 + localdev HTTP.' },

    { id: 'yb-deploy', label: 'deploy-discord-bots', cluster: 'yb', desc: 'master push 자동 배포 workflow.' },
    { id: 'yb-prod', label: 'yawnbot prod', cluster: 'yb', desc: '노트북 24/7 NSSM + cloudflared.' },
    { id: 'yb-dev', label: 'yawnbot dev', cluster: 'yb', desc: '데스크톱 dev 전용.' },

    { id: 'kar-INDEX', label: 'INDEX 지도', cluster: 'kar', desc: '지도 트리 루트.', link: 'memo/INDEX.md' },
    { id: 'kar-rules', label: '룰 정본', cluster: 'kar', desc: 'memo/rules/<cat>.md.' },
    { id: 'kar-tasks', label: 'TASK', cluster: 'kar', desc: 'TASK-KAR-NNN.' },
    { id: 'kar-hooks', label: '.claude/hooks', cluster: 'kar', desc: 'SessionStart / PostTool / Stop.' },
    { id: 'kar-skills', label: '.claude/skills', cluster: 'kar' },
    { id: 'kar-commands', label: '.claude/commands', cluster: 'kar' },
    { id: 'kar-active', label: '세션 보드', cluster: 'kar', desc: '병렬 슬롯 A/B/C/D.' },

    { id: 'life-voice', label: 'LIFE voice', cluster: 'life', desc: 'Whisper Ctrl+Alt+Space hold-to-talk.' },
    { id: 'life-lake', label: 'LIFE 데이터 레이크', cluster: 'life', desc: 'raw / processed / digest.' },

    { id: 'memo-repo', label: 'memo', cluster: 'infra', desc: '지식베이스 git repo.', link: 'memo/' },
    { id: 'ghio-repo', label: 'Mascari4615.github.io', cluster: 'infra', desc: '블로그 + 봇 + 앱 monorepo.' },
    { id: 'mcp-unity', label: 'Unity MCP', cluster: 'infra', desc: 'Unity Editor ↔ Claude.' },
    { id: 'gh-actions', label: 'GitHub Actions', cluster: 'infra', desc: 'verify / deploy / claude-audit / pages.' },
    { id: 'discord', label: 'Discord 본진', cluster: 'infra', desc: 'yawnbot 호스트 서버.' }
  ];

  const EDGES: CrossEdge[] = [
    { source: 'gh-actions', target: 'yb-deploy', kind: 'deploys', note: 'master push 발동' },
    { source: 'yb-deploy', target: 'yb-prod', kind: 'deploys', note: 'reset + build + nssm restart' },
    { source: 'gh-actions', target: 'wm-repo', kind: 'deploys', note: 'claude-audit (Tier 1+2)' },
    { source: 'gh-actions', target: 'ghio-repo', kind: 'deploys', note: 'pages' },
    { source: 'yb-prod', target: 'discord', kind: 'webhook' },
    { source: 'yb-dev', target: 'discord', kind: 'webhook' },
    { source: 'kl-sm', target: 'yb-dev', kind: 'depends', note: '카드로 기동/종료' },
    { source: 'kl-tauri', target: 'kl-ai', kind: 'depends' },
    { source: 'kl-tauri', target: 'life-voice', kind: 'depends', note: '단일 process' },
    { source: 'life-voice', target: 'life-lake', kind: 'data' },
    { source: 'mcp-unity', target: 'wm-unity', kind: 'mcp' },
    { source: 'kar-rules', target: 'wm-repo', kind: 'rule' },
    { source: 'kar-rules', target: 'kl-tauri', kind: 'rule' },
    { source: 'kar-rules', target: 'yb-prod', kind: 'rule' },
    { source: 'kar-INDEX', target: 'kar-rules', kind: 'depends', note: '지도 → 룰 cite' }
  ];

  const EDGE_LABEL: Record<EdgeKind, string> = {
    deploys: 'deploys', depends: 'depends', mcp: 'mcp', webhook: 'webhook', data: 'data', rule: 'rule'
  };

  const NODE_BY_ID: Record<string, MapNode> = NODES.reduce((acc, n) => { acc[n.id] = n; return acc; }, {} as Record<string, MapNode>);

  // ── C4 model 다이어그램 (Mermaid) ──────────────────────────────
  const C4_CONTEXT = `C4Context
    title System Context — karmoddrine

    Person(dev, "Mascari4615", "1인 개발자")
    System(karmoddrine, "karmoddrine", "로컬 monorepo umbrella (WM · memo · ghio)")

    System_Ext(discord, "Discord", "yawnbot 본진 서버")
    System_Ext(gh, "GitHub Actions", "verify / deploy / claude-audit")
    System_Ext(vertex, "Vertex AI / Claude", "LLM (Gemini · Claude API)")
    System_Ext(unity, "Unity Editor", "MCP 호스트 + 게임 빌드")
    System_Ext(cf, "Cloudflare Tunnel", "named tunnel · yawnbot.mascari4615.com")

    Rel(dev, karmoddrine, "코드 / TASK / 룰 편집")
    Rel(karmoddrine, gh, "push → CI 트리거")
    Rel(karmoddrine, vertex, "API 호출 (KarmoLab · WM)")
    Rel(karmoddrine, unity, "MCP 채널")
    Rel(karmoddrine, discord, "yawnbot 메시지")
    Rel(karmoddrine, cf, "prod URL 노출")
  `;

  const C4_CONTAINER = `C4Container
    title Container — karmoddrine 안

    Person(dev, "Mascari4615", "1인 개발자")

    System_Boundary(km, "karmoddrine") {
      Container(wm, "WM — Unity 게임", "C# / Unity", "욘 + 인형 + Fourth · HomeInside hub")
      Container(klTauri, "KarmoLab Tauri", "Rust + WebView2", "데스크톱 앱 · 위젯 호스트")
      Container(klWeb, "apps/karmolab", "TypeScript / esbuild", "위젯 (WebView 컨텐츠)")
      Container(klAi, "karmolab-ai", "TypeScript 패키지", "Vertex / Google Cloud 유틸")
      Container(ybProd, "yawnbot prod", "Node / Discord.js", "노트북 24/7 NSSM")
      Container(ybDev, "yawnbot dev", "Node / Discord.js", "데스크톱 dev")
      Container(ybDeploy, "deploy-discord-bots", "GH Actions workflow", "self-hosted runner")
      ContainerDb(memo, "memo 레포", "git", "룰 · TASK · 캐릭터 · 디자인 · INDEX")
      ContainerDb(ghio, "Mascari4615.github.io", "git", "블로그 + 봇 + 앱 monorepo")
    }

    System_Ext(discord, "Discord 본진", "")
    System_Ext(gh, "GitHub Actions", "")
    System_Ext(vertex, "Vertex AI", "")
    System_Ext(unity, "Unity Editor (MCP)", "")

    Rel(dev, klTauri, "데스크톱 사용")
    Rel(dev, wm, "Unity Editor 작업")
    Rel(klTauri, klWeb, "WebView 호스트")
    Rel(klTauri, klAi, "Vertex 호출")
    Rel(klAi, vertex, "API")
    Rel(unity, wm, "MCP 명령")
    Rel(gh, ybDeploy, "master push 발동")
    Rel(ybDeploy, ybProd, "git reset + build + nssm restart")
    Rel(gh, ghio, "pages 배포")
    Rel(gh, wm, "claude-audit")
    Rel(ybProd, discord, "메시지 / webhook")
    Rel(ybDev, discord, "메시지 (dev 라벨)")
    Rel(klTauri, ybDev, "Server Monitor 카드 기동")
    Rel(memo, klTauri, "TASK · QuestLog · INDEX read")
    Rel(memo, wm, "디자인 / 룰 cite")
  `;

  let mermaidLoadPromise: Promise<any> | null = null;
  function loadMermaid(): Promise<any> {
    const w = window as unknown as { mermaid?: any };
    const got = w.mermaid && (typeof w.mermaid.render === 'function' || (w.mermaid.default && typeof w.mermaid.default.render === 'function'))
      ? (w.mermaid.default || w.mermaid) : null;
    if (got) return Promise.resolve(got);
    if (mermaidLoadPromise) return mermaidLoadPromise;
    if (typeof tb.ensureScript !== 'function') return Promise.reject(new Error('ensureScript unavailable'));
    mermaidLoadPromise = tb.ensureScript('vendor/mermaid.min').then(() => {
      const ww = window as unknown as { mermaid?: any };
      const api = ww.mermaid && (ww.mermaid.default || ww.mermaid);
      if (api && typeof api.initialize === 'function') {
        api.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
      }
      return api;
    });
    return mermaidLoadPromise;
  }

  async function renderMermaid(el: HTMLElement, src: string, id: string): Promise<void> {
    try {
      const mm = await loadMermaid();
      if (mm && typeof mm.render === 'function') {
        const { svg } = await mm.render(id, src);
        el.innerHTML = svg;
      } else {
        el.textContent = 'mermaid API unavailable';
      }
    } catch (e: any) {
      el.innerHTML = `<pre style="color:var(--text-tertiary);font-size:11px;white-space:pre-wrap">mermaid render fail: ${esc(String(e?.message || e))}</pre>`;
    }
  }

  function injectStyles(): void {
    if (document.getElementById('km-map-styles')) return;
    const css = `
      .km-scroll { height: calc(100vh - 60px); overflow-y: auto; overflow-x: hidden; }
      .km-doc { color: var(--text-primary, #e8e8e8); max-width: 920px; margin: 0 auto; padding: 32px 24px 96px; font-size: 13px; line-height: 1.6; font-family: var(--font-sans, system-ui, sans-serif); }
      .km-doc h1 { font-size: 18px; font-weight: 500; margin: 0 0 24px; letter-spacing: -0.01em; }
      .km-doc h2 { font-size: 13px; font-weight: 500; margin: 36px 0 8px; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.08em; }
      .km-doc h2::before { content: '— '; opacity: 0.4; }
      .km-doc p { margin: 0 0 12px; color: var(--text-secondary, #ccc); }
      .km-doc code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; color: var(--text-primary); }
      .km-doc a { color: var(--text-primary); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; text-decoration-color: rgba(255,255,255,0.2); }
      .km-doc a:hover { text-decoration-color: var(--text-primary); }
      .km-doc table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 12px; }
      .km-doc th, .km-doc td { padding: 6px 12px 6px 0; text-align: left; vertical-align: top; border: none; }
      .km-doc th { color: var(--text-tertiary, #888); font-weight: 400; font-size: 11px; padding-bottom: 8px; }
      .km-doc tbody tr { border-top: 1px solid rgba(255,255,255,0.05); }
      .km-doc tbody td { color: var(--text-secondary, #ccc); }
      .km-doc tbody td:first-child { color: var(--text-primary); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; white-space: nowrap; }
      .km-doc .km-id { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; color: var(--text-tertiary, #888); }
      .km-doc .km-arrow { color: var(--text-tertiary, #666); padding: 0 4px; }
      .km-doc .km-kind { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; color: var(--text-tertiary, #888); }
      .km-doc .km-mermaid { margin: 8px 0 24px; background: var(--bg-secondary, rgba(255,255,255,0.02)); border-radius: 4px; padding: 16px; min-height: 60px; overflow-x: auto; }
      .km-doc .km-mermaid svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
      .km-doc .km-ascii { font-family: var(--font-mono, ui-monospace, "Cascadia Code", "JetBrains Mono", monospace); font-size: 11px; line-height: 1.3; white-space: pre; overflow-x: auto; margin: 8px 0 4px; padding: 16px; background: transparent; color: var(--text-primary); border: none; }
    `;
    const tag = document.createElement('style');
    tag.id = 'km-map-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function esc(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function md(s: string): string {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function render(container: HTMLElement): void {
    injectStyles();
    container.innerHTML = '';
    const doc = document.createElement('article');
    doc.className = 'km-doc';

    let html = '<h1>karmoddrine</h1>';
    html += `<p>로컬 monorepo umbrella. 3 핵심 독립 git repo 가 co-located. cluster ${CLUSTERS.length} 개 / 멤버 ${NODES.length} / 관계 ${EDGES.length}.</p>`;

    // ── hand-laid ASCII map (얽힘 0 — 자동 layout 폐기, 사람 손) ─────
    const asciiMap = [
      '',
      '                              [사용자 · Mascari4615]',
      '                                       │',
      '                                       │  코드 · TASK · 룰',
      '                                       ▼',
      '                          ┌──────────────────────────┐',
      '                          │       karmoddrine        │',
      '                          │   (로컬 monorepo · git X)│',
      '                          └────┬────────┬────────┬───┘',
      '                               │        │        │',
      '             ┌─────────────────┘        │        └─────────────────┐',
      '             ▼                          ▼                          ▼',
      '   ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────────┐',
      '   │  WM (Unity 게임) │      │  memo (지식베이스)│      │  Mascari4615.github  │',
      '   │  · Unity 프로젝트│      │  · 룰 / TASK     │      │  · 블로그 + 봇 + 앱  │',
      '   │  · 캐릭터 4 인   │◀─룰──│  · INDEX / hooks │──룰─▶│  (KarmoLab · YawnBot)│',
      '   │  · HomeInside    │      │  · skills /      │      │                      │',
      '   │    hub           │      │    commands      │      │                      │',
      '   └────────┬─────────┘      └──────────────────┘      └──┬────────────────┬──┘',
      '            │                                             │                │',
      '         MCP│                                       Tauri │                │ 배포',
      '            │                                             ▼                ▼',
      '   ┌────────▼─────────┐                          ┌──────────────┐  ┌──────────────┐',
      '   │  Unity Editor    │                          │  KarmoLab    │  │  yawnbot     │',
      '   │  (외부)          │                          │  Tauri 데스크│  │  prod        │',
      '   └──────────────────┘                          │  · 위젯 호스트│  │  (노트북 24/7│',
      '                                                 │  · AI 호출   │  │   NSSM)      │',
      '                                                 │  · LIFE voice│  └──────┬───────┘',
      '                                                 └──────┬───────┘         │',
      '                                                        │                 │',
      '                                                 의존   │ Vertex          │ webhook',
      '                                                        ▼                 ▼',
      '                                                 ┌──────────────┐  ┌──────────────┐',
      '                                                 │  Vertex AI / │  │  Discord 본진│',
      '                                                 │  Google Cloud│  │  (욘봇 카테고│',
      '                                                 │  (외부)      │  │   리 자동)   │',
      '                                                 └──────────────┘  └──────────────┘',
      '',
      '   범례: ───▶ 흐름 / ◀── 룰 적용 / MCP·webhook = 채널 종류',
      ''
    ].join('\n');
    html += '<h2>한 장 지도</h2>';
    html += `<pre class="km-ascii">${esc(asciiMap)}</pre>`;
    html += '<p style="font-size:11px;color:var(--text-tertiary);margin-top:-8px;margin-bottom:24px">손으로 깎은 ASCII 다이어그램 (자동 layout 폐기). 얽힘 = 0. 정확한 표·관계는 아래.</p>';

    // cluster 표
    html += '<h2>cluster</h2><table><thead><tr><th>id</th><th>한 줄</th></tr></thead><tbody>';
    CLUSTERS.forEach((c) => {
      html += `<tr><td>${esc(c.label)}</td><td>${md(c.body)}</td></tr>`;
    });
    html += '</tbody></table>';

    // cluster 별 멤버
    CLUSTERS.forEach((c) => {
      const members = NODES.filter((n) => n.cluster === c.id);
      if (members.length === 0) return;
      html += `<h2>${esc(c.label)} 멤버</h2><table><thead><tr><th>id</th><th>라벨</th><th>비고</th></tr></thead><tbody>`;
      members.forEach((n) => {
        const note = [n.desc, n.link ? `<code>${esc(n.link)}</code>` : ''].filter(Boolean).join(' · ');
        html += `<tr><td>${esc(n.id)}</td><td>${esc(n.label)}</td><td>${md(note || '—')}</td></tr>`;
      });
      html += '</tbody></table>';
    });

    // 관계 표
    html += `<h2>관계 (${EDGES.length})</h2><table><thead><tr><th>종류</th><th>출발</th><th></th><th>도착</th><th>비고</th></tr></thead><tbody>`;
    EDGES.forEach((e) => {
      const s = NODE_BY_ID[e.source];
      const t = NODE_BY_ID[e.target];
      html += `<tr>
        <td><span class="km-kind">${esc(EDGE_LABEL[e.kind])}</span></td>
        <td>${esc(s?.label || e.source)} <span class="km-id">${esc(e.source)}</span></td>
        <td class="km-arrow">→</td>
        <td>${esc(t?.label || e.target)} <span class="km-id">${esc(e.target)}</span></td>
        <td>${e.note ? md(e.note) : '—'}</td>
      </tr>`;
    });
    html += '</tbody></table>';

    // 실행 토폴로지
    html += '<h2>실행 토폴로지</h2><table><tbody>';
    [
      ['yawnbot prod', '노트북 24/7 NSSM + cloudflared `yawnbot.mascari4615.com`.'],
      ['yawnbot dev', '데스크톱 servermonitor 카드. dev 토큰/길드.'],
      ['KarmoLab Tauri prod', '`frontendDist = https://blog.mascari4615.com/karmolab/` (원격).'],
      ['KarmoLab dev 모드', '트레이 토글 → 로컬 8899 정적 서버 webview navigate.'],
      ['WM trunk-based', 'main 직접 push. claude-audit Tier 1 (bash grep) + Tier 2 (semantic).'],
      ['배포 자동', '`master` push + 해당 path 변경 → 자동. 수동 트리거 X.']
    ].forEach(([k, v]) => {
      html += `<tr><td>${esc(k)}</td><td>${md(v)}</td></tr>`;
    });
    html += '</tbody></table>';

    // 정본 위치
    html += '<h2>정본 위치</h2><table><tbody>';
    [
      ['룰', '`memo/rules/<cat>.md`'],
      ['TASK 스키마', '`memo/TASK-SCHEMA.md`'],
      ['WM 비전', '`memo/CLAUDE.md` + `memo/wm/design/vision/architecture.md`'],
      ['Claude 환경', '`memo/dotfiles/`'],
      ['KarmoLab 릴리스', '`memo/projects/karmolab/dev/release-flow.md`'],
      ['verify', '`Mascari4615.github.io/scripts/verify.mjs`'],
      ['지도 트리 루트', '`memo/INDEX.md`']
    ].forEach(([k, v]) => {
      html += `<tr><td>${esc(k)}</td><td>${md(v)}</td></tr>`;
    });
    html += '</tbody></table>';

    doc.innerHTML = html;
    const wrap = document.createElement('div');
    wrap.className = 'km-scroll';
    wrap.appendChild(doc);
    container.appendChild(wrap);
  }

  tb.register({
    ...(tb.getLazyWidgetPublicMeta ? tb.getLazyWidgetPublicMeta('karmoddrine-map') : { id: 'karmoddrine-map' }),
    tabs: [
      {
        id: 'map',
        label: 'karmoddrine',
        build(container: HTMLElement) {
          render(container);
        }
      }
    ]
  });
})();
