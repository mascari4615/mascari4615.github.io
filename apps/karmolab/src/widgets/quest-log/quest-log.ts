/**
 * Quest Log — 관측실(observatory) 미감의 프로젝트·인생 항목 트리. Tauri 데스크톱 전용 (category: 'desktop').
 *
 * **데이터 = memo 정본** (TASK-KL-009 Phase F): hardcoded `QUEST_DATA` 폐기,
 * Rust 명령 `get_quest_tree` (apps/karmolab-tauri/src-tauri/src/quest_index.rs) 가
 * memo 의 6 도메인 walk (wm/projects/karmolab/projects/yawnbot/life/hobby/learning)
 * + frontmatter 파싱 + 본문 체크박스 추출 → JSON. 위젯이 invoke 후 옛 트리 구조
 * (projects[].children[].leaf{checks} + sealed[]) 로 변환.
 *
 * status 매핑: memo (seed/ready/active/hold/done/sealed) → 옛 (seed/fire/sleep/sealed):
 *   seed/ready → seed · active → fire · hold → sleep · done/sealed → sealed.
 *   status='sealed' 인 TASK 만 sealed[] 로 분리.
 *
 * 시각/인터랙션 (옛 standalone `apps/karmolab/quest-log/` — 폐기됨, 시각만 위젯에 흡수):
 * - 진행도: leaf = checked/total, 부모 = 자식 평균
 * - 영속화: localStorage `quest-log-state-v1` (위젯 내부 working state — 폴링/재진입 시 memo 정본으로 갱신)
 * - CSS·DOM `.kl-quest-log` 스코프. drawer/sleep prompt fixed 모달은 위젯 컨테이너 자식.
 *
 * v1 = read-only (memo 정본 우선). v2 (TASK-KL-010): 위젯 토글 → memo write back. v3: 인라인 에디터.
 */
// KL-071: 레거시 IIFE 의 `: any` 어노테이션 제거 + 인터페이스화 완료 →
// `@ts-nocheck` 제거. 이 파일은 이제 `tsc --noEmit` (strict) 로 실검증됨.
import { isDesktop, invoke, listen } from '../../tauri-bridge';
import { t, loadNamespace, locale } from '../../lib/i18n';

