/**
 * cockpit.ts — Cockpit 위젯 엔트리 (TASK-KL-082 단위 J).
 *
 * 탭 라우터: 탭1=노드 그래프 / 탭2=TASK 목록.
 * Toolbox.register 로 등록. IIFE (Toolbox = lexical).
 */
import { injectCockpitStyles } from './styles';
import { GraphCanvas } from '../../lib/graph/canvas';
import { cockpitGraphAdapter, COCKPIT_KIND_COLORS } from './graph-tauri-adapter';
import { ActivityCollector } from './activity-collector';
import { buildTaskTab } from './task-tab';
import { buildTeamTab } from './team-tab';
import { buildCardsTab } from './cards-tab';

(function (): void {
  if (typeof Toolbox === 'undefined') return;
  const tb = Toolbox;

  // ── 상태 ──────────────────────────────────────────────────────────────────

  let canvas: GraphCanvas | null = null;
  let collector: ActivityCollector | null = null;
  let currentTab: 'graph' | 'task' = 'graph';
  let statusEl: HTMLElement | null = null;

  // ── repo_root 취득 ────────────────────────────────────────────────────────

  async function ensureRepoRoot(): Promise<boolean> {
    const w = window as unknown as { __cockpitRepoRoot?: string; __TAURI__?: { core?: { invoke?: unknown } } };
    if (w.__cockpitRepoRoot) return true;
    const invoke = w.__TAURI__?.core?.invoke;
    if (typeof invoke !== 'function') return false;
    try {
      const root = (await (invoke as (cmd: string) => Promise<string>)('localdev_get_repo_root')) as string | null;
      if (!root) return false;
      w.__cockpitRepoRoot = root;
      return true;
    } catch {
      return false;
    }
  }

  // ── 그래프 탭 구성 ────────────────────────────────────────────────────────

  async function buildGraphTab(graphPanel: HTMLElement): Promise<void> {
    // 컨트롤 바
    const ctrlBar = document.createElement('div');
    ctrlBar.className = 'ck-graph-controls';
    ctrlBar.innerHTML = `
      <button class="ck-ctrl-btn" data-action="fit">Fit</button>
      <button class="ck-ctrl-btn" data-action="reload">↺ 새로고침</button>
    `;
    graphPanel.appendChild(ctrlBar);

    // 상태 표시
    statusEl = document.createElement('div');
    statusEl.className = 'ck-status-bar';
    statusEl.textContent = '로딩 중…';
    graphPanel.appendChild(statusEl);

    // 캔버스 컨테이너
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'position:absolute;inset:0;';
    graphPanel.appendChild(canvasWrap);

    canvas = new GraphCanvas(canvasWrap, {
      persistAdapter: cockpitGraphAdapter,
      kindColors: COCKPIT_KIND_COLORS,
    });

    // 로딩 오버레이 박기 (graph.json + activity 첫 페치 동안)
    const loadingEl = document.createElement('div');
    loadingEl.className = 'ck-loading';
    loadingEl.textContent = '⏳ 로딩 중 …';
    canvasWrap.appendChild(loadingEl);

    const ok = await ensureRepoRoot();
    if (!ok) {
      if (statusEl) statusEl.textContent = 'repo_root 없음 — Server Monitor 에서 저장소 루트 설정 후 재오픈';
      loadingEl.textContent = '❌ repo_root 없음';
      return;
    }

    // graph spec 로드
    loadingEl.textContent = '⏳ graph.json 로드 중 …';
    const spec = await cockpitGraphAdapter.load();
    if (!spec) {
      if (statusEl) statusEl.textContent = 'graph.json 로드 실패';
      loadingEl.textContent = '❌ graph.json 로드 실패';
      return;
    }
    canvas.setSpec(spec);
    canvas.fitView();
    loadingEl.textContent = '⏳ 활성 신호 첫 수집 …';

    // activity collector
    collector = new ActivityCollector(({ snapshot, activeSets, ephemeralNodes }) => {
      if (!canvas) return;
      canvas.setEphemeralNodes(ephemeralNodes);
      canvas.setActiveSets(activeSets);
      canvas.applyHighlights();
      loadingEl.remove(); // 첫 페치 도착하면 오버레이 제거
      if (statusEl) {
        const ts = new Date(snapshot.ts * 1000).toLocaleTimeString('ko-KR');
        const activeCount = activeSets.node_ids_active.size;
        statusEl.textContent = `${ts} | 활성 노드 ${activeCount}`;
      }
    });
    collector.setSpec(spec);
    collector.start();

    // 컨트롤 이벤트
    ctrlBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLButtonElement | null;
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'fit') canvas?.fitView();
      else if (action === 'reload') void reloadGraph();
    });
  }

  async function reloadGraph(): Promise<void> {
    if (!canvas) return;
    if (statusEl) statusEl.textContent = '새로고침 중…';
    const spec = await cockpitGraphAdapter.load();
    if (!spec) { if (statusEl) statusEl.textContent = '재로드 실패'; return; }
    canvas.setSpec(spec);
    collector?.setSpec(spec);
    canvas.fitView();
    if (statusEl) statusEl.textContent = '재로드 완료';
  }

  // ── 탭 전환 ──────────────────────────────────────────────────────────────

  function switchTab(
    tab: 'graph' | 'task',
    tabBtns: NodeListOf<HTMLElement>,
    panels: Record<string, HTMLElement>,
  ): void {
    currentTab = tab;
    tabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    for (const [key, el] of Object.entries(panels)) {
      el.classList.toggle('hidden', key !== tab);
    }
    if (tab === 'graph') {
      collector?.start();
    } else {
      collector?.stop();
    }
  }

  // ── render ────────────────────────────────────────────────────────────────

  function render(container: HTMLElement): void {
    injectCockpitStyles();
    container.innerHTML = '';

    const cockpit = document.createElement('div');
    cockpit.className = 'ck-cockpit';

    // 탭 바
    const tabBar = document.createElement('div');
    tabBar.className = 'ck-tab-bar';
    tabBar.innerHTML = `
      <div class="ck-tab active" data-tab="graph">그래프</div>
      <div class="ck-tab" data-tab="task">TASK</div>
    `;
    cockpit.appendChild(tabBar);

    function makePanel(visible = false): HTMLElement {
      const el = document.createElement('div');
      el.className = 'ck-panel' + (visible ? '' : ' hidden');
      el.style.cssText = 'width:100%;height:100%;';
      cockpit.appendChild(el);
      return el;
    }

    const graphPanel = makePanel(true);
    graphPanel.style.cssText = 'position:relative;width:100%;height:100%;';
    // Task 탭 패널 — TASK·팀·카드 섹션 세로 쌓기
    const taskPanel = makePanel();
    taskPanel.style.cssText = 'width:100%;height:100%;overflow-y:auto;';

    const taskSection = document.createElement('div');
    taskSection.style.cssText = 'height:100%;min-height:500px;flex-shrink:0;';
    taskPanel.appendChild(taskSection);

    const teamSection = document.createElement('div');
    taskPanel.appendChild(teamSection);

    const cardsSection = document.createElement('div');
    taskPanel.appendChild(cardsSection);

    container.appendChild(cockpit);

    const tabBtns = tabBar.querySelectorAll<HTMLElement>('.ck-tab');
    const panels: Record<string, HTMLElement> = { graph: graphPanel, task: taskPanel };

    void buildGraphTab(graphPanel);
    buildTaskTab(taskSection);
    buildTeamTab(teamSection);
    buildCardsTab(cardsSection);

    // 탭 클릭
    tabBar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (!btn) return;
      const tab = btn.dataset.tab as 'graph' | 'task';
      switchTab(tab, tabBtns, panels);
    });
  }

  // ── 등록 ─────────────────────────────────────────────────────────────────

  tb.register({
    ...(tb.getLazyWidgetPublicMeta ? tb.getLazyWidgetPublicMeta('cockpit') : { id: 'cockpit' }),
    tabs: [
      {
        id: 'cockpit-main',
        label: 'Cockpit',
        build(container: HTMLElement) {
          render(container);
        },
      },
    ],
  });
})();
