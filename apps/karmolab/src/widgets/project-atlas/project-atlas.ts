/**
 * Project Atlas
 *
 * A light-weight entry widget for understanding KarmoLab / WM / memo.
 * The first screen stays small on purpose: pick a path, then dive deeper.
 */
(function (): void {
  if (typeof Toolbox === 'undefined') return;

  type AtlasMode = 'start' | 'walkthrough' | 'reference';
  type CoreId = 'karmoddrine' | 'karmolab' | 'memo' | 'wm';

  interface MetaStub {
    id: string;
    title?: string;
    category?: string;
    layout?: string;
    hidden?: boolean;
    desktopOnly?: boolean;
  }

  interface ServerMonitorConfig {
    devProfiles?: unknown[];
    localMonitors?: unknown[];
    envFiles?: unknown[];
  }

  interface CoreArea {
    id: CoreId;
    title: string;
    kind: string;
    path: string;
    summary: string;
    when: string[];
    files: string[];
    links: Array<{ label: string; widget?: string }>;
  }

  interface WalkStep {
    title: string;
    goal: string;
    steps: string[];
    widget?: string;
  }

  const MODES: Array<{ id: AtlasMode; label: string; note: string }> = [
    { id: 'start', label: 'Start', note: '처음 보는 입구' },
    { id: 'walkthrough', label: 'Walkthrough', note: '순서대로 따라보기' },
    { id: 'reference', label: 'Reference', note: '필요할 때만 펼쳐보기' },
  ];

  const CORE_AREAS: CoreArea[] = [
    {
      id: 'karmoddrine',
      title: 'karmoddrine',
      kind: 'umbrella workspace',
      path: 'C:/Users/masca/repos/karmoddrine',
      summary: '여러 repo를 한 작업공간에서 같이 다루는 루트다.',
      when: ['어느 repo로 들어가야 할지 헷갈릴 때', '전체 관계를 먼저 보고 싶을 때'],
      files: ['AGENTS.md', 'memo/UMBRELLA.md', 'memo/INDEX.md'],
      links: [{ label: 'Docs', widget: 'docs' }, { label: 'Quest Log', widget: 'quest-log' }],
    },
    {
      id: 'karmolab',
      title: 'KarmoLab',
      kind: 'web app',
      path: 'Mascari4615.github.io/apps/karmolab/',
      summary: '브라우저에서 보이는 앱 본체다. 위젯 수정은 거의 여기서 시작한다.',
      when: ['위젯 UI를 고칠 때', '웹 기능을 추가할 때', '로딩 흐름을 볼 때'],
      files: ['src/widgets-lazy-meta.ts', 'src/widgets/', 'src/toolbox.ts', 'build.mjs'],
      links: [{ label: 'KarmoMap', widget: 'karmomap' }, { label: 'Server Monitor', widget: 'servermonitor' }],
    },
    {
      id: 'memo',
      title: 'memo',
      kind: 'docs and tasks',
      path: 'memo/',
      summary: '규칙, TASK, 설계 문서가 들어 있는 지식 repo다.',
      when: ['작업 상태를 볼 때', '규칙과 설계 배경을 볼 때'],
      files: ['projects/', 'wm/', 'UMBRELLA.md'],
      links: [{ label: 'Docs', widget: 'docs' }, { label: 'Quest Log', widget: 'quest-log' }],
    },
    {
      id: 'wm',
      title: 'WitchMendokusai',
      kind: 'Unity game repo',
      path: 'WitchMendokusai/',
      summary: '실제 게임 본체다. KarmoLab은 이 repo를 설명하고 돕는 쪽이다.',
      when: ['게임 로직을 수정할 때', '입력이나 에셋을 다룰 때'],
      files: ['Assets/_WitchMendokusai/', 'ProjectSettings/', 'AGENTS.md'],
      links: [{ label: 'WM', widget: 'wm' }],
    },
  ];

  const WALK_STEPS: WalkStep[] = [
    {
      title: '1. 위젯 이름부터 찾기',
      goal: '수정하려는 화면 이름과 위젯 이름을 연결한다.',
      steps: [
        '먼저 지금 보이는 화면이 어떤 위젯인지 찾는다.',
        '모르면 Features 목록 대신 KarmoLab 화면에서 이름을 먼저 확인한다.',
        '그 다음 widgets-lazy-meta.ts에서 같은 id를 찾는다.',
      ],
    },
    {
      title: '2. 실제 파일로 내려가기',
      goal: '화면과 TS 파일을 연결한다.',
      steps: [
        'widgets-lazy-meta.ts의 lazyScriptPaths를 본다.',
        '가리키는 src/widgets/... 파일을 연다.',
        '거기서 innerHTML, event listener, Toolbox.register를 먼저 찾는다.',
      ],
      widget: 'project-atlas',
    },
    {
      title: '3. 기존 기능부터 재사용하기',
      goal: '새로 짜기 전에 이미 있는 helper와 위젯을 먼저 쓴다.',
      steps: [
        'docs, karmomap, quest-log, servermonitor 중 비슷한 게 있는지 본다.',
        'toolbox.ts와 widgets/README.md 패턴을 먼저 본다.',
        '재사용이 어렵다면 그 지점이 개선 대상이다.',
      ],
      widget: 'docs',
    },
    {
      title: '4. 최소 검증만 바로 돌리기',
      goal: '수정 후 바로 깨짐 여부를 본다.',
      steps: [
        'tsc --noEmit',
        'node build.mjs',
        '필요하면 실제 위젯 열어서 화면 확인',
      ],
      widget: 'servermonitor',
    },
  ];

  let activeMode: AtlasMode = 'start';
  let activeCoreId: CoreId = 'karmolab';
  let serverConfig: ServerMonitorConfig | null = null;

  function esc(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lazyMeta(): MetaStub[] {
    const meta = (window as unknown as { KARMOLAB_LAZY_META?: MetaStub[] }).KARMOLAB_LAZY_META;
    return Array.isArray(meta) ? meta.filter((item) => item && item.id) : [];
  }

  function visibleWidgets(): MetaStub[] {
    return lazyMeta().filter((item) => !item.hidden);
  }

  function currentCore(): CoreArea {
    return CORE_AREAS.find((item) => item.id === activeCoreId) || CORE_AREAS[0];
  }

  function openWidgetButton(label: string, widget: string): string {
    return `<button type="button" class="pa-chip" data-open-widget="${esc(widget)}">${esc(label)}</button>`;
  }

  function runtimeSummaryHtml(): string {
    const widgets = visibleWidgets();
    const desktopCount = lazyMeta().filter((item) => item.desktopOnly).length;
    const devProfiles = serverConfig?.devProfiles?.length ?? 0;
    return `
      <section class="pa-stats">
        <article class="pa-stat"><b>${widgets.length}</b><span>visible widgets</span></article>
        <article class="pa-stat"><b>${desktopCount}</b><span>desktop-only widgets</span></article>
        <article class="pa-stat"><b>${devProfiles}</b><span>server profiles</span></article>
      </section>`;
  }

  function sidePanelHtml(): string {
    const area = currentCore();
    return `
      <aside class="pa-side">
        <div class="pa-tag">${esc(area.kind)}</div>
        <h2>${esc(area.title)}</h2>
        <p class="pa-summary">${esc(area.summary)}</p>
        <div class="pa-fact">
          <span>Path</span>
          <code>${esc(area.path)}</code>
        </div>
        <section class="pa-side-block">
          <h3>여길 볼 때</h3>
          <ul>${area.when.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        </section>
        <section class="pa-side-block">
          <h3>먼저 여는 파일</h3>
          <div class="pa-chip-row">${area.files.map((item) => `<code>${esc(item)}</code>`).join('')}</div>
        </section>
        <section class="pa-side-block">
          <h3>관련 위젯</h3>
          <div class="pa-chip-row">
            ${area.links.map((link) => link.widget ? openWidgetButton(link.label, link.widget) : '').join('')}
          </div>
        </section>
      </aside>`;
  }

  function startHtml(): string {
    return `
      <div class="pa-main">
        <section class="pa-hero">
          <div>
            <p class="pa-kicker">Project Atlas</p>
            <h1>처음에는 세 가지만 고르면 된다</h1>
            <p class="pa-lede">전체 구조를 볼지, 순서대로 따라볼지, 수정할 파일을 찾을지부터 고른다. 나머지 정보는 뒤로 뺀다.</p>
          </div>
          <div class="pa-tabs">
            ${MODES.map((mode) => `
              <button type="button" class="${mode.id === activeMode ? 'is-on' : ''}" data-mode="${mode.id}">
                <b>${esc(mode.label)}</b><span>${esc(mode.note)}</span>
              </button>`).join('')}
          </div>
        </section>
        ${runtimeSummaryHtml()}
        <section class="pa-section">
          <div class="pa-section-head">
            <div>
              <p class="pa-kicker">Choose one path</p>
              <h2>지금 필요한 입구</h2>
            </div>
          </div>
          <div class="pa-paths">
            <button type="button" class="pa-path" data-core="karmolab">
              <b>전체 구조 보기</b>
              <span>repo 4개와 핵심 파일만 먼저 본다.</span>
            </button>
            <button type="button" class="pa-path" data-mode="walkthrough">
              <b>처음부터 따라보기</b>
              <span>위젯 찾기 -> 파일 찾기 -> 재사용 -> 검증 순서로 본다.</span>
            </button>
            <button type="button" class="pa-path" data-mode="reference">
              <b>수정할 파일 찾기</b>
              <span>폴더, TS 문법, 패키지, 위젯 메타를 필요할 때만 펼친다.</span>
            </button>
          </div>
        </section>
        <section class="pa-section">
          <div class="pa-section-head">
            <div>
              <p class="pa-kicker">Core areas</p>
              <h2>핵심 영역 4개</h2>
            </div>
            <p class="pa-muted">첫 화면에서는 이것만 기억하면 된다.</p>
          </div>
          <div class="pa-core-grid">
            ${CORE_AREAS.map((area) => `
              <button type="button" class="pa-core ${area.id === activeCoreId ? 'is-selected' : ''}" data-core="${area.id}">
                <span>${esc(area.kind)}</span>
                <h3>${esc(area.title)}</h3>
                <p>${esc(area.summary)}</p>
              </button>`).join('')}
          </div>
        </section>
        <section class="pa-section">
          <div class="pa-section-head">
            <div>
              <p class="pa-kicker">Use existing widgets</p>
              <h2>설명보다 바로 이동</h2>
            </div>
          </div>
          <div class="pa-shortcuts">
            ${openWidgetButton('Docs', 'docs')}
            ${openWidgetButton('KarmoMap', 'karmomap')}
            ${openWidgetButton('Quest Log', 'quest-log')}
            ${openWidgetButton('Server Monitor', 'servermonitor')}
            ${openWidgetButton('WM', 'wm')}
          </div>
        </section>
      </div>
      ${sidePanelHtml()}`;
  }

  function walkthroughHtml(): string {
    return `
      <div class="pa-main">
        <section class="pa-hero pa-hero-compact">
          <div>
            <p class="pa-kicker">Walkthrough</p>
            <h1>복잡한 정보 대신 순서</h1>
            <p class="pa-lede">이 순서대로만 보면 된다. 설명보다 먼저 행동 순서를 고정한다.</p>
          </div>
          <div class="pa-tabs">
            ${MODES.map((mode) => `
              <button type="button" class="${mode.id === activeMode ? 'is-on' : ''}" data-mode="${mode.id}">
                <b>${esc(mode.label)}</b><span>${esc(mode.note)}</span>
              </button>`).join('')}
          </div>
        </section>
        <section class="pa-steps">
          ${WALK_STEPS.map((step) => `
            <article class="pa-step">
              <div class="pa-step-head">
                <h2>${esc(step.title)}</h2>
                <span>${esc(step.goal)}</span>
              </div>
              <ol>${step.steps.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>
              <div class="pa-step-foot">
                ${step.widget ? openWidgetButton(`Open ${step.widget}`, step.widget) : ''}
              </div>
            </article>`).join('')}
        </section>
      </div>
      <aside class="pa-side">
        <div class="pa-tag">beginner rule</div>
        <h2>처음엔 깊게 파지 않는다</h2>
        <p class="pa-summary">TS 전체 문법, 전체 위젯 목록, 전체 폴더 트리를 처음부터 다 읽지 않는다. 지금 수정과 연결되는 것만 본다.</p>
        <section class="pa-side-block">
          <h3>먼저 보는 파일</h3>
          <div class="pa-chip-row">
            <code>src/widgets-lazy-meta.ts</code>
            <code>src/widgets/*</code>
            <code>src/toolbox.ts</code>
            <code>memo/UMBRELLA.md</code>
          </div>
        </section>
      </aside>`;
  }

  function categoryCountsHtml(): string {
    const counts = new Map<string, number>();
    visibleWidgets().forEach((item) => {
      const key = item.category || 'uncategorized';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label, count]) => `<li><b>${count}</b><span>${esc(label)}</span></li>`)
      .join('');
  }

  function visibleWidgetRows(): string {
    return visibleWidgets()
      .slice()
      .sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)))
      .slice(0, 16)
      .map((item) => `
        <tr>
          <td>${openWidgetButton(String(item.title || item.id), item.id)}</td>
          <td>${esc(item.id)}</td>
          <td>${esc(item.category || '-')}</td>
        </tr>`)
      .join('');
  }

  function referenceHtml(): string {
    const profiles = serverConfig?.devProfiles?.length ?? 0;
    const monitors = serverConfig?.localMonitors?.length ?? 0;
    const envFiles = serverConfig?.envFiles?.length ?? 0;
    return `
      <div class="pa-main">
        <section class="pa-hero pa-hero-compact">
          <div>
            <p class="pa-kicker">Reference</p>
            <h1>필요할 때만 펼쳐보기</h1>
            <p class="pa-lede">여긴 시작 화면이 아니라 참고 구역이다. 지금 필요 없는 건 읽지 않아도 된다.</p>
          </div>
          <div class="pa-tabs">
            ${MODES.map((mode) => `
              <button type="button" class="${mode.id === activeMode ? 'is-on' : ''}" data-mode="${mode.id}">
                <b>${esc(mode.label)}</b><span>${esc(mode.note)}</span>
              </button>`).join('')}
          </div>
        </section>
        <section class="pa-section">
          <details class="pa-detail" open>
            <summary>수정할 파일 찾기</summary>
            <div class="pa-detail-body">
              <ol>
                <li><code>widgets-lazy-meta.ts</code> 에서 위젯 id를 찾는다.</li>
                <li><code>lazyScriptPaths</code> 로 실제 <code>src/widgets/...</code> 파일을 연다.</li>
                <li>공용 동작이 필요하면 <code>toolbox.ts</code> 와 비슷한 위젯을 본다.</li>
              </ol>
            </div>
          </details>
          <details class="pa-detail">
            <summary>폴더 구조 한 줄 요약</summary>
            <div class="pa-detail-body">
              <ul>
                <li><code>karmoddrine/</code> = umbrella workspace</li>
                <li><code>Mascari4615.github.io/</code> = 웹앱/봇/shared package</li>
                <li><code>memo/</code> = 규칙/TASK/설계 문서</li>
                <li><code>WitchMendokusai/</code> = Unity 게임 본체</li>
              </ul>
            </div>
          </details>
          <details class="pa-detail">
            <summary>TypeScript를 C#처럼 읽기</summary>
            <div class="pa-detail-body">
              <ul>
                <li><code>interface</code> = data shape / DTO 감각</li>
                <li><code>fetch</code> = HttpClient.GetAsync 감각</li>
                <li><code>addEventListener</code> = UI 이벤트 연결</li>
                <li><code>innerHTML</code> = 코드에서 UI를 직접 그림</li>
              </ul>
            </div>
          </details>
          <details class="pa-detail">
            <summary>현재 기술 스택</summary>
            <div class="pa-detail-body">
              <ul>
                <li>주 언어: TypeScript</li>
                <li>UI: HTML + CSS + local runtime</li>
                <li>빌드: esbuild</li>
                <li>데스크톱 브리지: Tauri</li>
                <li>테스트: Playwright</li>
              </ul>
            </div>
          </details>
          <details class="pa-detail">
            <summary>현재 메타 기준 기능 개요</summary>
            <div class="pa-detail-body">
              <div class="pa-ref-stats">
                <div><b>${profiles}</b><span>server profiles</span></div>
                <div><b>${monitors}</b><span>local monitors</span></div>
                <div><b>${envFiles}</b><span>env files</span></div>
              </div>
              <ul class="pa-count-list">${categoryCountsHtml()}</ul>
              <div class="pa-table-wrap">
                <table class="pa-table">
                  <thead><tr><th>Title</th><th>Id</th><th>Category</th></tr></thead>
                  <tbody>${visibleWidgetRows()}</tbody>
                </table>
              </div>
            </div>
          </details>
        </section>
      </div>
      <aside class="pa-side">
        <div class="pa-tag">reference rule</div>
        <h2>레퍼런스는 consult 용도다</h2>
        <p class="pa-summary">처음부터 읽는 구간이 아니라, 작업 중 막혔을 때 필요한 항목만 펼쳐보는 구간이다. Diataxis 기준으로도 이게 맞다.</p>
        <section class="pa-side-block">
          <h3>바로 가기</h3>
          <div class="pa-chip-row">
            ${openWidgetButton('Docs', 'docs')}
            ${openWidgetButton('KarmoMap', 'karmomap')}
            ${openWidgetButton('Quest Log', 'quest-log')}
          </div>
        </section>
      </aside>`;
  }

  function render(container: HTMLElement): void {
    container.classList.add('project-atlas');
    container.innerHTML =
      activeMode === 'walkthrough' ? walkthroughHtml() :
      activeMode === 'reference' ? referenceHtml() :
      startHtml();
  }

  function wire(container: HTMLElement): void {
    container.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;

      const modeButton = target.closest<HTMLElement>('[data-mode]');
      if (modeButton?.dataset.mode) {
        activeMode = modeButton.dataset.mode as AtlasMode;
        render(container);
        return;
      }

      const coreButton = target.closest<HTMLElement>('[data-core]');
      if (coreButton?.dataset.core) {
        activeCoreId = coreButton.dataset.core as CoreId;
        activeMode = 'start';
        render(container);
        return;
      }

      const widgetButton = target.closest<HTMLElement>('[data-open-widget]');
      if (widgetButton?.dataset.openWidget) {
        Toolbox.switchPage?.(widgetButton.dataset.openWidget);
      }
    });
  }

  function injectStyles(): void {
    Mdd.injectCSS(
      'project-atlas',
      `
      .project-atlas { display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:14px; min-height:min(76vh, 880px); }
      .pa-main, .pa-side { min-width:0; }
      .pa-hero { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; margin-bottom:12px; }
      .pa-hero-compact { margin-bottom:14px; }
      .pa-kicker { margin:0 0 6px; color:var(--text-tertiary); font-size:11px; text-transform:uppercase; font-weight:800; }
      .pa-hero h1 { margin:0 0 8px; color:var(--text-primary); font-size:28px; line-height:1.1; }
      .pa-lede { margin:0; color:var(--text-secondary); font-size:14px; line-height:1.6; max-width:760px; }
      .pa-tabs { display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-end; }
      .pa-tabs button {
        display:flex; flex-direction:column; align-items:flex-start; gap:2px;
        min-width:116px; padding:8px 10px; border:1px solid var(--border); background:var(--bg-secondary);
        border-radius:var(--radius-sm); color:var(--text-secondary); cursor:pointer; font:inherit; text-align:left;
      }
      .pa-tabs button.is-on { border-color:var(--accent); background:var(--accent-subtle); color:var(--text-primary); }
      .pa-tabs b { font-size:12px; }
      .pa-tabs span { font-size:11px; color:var(--text-tertiary); line-height:1.35; }
      .pa-stats { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; margin-bottom:14px; }
      .pa-stat { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px; }
      .pa-stat b { display:block; color:var(--text-primary); font-size:22px; line-height:1.1; }
      .pa-stat span { display:block; color:var(--text-tertiary); font-size:11px; margin-top:3px; }
      .pa-section { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:14px; margin-bottom:14px; }
      .pa-section-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-end; margin-bottom:12px; }
      .pa-section-head h2 { margin:0; color:var(--text-primary); font-size:20px; line-height:1.2; }
      .pa-muted { margin:0; color:var(--text-tertiary); font-size:12px; }
      .pa-paths { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:10px; }
      .pa-path, .pa-core {
        display:flex; flex-direction:column; gap:8px; min-width:0; text-align:left; cursor:pointer; font:inherit;
        padding:14px; border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-secondary);
        border-radius:var(--radius-sm);
      }
      .pa-path:hover, .pa-core:hover, .pa-core.is-selected { border-color:var(--accent); background:var(--bg-primary); }
      .pa-path b, .pa-core h3, .pa-step h2 { margin:0; color:var(--text-primary); font-size:17px; line-height:1.25; }
      .pa-path span, .pa-core p, .pa-step span, .pa-summary, .pa-detail-body, .pa-side li { color:var(--text-secondary); font-size:13px; line-height:1.55; }
      .pa-core span { color:var(--accent); font-size:11px; text-transform:uppercase; font-weight:800; }
      .pa-core-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px; }
      .pa-shortcuts, .pa-chip-row { display:flex; flex-wrap:wrap; gap:6px; }
      .pa-chip, .pa-side code {
        display:inline-flex; border:1px solid var(--border); background:var(--bg-tertiary); color:var(--text-secondary);
        border-radius:var(--radius-sm); padding:6px 9px; font:inherit; text-decoration:none;
      }
      .pa-chip { cursor:pointer; }
      .pa-chip:hover { border-color:var(--accent); color:var(--text-primary); background:var(--accent-subtle); }
      .pa-side {
        align-self:start; position:sticky; top:10px; max-height:76vh; overflow:auto;
        background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-md); padding:14px;
      }
      .pa-tag {
        display:inline-flex; border:1px solid var(--accent); color:var(--text-primary); background:var(--bg-tertiary);
        border-radius:999px; padding:3px 8px; font-size:11px; margin-bottom:10px;
      }
      .pa-side h2 { margin:0 0 8px; color:var(--text-primary); font-size:21px; line-height:1.2; }
      .pa-summary { margin:0 0 14px; }
      .pa-fact { border-top:1px solid var(--border); padding-top:10px; }
      .pa-fact span, .pa-side-block h3 { display:block; color:var(--text-tertiary); font-size:11px; text-transform:uppercase; font-weight:800; margin-bottom:5px; }
      .pa-side-block { margin-top:14px; border-top:1px solid var(--border); padding-top:12px; }
      .pa-side-block ul { margin:0; padding-left:18px; }
      .pa-steps { display:grid; gap:10px; }
      .pa-step { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px; }
      .pa-step-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; margin-bottom:10px; }
      .pa-step ol { margin:0 0 10px; padding-left:18px; color:var(--text-secondary); font-size:13px; line-height:1.6; }
      .pa-step-foot { border-top:1px solid var(--border); padding-top:10px; }
      .pa-detail { border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-tertiary); margin-bottom:10px; overflow:hidden; }
      .pa-detail summary { cursor:pointer; padding:12px 14px; color:var(--text-primary); font-weight:700; }
      .pa-detail-body { padding:0 14px 14px; }
      .pa-detail-body ol, .pa-detail-body ul { margin:0; padding-left:18px; }
      .pa-ref-stats { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; margin-bottom:10px; }
      .pa-ref-stats div { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px; }
      .pa-ref-stats b { display:block; color:var(--text-primary); font-size:18px; }
      .pa-ref-stats span { display:block; color:var(--text-tertiary); font-size:11px; margin-top:3px; }
      .pa-count-list { list-style:none; padding:0; margin:0 0 10px; display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:8px; }
      .pa-count-list li { display:flex; justify-content:space-between; gap:8px; padding:10px; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-sm); }
      .pa-count-list b { color:var(--text-primary); }
      .pa-count-list span { color:var(--text-secondary); font-size:12px; }
      .pa-table-wrap { overflow:auto; border:1px solid var(--border); border-radius:var(--radius-sm); }
      .pa-table { width:100%; border-collapse:collapse; min-width:620px; }
      .pa-table th, .pa-table td { padding:10px 12px; border-bottom:1px solid var(--border); text-align:left; font-size:12px; }
      .pa-table th { color:var(--text-tertiary); text-transform:uppercase; background:var(--bg-secondary); }
      @media (max-width: 1120px) {
        .project-atlas { grid-template-columns:1fr; }
        .pa-side { position:static; max-height:none; }
      }
      @media (max-width: 760px) {
        .pa-hero, .pa-section-head, .pa-step-head { flex-direction:column; }
        .pa-tabs { justify-content:flex-start; }
        .pa-stats, .pa-paths, .pa-core-grid, .pa-ref-stats, .pa-count-list { grid-template-columns:1fr; }
      }
      `
    );
  }

  async function loadRuntimeData(): Promise<void> {
    try {
      const response = await fetch('/apps/karmolab/data/servermonitor-config.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      serverConfig = (await response.json()) as ServerMonitorConfig;
    } catch {
      serverConfig = null;
    }
  }

  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta!('project-atlas'),
    tabs: [
      {
        id: 'project-atlas-main',
        label: 'Atlas',
        build(container: HTMLElement): void {
          injectStyles();
          render(container);
          wire(container);
          void loadRuntimeData().then(() => {
            if (container.isConnected) render(container);
          });
        },
      },
    ],
  });
})();