const _questUnlisten = new WeakMap<HTMLElement, () => void>();

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ── DATA — memo 정본 view ─────────────────────────────────────────────
  // hardcoded QUEST_DATA 폐기. Rust 명령 `get_quest_tree` 가 6 도메인 walk
  // → 위젯이 invoke 후 옛 트리 구조 (projects/children/leaf + sealed[]) 로 변환.

  interface MemoCheckItem {
    text: string;
    done: boolean;
    group: string | null;
    lineNumber: number;
  }
  interface MemoTaskNode {
    id: string;
    status: string;
    priority: string;
    path: string[];
    parent: string | null;
    tags: string[];
    title: string;
    filePath: string;
    checks: MemoCheckItem[];
  }
  interface MemoTaskError {
    filePath: string;
    reason: string;
  }
  interface MemoQuestTree {
    tasks: MemoTaskNode[];
    generatedAtUnix: number;
    memoPath: string;
    errors: MemoTaskError[];
  }

  const DOMAIN_ORDER = ['wm', 'karmolab', 'yawnbot', 'life', 'hobby', 'learning'];
  const DOMAIN_LABEL: Record<string, string> = {
    wm: 'WitchMendokusai',
    karmolab: 'KarmoLab',
    yawnbot: 'YawnBot',
    life: t('quest-log.t20'),
    hobby: t('quest-log.t21'),
    learning: t('quest-log.t22'),
  };
  const DOMAIN_ICON: Record<string, string> = {
    wm: '🔮',
    karmolab: '🧪',
    yawnbot: '🤖',
    life: '🏠',
    hobby: '🎨',
    learning: '📚',
  };
  const DOMAIN_SUBTITLE: Record<string, string> = {
    wm: t('quest-log.t23'),
    karmolab: t('quest-log.t24'),
    yawnbot: t('quest-log.t25'),
    life: t('quest-log.t26'),
    hobby: t('quest-log.t27'),
    learning: t('quest-log.t28'),
  };

  // 이전 위젯 (a344ee85) 의 자기 소멸 코드는 옛 인터랙션 살리려 제거 (localStorage 다시 사용).

  // TASK-KL-062 slice3c: 로컬 isKarmolabDesktop 폐기 → tauri-bridge isDesktop.

  async function fetchMemoTree(): Promise<MemoQuestTree | null> {
    // TASK-KL-062 slice3c: 로컬 invoke 캡처 폐기 → seam (웹=isDesktop false).
    if (!isDesktop()) return null;
    try {
      return (await invoke('get_quest_tree')) as MemoQuestTree;
    } catch (err) {
      console.error(t('quest-log.t29'), err);
      return null;
    }
  }

  // KL-045 — memo status drift 보정. memo TASK 들에 schema X 값 (`in_progress` / `in_review`
  // / `seeded` / `in-progress` / `suspended` / `closed` / `medium` / `critical` 등) 가
  // 다수 존재 (실측 50+ 케이스). 정렬·필터·overview 통계 모두 canonical 6 값으로 정규화 후 동작.
  // 정본 fix = `node memo/scripts/sync-task-status.mjs --apply` 별도 (race 위험 — 본 frontend 는 방어).
  function canonicalStatus(s: string): string {
    switch (s) {
      case 'active': case 'in_progress': case 'in-progress': return 'active';
      case 'ready': case 'in_review': return 'ready';
      case 'seed': case 'seeded': return 'seed';
      case 'hold': case 'suspended': return 'hold';
      case 'done': case 'closed': return 'done';
      case 'sealed': return 'sealed';
      default: return 'seed';
    }
  }
  function canonicalPriority(p: string): string {
    switch (p) {
      case 'high': case 'critical': return 'high';
      case 'normal': case 'medium': return 'normal';
      case 'low': return 'low';
      default: return 'normal';
    }
  }

  /// canonical → widget pill (KL-049). done/sealed 분리: done = main tree DONE pill, sealed = trophy 만.
  function mapMemoStatus(status: string): string {
    const c = canonicalStatus(status);
    if (c === 'active') return 'fire';
    if (c === 'hold') return 'sleep';
    if (c === 'done') return 'done';
    if (c === 'sealed') return 'sealed';  // trophy view 만 도달
    return 'seed';  // seed + ready 는 widget 에서 'seed' 로 통합 (시각 단순화)
  }

  /// 위젯 → memo status 역방향 매핑 (KL-018 status write-back).
  /// `ready` 는 위젯 표현 불가 → 위젯 'seed' 클릭은 memo 'seed' 로 통일 (lossy).
  function mapWidgetStatusToMemo(widgetStatus: string): string {
    if (widgetStatus === 'fire') return 'active';
    if (widgetStatus === 'sleep') return 'hold';
    if (widgetStatus === 'done') return 'done';
    if (widgetStatus === 'sealed') return 'sealed';  // 위젯 미사용, lossless
    return 'seed';
  }

  // ── 레거시 quest 포맷 인터페이스 (KL-071) ──────────────────────────────
  // transformMemoToOld 가 memo 트리를 옛 위젯 트리(projects/children/leaf
  // + sealed[])로 변환한다. 그 *구성된* 모양을 정밀 타입으로 고정하고,
  // 휴리스틱 순회/렌더 (findNode/allLeaves/progressOf/openDrawer)는 세
  // 모양을 구조적으로 함께 다루므로 넓은 supertype `QuestNode` 를 쓴다.
  // (`@ts-nocheck` 제거 — tsc 가 실제로 검증. `: any` → 정의된 타입.)
  interface QuestCheck {
    t: string;
    done: boolean;
    lineNumber?: number; // localStorage fallback add 경로는 lineNumber 없이 push (2355)
  }
  interface QuestLeaf {
    id: string;
    title: string;
    status: string;       // 위젯 status: fire|sleep|done|sealed|seed
    memoStatus: string;
    memoPriority: string;
    parentId: string | null;
    filePath: string;
    checks: QuestCheck[];
    note?: string;        // taskNodeToLeaf 미생성 — drawer 가 node.note 읽음 (방어)
  }
  interface QuestCategory {
    id: string;
    title: string;
    note: string;
    children: QuestLeaf[];
  }
  type QuestTreeNode = QuestLeaf | QuestCategory;
  interface QuestProject {
    id: string;
    title: string;
    subtitle: string;
    kind: 'main' | 'side';
    icon: string;
    children: QuestTreeNode[];
  }
  interface QuestSealedItem {
    id: string;
    title: string;
    project: string;
    note: string;
    sealedNote: string;
  }
  interface QuestData {
    projects: QuestProject[];
    sealed: QuestSealedItem[];
  }
  // 순회/렌더가 project/category/leaf 를 구조적으로 함께 다루는 넓은 노드.
  // 정밀 타입(QuestProject/Category/Leaf)은 구조적으로 이 supertype 에 대입된다.
  interface QuestNode {
    id: string;
    title: string;
    status?: string;
    memoStatus?: string;
    memoPriority?: string;
    parentId?: string | null;
    filePath?: string;
    note?: string;
    subtitle?: string;
    icon?: string;
    kind?: 'main' | 'side';
    children?: QuestNode[];
    checks?: QuestCheck[];
  }
  // get_questlog_hub (questlog_hub.rs QuestlogHub/CommitInfo) — 위젯은 commits 만 사용.
  interface HubCommit { hash: string; date: string; subject: string; }
  interface HubState { commits?: Record<string, HubCommit[]>; }

  function taskNodeToLeaf(t: MemoTaskNode): QuestLeaf {
    return {
      id: t.id,
      title: t.title,
      status: mapMemoStatus(t.status),
      memoStatus: t.status, // KL-018 — write-back 시 expected_status 로 사용
      memoPriority: t.priority, // KL-021 — priority write-back expected
      parentId: t.parent, // KL-048 — sub-task hierarchy (트리 라인 / sort 묶음)
      filePath: t.filePath,
      checks: t.checks.map((c) => ({ t: c.text, done: c.done, lineNumber: c.lineNumber })),
    };
  }

  /// memo TaskNode 들 → 옛 위젯 데이터 (projects/children/leaf checks + sealed[]).
  /// status='sealed' 인 TASK 만 sealed[] 로 분리. 그 외는 트리 안.
  /// 도메인(path[0]) 별 그룹 + parent chain 카테고리 (parent 가 자식 가지면 children 노드로).
  function transformMemoToOld(tree: MemoQuestTree): QuestData {
    const sealedTasks: MemoTaskNode[] = [];
    const liveTasks: MemoTaskNode[] = [];
    for (const t of tree.tasks) {
      if (t.status === 'sealed') sealedTasks.push(t);
      else liveTasks.push(t);
    }

    const byDomain = new Map<string, MemoTaskNode[]>();
    for (const t of liveTasks) {
      const domain = t.path[0] ?? 'unknown';
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain)!.push(t);
    }

    const sortedDomains = [
      ...DOMAIN_ORDER.filter((d) => byDomain.has(d)),
      ...Array.from(byDomain.keys()).filter((d) => !DOMAIN_ORDER.includes(d)),
    ];

    const projects = sortedDomains.map((domain) => {
      const tasks = byDomain.get(domain)!;
      const idSet = new Set(tasks.map((t) => t.id));
      const childrenByParent = new Map<string, MemoTaskNode[]>();
      const rootTasks: MemoTaskNode[] = [];
      for (const t of tasks) {
        if (t.parent && idSet.has(t.parent)) {
          if (!childrenByParent.has(t.parent)) childrenByParent.set(t.parent, []);
          childrenByParent.get(t.parent)!.push(t);
        } else {
          rootTasks.push(t);
        }
      }
      rootTasks.sort((a, b) => a.id.localeCompare(b.id));
      childrenByParent.forEach((arr) => arr.sort((a, b) => a.id.localeCompare(b.id)));

      const children = rootTasks.map((t) => {
        const subs = childrenByParent.get(t.id);
        if (subs && subs.length > 0) {
          // parent 가 sub 가지면 카테고리 노드. 자기 자신도 leaf 로 children 의 첫 항목으로.
          const allLeaves = [taskNodeToLeaf(t), ...subs.map((s) => taskNodeToLeaf(s))];
          return {
            id: t.id,
            title: t.title,
            note: `${t.id} \u00b7 sub-phase ${subs.length}`,
            children: allLeaves,
          };
        }
        return taskNodeToLeaf(t);
      });

      return {
        id: domain,
        title: DOMAIN_LABEL[domain] ?? domain,
        subtitle: DOMAIN_SUBTITLE[domain] ?? '',
        kind: (domain === 'wm' ? 'main' : 'side') as 'main' | 'side',
        icon: DOMAIN_ICON[domain] ?? '📦',
        children,
      };
    });

    const sealed = sealedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      project: DOMAIN_LABEL[t.path[0] ?? ''] ?? t.path[0] ?? '',
      note: t.filePath,
      sealedNote: t.tags.join(', '),
    }));

    return { projects, sealed };
  }

  // ── 「프로젝트 개요」 데이터 모델 + 렌더 (KL-044) ──────────────────────
  // App 트리 위 최상단. PM 뷰 = 도메인 진척 / 다음 할 것 / 7d commit / hold.
  // 데이터 = fetchMemoTree() (raw 6 status) + get_questlog_hub (commits).
  // commits 분류 = subject scope regex (`feat(wm):` / `chore(kl):`) + repo fallback.

  interface DomainStat {
    domain: string; label: string; icon: string;
    fire: number; ready: number; seed: number; hold: number; done: number; sealed: number;
    workingTotal: number;  // fire + ready + hold + done — seed/sealed 제외
    progress: number;      // done / workingTotal · 0~1
  }
  interface TopNextItem {
    id: string; title: string; domain: string; domainIcon: string;
    status: string;  // 'active' | 'ready'
  }
  interface CommitDomainBucket {
    domain: string; label: string; icon: string; count: number;
    recent: { hash: string; date: string; subject: string; repo: string }[];  // top 3
  }
  interface HoldStat {
    domain: string; label: string; icon: string; count: number;
  }
  interface ProjectOverview {
    generatedAt: number;
    domainStats: DomainStat[];
    topNext: TopNextItem[];
    commitsByDomain: CommitDomainBucket[];
    holdByDomain: HoldStat[];
    holdsTotal: number;
    commitsLast7dTotal: number;
  }

  const SCOPE_TO_DOMAIN: Record<string, string> = {
    wm: 'wm', witch: 'wm', witchmendokusai: 'wm', mendokusai: 'wm',
    kl: 'karmolab', karmolab: 'karmolab',
    yb: 'yawnbot', yawnbot: 'yawnbot', yawn: 'yawnbot',
    life: 'life',
    hobby: 'hobby',
    learn: 'learning', learning: 'learning',
  };
  const REPO_DEFAULT_DOMAIN: Record<string, string> = {
    'WitchMendokusai': 'wm',
    'Mascari4615.github.io': 'meta',
    'memo': 'meta',
  };

  function commitToDomain(repo: string, subject: string): string {
    const scopeMatch = subject.match(/^[a-z]+\(([a-z\-]+)\)\s*[:!]/i);
    if (scopeMatch) {
      const mapped = SCOPE_TO_DOMAIN[scopeMatch[1].toLowerCase()];
      if (mapped) return mapped;
    }
    return REPO_DEFAULT_DOMAIN[repo] ?? 'meta';
  }

  function buildProjectOverview(tree: MemoQuestTree, hubState: HubState | null): ProjectOverview {
    const domainCounts = new Map<string, { fire: number; ready: number; seed: number; hold: number; done: number; sealed: number }>();
    const ensure = (d: string) => {
      if (!domainCounts.has(d)) domainCounts.set(d, { fire: 0, ready: 0, seed: 0, hold: 0, done: 0, sealed: 0 });
      return domainCounts.get(d)!;
    };
    for (const t of tree.tasks) {
      const domain = t.path[0] ?? 'unknown';
      const c = ensure(domain);
      // KL-045 — canonical 정규화 (memo 안 schema X 값 `in_progress` / `in_review` 등 흡수).
      switch (canonicalStatus(t.status)) {
        case 'active': c.fire++; break;
        case 'ready': c.ready++; break;
        case 'seed': c.seed++; break;
        case 'hold': c.hold++; break;
        case 'done': c.done++; break;
        case 'sealed': c.sealed++; break;
      }
    }
    const orderedDomains = [
      ...DOMAIN_ORDER.filter((d) => domainCounts.has(d)),
      ...Array.from(domainCounts.keys()).filter((d) => !DOMAIN_ORDER.includes(d)),
    ];
    const domainStats: DomainStat[] = orderedDomains.map((domain) => {
      const c = domainCounts.get(domain)!;
      const workingTotal = c.fire + c.ready + c.hold + c.done;
      const progress = workingTotal > 0 ? c.done / workingTotal : 0;
      return {
        domain,
        label: DOMAIN_LABEL[domain] ?? domain,
        icon: DOMAIN_ICON[domain] ?? '📦',
        fire: c.fire, ready: c.ready, seed: c.seed, hold: c.hold, done: c.done, sealed: c.sealed,
        workingTotal,
        progress,
      };
    });

    const topNext: TopNextItem[] = tree.tasks
      .filter((t) => {
        // KL-045 — canonical 정규화 후 비교. priority `medium` / `critical` 도 흡수.
        const cs = canonicalStatus(t.status);
        const cp = canonicalPriority(t.priority);
        return cp === 'high' && (cs === 'active' || cs === 'ready');
      })
      .sort((a, b) => {
        const sa = canonicalStatus(a.status);
        const sb = canonicalStatus(b.status);
        if (sa !== sb) return sa === 'active' ? -1 : 1;
        return a.id.localeCompare(b.id);
      })
      .slice(0, 5)
      .map((t) => ({
        id: t.id,
        title: t.title,
        domain: t.path[0] ?? 'unknown',
        domainIcon: DOMAIN_ICON[t.path[0] ?? ''] ?? '📦',
        status: canonicalStatus(t.status),  // KL-045 — render data-status="active|ready" CSS 매치
      }));

    const sevenDayMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - sevenDayMs;
    const commitDomainMap = new Map<string, { count: number; recent: { hash: string; date: string; subject: string; repo: string }[] }>();
    let commitsLast7dTotal = 0;
    if (hubState && hubState.commits) {
      for (const repo of Object.keys(hubState.commits)) {
        const list = hubState.commits[repo] ?? [];
        for (const c of list) {
          const t = Date.parse(c.date);
          if (Number.isNaN(t) || t < cutoff) continue;
          const dom = commitToDomain(repo, c.subject);
          if (!commitDomainMap.has(dom)) commitDomainMap.set(dom, { count: 0, recent: [] });
          const bucket = commitDomainMap.get(dom)!;
          bucket.count++;
          if (bucket.recent.length < 3) {
            bucket.recent.push({ hash: c.hash, date: c.date, subject: c.subject, repo });
          }
          commitsLast7dTotal++;
        }
      }
    }
    const commitDomainOrder = [...DOMAIN_ORDER, 'meta'];
    const commitsByDomain: CommitDomainBucket[] = [
      ...commitDomainOrder.filter((d) => commitDomainMap.has(d)),
      ...Array.from(commitDomainMap.keys()).filter((d) => !commitDomainOrder.includes(d)),
    ].map((domain) => ({
      domain,
      label: domain === 'meta' ? t('quest-log.t30') : (DOMAIN_LABEL[domain] ?? domain),
      icon: domain === 'meta' ? '🗂️' : (DOMAIN_ICON[domain] ?? '📦'),
      count: commitDomainMap.get(domain)!.count,
      recent: commitDomainMap.get(domain)!.recent,
    }));

    const holdByDomain: HoldStat[] = orderedDomains.map((domain) => ({
      domain,
      label: DOMAIN_LABEL[domain] ?? domain,
      icon: DOMAIN_ICON[domain] ?? '📦',
      count: domainCounts.get(domain)!.hold,
    }));
    const holdsTotal = holdByDomain.reduce((sum, h) => sum + h.count, 0);

    return {
      generatedAt: Date.now(),
      domainStats,
      topNext,
      commitsByDomain,
      holdByDomain,
      holdsTotal,
      commitsLast7dTotal,
    };
  }

  async function fetchHubState(): Promise<HubState | null> {
    // TASK-KL-062 slice3c: 로컬 invoke 캡처 폐기 → seam (웹=isDesktop false).
    if (!isDesktop()) return null;
    try {
      return (await invoke('get_questlog_hub')) as HubState;
    } catch (e) {
      // hub 없어도 overview 의 도메인 진척 / top-5 / hold 는 작동. commit 만 빈 상태.
      return null;
    }
  }

  function escOverview(s: unknown): string {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
  }

  function renderOverview(overviewWrap: HTMLElement, ov: ProjectOverview): void {
    if (!isDesktop()) {
      overviewWrap.innerHTML = '';
      return;
    }
    const dt = new Date(ov.generatedAt).toLocaleTimeString(locale());
    const domainsHtml = ov.domainStats.map((d) => `
      <div class="overview-domain">
        <div class="overview-domain-head">
          <div class="overview-domain-name"><span class="overview-domain-icon">${escOverview(d.icon)}</span>${escOverview(d.label)}</div>
          <div class="overview-domain-pct">${Math.round(d.progress * 100)}%</div>
        </div>
        <div class="overview-domain-bar"><div class="fill" style="width:${(d.progress * 100).toFixed(1)}%"></div></div>
        <div class="overview-domain-counts">
          <span class="fire"><span class="k">FIRE</span><span class="v ${d.fire === 0 ? 'zero' : ''}">${d.fire}</span></span>
          <span><span class="k">SEED</span><span class="v ${d.seed + d.ready === 0 ? 'zero' : ''}">${d.seed + d.ready}</span></span>
          <span><span class="k">HOLD</span><span class="v ${d.hold === 0 ? 'zero' : ''}">${d.hold}</span></span>
          <span><span class="k">DONE</span><span class="v ${d.done === 0 ? 'zero' : ''}">${d.done}</span></span>
        </div>
      </div>
    `).join('');

    const topNextHtml = ov.topNext.length === 0
      ? `<li class="overview-next-empty"><div class="overview-loading">${esc(t('quest-log.t04'))}</div></li>`
      : ov.topNext.map((t) => `
        <li class="overview-next-item" data-status="${escOverview(t.status)}">
          <div class="icon">${escOverview(t.domainIcon)}</div>
          <div class="id">${escOverview(t.id)}</div>
          <div class="title">${escOverview(t.title)}</div>
        </li>
      `).join('');

    const commitsHtml = ov.commitsByDomain.length === 0
      ? `<div class="overview-loading">${esc(t('quest-log.t05'))}</div>`
      : `<div class="overview-commits-grid">${ov.commitsByDomain.map((b) => `
        <div class="overview-commit-bucket">
          <div class="overview-commit-bucket-head">
            <div class="overview-commit-bucket-name">${escOverview(b.icon)} ${escOverview(b.label)}</div>
            <div class="overview-commit-bucket-count">${b.count}</div>
          </div>
          ${b.recent.length === 0 ? `<div class="empty">(0)</div>` : `<ul class="overview-commit-bucket-list">${b.recent.map((c) => `
            <li><span class="hash">${escOverview(c.hash)}</span>${escOverview(c.subject)}</li>
          `).join('')}</ul>`}
        </div>
      `).join('')}</div>`;

    const holdHtml = `<div class="overview-hold-row">${ov.holdByDomain.map((h) => `
      <span class="overview-hold ${h.count > 0 ? 'has-hold' : ''}"><span class="icon">${escOverview(h.icon)}</span><span class="k">${escOverview(h.label)}</span><span class="v">${h.count}</span></span>
    `).join('')}</div>`;

    overviewWrap.innerHTML = `
      <section class="overview">
        <div class="overview-head">
          <h1>PROJECT OVERVIEW <em>— at a glance</em></h1>
          <div class="meta">생성 ${escOverview(dt)} · 폴링 10s · 7d commits ${ov.commitsLast7dTotal} · hold ${ov.holdsTotal}</div>
        </div>
        <div class="overview-section">
          <h2>${esc(t('quest-log.t06'))} <small>${ov.domainStats.length}개 · DONE / 작업집합(FIRE+READY+HOLD+DONE)</small></h2>
          <div class="overview-domains">${domainsHtml}</div>
        </div>
        <div class="overview-section">
          <h2>${esc(t('quest-log.t07'))} <small>priority=high · ready/active</small></h2>
          <ul class="overview-next-list">${topNextHtml}</ul>
        </div>
        <div class="overview-section">
          <h2>${esc(t('quest-log.t08'))} <small>commit ${ov.commitsLast7dTotal}건 · 도메인 묶음</small></h2>
          ${commitsHtml}
        </div>
        <div class="overview-section">
          <h2>${esc(t('quest-log.t09'))} <small>status=hold · 합산 ${ov.holdsTotal}</small></h2>
          ${holdHtml}
        </div>
      </section>
    `;
  }

  const POLL_INTERVAL_OVERVIEW_MS = 10_000;
  let overviewPollTimer: number | null = null;
  async function refreshOverview(overviewWrap: HTMLElement): Promise<void> {
    const [tree, hubState] = await Promise.all([fetchMemoTree(), fetchHubState()]);
    if (!tree) {
      // 트리 못 받으면 placeholder 비움. (App 영역이 자체 에러 메시지 보여줌.)
      overviewWrap.innerHTML = `<div class="overview-loading">${esc(t('quest-log.t10'))}</div>`;
      return;
    }
    const overview = buildProjectOverview(tree, hubState);
    renderOverview(overviewWrap, overview);
  }
  function startOverviewPolling(overviewWrap: HTMLElement): void {
    if (!isDesktop()) return;
    void refreshOverview(overviewWrap);
    if (overviewPollTimer != null) window.clearInterval(overviewPollTimer);
    overviewPollTimer = window.setInterval(() => {
      if (!overviewWrap.isConnected) {
        if (overviewPollTimer != null) { window.clearInterval(overviewPollTimer); overviewPollTimer = null; }
        return;
      }
      // KL-051: 트레이 hide 시 IPC + memo 6 도메인 walk 비용 0.
      if (typeof document !== 'undefined' && document.hidden) return;
      void refreshOverview(overviewWrap);
    }, POLL_INTERVAL_OVERVIEW_MS);
  }

  // ── STYLES (injected once) ──────────────────────────────────────────────
  const STYLE_ID = 'kl-quest-log-styles';
  const CSS = `
.kl-quest-log {
  /* 앱 테마 토큰의 별명. 예전엔 다크 색을 직접 박아 라이트에서 이 판만 까맣게 남았다.
     --accent 는 일부러 안 덮는다 — 바깥에서 내려오는 테마 강조색을 그대로 쓴다. */
  --bg: var(--bg-void);
  --bg-2: var(--bg-primary);
  --paper: var(--bg-secondary);
  --paper-2: var(--bg-primary);
  --ink: var(--text-primary);
  --ink-2: var(--text-secondary);
  --ink-3: var(--text-tertiary);
  --ink-4: var(--bg-active);
  --line: var(--bg-tertiary);
  --line-2: var(--bg-hover);
  --line-3: var(--bg-active);
  --accent-2: var(--secondary);
  --mag-wm: #e8d9a8;
  --mag-project: #9ec4a8;
  --mag-learn: #b7a3d6;
  --mag-life: #d8a4a0;
  --mag-career: #7fa6d4;

  position: relative;
  color: var(--ink);
  font-family: 'KarmoSans', system-ui, sans-serif;
  /* 외부 body backdrop(observatory) 통과 — 자체 background/그리드는 KarmoLab 안에서 중복이므로 제거 */
  background: transparent;
  /* layout-full 안에서 화면 전체를 채우고 자체 스크롤 */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  /* contain: paint 금지 — drawer/sleep-prompt overlay가 fixed인데 contain이 fixed positioning containment block을 만들어 viewport 추적이 깨짐 */
}
.kl-quest-log *, .kl-quest-log *::before, .kl-quest-log *::after { box-sizing: border-box; margin: 0; padding: 0; }
.kl-quest-log .serif { font-family: 'KarmoSerif', serif; }
.kl-quest-log .mono { font-family: 'KarmoMono', monospace; }
.kl-quest-log ::selection { background: var(--accent); color: var(--bg); }

.kl-quest-log .wrap { max-width: none; margin: 0; padding: 24px 28px 48px; position: relative; z-index: 1; }

/* ── HEADER ── */
.kl-quest-log header.hd {
  padding-bottom: 14px; border-bottom: 1px solid var(--line-2); margin-bottom: 22px;
}
.kl-quest-log header.hd h1 {
  margin: 0; font-family: 'KarmoSerif', serif; font-weight: 900;
  font-size: clamp(28px, 3.6vw, 44px); line-height: 1; letter-spacing: -0.02em;
}
.kl-quest-log header.hd h1 em { font-style: italic; font-weight: 500; color: var(--ink-2); }

/* ── STATS ── */
.kl-quest-log .stats {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px;
  background: var(--line-2); border: 1px solid var(--line-2);
  margin-bottom: 22px;
}
.kl-quest-log .stat { background: var(--paper); padding: 12px 16px; display: flex; flex-direction: column; gap: 3px; }
.kl-quest-log .stat-toggle {
  border: none; text-align: left; color: inherit; cursor: pointer; font: inherit;
  transition: background 140ms;
}
.kl-quest-log .stat-toggle:hover { background: var(--paper-2); }
.kl-quest-log .stat-toggle.on { background: var(--accent); color: var(--bg); }
.kl-quest-log .stat-toggle.on .k,
.kl-quest-log .stat-toggle.on .v small { color: var(--bg); opacity: 0.85; }
.kl-quest-log .stat .k {
  font-family: 'KarmoMono', monospace; font-size: 12px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3);
}
.kl-quest-log .stat .v {
  font-family: 'KarmoSerif', serif; font-weight: 700;
  font-size: 22px; line-height: 1; letter-spacing: -0.01em;
}
.kl-quest-log .stat .v small { font-family: 'KarmoMono', monospace; font-weight: 400; font-size: 13.5px; color: var(--ink-2); margin-left: 3px; }
.kl-quest-log .stat.accent .v { color: var(--accent); }

/* ── chip (drawer status switcher) ── */
.kl-quest-log .chip {
  font-family: 'KarmoMono', monospace; font-size: 13px;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-2);
  padding: 5px 10px; border: 1px solid var(--line-2); background: transparent;
  cursor: pointer; transition: all 140ms; display: inline-flex; align-items: center; gap: 6px;
}
.kl-quest-log .chip:hover { border-color: var(--ink-2); color: var(--ink); }
.kl-quest-log .chip.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }

/* ── COLUMNS ── */
.kl-quest-log .columns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.kl-quest-log .col {
  border: 1px solid var(--line-2); background: var(--paper);
  display: flex; flex-direction: column; position: relative;
}
.kl-quest-log .col::before {
  content: ''; position: absolute; top: -1px; left: -1px; width: 10px; height: 10px;
  border-top: 1px solid var(--ink); border-left: 1px solid var(--ink);
}
.kl-quest-log .col::after {
  content: ''; position: absolute; bottom: -1px; right: -1px; width: 10px; height: 10px;
  border-bottom: 1px solid var(--line-3); border-right: 1px solid var(--line-3);
}
.kl-quest-log .col-head {
  padding: 14px 16px 12px; border-bottom: 1px solid var(--line-2);
  display: grid; grid-template-columns: 1fr auto; gap: 6px; align-items: baseline;
}
.kl-quest-log .col-head h3 {
  margin: 0; font-family: 'KarmoSerif', serif; font-weight: 700;
  font-size: 20px; letter-spacing: -0.01em; display: flex; align-items: baseline; gap: 8px;
}
.kl-quest-log .col-head h3 .idx {
  font-family: 'KarmoMono', monospace; font-size: 13px;
  font-weight: 400; color: var(--ink-3); letter-spacing: 0.18em;
}
.kl-quest-log .col-head .sub {
  font-family: 'KarmoMono', monospace; font-size: 12.5px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-2);
  text-align: right;
}
.kl-quest-log .col-head .bar-line {
  grid-column: 1 / -1; height: 2px; background: var(--line); margin-top: 6px;
  position: relative; overflow: hidden;
}
.kl-quest-log .col-head .bar-line .fill {
  position: absolute; inset: 0 auto 0 0; background: var(--accent);
  transition: width 400ms ease;
}
.kl-quest-log .col-head .bar-meta {
  grid-column: 1 / -1;
  font-family: 'KarmoMono', monospace; font-size: 12px;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-3);
  display: flex; justify-content: space-between; margin-top: 4px;
}
.kl-quest-log .col-head .bar-meta b { color: var(--ink-2); font-weight: 400; }

/* ── SKY PATCH ── */
.kl-quest-log .sky {
  aspect-ratio: 16/8; border-bottom: 1px solid var(--line-2);
  position: relative; overflow: hidden;
  background: radial-gradient(ellipse at 30% 60%, #182033 0%, #0a0d14 70%);
}
.kl-quest-log .sky.photo { background: #0a0d14; }
.kl-quest-log .sky.photo img {
  width: 100%; height: 100%; object-fit: cover;
}
.kl-quest-log .sky.photo::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(11,13,18,0.25) 0%, rgba(11,13,18,0.8) 100%);
}
.kl-quest-log .sky svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.kl-quest-log .sky .coord {
  position: absolute; left: 12px; top: 12px; z-index: 3;
  font-family: 'KarmoMono', monospace; font-size: 12px;
  color: var(--ink-2); letter-spacing: 0.15em; line-height: 1.7;
}
.kl-quest-log .sky .coord .k { color: var(--ink-3); }
.kl-quest-log .sky .tag {
  position: absolute; right: 12px; bottom: 12px; z-index: 3;
  font-family: 'KarmoMono', monospace; font-size: 12px;
  color: var(--ink-2); letter-spacing: 0.18em; text-transform: uppercase;
  padding: 3px 7px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.08);
}

/* ── LOG LIST ── */
.kl-quest-log .log { padding: 6px 12px 12px; flex: 1; display: flex; flex-direction: column; }
.kl-quest-log .obs {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 6px; cursor: pointer; border-radius: 3px; min-width: 0;
  transition: background 80ms;
}
.kl-quest-log .obs:hover { background: var(--bg-2); }
.kl-quest-log .obs.selected { background: var(--bg-2); outline: 1px solid var(--line-2); }
.kl-quest-log .obs .obs-id {
  font-family: 'KarmoMono', monospace; font-size: 11px;
  color: var(--accent); letter-spacing: 0.05em; flex-shrink: 0; white-space: nowrap;
}
.kl-quest-log .obs .obs-name {
  font-family: 'KarmoSerif', serif; font-size: 13.5px; color: var(--ink); font-weight: 500;
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  letter-spacing: -0.01em;
}
.kl-quest-log .obs[data-status="fire"] .obs-name::before { content: '✦ '; color: var(--accent); font-size: 11px; font-family: 'KarmoMono', monospace; }
.kl-quest-log .obs[data-status="done"] .obs-name,
.kl-quest-log .obs[data-status="sealed"] .obs-name { text-decoration: line-through; color: var(--ink-3); text-decoration-thickness: 1px; }
.kl-quest-log .obs .obs-prog {
  display: flex; align-items: center; gap: 5px; margin-left: auto; flex-shrink: 0;
  font-family: 'KarmoMono', monospace; font-size: 10.5px; color: var(--ink-3);
}
.kl-quest-log .obs .obs-bw { width: 40px; height: 3px; background: var(--line); border-radius: 2px; flex-shrink: 0; }
.kl-quest-log .obs .obs-bf { display: block; height: 100%; background: var(--ink-2); border-radius: 2px; }
.kl-quest-log .obs[data-status="fire"] .obs-bf { background: var(--accent); }
.kl-quest-log .obs[data-status="done"] .obs-bf { background: var(--ink); width: 100% !important; }
.kl-quest-log .obs .mag {
  font-family: 'KarmoMono', monospace; font-size: 10.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3);
  padding: 2px 5px; border: 1px solid var(--line-2); white-space: nowrap; flex-shrink: 0;
}
.kl-quest-log .obs-expand-ph { width: 18px; flex-shrink: 0; }

.kl-quest-log .empty {
  padding: 32px 0; text-align: center; color: var(--ink-3);
  font-family: 'KarmoMono', monospace; font-size: 13px;
  letter-spacing: 0.22em; text-transform: uppercase;
}
.kl-quest-log .empty::before, .kl-quest-log .empty::after { content: '— '; opacity: 0.6; }
.kl-quest-log .empty::after { content: ' —'; }

/* ── DRAWER ── */
.kl-quest-log .drawer {
  position: fixed; inset: 0 0 0 auto; width: min(520px, 92vw);
  background: var(--paper); border-left: 1px solid var(--line-3);
  transform: translateX(100%); transition: transform 280ms cubic-bezier(0.22, 0.9, 0.32, 1);
  z-index: 100; overflow-y: auto;
  box-shadow: -40px 0 80px rgba(0,0,0,0.4);
}
.kl-quest-log .drawer.open { transform: translateX(0); }
.kl-quest-log .drawer-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  z-index: 99; opacity: 0; pointer-events: none; transition: opacity 220ms;
}
.kl-quest-log .drawer-backdrop.open { opacity: 1; pointer-events: auto; }

.kl-quest-log .drawer-head {
  padding: 18px 24px; border-bottom: 1px solid var(--line-2);
  display: flex; justify-content: space-between; align-items: center;
  position: sticky; top: 0; background: var(--paper); z-index: 2;
}
.kl-quest-log .drawer-head .crumb {
  font-family: 'KarmoMono', monospace; font-size: 13px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3);
}
.kl-quest-log .drawer-head .crumb b { color: var(--ink); }
.kl-quest-log .drawer-close {
  background: transparent; border: 1px solid var(--line-2); color: var(--ink-2);
  font-family: 'KarmoMono', monospace; font-size: 14px;
  width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.kl-quest-log .drawer-close:hover { border-color: var(--ink); color: var(--ink); }

.kl-quest-log .drawer-body { padding: 28px 28px 40px; }
.kl-quest-log .drawer-body .lane-pill {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: 'KarmoMono', monospace; font-size: 13px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-2);
  padding: 5px 10px; border: 1px solid var(--line-2);
}
.kl-quest-log .drawer-body .lane-pill .sw { width: 6px; height: 6px; border-radius: 50%; }
.kl-quest-log .drawer-body h2 {
  margin: 16px 0 10px; font-family: 'KarmoSerif', serif; font-weight: 700;
  font-size: 32px; line-height: 1.1; letter-spacing: -0.02em;
}
.kl-quest-log .drawer-body h2 em { font-style: italic; font-weight: 400; color: var(--ink-2); }
.kl-quest-log .drawer-body .lede {
  font-size: 16.5px; color: var(--ink-2); line-height: 1.65; max-width: 52ch;
}
.kl-quest-log .drawer-body .progress-wrap {
  margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line-2);
}
.kl-quest-log .drawer-body .progress-wrap .lbl {
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: 'KarmoMono', monospace; font-size: 13px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3);
  margin-bottom: 8px;
}
.kl-quest-log .drawer-body .progress-wrap .lbl b {
  font-family: 'KarmoSerif', serif; font-size: 20px; color: var(--ink); letter-spacing: -0.01em;
  font-weight: 700;
}
.kl-quest-log .drawer-body .progress-wrap .bar {
  height: 3px; background: var(--line); position: relative; overflow: hidden;
}
.kl-quest-log .drawer-body .progress-wrap .bar .f {
  position: absolute; inset: 0 auto 0 0; background: var(--accent);
}
.kl-quest-log .drawer-body .progress-wrap .ticks {
  display: flex; justify-content: space-between; margin-top: 4px;
  font-family: 'KarmoMono', monospace; font-size: 12px;
  color: var(--ink-3); letter-spacing: 0.18em;
}

/* ── FEATURED + SUB-GRID ── */
.kl-quest-log .featured {
  border: 1px solid var(--line-2); background: var(--paper);
  margin-bottom: 20px; position: relative;
  display: grid; grid-template-columns: 1.1fr 1.5fr;
}
.kl-quest-log .featured::before {
  content: ''; position: absolute; top: -1px; left: -1px; width: 14px; height: 14px;
  border-top: 1px solid var(--accent); border-left: 1px solid var(--accent);
}
.kl-quest-log .featured::after {
  content: ''; position: absolute; bottom: -1px; right: -1px; width: 14px; height: 14px;
  border-bottom: 1px solid var(--line-3); border-right: 1px solid var(--line-3);
}
.kl-quest-log .featured .f-left { display: flex; flex-direction: column; border-right: 1px solid var(--line-2); }
.kl-quest-log .featured .f-sky { aspect-ratio: auto; flex: 1; min-height: 280px; border-bottom: 1px solid var(--line-2); position: relative; overflow: hidden; }
.kl-quest-log .featured .f-sky img {
  width: 100%; height: 100%; object-fit: cover;
}
.kl-quest-log .featured .f-sky::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(11,13,18,0.2) 0%, rgba(11,13,18,0.8) 100%);
}
.kl-quest-log .featured .f-sky .coord {
  position: absolute; left: 14px; top: 14px; z-index: 3;
  font-family: 'KarmoMono', monospace; font-size: 12.5px;
  color: var(--ink-2); letter-spacing: 0.15em; line-height: 1.8;
}
.kl-quest-log .featured .f-sky .coord .k { color: var(--ink-3); }
.kl-quest-log .featured .f-sky .tag {
  position: absolute; right: 14px; bottom: 14px; z-index: 3;
  font-family: 'KarmoMono', monospace; font-size: 13px;
  color: var(--ink); letter-spacing: 0.2em; text-transform: uppercase;
  padding: 4px 9px; background: rgba(0,0,0,0.55); border: 1px solid var(--line-3);
}
.kl-quest-log .featured .f-sky .overlay-title {
  position: absolute; left: 20px; right: 20px; bottom: 42px; z-index: 3;
  pointer-events: none;
}
.kl-quest-log .featured .f-sky .overlay-title .cst {
  font-family: 'KarmoMono', monospace; font-size: 12px;
  letter-spacing: 0.3em; color: var(--accent); text-transform: uppercase;
}
.kl-quest-log .featured .f-sky .overlay-title .name {
  font-family: 'KarmoSerif', serif; font-style: italic; font-weight: 500;
  font-size: 30px; color: var(--ink); line-height: 1.05; margin-top: 4px;
  letter-spacing: -0.01em; text-shadow: 0 2px 20px rgba(0,0,0,0.8);
}
.kl-quest-log .featured .f-meta { padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; }
.kl-quest-log .featured .f-meta .eye {
  font-family: 'KarmoMono', monospace; font-size: 12px;
  letter-spacing: 0.28em; color: var(--accent); text-transform: uppercase;
}
.kl-quest-log .featured .f-meta h2 {
  margin: 0; font-family: 'KarmoSerif', serif; font-weight: 900;
  font-size: 40px; line-height: 0.98; letter-spacing: -0.02em;
}
.kl-quest-log .featured .f-meta h2 em { font-style: italic; font-weight: 500; color: var(--ink-2); display: block; font-size: 0.5em; margin-top: 6px; letter-spacing: 0.05em; }
.kl-quest-log .featured .f-meta .dek {
  font-size: 15px; color: var(--ink-2); line-height: 1.6; max-width: 46ch;
  border-top: 1px dashed var(--line-2); padding-top: 10px;
}
.kl-quest-log .featured .f-meta .mini-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
  background: var(--line-2); border: 1px solid var(--line-2); margin-top: auto;
}
.kl-quest-log .featured .f-meta .mini-stats .s { background: var(--paper); padding: 10px 12px; }
.kl-quest-log .featured .f-meta .mini-stats .s .k {
  font-family: 'KarmoMono', monospace; font-size: 11.5px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3);
}
.kl-quest-log .featured .f-meta .mini-stats .s .v {
  font-family: 'KarmoSerif', serif; font-weight: 700;
  font-size: 20px; line-height: 1.2; letter-spacing: -0.01em;
}
.kl-quest-log .featured .f-meta .mini-stats .s.accent .v { color: var(--accent); }
.kl-quest-log .featured .f-meta .bar-line {
  height: 2px; background: var(--line); position: relative; overflow: hidden; margin-top: 4px;
}
.kl-quest-log .featured .f-meta .bar-line .fill {
  position: absolute; inset: 0 auto 0 0; background: var(--accent);
}

.kl-quest-log .featured .f-right {
  padding: 10px 14px 14px;
  display: flex; flex-direction: column; overflow-y: auto;
}
.kl-quest-log .obs-group--has-subs .obs-subs { display: none; }
.kl-quest-log .obs-group--has-subs.obs-group--expanded .obs-subs { display: block; }
.kl-quest-log .obs-expand-btn {
  background: none; border: none; cursor: pointer; padding: 0;
  width: 18px; text-align: center; flex-shrink: 0;
  color: var(--ink-3); font-size: 11px; line-height: 1; vertical-align: middle;
}
.kl-quest-log .obs-expand-btn:hover { color: var(--accent); }
.kl-quest-log .featured .f-right .log-head {
  display: flex; justify-content: space-between; align-items: baseline;
  padding-bottom: 8px; border-bottom: 1px solid var(--line-2); margin-bottom: 4px;
  font-family: 'KarmoMono', monospace; font-size: 13px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3);
}
.kl-quest-log .featured .f-right .log-head b { color: var(--ink); font-weight: 500; }

.kl-quest-log .sub-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 1100px) { .kl-quest-log .sub-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) {
  .kl-quest-log .sub-grid { grid-template-columns: 1fr; }
  .kl-quest-log .featured { grid-template-columns: 1fr; }
  .kl-quest-log .featured .f-left { border-right: none; border-bottom: 1px solid var(--line-2); }
  .kl-quest-log .featured .f-right { padding: 8px 10px 12px; }
}

/* ── status-coloured obs rows ── */
.kl-quest-log .obs[data-status="fire"] .mag { color: var(--bg); background: var(--accent); border-color: var(--accent); }
.kl-quest-log .obs[data-status="done"] .mag,
.kl-quest-log .obs[data-status="sealed"] .mag { color: var(--bg); background: var(--ink); border-color: var(--ink); }
.kl-quest-log .obs[data-status="hold"] .mag { border-style: dashed; }
.kl-quest-log .obs[data-status="seed"] .mag { color: var(--ink-3); }

/* ── 5-star rating ── */
.kl-quest-log .stars { display: inline-flex; gap: 2px; vertical-align: middle; }
.kl-quest-log .stars .star { width: 11px; height: 11px; color: var(--line-3); display: inline-block; }
.kl-quest-log .stars.large .star { width: 16px; height: 16px; }
.kl-quest-log .stars .star.filled { color: var(--accent); }
.kl-quest-log .stars .star.half {
  color: var(--accent);
  mask-image: linear-gradient(90deg, black 50%, transparent 50%);
  -webkit-mask-image: linear-gradient(90deg, black 50%, transparent 50%);
}

/* ── checklist in drawer ── */
.kl-quest-log .checklist { display: flex; flex-direction: column; gap: 2px; }
.kl-quest-log .check-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 10px 10px 4px; cursor: pointer;
  border-bottom: 1px dashed var(--line-2);
  transition: background 120ms;
}
.kl-quest-log .check-row:hover { background: var(--bg-2); }
.kl-quest-log .check-box {
  width: 14px; height: 14px; border: 1px solid var(--ink-3); flex-shrink: 0;
  margin-top: 3px; position: relative; transition: all 140ms;
}
.kl-quest-log .check-row.done .check-box { background: var(--accent); border-color: var(--accent); }
.kl-quest-log .check-row.done .check-box::after {
  content: '✓'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--bg); font-size: 13px; font-weight: 700;
}
.kl-quest-log .check-label {
  font-family: 'KarmoSerif', serif; font-size: 16px; line-height: 1.45;
  color: var(--ink); letter-spacing: -0.005em;
}
.kl-quest-log .check-row.done .check-label { color: var(--ink-3); text-decoration: line-through; text-decoration-color: var(--line-3); }
.kl-quest-log .check-row { position: relative; padding-right: 56px; }
.kl-quest-log .check-edit, .kl-quest-log .check-delete {
  position: absolute; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer;
  color: var(--ink-3); font-size: 14px; line-height: 1; padding: 4px 6px;
  opacity: 0; transition: opacity 0.12s, color 0.12s;
}
.kl-quest-log .check-edit { right: 28px; }
.kl-quest-log .check-delete { right: 4px; font-size: 18px; }
.kl-quest-log .check-row:hover .check-edit,
.kl-quest-log .check-row:hover .check-delete { opacity: 1; }
.kl-quest-log .check-edit:hover { color: var(--accent); }
.kl-quest-log .check-delete:hover { color: #d4504e; }
.kl-quest-log .check-edit-input {
  font-family: 'KarmoSerif', serif; font-size: 16px; line-height: 1.45;
  background: var(--paper); color: var(--ink); border: 1px solid var(--accent);
  outline: none; padding: 2px 6px; flex: 1; min-width: 0;
}

.kl-quest-log .add-check input {
  flex: 1; background: var(--paper); border: none; outline: none;
  padding: 9px 12px; font-family: 'KarmoSans', sans-serif; font-size: 15px; color: var(--ink);
}
.kl-quest-log .add-check input::placeholder { color: var(--ink-3); }
.kl-quest-log .add-check button {
  background: var(--bg); border: none; color: var(--ink);
  padding: 9px 14px; font-family: 'KarmoMono', monospace; font-size: 13px;
  letter-spacing: 0.22em; cursor: pointer;
}
.kl-quest-log .add-check button:hover { background: var(--accent); color: var(--bg); }

/* ── status switcher ── */
.kl-quest-log .status-toggle {
  font-family: 'KarmoMono', monospace; font-size: 13px; letter-spacing: 0.2em;
  background: var(--paper); color: var(--ink-2); cursor: pointer;
  transition: all 140ms;
}
.kl-quest-log .status-toggle:hover { color: var(--ink); }
.kl-quest-log .status-toggle.on { background: var(--accent); color: var(--bg); }

/* ── child row ── */
.kl-quest-log .children-list { display: flex; flex-direction: column; gap: 0; }
.kl-quest-log .child-row {
  display: grid; grid-template-columns: 70px 1fr auto; gap: 12px; align-items: center;
  padding: 11px 4px; border-bottom: 1px dashed var(--line-2); cursor: pointer;
  transition: background 120ms, padding 120ms;
}
.kl-quest-log .child-row:hover { background: var(--bg-2); }
.kl-quest-log .cr-status {
  font-family: 'KarmoMono', monospace; font-size: 12px; letter-spacing: 0.22em;
  color: var(--ink-3); text-align: center; padding: 2px 5px; border: 1px solid var(--line-2);
}
.kl-quest-log .cr-status.fire { color: var(--accent); border-color: var(--accent); }
.kl-quest-log .cr-status.sealed { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.kl-quest-log .cr-title { font-family: 'KarmoSerif', serif; font-size: 16.5px; color: var(--ink); }
.kl-quest-log .cr-right { display: flex; align-items: center; }

/* ── seal button ── */
.kl-quest-log .seal-btn {
  margin-top: 22px; width: 100%; background: var(--ink); color: var(--bg);
  border: none; padding: 14px; cursor: pointer;
  font-family: 'KarmoMono', monospace; font-size: 13.5px;
  letter-spacing: 0.3em; text-transform: uppercase; transition: background 140ms;
}
.kl-quest-log .seal-btn:hover { background: var(--accent); }

@media (max-width: 1000px) { .kl-quest-log .stats { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 640px) {
  .kl-quest-log .columns { grid-template-columns: 1fr; }
  .kl-quest-log .stats { grid-template-columns: repeat(2, 1fr); }
  .kl-quest-log header.hd { flex-direction: column; align-items: flex-start; gap: 8px; }
}

/* ═══ OVERVIEW (KL-044) — 페이지 최상단. PM 뷰. App 트리 위 ═══ */
.kl-quest-log .overview {
  padding: 24px 28px 22px;
  border-bottom: 1px solid var(--line-2);
}
.kl-quest-log .overview-head {
  display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap;
  margin-bottom: 18px; padding-bottom: 10px; border-bottom: 1px dashed var(--line-2);
}
.kl-quest-log .overview-head h1 {
  font-family: 'KarmoSerif', serif; font-weight: 900;
  font-size: clamp(22px, 2.6vw, 28px); line-height: 1; letter-spacing: -0.02em;
  color: var(--ink);
}
.kl-quest-log .overview-head h1 em { font-style: italic; font-weight: 500; color: var(--ink-2); }
.kl-quest-log .overview-head .meta {
  font-family: 'KarmoMono', monospace; font-size: 11px;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-3);
}

.kl-quest-log .overview-section { margin-bottom: 22px; }
.kl-quest-log .overview-section:last-child { margin-bottom: 0; }
.kl-quest-log .overview-section h2 {
  margin: 0 0 10px;
  font-family: 'KarmoMono', monospace; font-size: 11.5px; font-weight: 500;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent);
}
.kl-quest-log .overview-section h2 small {
  font-family: 'KarmoMono', monospace; font-size: 10.5px;
  letter-spacing: 0.16em; color: var(--ink-3); text-transform: uppercase;
  margin-left: 8px; font-weight: 400;
}

/* domain stats grid */
.kl-quest-log .overview-domains {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px;
}
.kl-quest-log .overview-domain {
  position: relative; padding: 12px 14px;
  background: var(--paper); border: 1px solid var(--line-2);
}
.kl-quest-log .overview-domain::before {
  content: ''; position: absolute; top: -1px; left: -1px; width: 8px; height: 8px;
  border-top: 1px solid var(--accent); border-left: 1px solid var(--accent);
}
.kl-quest-log .overview-domain-head {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  margin-bottom: 6px;
}
.kl-quest-log .overview-domain-name {
  font-family: 'KarmoSerif', serif; font-weight: 700; font-size: 15px;
  color: var(--ink); letter-spacing: -0.01em;
}
.kl-quest-log .overview-domain-icon { margin-right: 4px; font-size: 14px; }
.kl-quest-log .overview-domain-pct {
  font-family: 'KarmoMono', monospace; font-size: 13px; font-weight: 700;
  color: var(--accent); letter-spacing: 0.04em;
}
.kl-quest-log .overview-domain-bar {
  height: 2px; background: var(--line); margin: 6px 0 8px;
  position: relative; overflow: hidden;
}
.kl-quest-log .overview-domain-bar .fill {
  position: absolute; inset: 0 auto 0 0; background: var(--accent);
  transition: width 400ms ease;
}
.kl-quest-log .overview-domain-counts {
  display: flex; gap: 12px; flex-wrap: wrap;
  font-family: 'KarmoMono', monospace; font-size: 10.5px;
  letter-spacing: 0.16em; text-transform: uppercase;
}
.kl-quest-log .overview-domain-counts .k { color: var(--ink-3); }
.kl-quest-log .overview-domain-counts .v { color: var(--ink); font-weight: 500; margin-left: 3px; }
.kl-quest-log .overview-domain-counts .v.zero { color: var(--ink-3); font-weight: 400; }
.kl-quest-log .overview-domain-counts .fire .v:not(.zero) { color: var(--accent); }

/* top-next list */
.kl-quest-log .overview-next-list {
  list-style: none; padding: 0; margin: 0;
}
.kl-quest-log .overview-next-item {
  display: grid; grid-template-columns: 24px 130px 1fr; gap: 10px; align-items: baseline;
  padding: 8px 0; border-bottom: 1px dashed var(--line-2);
}
.kl-quest-log .overview-next-item:last-child { border-bottom: none; }
.kl-quest-log .overview-next-item .icon { font-size: 14px; text-align: center; }
.kl-quest-log .overview-next-item .id {
  font-family: 'KarmoMono', monospace; font-size: 11px;
  letter-spacing: 0.08em; color: var(--accent);
}
.kl-quest-log .overview-next-item .title {
  font-family: 'KarmoSerif', serif; font-size: 14.5px; color: var(--ink); line-height: 1.4;
}
.kl-quest-log .overview-next-item[data-status="active"] .title::before {
  content: '✦'; color: var(--accent); margin-right: 6px;
}
.kl-quest-log .overview-next-item[data-status="ready"] .title::before {
  content: '◇'; color: var(--ink-2); margin-right: 6px;
}

/* commits by domain */
.kl-quest-log .overview-commits-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px;
}
.kl-quest-log .overview-commit-bucket {
  background: var(--paper); border: 1px solid var(--line-2); padding: 10px 12px;
}
.kl-quest-log .overview-commit-bucket-head {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px dashed var(--line-2);
}
.kl-quest-log .overview-commit-bucket-name {
  font-family: 'KarmoSerif', serif; font-weight: 700; font-size: 13.5px; color: var(--ink);
}
.kl-quest-log .overview-commit-bucket-count {
  font-family: 'KarmoMono', monospace; font-size: 12px; font-weight: 700;
  color: var(--accent); letter-spacing: 0.04em;
}
.kl-quest-log .overview-commit-bucket-list {
  list-style: none; padding: 0; margin: 0;
  font-family: 'KarmoMono', monospace; font-size: 10.5px; line-height: 1.6;
}
.kl-quest-log .overview-commit-bucket-list li {
  color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.kl-quest-log .overview-commit-bucket-list li .hash { color: var(--accent); margin-right: 6px; }
.kl-quest-log .overview-commit-bucket .empty {
  font-family: 'KarmoSerif', serif; font-style: italic;
  font-size: 11.5px; color: var(--ink-3);
}

/* hold by domain */
.kl-quest-log .overview-hold-row {
  display: flex; gap: 18px; flex-wrap: wrap;
  font-family: 'KarmoMono', monospace; font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.kl-quest-log .overview-hold {
  display: inline-flex; align-items: baseline; gap: 6px;
  color: var(--ink-3);
}
.kl-quest-log .overview-hold.has-hold { color: var(--ink-2); }
.kl-quest-log .overview-hold.has-hold .v { color: var(--accent); font-weight: 700; }
.kl-quest-log .overview-hold .icon { font-size: 13px; }

/* loading state */
.kl-quest-log .overview-loading {
  padding: 18px 16px; text-align: center;
  font-family: 'KarmoSerif', serif; font-style: italic;
  font-size: 13px; color: var(--ink-3);
}

/* ═══ APP TREE CONTROLS (KL-045) — 상태 / 도메인 / 밀도 칩 ═══ */
.kl-quest-log .ql-controls {
  margin-bottom: 18px;
  padding: 12px 0; border-top: 1px dashed var(--line-2); border-bottom: 1px dashed var(--line-2);
  display: flex; flex-direction: column; gap: 8px;
}
.kl-quest-log .ql-control-row {
  display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
}
.kl-quest-log .ql-control-label {
  font-family: 'KarmoMono', monospace; font-size: 10.5px;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink-3);
  width: 56px; flex-shrink: 0;
}
.kl-quest-log .ql-chip {
  font-family: 'KarmoMono', monospace; font-size: 11.5px;
  letter-spacing: 0.10em; color: var(--ink-3);
  padding: 4px 10px; border: 1px dashed var(--line-3); background: transparent;
  cursor: pointer; transition: all 140ms;
  display: inline-flex; align-items: center; gap: 4px;
}
.kl-quest-log .ql-chip:hover { color: var(--ink-2); border-color: var(--ink-3); }
.kl-quest-log .ql-chip.on {
  color: var(--ink); border: 1px solid var(--accent); background: rgba(212, 168, 73, 0.10);
}
.kl-quest-log .ql-chip-num {
  display: inline-block; background: var(--accent); color: var(--bg);
  font-family: 'KarmoMono', monospace; font-size: 9.5px; font-weight: 700;
  padding: 1px 5px; margin-right: 5px;
  border-radius: 2px; letter-spacing: 0;
}
.kl-quest-log .ql-chip-hint {
  font-family: 'KarmoSans', sans-serif; font-size: 10.5px;
  color: var(--ink-3); margin-left: 6px; font-style: italic;
}

/* ═══ obs chips ═══ */
.kl-quest-log .mag-cluster { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; white-space: nowrap; }
.kl-quest-log .pri {
  display: inline-block;
  font-family: 'KarmoMono', monospace; font-size: 10.5px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3);
  padding: 2px 5px; border: 1px solid var(--line-2); white-space: nowrap; flex-shrink: 0;
}
.kl-quest-log .pri--high { color: var(--bg); background: var(--accent); border-color: var(--accent); }
.kl-quest-log .pri--low  { color: var(--ink-3); border-style: dashed; }
.kl-quest-log .pri--blank { visibility: hidden; }

/* ═══ obs sub-task hierarchy (KL-048) — 트리 라인 (├── / └──) + 좌측 indent ═══ */
.kl-quest-log .obs--sub-mid, .kl-quest-log .obs--sub-last {
  padding-left: 32px; position: relative;
}
.kl-quest-log .obs--sub-mid::after, .kl-quest-log .obs--sub-last::after {
  position: absolute; left: 4px; top: 14px;
  font-family: 'KarmoMono', monospace; font-size: 11px;
  color: var(--ink-3); letter-spacing: 0; white-space: pre;
  pointer-events: none;
}
.kl-quest-log .obs--sub-mid::after { content: '├──'; }
.kl-quest-log .obs--sub-last::after { content: '└──'; }
/* compact 도 동일 패턴, 작은 크기 */
.kl-quest-log .obs--compact.obs--sub-mid, .kl-quest-log .obs--compact.obs--sub-last {
  padding-left: 28px;
}
.kl-quest-log .obs--compact.obs--sub-mid::after, .kl-quest-log .obs--compact.obs--sub-last::after {
  top: 6px; font-size: 10px;
}
`;

  function injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);

    // Observatory 폰트 — 페이지 어디든 같은 url을 여러 번 import해도 브라우저가 중복 다운로드 안 함
    if (!document.getElementById('kl-quest-log-fonts')) {
      const link = document.createElement('link');
      link.id = 'kl-quest-log-fonts';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;700;900&family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap';
      document.head.appendChild(link);
    }
  }

  // ── Toolbox.register ───────────────────────────────────────────────────
  Toolbox.register({
    ...Toolbox.getLazyWidgetPublicMeta('quest-log'),
    tabs: [
      {
        id: 'app',
        label: 'Quest Log',
        build: function (container: HTMLElement): void {
          void loadNamespace('quest-log').then(function () {

          Mdd.linePreset('tool_run', { msg: t('quest-log.t31') });
          injectStyles();
          renderQuestLog(container);
                  });
        }
      }
    ]
  });

  // ── renderQuestLog: HTML scaffold + memo 정본 fetch + runQuestLog ───────
  function renderQuestLog(container: HTMLElement): void {
    if (!isDesktop()) {
      container.innerHTML = `<div class="kl-quest-log"><div style="padding:48px 24px; text-align:center; color:#888;">${esc(t('quest-log.t11'))}<br/>${esc(t('quest-log.t12'))}</div></div>`;
      return;
    }

    // KL-024 — 이전 마운트의 file-watcher unlisten 이 있으면 정리.
    const prevUnlisten = _questUnlisten.get(container);
    if (typeof prevUnlisten === 'function') {
      try { prevUnlisten(); } catch (e) { console.error(t('quest-log.t32'), e); }
      _questUnlisten.delete(container);
    }

    // KL-035 — `.kl-quest-log` 한 컨테이너가 자체 스크롤 (CSS: flex:1; min-height:0; overflow-y:auto).
    // layout-full tab-panel 이 flex column 이므로 스크롤 wrapper 는 단일이어야 chain 안 깨짐.
    // KL-044 — [overview, app] 2 layer (KL-035 의 hub 6 섹션 통째로 폐기).
    //   overview = PM 뷰 — 도메인 진척 / top-5 / 7d commits / hold (사람 인터페이스).
    //   app = 도메인 TASK 트리 (renderOnce 갱신).
    //   ※ hub (활성세션/commit/도구/룰/그래프) 는 Claude infra 데이터라 사용자에 X — 폐기.
    if (!container.querySelector('.kl-quest-log')) {
      container.innerHTML = '';
      const klRoot = document.createElement('div');
      klRoot.className = 'kl-quest-log';
      container.appendChild(klRoot);

      const overviewWrap = document.createElement('div');
      overviewWrap.setAttribute('data-kl-ql-overview', '1');
      klRoot.appendChild(overviewWrap);

      const appWrap = document.createElement('div');
      appWrap.setAttribute('data-kl-ql-app', '1');
      klRoot.appendChild(appWrap);
    }
    const klRoot = container.querySelector('.kl-quest-log') as HTMLElement;
    const overviewWrap = klRoot.querySelector('[data-kl-ql-overview]') as HTMLElement;
    const appWrap = klRoot.querySelector('[data-kl-ql-app]') as HTMLElement;

    const renderOnce = (): void => {
      klRoot.dataset.pendingScroll = String(klRoot.scrollTop);
      appWrap.innerHTML = `
        <div class="wrap">
          <header class="hd">
            <h1 class="serif">QUEST LOG <em>— in progress</em></h1>
          </header>

          <div class="stats" data-kl-ql="stats"></div>

          <div data-kl-ql="ql-controls"></div>

          <div data-kl-ql="featured-wrap"></div>
          <div class="sub-grid" data-kl-ql="sub-columns"></div>

        </div>

        <div class="drawer-backdrop" data-kl-ql="backdrop"></div>
        <aside class="drawer" data-kl-ql="drawer">
          <div class="drawer-head">
            <div class="crumb" data-kl-ql="crumb">KMLB-QST / <b>—</b></div>
            <button class="drawer-close" data-kl-ql="drawer-close" aria-label="Close">✕</button>
          </div>
          <div class="drawer-body" data-kl-ql="drawer-body"></div>
        </aside>
      `;

      // root = klRoot (단일 스크롤 컨테이너). data-kl-ql=* selector 가 appWrap 안에서 다 찾힘.
      const root = klRoot;

      // 비동기 invoke + 변환 + run
      void (async () => {
        const tree = await fetchMemoTree();
        if (!tree) {
          // 에러 표시는 appWrap 만 wipe. overview 영역 유지 (자체 폴링).
          appWrap.innerHTML = `<div style="padding:48px 24px; text-align:center; color:#c08080;">${esc(t('quest-log.t13'))}</div>`;
          return;
        }
        const src = transformMemoToOld(tree);
        runQuestLog(root, src);
      })();
    };

    renderOnce();

    // KL-044 — 「프로젝트 개요」 폴링 시작 (10s 자체 폴링).
    startOverviewPolling(overviewWrap);

    // KL-024 — Tauri file watcher 가 emit 하는 'quest-tree-changed' 이벤트 listen.
    // 외부 에디터에서 memo TASK 파일이 변경되면 자동 새로고침. KL-044 — overview 도 즉시 갱신.
    // TASK-KL-062 slice3c: 로컬 tauriEvent 캡처+가드 폐기 → seam listen
    // (웹=no-op unlisten). isDesktop() 게이트로 비-데스크톱 설치 skip 보존.
    if (isDesktop()) {
      void (async () => {
        try {
          const unlisten = await listen('quest-tree-changed', () => {
            renderOnce();
            void refreshOverview(overviewWrap);
          });
          _questUnlisten.set(container, unlisten);
        } catch (err) {
          console.error(t('quest-log.t33'), err);
        }
      })();
    }
  }

  // ── runQuestLog: 원본 IIFE 로직 (document → root, ID → data-kl-ql) ──────
  function runQuestLog(root: HTMLElement, src: QuestData): void {
    // KL-048 — v2: leaf 에 parentId 필드 추가. 이전 v1 캐시는 자동 폐기 (sub-task hierarchy 정합).
    const STORAGE_KEY = 'quest-log-state-v2';
    const SRC = src;

    const $ = (sel: string): HTMLElement | null => root.querySelector(sel) as HTMLElement | null;
    const $$ = (sel: string): NodeListOf<HTMLElement> => root.querySelectorAll(sel) as NodeListOf<HTMLElement>;
    const byKey = (key: string): HTMLElement | null => root.querySelector(`[data-kl-ql="${key}"]`) as HTMLElement | null;

    function loadStored(): QuestData | null {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as QuestData | null; } catch (e) { return null; }
    }
    function save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects: DATA.projects, sealed: DATA.sealed })); } catch (e) {}
    }
    const stored = loadStored();
    const DATA = {
      projects: stored?.projects ?? SRC.projects,
      sealed: stored?.sealed ?? SRC.sealed,
    };

    // KL-045 — UI prefs (status 필터 / 도메인 토글 / 행 밀도 / 다중 키 정렬). 별도 키 (DATA 캐시와 분리).
    const UI_PREFS_KEY = 'quest-log-ui-prefs-v1';
    type SortKey = 'status' | 'id-asc' | 'id-desc' | 'priority';
    interface UIPrefs { statusOff: string[]; domainOff: string[]; density: 'full' | 'compact'; sortKeys: SortKey[]; expandedParents: string[]; }
    const SORT_VALUES: SortKey[] = ['status', 'id-asc', 'id-desc', 'priority'];
    function loadPrefs(): UIPrefs {
      try {
        const raw = JSON.parse(localStorage.getItem(UI_PREFS_KEY) || 'null');
        // 마이그레이션: 옛 단일 `sort: SortKey` → `sortKeys: [sort]`.
        let sortKeys: SortKey[];
        if (Array.isArray(raw?.sortKeys)) {
          sortKeys = raw.sortKeys.filter((k: unknown): k is SortKey => SORT_VALUES.includes(k as SortKey));
        } else if (typeof raw?.sort === 'string' && SORT_VALUES.includes(raw.sort)) {
          sortKeys = [raw.sort];
        } else {
          sortKeys = ['status'];  // default = 상태 우선 (PM 뷰 정합)
        }
        return {
          statusOff: Array.isArray(raw?.statusOff) ? raw.statusOff : [],
          domainOff: Array.isArray(raw?.domainOff) ? raw.domainOff : [],
          density: raw?.density === 'compact' ? 'compact' : 'full',
          sortKeys,
          expandedParents: Array.isArray(raw?.expandedParents) ? raw.expandedParents : [],
        };
      } catch (e) {
        return { statusOff: [], domainOff: [], density: 'full', sortKeys: ['status'], expandedParents: [] };
      }
    }
    function savePrefs(): void {
      try { localStorage.setItem(UI_PREFS_KEY, JSON.stringify(state.prefs)); } catch (e) {}
    }

    const HEROES = [
      '/apps/karmolab/img/widgets/quest-log/240126-072633.png',
      '/apps/karmolab/img/widgets/quest-log/240714-071225.jpg',
      '/apps/karmolab/img/widgets/quest-log/240330-000000.png',
      '/apps/karmolab/img/widgets/quest-log/240330-111546.png',
      '/apps/karmolab/img/widgets/quest-log/240330-140142.png',
      '/apps/karmolab/img/widgets/quest-log/240513-131941.png',
      '/apps/karmolab/img/widgets/quest-log/240514-103335.png',
      '/apps/karmolab/img/widgets/quest-log/240514-104350.png',
      '/apps/karmolab/img/widgets/quest-log/240514-192005.png',
      '/apps/karmolab/img/widgets/quest-log/240605-133617.png',
      '/apps/karmolab/img/widgets/quest-log/240618-000000.png',
      '/apps/karmolab/img/widgets/quest-log/250315-170647.png',
      '/apps/karmolab/img/widgets/quest-log/250315-173653.png',
    ];
    const CONST_BY_PROJECT: Record<string, { name: string; sub: string; mag: string }> = {
      wm:     { name: 'Venefica',  sub: 'the witch',    mag: '1.2' },
      blog:   { name: 'Scriba',    sub: 'the scribe',   mag: '2.8' },
      learn:  { name: 'Discipulus',sub: 'the student',  mag: '3.1' },
      travel: { name: 'Viator',    sub: 'the wanderer', mag: '2.5' },
      body:   { name: 'Corpus',    sub: 'the body',     mag: '3.4' },
    };

    function findNode(id: string, nodes: QuestNode[] = DATA.projects, parents: QuestNode[] = []): { node: QuestNode; parents: QuestNode[] } | null {
      for (const n of nodes) {
        if (n.id === id) return { node: n, parents };
        if (n.children) {
          const f = findNode(id, n.children, [...parents, n]);
          if (f) return f;
        }
      }
      return null;
    }
    function isLeaf(n: QuestNode): n is QuestLeaf { return Array.isArray(n.checks); }
    function allLeaves(n: QuestNode, out: QuestNode[] = []): QuestNode[] {
      if (isLeaf(n)) { out.push(n); return out; }
      if (n.children) n.children.forEach((c) => allLeaves(c, out));
      return out;
    }
    function progressOf(n: QuestNode): number {
      if (isLeaf(n)) return n.checks.length ? n.checks.filter((c) => c.done).length / n.checks.length : 0;
      if (!n.children || !n.children.length) return 0;
      return n.children.reduce((s: number, c) => s + progressOf(c), 0) / n.children.length;
    }
    function findAreaOf(id: string): QuestNode | null {
      const f = findNode(id);
      if (!f) return null;
      return f.parents[1] || f.parents[0];
    }

    function hash(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return Math.abs(h); }
    function coords(idx: number) {
      const ra = (idx * 3.7 + 1) % 24;
      const dec = ((idx * 11.2) % 60) + 12;
      const rah = Math.floor(ra);
      const ram = Math.floor((ra - rah) * 60);
      const decd = Math.floor(dec);
      const decm = Math.floor((dec - decd) * 60);
      return { rah: String(rah).padStart(2, '0'), ram: String(ram).padStart(2, '0'),
               decd: String(decd).padStart(2, '0'), decm: String(decm).padStart(2, '0') };
    }

    const state = {
      view: 'log' as 'log' | 'trophy',
      selectedId: null as string | null,
      prefs: loadPrefs(),
    };

    // KL-045 — 필터 헬퍼 (canonical status 기반 — 'active' / 'ready' / 'seed' / 'hold' / 'done' / 'sealed').
    function isStatusOn(memoStatus: string): boolean {
      return !state.prefs.statusOff.includes(canonicalStatus(memoStatus));
    }
    function isDomainOn(domainId: string): boolean {
      return !state.prefs.domainOff.includes(domainId);
    }
    // KL-045 — 다중 키 정렬 헬퍼. state.prefs.sortKeys 순서대로 비교, tie 시 다음 키, 최종 tie = id asc.
    const STATUS_RANK: Record<string, number> = { active: 0, ready: 1, seed: 2, hold: 3, done: 4, sealed: 5 };
    const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };
    function compareByKey(a: QuestLeaf, b: QuestLeaf, key: SortKey): number {
      switch (key) {
        case 'status': {
          const ra = STATUS_RANK[canonicalStatus(a.memoStatus)] ?? 99;
          const rb = STATUS_RANK[canonicalStatus(b.memoStatus)] ?? 99;
          return ra - rb;
        }
        case 'priority': {
          const ra = PRIORITY_RANK[canonicalPriority(a.memoPriority)] ?? 99;
          const rb = PRIORITY_RANK[canonicalPriority(b.memoPriority)] ?? 99;
          return ra - rb;
        }
        case 'id-asc':
          return a.id.localeCompare(b.id);
        case 'id-desc':
          return b.id.localeCompare(a.id);
      }
      return 0;
    }
    function sortLeaves(leaves: QuestLeaf[]): QuestLeaf[] {
      const sorted = [...leaves];
      const keys = state.prefs.sortKeys;
      if (keys.length === 0) return sorted;
      sorted.sort((a, b) => {
        for (const key of keys) {
          const cmp = compareByKey(a, b, key);
          if (cmp !== 0) return cmp;
        }
        return a.id.localeCompare(b.id);
      });
      return sorted;
    }

    // KL-048 — sub-task hierarchy. project.children 안 카테고리 노드 (부모+subs) 풀어 hier item 으로.
    interface HierItem { leaf: QuestLeaf; isSub: boolean; isLast: boolean; }
    function flattenWithHier(project: QuestProject): HierItem[] {
      const out: HierItem[] = [];
      for (const child of (project.children || [])) {
        if (isLeaf(child)) {
          out.push({ leaf: child, isSub: false, isLast: false });
        } else if (Array.isArray(child.children)) {
          // 카테고리 노드: children[0] = 부모 leaf / children[1..] = subs
          const [parent, ...subs] = child.children;
          if (parent) out.push({ leaf: parent, isSub: false, isLast: false });
          subs.forEach((s, i) => {
            out.push({ leaf: s, isSub: true, isLast: i === subs.length - 1 });
          });
        }
      }
      return out;
    }

    // 정렬 시 부모-자식 묶음 유지. parent 의 sort key 로 그룹 정렬, sub 는 부모 뒤 원래 순서.
    function sortHierItems(items: HierItem[]): HierItem[] {
      const groups = new Map<string, { parent: HierItem | null; subs: HierItem[] }>();
      for (const it of items) {
        if (!it.isSub) {
          const id = it.leaf.id;
          if (!groups.has(id)) groups.set(id, { parent: it, subs: [] });
          else groups.get(id)!.parent = it;
        } else {
          const pid = it.leaf.parentId || it.leaf.id;
          if (!groups.has(pid)) groups.set(pid, { parent: null, subs: [] });
          groups.get(pid)!.subs.push(it);
        }
      }
      const arr = Array.from(groups.values());
      const keys = state.prefs.sortKeys;
      if (keys.length > 0) {
        arr.sort((a, b) => {
          // parent 가 null 인 그룹 (orphan subs) 은 끝으로
          if (!a.parent && !b.parent) return 0;
          if (!a.parent) return 1;
          if (!b.parent) return -1;
          for (const key of keys) {
            const cmp = compareByKey(a.parent.leaf, b.parent.leaf, key);
            if (cmp !== 0) return cmp;
          }
          return a.parent.leaf.id.localeCompare(b.parent.leaf.id);
        });
      }
      const out: HierItem[] = [];
      for (const g of arr) {
        if (g.parent) {
          out.push(g.parent);
          g.subs.forEach((s, i) => {
            out.push({ leaf: s.leaf, isSub: true, isLast: i === g.subs.length - 1 });
          });
        } else {
          // orphan: parent 가 필터됐으면 subs 도 트리 연결 끊고 standalone 으로
          g.subs.forEach((s) => {
            out.push({ leaf: s.leaf, isSub: false, isLast: false });
          });
        }
      }
      return out;
    }

    // KL-048 — TASK ID 의 도메인 prefix 떼고 번호만 (`TASK-WM-091-A` → `091-A`). 도메인은 그룹으로 이미 분리됨.
    function shortId(id: string): string {
      return String(id).replace(/^TASK-[A-Z]+-/, '');
    }

    function esc(s: unknown): string { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!)); }

    function starsHTML(progress: number, large = false): string {
      const filled = progress * 5;
      const full = Math.floor(filled);
      const hasHalf = (filled - full) >= 0.25 && (filled - full) < 0.75;
      const svg = '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2l2.9 6.95 7.6.6-5.75 4.95L18.4 22 12 17.9 5.6 22l1.65-7.5L1.5 9.55l7.6-.6z" fill="currentColor"/></svg>';
      let html = '<span class="stars' + (large ? ' large' : '') + '">';
      for (let i = 0; i < 5; i++) {
        let cls = '';
        if (i < full) cls = 'filled';
        else if (i === full && hasHalf) cls = 'half';
        html += '<span class="star ' + cls + '">' + svg + '</span>';
      }
      html += '</span>';
      return html;
    }

    function renderStats() {
      const all: QuestNode[] = [];
      DATA.projects.forEach((p) => allLeaves(p).forEach(l => all.push(l)));
      const sealed = DATA.sealed.length;
      const coverage = all.length ? Math.round(all.reduce((s, l) => s + progressOf(l), 0) / all.length * 100) : 0;
      const el = byKey('stats');
      if (!el) return;
      const trophyOn = state.view === 'trophy';
      el.innerHTML = `
        <div class="stat"><div class="k">COVERAGE</div><div class="v">${coverage}<small>%</small></div></div>
        <button class="stat stat-toggle ${trophyOn ? 'on' : ''}" data-kl-ql="trophy-toggle" type="button">
          <div class="k">SEALED${trophyOn ? ' · OPEN' : ''}</div>
          <div class="v">${sealed}<small>${trophyOn ? '← back to log' : 'open trophy'}</small></div>
        </button>
      `;
      const toggle = byKey('trophy-toggle');
      if (toggle) {
        toggle.addEventListener('click', () => {
          state.view = state.view === 'trophy' ? 'log' : 'trophy';
          renderStats();
          renderColumns();
        });
      }
    }

    // KL-045 — 컨트롤 row (상태 칩 / 도메인 토글 / 행 밀도). state.prefs ↔ localStorage `quest-log-ui-prefs-v1`.
    function renderControls() {
      const el = byKey('ql-controls');
      if (!el) return;
      const STATUS_CHIPS = [
        { id: 'active', label: '◉ FIRE' },
        { id: 'ready',  label: '◐ READY' },
        { id: 'seed',   label: '○ SEED' },
        { id: 'hold',   label: '─ SLEEP' },
      ];
      const DOMAIN_CHIPS = DOMAIN_ORDER.map((d) => ({
        id: d,
        label: `${DOMAIN_ICON[d] ?? '📦'} ${DOMAIN_LABEL[d] ?? d}`,
      }));
      const isStatusOff = (s: string) => state.prefs.statusOff.includes(s);
      const isDomainOff = (d: string) => state.prefs.domainOff.includes(d);
      const dense = state.prefs.density;
      el.innerHTML = `
        <div class="ql-controls">
          <div class="ql-control-row">
            <span class="ql-control-label">${esc(t('quest-log.t14'))}</span>
            ${STATUS_CHIPS.map((c) => `
              <button class="ql-chip ${isStatusOff(c.id) ? '' : 'on'}" data-status-toggle="${c.id}" type="button">${esc(c.label)}</button>
            `).join('')}
          </div>
          <div class="ql-control-row">
            <span class="ql-control-label">${esc(t('quest-log.t15'))}</span>
            ${DOMAIN_CHIPS.map((c) => `
              <button class="ql-chip ${isDomainOff(c.id) ? '' : 'on'}" data-domain-toggle="${c.id}" type="button">${esc(c.label)}</button>
            `).join('')}
          </div>
          <div class="ql-control-row">
            <span class="ql-control-label">${esc(t('quest-log.t16'))}</span>
            ${(() => {
              const sortLabels: Record<SortKey, string> = {
                'status': t('quest-log.t34'),
                'priority': 'priority (high→normal→low)',
                'id-desc': t('quest-log.t35'),
                'id-asc': t('quest-log.t36'),
              };
              return SORT_VALUES.map((key) => {
                const idx = state.prefs.sortKeys.indexOf(key);
                const on = idx >= 0;
                const num = on ? `<span class="ql-chip-num">${idx + 1}</span>` : '';
                return `<button class="ql-chip ${on ? 'on' : ''}" data-sort="${key}" type="button">${num}${esc(sortLabels[key])}</button>`;
              }).join('');
            })()}
            <span class="ql-chip-hint">${esc(t('quest-log.t17'))}</span>
          </div>
          <div class="ql-control-row">
            <span class="ql-control-label">${esc(t('quest-log.t18'))}</span>
            <button class="ql-chip ${dense === 'full' ? 'on' : ''}" data-density="full" type="button">FULL</button>
            <button class="ql-chip ${dense === 'compact' ? 'on' : ''}" data-density="compact" type="button">COMPACT</button>
          </div>
        </div>
      `;
      el.querySelectorAll<HTMLElement>('[data-sort]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.sort as SortKey;
          if (!SORT_VALUES.includes(next)) return;
          const idx = state.prefs.sortKeys.indexOf(next);
          if (idx >= 0) {
            state.prefs.sortKeys.splice(idx, 1);  // toggle off
          } else {
            state.prefs.sortKeys.push(next);  // append (lowest priority)
          }
          savePrefs(); renderControls(); renderColumns();
        });
      });
      el.querySelectorAll<HTMLElement>('[data-status-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.statusToggle!;
          const idx = state.prefs.statusOff.indexOf(id);
          if (idx >= 0) state.prefs.statusOff.splice(idx, 1); else state.prefs.statusOff.push(id);
          savePrefs(); renderControls(); renderColumns();
        });
      });
      el.querySelectorAll<HTMLElement>('[data-domain-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.domainToggle!;
          const idx = state.prefs.domainOff.indexOf(id);
          if (idx >= 0) state.prefs.domainOff.splice(idx, 1); else state.prefs.domainOff.push(id);
          savePrefs(); renderControls(); renderColumns();
        });
      });
      el.querySelectorAll<HTMLElement>('[data-density]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.density === 'compact' ? 'compact' : 'full';
          if (state.prefs.density === next) return;
          state.prefs.density = next;
          savePrefs(); renderControls(); renderColumns();
        });
      });
    }

    function skyHTML(idx: number, photo: boolean) {
      const { rah, ram, decd, decm } = coords(idx);
      if (photo) {
        const img = HEROES[idx % HEROES.length];
        return `
          <div class="sky photo">
            <img src="${img}" alt="">
            <div class="coord"><span class="k">RA</span> ${rah}<sup>h</sup> ${ram}<sup>m</sup><br><span class="k">DEC</span> +${decd}° ${decm}'</div>
            <div class="tag">PLATE 00${idx + 1}</div>
          </div>
        `;
      }
      const stars: { x: number; y: number; r: number; bright: boolean }[] = [];
      for (let i = 0; i < 14; i++) {
        const h = hash('s' + idx + i);
        stars.push({ x: h % 100, y: ((h >> 8) % 80) + 10, r: ((h >> 16) % 15) / 10 + 0.4, bright: i < 5 });
      }
      const bright = stars.filter(s => s.bright);
      let lines = '';
      for (let i = 0; i < bright.length - 1; i++) {
        lines += `<line x1="${bright[i].x}" y1="${bright[i].y}" x2="${bright[i + 1].x}" y2="${bright[i + 1].y}" stroke="var(--line-3)" stroke-width="0.18" stroke-dasharray="0.6 0.8" opacity="0.7" />`;
      }
      const hasMoon = idx === 2 || idx === 5;
      const moonX = 65 + (idx * 7) % 20;
      const moonY = 28 + (idx * 3) % 15;
      return `
        <div class="sky">
          <svg viewBox="0 0 100 50" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="kl-ql-g${idx}">
                <stop offset="0" stop-color="#233049" stop-opacity="0.9"/>
                <stop offset="1" stop-color="#0a0d14" stop-opacity="1"/>
              </radialGradient>
            </defs>
            <rect width="100" height="50" fill="url(#kl-ql-g${idx})"/>
            ${lines}
            ${stars.map(s => `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${s.bright ? '#f2f2ee' : '#9a9a94'}" opacity="${s.bright ? 1 : 0.7}"/>`).join('')}
            ${bright.slice(0, 3).map(s => `<circle cx="${s.x}" cy="${s.y}" r="${s.r * 2.5}" fill="none" stroke="#f2f2ee" stroke-width="0.15" opacity="0.3"/>`).join('')}
            ${hasMoon ? `<circle cx="${moonX}" cy="${moonY}" r="5" fill="#e8d9a8" opacity="0.95"/><circle cx="${moonX - 1.5}" cy="${moonY - 0.5}" r="4.2" fill="#0a0d14" opacity="0.25"/>` : ''}
          </svg>
          <div class="coord"><span class="k">RA</span> ${rah}<sup>h</sup> ${ram}<sup>m</sup><br><span class="k">DEC</span> +${decd}° ${decm}'</div>
          <div class="tag">FIELD 00${idx + 1}</div>
        </div>
      `;
    }

    // 모든 호출부가 HierItem 을 넘긴다 (groupedObsRows). 옛 bare-leaf 방어 분기는
    // 사문(死文)이라 KL-071 에서 제거 — 동작 동일, 타입만 정밀.
    function obsRow(hierOrLeaf: HierItem, projectId: string, hasSubs?: boolean, isExpanded?: boolean) {
      const leaf = hierOrLeaf.leaf;
      const isSub: boolean = !!hierOrLeaf.isSub;
      const isLast: boolean = !!hierOrLeaf.isLast;
      const status = leaf.status || 'seed';
      const priority = canonicalPriority(leaf.memoPriority || 'normal');
      const selectedCls = state.selectedId === leaf.id ? 'selected' : '';
      const priChip = priority === 'high'
        ? '<span class="pri pri--high">HI</span>'
        : priority === 'low'
          ? '<span class="pri pri--low">LO</span>'
          : '<span class="pri pri--blank">HI</span>';
      const magCluster = `<div class="mag-cluster"><span class="mag">${status.toUpperCase()}</span>${priChip}</div>`;
      const subCls = isSub ? (isLast ? 'obs--sub-last' : 'obs--sub-mid') : '';
      const toggleBtn = hasSubs
        ? `<button class="obs-expand-btn">${isExpanded ? '▾' : '▸'}</button>`
        : '<span class="obs-expand-ph"></span>';
      const checkN = leaf.checks.length;
      const checkDone = leaf.checks.filter((c) => c.done).length;
      const progress = checkN > 0 ? Math.round(progressOf(leaf) * 100) : 0;
      const progSection = checkN > 0
        ? `<div class="obs-prog"><span class="obs-chk">${checkDone}/${checkN}</span>${!isSub && status !== 'seed' ? `<span class="obs-bw"><span class="obs-bf" style="width:${progress}%"></span></span>` : ''}</div>`
        : '';
      return `
        <div class="obs ${selectedCls} ${subCls}" data-status="${status}" data-priority="${priority}" data-proj="${projectId}" data-id="${leaf.id}">
          ${toggleBtn}
          ${magCluster}
          <span class="obs-id">${esc(shortId(leaf.id))}</span>
          <span class="obs-name">${esc(leaf.title)}</span>
          ${progSection}
        </div>
      `;
    }

    // sub-task 접기/펼치기 — parent+subs 를 .obs-group 으로 묶어 반환.
    function groupedObsRows(items: HierItem[], projectId: string): string {
      const html: string[] = [];
      let i = 0;
      while (i < items.length) {
        const item = items[i];
        if (!item.isSub) {
          const subs: HierItem[] = [];
          let j = i + 1;
          while (j < items.length && items[j].isSub) { subs.push(items[j]); j++; }
          if (subs.length > 0) {
            const parentId = item.leaf.id;
            const isExp = state.prefs.expandedParents.includes(parentId);
            html.push(`<div class="obs-group obs-group--has-subs${isExp ? ' obs-group--expanded' : ''}" data-parent-id="${esc(parentId)}">`);
            html.push(obsRow(item, projectId, true, isExp));
            html.push(`<div class="obs-subs">${subs.map(s => obsRow(s, projectId)).join('')}</div>`);
            html.push('</div>');
            i = j;
          } else {
            html.push(`<div class="obs-group">${obsRow(item, projectId)}</div>`);
            i++;
          }
        } else {
          html.push(`<div class="obs-group">${obsRow(item, projectId)}</div>`);
          i++;
        }
      }
      return html.join('');
    }

    function renderColumns() {
      if (state.view === 'trophy') { renderTrophyView(); return; }

      const wm = DATA.projects.find((p) => p.id === 'wm');
      const others = DATA.projects.filter((p) => p.id !== 'wm' && isDomainOn(p.id));

      const fw = byKey('featured-wrap');
      if (!fw) return;
      if (wm && isDomainOn('wm')) {
        // KL-045 — WM featured 의 TASK 일렬 = 상태 필터 + 정렬 적용. 통계 (FIRE/SEALED/COVERAGE) 는 전체 기준 (필터 무관).
        const wmAllRaw = allLeaves(wm);
        // KL-048 — sub-task hierarchy 보존 정렬. parent + subs 묶음으로 sort 진행.
        const wmHierAll = flattenWithHier(wm).filter((h) => isStatusOn(h.leaf.memoStatus));
        const wmAll = sortHierItems(wmHierAll);
        const wmFire = wmAllRaw.filter(l => l.status === 'fire').length;
        const wmSealedCount = DATA.sealed.filter((s) => s.project === wm.title).length;
        const wmProg = wmAllRaw.length ? Math.round(wmAllRaw.reduce((s, l) => s + progressOf(l), 0) / wmAllRaw.length * 100) : 0;
        const cst = CONST_BY_PROJECT.wm;
        const { rah, ram, decd, decm } = coords(0);

        const prevFRightScroll = (fw.querySelector('.f-right') as HTMLElement | null)?.scrollTop ?? 0;
        fw.innerHTML = `
          <div class="featured">
            <div class="f-left">
              <div class="f-sky">
                <img src="/apps/karmolab/img/widgets/quest-log/240714-071225.jpg" alt="">
                <div class="coord"><span class="k">RA</span> ${rah}<sup>h</sup> ${ram}<sup>m</sup><br><span class="k">DEC</span> +${decd}° ${decm}'<br><span class="k">MAG</span> ${cst.mag}</div>
                <div class="tag">★ MAIN PROJECT</div>
                <div class="overlay-title">
                  <div class="cst">✓ ${esc(cst.name.toUpperCase())} · ${esc(cst.sub)}</div>
                  <div class="name">${esc(wm.title)}</div>
                </div>
              </div>
              <div class="f-meta">
                <div class="eye">№ 00 · PRIMARY TARGET</div>
                <h2 class="serif">${esc(wm.title)}<em>${esc(wm.subtitle || '')}</em></h2>
                <div class="dek">${wm.children.length}개 영역. 채광, 전투, 농사, 마을 경영, 인형 부리기, 수집, 낚시, 스토리 — 기초 시스템들이 하나씩 자리를 잡으면 게임의 재미가 드러난다.</div>
                <div class="bar-line"><div class="fill" style="width:${wmProg}%"></div></div>
                <div class="mini-stats">
                  <div class="s accent"><div class="k">FIRE</div><div class="v">${wmFire}</div></div>
                  <div class="s"><div class="k">SEALED</div><div class="v">${wmSealedCount}</div></div>
                  <div class="s"><div class="k">COVERAGE</div><div class="v">${wmProg}<span style="font-family:'KarmoMono',monospace;font-weight:400;font-size:13.5px;color:var(--ink-2);margin-left:2px;">%</span></div></div>
                </div>
              </div>
            </div>
            <div class="f-right">
              <div class="log-head"><span>TASK LOG</span><span><b>${wmAll.length}</b> TASKS${wmAll.length !== wmAllRaw.length ? ` <small style="color:var(--ink-3);font-weight:400;">${t('quest-log.filteredOf', { n: wmAllRaw.length })}</small>` : ''}</span></div>
              ${wmAll.length ? groupedObsRows(wmAll, 'wm') : t('quest-log.t37')}
            </div>
          </div>
        `;
        if (prevFRightScroll) {
          const newFRight = fw.querySelector('.f-right') as HTMLElement | null;
          if (newFRight) newFRight.scrollTop = prevFRightScroll;
        }
      } else {
        fw.innerHTML = '';
      }

      const subEl = byKey('sub-columns');
      if (!subEl) return;
      // KL-045 — sub-grid: 도메인 토글 = `others` 가 이미 isDomainOn 필터됨 (위). 행은 상태 필터 + 정렬 적용.
      subEl.innerHTML = others.map((p, subIdx: number) => {
        const idx = subIdx + 1;
        const allRaw = allLeaves(p);
        const hierAll = flattenWithHier(p).filter((h) => isStatusOn(h.leaf.memoStatus));
        const all = sortHierItems(hierAll);
        const totalP = allRaw.length ? Math.round(allRaw.reduce((s, l) => s + progressOf(l), 0) / allRaw.length * 100) : 0;
        const fireCount = allRaw.filter(l => l.status === 'fire').length;
        const cst = CONST_BY_PROJECT[p.id] || { name: p.title, sub: p.subtitle || '', mag: '—' };

        return `
          <div class="col" data-proj="${p.id}">
            <div class="col-head">
              <h3 class="serif"><span class="idx">№ ${String(idx + 1).padStart(2, '0')}</span>${esc(p.title)}</h3>
              <div class="sub">${esc(cst.name)} · <span style="font-style:italic;text-transform:none;letter-spacing:0.05em;">${esc(cst.sub)}</span></div>
              <div class="bar-line"><div class="fill" style="width:${totalP}%"></div></div>
              <div class="bar-meta">
                <b>${all.length} TASKS${all.length !== allRaw.length ? ` <small style="color:var(--ink-3);font-weight:400;">${t('quest-log.outOf', { n: allRaw.length })}</small>` : ''}</b>
                <span>${fireCount} FIRE · ${totalP}% COVERAGE · MAG ${cst.mag}</span>
              </div>
            </div>
            ${skyHTML(idx, true)}
            <div class="log">
              ${all.length ? groupedObsRows(all, p.id) : t('quest-log.t38')}
            </div>
          </div>
        `;
      }).join('');

      $$('.obs').forEach(el => {
        el.addEventListener('click', () => openDrawer(el.dataset.id!));
      });

      $$('.obs-expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const group = (btn as HTMLElement).closest('.obs-group--has-subs') as HTMLElement | null;
          if (!group) return;
          const parentId = group.dataset.parentId || '';
          const isExp = group.classList.toggle('obs-group--expanded');
          (btn as HTMLElement).textContent = isExp ? '▾' : '▸';
          if (isExp) {
            if (!state.prefs.expandedParents.includes(parentId)) state.prefs.expandedParents.push(parentId);
          } else {
            state.prefs.expandedParents = state.prefs.expandedParents.filter(id => id !== parentId);
          }
          savePrefs();
        });
      });

      const ps = Number(root.dataset.pendingScroll || 0);
      if (ps > 0) { root.scrollTop = ps; delete root.dataset.pendingScroll; }
    }

    function renderTrophyView() {
      const fw = byKey('featured-wrap');
      const subEl = byKey('sub-columns');
      if (!fw || !subEl) return;
      fw.innerHTML = '';
      if (DATA.sealed.length === 0) {
        subEl.innerHTML = '<div class="col" style="grid-column:1 / -1;"><div class="log" style="padding:40px;"><div class="empty">no sealed entries yet</div></div></div>';
        return;
      }
      subEl.innerHTML = `
        <div class="col" style="grid-column: 1 / -1;">
          <div class="col-head">
            <h3 class="serif"><span class="idx">◆</span>TROPHY ROOM</h3>
            <div class="sub">SEALED · <span style="font-style:italic;text-transform:none;letter-spacing:0.05em;">${esc(t('quest-log.t19'))}</span></div>
            <div class="bar-line"><div class="fill" style="width:100%;background:var(--accent);"></div></div>
            <div class="bar-meta"><b>${DATA.sealed.length} ENTRIES</b><span>ARCHIVED</span></div>
          </div>
          <div class="log" style="padding: 8px 16px 20px;">
            ${DATA.sealed.map((t, i: number) => `
              <div class="obs" data-status="done">
                <div class="time"><b>№ ${String(i + 1).padStart(3, '0')}</b>SEALED</div>
                <div class="body">
                  <div class="lane"><span class="sw"></span>${esc(t.project.toUpperCase())}</div>
                  <div class="t serif">${esc(t.title)}</div>
                  ${t.note ? `<div class="n">${esc(t.note)}</div>` : ''}
                  ${t.sealedNote ? `<div class="n" style="font-style:italic;color:var(--accent);margin-top:6px;">"${esc(t.sealedNote)}"</div>` : ''}
                </div>
                <div class="mag">SEALED</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const drawer = byKey('drawer')!;
    const backdrop = byKey('backdrop')!;

    function openDrawer(id: string) {
      const f = findNode(id);
      if (!f) return;
      const node = f.node;
      const project = f.parents[0];
      const area = f.parents[1];
      state.selectedId = id;
      $$('.obs').forEach(el => el.classList.toggle('selected', el.dataset.id === id));

      const progress = Math.round(progressOf(node) * 100);
      const status = node.status || 'seed';
      const statusColor = status === 'fire' ? 'var(--accent)' :
                          status === 'sleep' ? 'var(--mag-learn)' :
                          status === 'sealed' ? 'var(--accent)' : 'var(--ink-3)';

      const crumb = byKey('crumb');
      if (crumb) crumb.innerHTML = `KMLB-QST / <b>${esc(node.id.toUpperCase())}</b>`;

      const body = byKey('drawer-body');
      if (!body) return;
      body.innerHTML = `
        <div class="lane-pill"><span class="sw" style="background: var(--accent);"></span>${esc(project ? project.title : '')}${area ? ' · ' + esc(area.title) : ''}</div>
        <h2 class="serif">${esc(node.title)} <em>${status.toUpperCase()}</em></h2>
        ${node.note ? `<p class="lede">${esc(node.note)}</p>` : ''}

        <div class="status-switcher" style="display:flex; gap:1px; margin-top:20px; background:var(--line-2); border:1px solid var(--line-2); width:fit-content;">
          ${['fire', 'seed', 'sleep'].map(s => `
            <button class="chip status-toggle ${status === s ? 'on' : ''}" data-set-status="${s}" style="border:none; padding:7px 14px;">
              ${s === 'fire' ? '◉ FIRE' : s === 'seed' ? '○ SEED' : '─ SLEEP'}
            </button>
          `).join('')}
        </div>

        <div class="priority-switcher" style="display:flex; gap:1px; margin-top:8px; background:var(--line-2); border:1px solid var(--line-2); width:fit-content;">
          ${['low', 'normal', 'high'].map(p => `
            <button class="chip priority-toggle ${node.memoPriority === p ? 'on' : ''}" data-set-priority="${p}" style="border:none; padding:7px 14px; font-size:12px;">
              ${p === 'high' ? '! HIGH' : p === 'low' ? '· LOW' : '○ NORMAL'}
            </button>
          `).join('')}
        </div>

        <div class="progress-wrap">
          <div class="lbl"><span>PROGRESS · ${starsHTML(progress / 100, false)}</span><b>${progress}%</b></div>
          <div class="bar"><div class="f" style="width:${progress}%; background:${statusColor};"></div></div>
          <div class="ticks"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        </div>

        ${isLeaf(node) ? `
          <div style="margin-top:24px; padding-top:18px; border-top:1px solid var(--line-2);">
            <div style="font-family:'KarmoMono',monospace;font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-3);margin-bottom:10px;">
              CHECKLIST · ${node.checks.filter((c) => c.done).length} / ${node.checks.length}
            </div>
            <div class="checklist">
              ${node.checks.map((c, i: number) => `
                <label class="check-row ${c.done ? 'done' : ''}" data-check-idx="${i}">
                  <input type="checkbox" ${c.done ? 'checked' : ''} style="display:none;">
                  <span class="check-box"></span>
                  <span class="check-label">${esc(c.t)}</span>
                  <button class="check-edit" data-check-edit="${i}" title="${esc(t('quest-log.t01'))}">✎</button>
                  <button class="check-delete" data-check-del="${i}" title="${esc(t('quest-log.t02'))}">×</button>
                </label>
              `).join('')}
            </div>
            <div class="add-check" style="display:flex; gap:1px; margin-top:12px; background:var(--line-2); border:1px solid var(--line-2);">
              <input type="text" placeholder="${esc(t('quest-log.t03'))}" />
              <button>ADD</button>
            </div>
          </div>
        ` : `
          <div style="margin-top:24px; padding-top:18px; border-top:1px solid var(--line-2);">
            <div style="font-family:'KarmoMono',monospace;font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:var(--ink-3);margin-bottom:10px;">
              SUB-AREAS · ${node.children!.length}
            </div>
            <div class="children-list">
              ${node.children!.map((c) => {
                const cp = Math.round(progressOf(c) * 100);
                const cs = c.status || 'seed';
                return `
                  <div class="child-row" data-child="${c.id}">
                    <span class="cr-status ${cs}">${cs.toUpperCase()}</span>
                    <span class="cr-title">${esc(c.title)}</span>
                    <span class="cr-right">${starsHTML(cp / 100)} <span style="font-family:'KarmoMono',monospace;font-size:13px;color:var(--ink-3);margin-left:6px;">${cp}%</span></span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `}

        ${isLeaf(node) && progress >= 100 ? `
          <button class="seal-btn" data-seal="${node.id}">◆ SEAL TO TROPHY</button>
        ` : ''}
      `;

      $$('[data-check-idx]').forEach(el => {
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          // 삭제·편집 버튼 클릭은 별도 핸들러에서 처리 — 토글 안 함
          if ((e.target as HTMLElement).matches('[data-check-del]')) return;
          if ((e.target as HTMLElement).matches('[data-check-edit]')) return;

          const i = Number(el.dataset.checkIdx);
          const check = node.checks![i];  // 핸들러는 isLeaf 렌더 시에만 부착 — checks 보장

          // 메모 정본 write-back (TASK-KL-017). filePath/lineNumber 가 있는 경우만.
          // 없으면 (옛 localStorage 데이터) 시각만 토글.
          // TASK-KL-062 slice3c: 로컬 invoke 캡처 폐기 → seam invoke.
          if (node.filePath && check.lineNumber && isDesktop()) {
            try {
              const newDone = await invoke('toggle_quest_check', {
                filePath: node.filePath,
                lineNumber: check.lineNumber,
                expectedText: check.t,
              }) as boolean;
              check.done = newDone;
            } catch (err) {
              console.error(t('quest-log.t39'), err);
              alert(t('quest-log.failWrite', { err: String(err) }));
              return;
            }
          } else {
            check.done = !check.done;
          }

          if (check.done) Mdd.linePreset('success', { msg: t('quest-log.t40') });
          save();
          openDrawer(id);
          renderColumns();
          renderStats();
        });
      });

      $$('[data-check-del]').forEach(el => {
        el.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const i = Number(el.dataset.checkDel);
          const check = node.checks![i];  // 핸들러는 isLeaf 렌더 시에만 부착 — checks 보장
          if (!confirm(t('quest-log.confirmDelete', { text: check.t }))) return;

          // TASK-KL-062 slice3c: 로컬 invoke 캡처 폐기 → seam invoke.
          if (node.filePath && check.lineNumber && isDesktop()) {
            try {
              await invoke('delete_quest_check', {
                filePath: node.filePath,
                lineNumber: check.lineNumber,
                expectedText: check.t,
              });
            } catch (err) {
              console.error(t('quest-log.t41'), err);
              alert(t('quest-log.failDelete', { err: String(err) }));
              return;
            }
          }

          // 파일에서 라인 1개 사라지면 그 뒤 체크박스들의 절대 라인 번호가 1씩 당겨짐.
          // in-memory 도 동기화 안 하면 다음 토글에서 text mismatch 로 실패.
          for (let j = i + 1; j < node.checks!.length; j++) {
            const ln = node.checks![j].lineNumber;
            if (typeof ln === 'number') {
              node.checks![j].lineNumber = ln - 1;
            }
          }
          node.checks!.splice(i, 1);
          save();
          openDrawer(id);
          renderColumns();
          renderStats();
        });
      });

      $$('[data-check-edit]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const i = Number(el.dataset.checkEdit);
          const check = node.checks![i];  // 핸들러는 isLeaf 렌더 시에만 부착 — checks 보장
          const labelEl = el.previousElementSibling as HTMLElement | null;
          if (!labelEl || !labelEl.classList.contains('check-label')) return;

          // input 으로 swap. 기존 텍스트 selected.
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'check-edit-input';
          input.value = check.t;
          labelEl.replaceWith(input);
          input.focus();
          input.select();

          const restoreLabel = (newText: string) => {
            const span = document.createElement('span');
            span.className = 'check-label';
            span.textContent = newText;
            input.replaceWith(span);
          };

          let committed = false;
          const commit = async () => {
            if (committed) return;
            committed = true;
            const newText = input.value.trim();
            if (!newText || newText === check.t) {
              // 변경 없음 — 원복만
              restoreLabel(check.t);
              return;
            }

            // TASK-KL-062 slice3c: 로컬 invoke 캡처 폐기 → seam invoke.
            if (node.filePath && check.lineNumber && isDesktop()) {
              try {
                await invoke('rename_quest_check', {
                  filePath: node.filePath,
                  lineNumber: check.lineNumber,
                  expectedText: check.t,
                  newText,
                });
              } catch (err) {
                console.error(t('quest-log.t42'), err);
                alert(t('quest-log.failEdit', { err: String(err) }));
                restoreLabel(check.t);
                return;
              }
            }

            check.t = newText;
            restoreLabel(newText);
            save();
            openDrawer(id);
            renderColumns();
            renderStats();
          };

          const cancel = () => {
            if (committed) return;
            committed = true;
            restoreLabel(check.t);
          };

          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          });
          input.addEventListener('blur', () => { void commit(); });
        });
      });

      $$('[data-set-status]').forEach(el => {
        el.addEventListener('click', async () => {
          const s = el.dataset.setStatus!;
          const newWidgetStatus = node.status === s ? 'seed' : s;

          // memo 정본 status write-back (TASK-KL-018). filePath/memoStatus 가 있는 경우만.
          // TASK-KL-062 slice3c: 로컬 invoke 캡처 폐기 → seam invoke.
          if (node.filePath && node.memoStatus && isDesktop()) {
            const newMemoStatus = mapWidgetStatusToMemo(newWidgetStatus);
            try {
              const written = await invoke('set_quest_status', {
                filePath: node.filePath,
                newStatus: newMemoStatus,
                expectedStatus: node.memoStatus,
              }) as string;
              node.memoStatus = written;
              node.status = mapMemoStatus(written);
            } catch (err) {
              console.error(t('quest-log.t43'), err);
              alert(t('quest-log.failStatus', { err: String(err) }));
              return;
            }
          } else {
            node.status = newWidgetStatus;
          }

          if (node.status === 'fire') Mdd.linePreset('tool_run', { msg: t('quest-log.t44') });
          save();
          openDrawer(id);
          renderColumns();
          renderStats();
        });
      });

      $$('[data-set-priority]').forEach(el => {
        el.addEventListener('click', async () => {
          const newPriority = el.dataset.setPriority!;
          // 같은 priority 클릭은 무동작 (status 와 달리 토글 의미 없음)
          if (node.memoPriority === newPriority) return;

          // TASK-KL-062 slice3c: 로컬 invoke 캡처 폐기 → seam invoke.
          if (node.filePath && node.memoPriority && isDesktop()) {
            try {
              const written = await invoke('set_quest_priority', {
                filePath: node.filePath,
                newPriority,
                expectedPriority: node.memoPriority,
              }) as string;
              node.memoPriority = written;
            } catch (err) {
              console.error(t('quest-log.t45'), err);
              alert(`우선순위 쓰기 실패: ${err}\n\n파일이 외부에서 변경됐을 수 있습니다. 위젯을 재실행해 주세요.`);
              return;
            }
          } else {
            node.memoPriority = newPriority;
          }

          save();
          openDrawer(id);
          renderColumns();
          renderStats();
        });
      });

      const input = root.querySelector('.add-check input') as HTMLInputElement | null;
      const btn = root.querySelector('.add-check button') as HTMLButtonElement | null;
      if (input && btn) {
        const add = async () => {
          const text = input.value.trim();
          if (!text) return;

          // memo 정본 write-back (TASK-KL-019). filePath 가 있는 경우만.
          // TASK-KL-062 slice3c: 로컬 invoke 캡처 폐기 → seam invoke.
          if (node.filePath && isDesktop()) {
            try {
              const newLineNumber = await invoke('add_quest_check', {
                filePath: node.filePath,
                text: text,
              }) as number;
              node.checks!.push({ t: text, done: false, lineNumber: newLineNumber });
            } catch (err) {
              console.error(t('quest-log.t46'), err);
              alert(t('quest-log.failAdd', { err: String(err) }));
              return;
            }
          } else {
            node.checks!.push({ t: text, done: false });
          }

          input.value = '';
          save();
          openDrawer(id);
          renderColumns();
          renderStats();
        };
        btn.addEventListener('click', add);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
      }

      $$('[data-child]').forEach(el => {
        el.addEventListener('click', () => openDrawer(el.dataset.child!));
      });

      const sealBtn = root.querySelector('[data-seal]') as HTMLButtonElement | null;
      if (sealBtn) {
        sealBtn.addEventListener('click', () => {
          DATA.sealed.unshift({
            id: 's-' + Date.now(),
            title: node.title,
            project: project ? project.title : '',
            note: node.note || '',
            sealedNote: '',
          });
          node.status = 'sealed';
          Mdd.linePreset('achievement', { msg: t('quest-log.t47') });
          save();
          closeDrawer();
          state.view = 'trophy';
          renderStats();
          renderColumns();
        });
      }

      drawer.classList.add('open');
      backdrop.classList.add('open');
    }

    function closeDrawer() {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      state.selectedId = null;
      $$('.obs.selected').forEach(el => el.classList.remove('selected'));
    }
    const closeBtn = byKey('drawer-close');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', closeDrawer);

    // Esc 닫기 — 위젯이 DOM에 살아있는 동안만 (탭 전환·재빌드 시 자연 정리)
    function onEsc(e: KeyboardEvent) {
      if (!root.isConnected) {
        window.removeEventListener('keydown', onEsc);
        return;
      }
      if (e.key === 'Escape') closeDrawer();
    }
    window.addEventListener('keydown', onEsc);

    renderStats();
    renderControls();
    renderColumns();
  }
})();
