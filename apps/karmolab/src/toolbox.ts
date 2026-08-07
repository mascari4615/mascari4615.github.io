/**
 * KarmoLab — 도구 레지스트리 기반 모듈 시스템
 *
 * ┌─ 아키텍처 ─────────────────────────────────────────────────┐
 * │                                                            │
 * │  index.html ─→ toolbox.js (코어)                           │
 * │                  ├─ 랜딩 페이지 (히어로 + 즐겨찾기 CTA)       │
 * │                  ├─ 상단 메뉴 (카테고리별 드롭다운)          │
 * │                  ├─ 검색, breadcrumb, 테마, 사용량 추적      │
 * │                  └─ 도전과제/뱃지/진행도 시스템              │
 * │               ─→ mdd.js (마스코트)                          │
 * │                  ├─ 이미지 마스코트 (12 감정)               │
 * │                  ├─ 말풍선, 바운스 인터랙션                  │
 * │                  └─ 호감도/스토리 진행 시스템                │
 * │               ─→ gemini.js (AI API)                        │
 * │               ─→ widgets/*.js (개별 도구)                   │
 * │                                                            │
 * │  카테고리:  tool (도구)  /  play (놀이)  /  lab (실험실·개발중)  /  desktop (데스크톱 앱 전용)  /  null (기타)  │
 * └────────────────────────────────────────────────────────────┘
 *
 * 새 도구 추가 방법:
 * 1. widgets/ 폴더에 새 JS 파일 생성
 * 2. widgets-manifest.js(boot) + widgets-lazy-meta.js(지연 메타 단일 출처)
 * 3. Toolbox.register({ id, title, icon, category, desc, hidden?, tabs }) 호출
 *    - icon: SVG path 문자열 (viewBox 0 0 24 24 기준)
 *    - category: 'tool' | 'play' | 'lab' | 'desktop' | null  ('desktop'은 Tauri 앱에서만 메뉴·페이지에 표시)
 *    - desc: 한 줄 설명 (검색·즐겨찾기용)
 *    - hidden: true면 메뉴에 비표시 (user 등)
 *    - layout: 'form'(기본·900px 카드) | 'wide'(1200px, 표·2단 편집기) | 'full'(화면 점유)
 *      · **'full' 은 특수한 경우만** — 페이지 스크롤을 죽이므로(main-content overflow:hidden)
 *        아래로 이어지는 내용이 있으면 잘린다. 챗봇·터미널처럼 화면을 통째로 써야 하는 위젯 전용.
 *        도구 상세 페이지(/karmolab/t/)가 있는 위젯은 gen-tool-pages.mjs 가 'full' 을 막는다.
 *    - tabs: [{ id, label, build(container) }]
 *    - tabLayout: (선택) `'sidebar'` — 탭이 많을 때 왼쪽 세로 목록 + 오른쪽 패널 (문서 위젯 등)
 *    - lazyTabs: (선택) true — 첫 탭 외에는 처음 열릴 때 그린다. 여러 도구를 탭으로 묶은
 *      위젯에 쓴다 (전부 미리 그리면 안 본 화면·타이머·저장소 접근이 헛돈다)
 *
 * 마스코트 연동:
 *   Mdd.setMood('happy')   — 감정 변경
 *   Mdd.say('메시지')       — 말풍선 표시
 *   Mdd.linePreset('success', { msg?, mood?, duration? }) — 티메토 대사 프리셋 (`mdd.js`의 LINE_PRESETS)
 *   Mdd.bounce()           — 바운스 애니메이션
 *   Mdd.addAffection(n)    — 호감도 증가 (스토리 해금 트리거)
 */
// @ts-nocheck — core shell; narrow types incrementally
const Toolbox = (() => {
    const tools = [];

    /* ===== 카테고리 & 메타데이터 ===== */

    // 'desktop' 카테고리 폐지 (사용자 발화 2026-05-23, TASK-YB-039) — 위젯은 일반
    // 카테고리(tool/lab/play) 로 분류 + `desktopOnly: true` 플래그로 브라우저 hide.
    const CATEGORIES = [
        { id: 'tool', label: '도구', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94L6.73 20.15a2.1 2.1 0 0 1-3-3l6.72-6.72a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
        // TASK-KL-088: 자료 = 입력·출력이 아니라 「찾아보고 눌러 복사」 하는 표 (특수문자·코드표 등).
        { id: 'ref', label: '자료', icon: '<path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7h7M8 11h7M8 15h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' },
        { id: 'play', label: '놀이', icon: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4m-2-2v4"/><circle cx="15" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>' },
        { id: 'lab', label: '실험실 · 개발중', icon: '<path d="M9 3h6v5l4 4v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7l4-4V3z"/><path d="M9 3h6"/>' },
    ];

    /** 갈래 목록 (id·label·icon) — 화면 여러 곳이 같은 이름을 써야 하므로 여기서만 정의한다.
     *  손으로 라벨을 한 벌 더 적으면 메뉴와 즐겨찾기가 서로 다른 이름으로 갈라진다. */
    function getCategories() {
        return CATEGORIES.map((c) => ({ ...c }));
    }

    /** 위젯별 메타데이터 (category, desc, hidden, desktopOnly 등) — 각 위젯 register에서 정의 */
    function getToolMeta(id) {
        const t = tools.find(x => x.id === id);
        return t ? { category: t.category, desc: t.desc, hidden: t.hidden, desktopOnly: !!t.desktopOnly } : null;
    }
    const LAST_PAGE_KEY = 'toolbox_last_page';

    /* ── 내가 고른 도구 (TASK-KL-129) ────────────────────────────
     * 별 하나가 네 곳을 같이 바꾼다: 도구 목록 · 찾는 창 · 옆줄 · 도구 화면.
     * 저장하는 자리는 하나뿐이라 어디서 꽂든 같은 것을 가리킨다. */
    const PINNED_KEY = 'toolbox_pinned_tools';
    /** 옆줄의 「내 것」 칸을 다시 그리는 손잡이 — 옆줄이 만들어질 때 채워진다. */
    let rebuildMineGroup = null;

    function getPins() {
        try {
            const raw = localStorage.getItem(PINNED_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
        } catch (_) {
            return [];
        }
    }

    function isPinned(id) {
        return getPins().indexOf(id) >= 0;
    }

    /** 꽂거나 뺀다. 화면에 있는 별·옆줄·찾는 창을 그 자리에서 맞춘다. */
    function togglePin(id) {
        const next = getPins().filter(x => x !== id);
        const on = next.length === getPins().length;   // 없던 것이면 켜는 것
        if (on) next.push(id);
        try { localStorage.setItem(PINNED_KEY, JSON.stringify(next)); } catch (_) { /* 저장이 막혀도 화면은 돈다 */ }
        paintPinStars();
        rebuildMineGroup?.();
        window.KarmoPalette?.refresh();
        return on;
    }

    function paintPinStars() {
        document.querySelectorAll('.tool-pin-star').forEach(btn => {
            const on = isPinned(btn.dataset.tool);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.title = on ? '내 것에서 빼기' : '내 것으로 두기';
            btn.setAttribute('aria-label', btn.title);
        });
    }

    /* ── 결과를 옆 도구로 넘긴다 (TASK-KL-133) ──────────────────
     *
     * 도구가 127개인데 서로를 몰랐다. PDF 를 합친 뒤 압축하려면 받은 파일을 찾아 다른 도구를
     * 열고 다시 집어넣어야 했다 — 사람은 한 가지 일을 하는데 도구가 세 번 끊었다.
     * 이 앱의 도구는 전부 브라우저 안에서 도니까, 방금 만든 것은 이미 여기 있다. 그걸 그냥 넘긴다.
     *
     * 놓는 쪽은 `offer`, 받는 쪽은 열릴 때 `take` 로 한 번만 집어 간다(두 번 집히면 같은 파일이
     * 두 번 들어온다). 어느 도구가 받을 수 있는지는 도구가 등록할 때 밝힌 형식(`accepts`)에서
     * 고른다 — 짝을 손으로 적어 두면 도구가 늘 때마다 그 표가 낡는다.
     */
    let handoffItem = null;

    /* 넘길 것은 **화면을 옮겨도 살아남아야 한다** (TASK-KL-133).
     *
     * 도구 상세 페이지(`/karmolab/t/<id>/`)에서 「이어서」를 누르면 그건 다른 주소로 가는
     * 진짜 이동이라, 기억에만 들고 있으면 그 순간 파일이 사라진다 — 눌렀더니 빈손으로
     * 도착했다(실제로 그랬다). 파일을 잃는 단추는 없는 단추보다 나쁘다.
     * 그래서 브라우저 저장소(IndexedDB)에 한 칸 놓아둔다. 파일 자체를 그대로 담을 수 있는
     * 유일한 자리다(localStorage 는 글자만 담는다). 집어 가면 지운다.
     */
    const HANDOFF_DB = 'karmolab-handoff';
    const HANDOFF_KEY = 'current';

    function handoffStore(mode) {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') return reject(new Error('저장소 없음'));
            const req = indexedDB.open(HANDOFF_DB, 1);
            req.onupgradeneeded = () => req.result.createObjectStore('items');
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                const db = req.result;
                resolve(db.transaction('items', mode).objectStore('items'));
            };
        });
    }

    function handoffSave(item) {
        return handoffStore('readwrite')
            .then((s) => s.put(item, HANDOFF_KEY))
            .catch(() => { /* 저장소가 막혀 있어도 같은 화면 안에서는 그대로 돈다 */ });
    }

    function handoffLoad() {
        return handoffStore('readonly')
            .then((s) => new Promise((resolve) => {
                const r = s.get(HANDOFF_KEY);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror = () => resolve(null);
            }))
            .catch(() => null);
    }

    function handoffClear() {
        return handoffStore('readwrite')
            .then((s) => s.delete(HANDOFF_KEY))
            .catch(() => {});
    }

    /** 방금 만든 것을 놓아둔다. `{ blob, name, from }` */
    function offerResult(item) {
        if (!item || !item.blob) return;
        handoffItem = { blob: item.blob, name: item.name || '결과', from: item.from || null, at: Date.now() };
        void handoffSave(handoffItem);
    }

    /** 놓인 것을 집어 간다 — 한 번만. 없으면 null. (같은 화면 안에서 쓰는 빠른 길) */
    function takeResult() {
        const it = handoffItem;
        handoffItem = null;
        if (it) void handoffClear();
        return it;
    }

    /**
     * 놓인 것이 **이 도구가 받을 수 있는 것이면** 건네준다 — 한 번만.
     *
     * 기억에 있으면 그 자리에서, 없으면 저장소에서 찾아 준다(화면을 옮겨 온 경우).
     * 도구는 언제 오든 같은 방식으로 받는다: `Toolbox.onHandoff(['application/pdf'], (file) => …)`.
     */
    function onHandoff(kinds, cb) {
        const ok = (type) => (kinds || []).some((k) => (k.endsWith('/*') ? String(type).startsWith(k.slice(0, -1)) : type === k));
        const hand = (it) => {
            if (!it || !it.blob || !ok(it.blob.type)) return false;
            cb(new File([it.blob], it.name || '넘겨받은', { type: it.blob.type }));
            return true;
        };
        const mem = handoffItem;
        if (mem && ok(mem.blob.type)) {
            handoffItem = null;
            void handoffClear();
            hand(mem);
            return;
        }
        void handoffLoad().then((it) => {
            /* 오래된 것은 안 집는다 — 어제 만든 파일이 오늘 연 도구에 갑자기 들어오면
             * 그건 이어 붙이기가 아니라 유령이다. 화면을 옮기는 데 드는 시간만 허용한다. */
            if (!it || Date.now() - (it.at || 0) > 5 * 60 * 1000) return;
            if (hand(it)) void handoffClear();
        });
    }

    function peekResult() {
        return handoffItem;
    }

    /** 이 형식을 받을 수 있다고 밝힌 도구들 (자기 자신은 뺀다 — 넘길 이유가 없다). */
    function toolsAccepting(type, exceptId) {
        const t = String(type || '');
        return tools.filter(x =>
            x.id !== exceptId &&
            Array.isArray(x.accepts) &&
            x.accepts.some(a => a === t || (a.endsWith('/*') && t.startsWith(a.slice(0, -1)))) &&
            (!isDesktopOnlyTool(x) || isDesktopApp())
        );
    }

    /**
     * 결과 아래 「이어서」 한 줄. 갈 곳이 없으면 아무것도 안 그린다 —
     * 눌러도 아무 일 없는 줄을 두지 않는다.
     */
    function offerNext(anchor, item) {
        if (!anchor || !anchor.parentElement) return;
        /* 줄은 기준 요소 **안**이 아니라 **바로 밑**에 놓는다 (TASK-KL-133).
         * 안에 넣었더니 도구가 상태 글을 갈아 끼우는 순간(textContent) 같이 지워졌다 —
         * 만들어 놓고 곧바로 사라져서, 화면에는 한 번도 안 보였다. */
        /* 놓아둘 수 있는 결과는 **하나뿐**이다. 그러니 화면에 남은 옛 줄도 전부 걷는다 —
         * 안 걷으면 앞 도구의 탭에 낡은 줄이 남아, 눌렀을 때 없는 것을 넘기려 든다. */
        document.querySelectorAll('.tool-next-row').forEach(n => n.remove());
        let targets = toolsAccepting(item && item.blob && item.blob.type, item && item.from);
        if (!item || !targets.length) return;
        /* 갈 곳이 여덟 군데까지 나오는데 한 줄에는 다섯이 들어간다. 무엇을 앞에 둘지는
         * **이 사람이 쓰는 것**으로 정한다 — 내가 꽂아 둔 것, 그다음 최근에 연 것.
         * 등록 순서대로 자르면 늘 쓰는 도구가 잘려 나가고 안 쓰는 것이 남는다. */
        const mine = getPins();
        const recent = (window.KarmoPalette?.getRecent?.() || []);
        const rank = (t) => {
            const i = mine.indexOf(t.id);
            if (i >= 0) return i;
            const r = recent.indexOf(t.id);
            return r >= 0 ? 100 + r : 1000;
        };
        targets = [...targets].sort((a, b) => rank(a) - rank(b));
        offerResult(item);
        const row = document.createElement('div');
        row.className = 'tool-next-row';
        const label = document.createElement('span');
        label.className = 'tool-next-label';
        label.textContent = '이어서';
        row.appendChild(label);
        // 다섯이 한 줄에 들어간다. 더 늘면 줄이 두 겹이 되어 결과보다 커진다.
        targets.slice(0, 5).forEach(t => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tool-next-btn';
            b.textContent = t.title || t.id;
            b.onclick = () => switchPage(t.id);
            row.appendChild(b);
        });
        anchor.insertAdjacentElement('afterend', row);
    }

    /** 도구 화면의 별 — 쓰던 자리에서 바로 꽂는다 (목록까지 안 가도 되게). */
    function mountPinStar(host, toolId) {
        if (!host || host.querySelector('.tool-pin-star')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tool-pin-star';
        btn.dataset.tool = toolId;
        btn.textContent = '★';
        btn.onclick = () => togglePin(toolId);
        host.appendChild(btn);
        paintPinStars();
    }
    /** 현재 열린 도구 id — 복사·사용 계측이 어느 도구인지 알기 위해 (TASK-KL-088) */
    let currentPageId = 'home';
    const NAV_LAYOUT_KEY = 'toolbox_nav_layout';
    const SIDEBAR_GROUP_KEY = 'toolbox_sidebar_groups';

    function getNavLayout() {
        const v = localStorage.getItem(NAV_LAYOUT_KEY);
        return (v === 'sidebar' || v === 'header') ? v : 'header';
    }

    function setNavLayout(layout) {
        document.documentElement.setAttribute('data-nav', layout);
        try { localStorage.setItem(NAV_LAYOUT_KEY, layout); } catch (_) {}
    }

    function getSidebarGroupState() {
        try {
            const raw = localStorage.getItem(SIDEBAR_GROUP_KEY);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return { tool: true, play: false, lab: false, misc: true };
    }

    function setSidebarGroupState(state) {
        try { localStorage.setItem(SIDEBAR_GROUP_KEY, JSON.stringify(state)); } catch (_) {}
    }

    let megaMenuCloseTimer = null;

    function clearMegaMenuTimer() {
        if (megaMenuCloseTimer) {
            clearTimeout(megaMenuCloseTimer);
            megaMenuCloseTimer = null;
        }
    }

    function scheduleMegaMenuClose() {
        clearMegaMenuTimer();
        megaMenuCloseTimer = setTimeout(() => {
            megaMenuCloseTimer = null;
            closeAllHeaderNav();
        }, 220);
    }

    function closeAllHeaderNav() {
        clearMegaMenuTimer();
        document.querySelectorAll('.header-nav-group.is-open').forEach((wrap) => {
            wrap.classList.remove('is-open');
            const tr = wrap.querySelector('.header-nav-trigger');
            if (tr) tr.setAttribute('aria-expanded', 'false');
            const p = wrap.querySelector('.header-nav-panel');
            if (p) p.hidden = true;
        });
    }

    function closeAllHeaderNavExcept(except) {
        document.querySelectorAll('.header-nav-group.is-open').forEach((w) => {
            if (w === except) return;
            w.classList.remove('is-open');
            const tr = w.querySelector('.header-nav-trigger');
            if (tr) tr.setAttribute('aria-expanded', 'false');
            const p = w.querySelector('.header-nav-panel');
            if (p) p.hidden = true;
        });
    }

    /* ===== Public API ===== */

    const lazyLoadPromises = new Map();

    /* ── 위젯이 걸어 둔 것을 거두는 자리 (TASK-KL-100) ──
     * 도구를 다시 그릴 때 DOM 리스너는 노드가 갈리며 같이 죽지만 **타이머는 안 죽는다**.
     * 거두지 않으면 다시 그릴 때마다 쌓여서, 나중엔 같은 일을 여러 번 하는 화면이 된다.
     * 위젯은 build 안에서 `Toolbox.onDispose(fn)` 로 자기 뒷정리를 맡긴다. */
    const disposers = new Map();     // toolId → fn[]
    let buildingTool = null;         // 지금 build 중인 도구 (onDispose 가 누구 것인지 알려면 필요)

    function onDispose(fn) {
        if (typeof fn !== 'function' || !buildingTool) return;
        const list = disposers.get(buildingTool) || [];
        list.push(fn);
        disposers.set(buildingTool, list);
    }

    /** 위젯 그리기는 **전부 이걸 거친다** — 그래야 onDispose 가 누구 것인지 안다.
     *  한 군데라도 빼먹으면 그 위젯만 뒷정리가 안 되고, 그건 눈에 안 보인다. */
    function runBuild(toolId, fn) {
        const prev = buildingTool;
        buildingTool = toolId;
        try { return fn(); } finally { buildingTool = prev; }
    }

    function disposeTool(id) {
        const list = disposers.get(id);
        if (!list) return;
        disposers.delete(id);
        for (const fn of list) {
            try { fn(); } catch (err) { console.warn('[KarmoLab] 뒷정리 실패 —', id, err); }
        }
    }

    /**
     * 같은 id 로 다시 등록하면 **갈아 끼운다** (TASK-KL-100).
     *
     * 예전에는 이미 있으면 조용히 무시하고 끝냈다. 그래서 위젯 코드를 새로 실행해도 화면은
     * 옛 코드 그대로였고, 고친 것을 보려면 새로고침(= 상태 전부 날림)밖에 없었다.
     * 교체 배선은 이미 있었다 — 지연 등록이 실제 등록으로 바뀔 때 쓰던 그 길이다. 그 길을
     * 재등록에도 열어 주는 것이 이 함수의 전부다.
     */
    function register(config) {
        const idx = tools.findIndex(t => t.id === config.id);
        if (idx < 0) {
            tools.push(config);
            return;
        }
        const wasDeferred = !!tools[idx]._deferred;
        // 옛 것이 걸어 둔 타이머·리스너를 먼저 거둔다. 순서가 뒤면 새 것이 건 것까지 거둔다.
        if (!wasDeferred) disposeTool(config.id);
        tools[idx] = wasDeferred ? { ...config, _deferred: false } : config;
        rebuildToolPageIfInDom(config.id);
    }

    /** 등록된 위젯의 첫 tab.build 를 임의 container 에 inline 호출 (잡동사니 위젯 등 페이지 안 페이지). */
    function renderInline(id, container) {
        const tool = tools.find(t => t.id === id);
        if (!tool || !tool.tabs || tool.tabs.length === 0) return false;
        const tab = tool.tabs[0];
        if (typeof tab.build !== 'function') return false;
        try {
            runBuild(id, () => tab.build(container));
            return true;
        } catch (err) {
            console.warn('[KarmoLab] renderInline fail —', id, err);
            return false;
        }
    }

    /** 레지스트리·초기화용 — 스크립트는 첫 방문 시 loadDeferredWidget에서 로드 */
    function registerDeferred(stub) {
        const { lazyScriptPaths, ...rest } = stub;
        tools.push({
            ...rest,
            _deferred: true,
            lazyScriptPaths: lazyScriptPaths || [],
            tabs: [{
                id: '__lazy',
                label: '…',
                build(container) {
                    container.innerHTML = '<p class="tb-lazy-loading" style="padding:32px;text-align:center;color:var(--text-secondary);">불러오는 중…</p>';
                },
            }],
        });
    }

    /**
     * 뒤늦게 도착한 아이콘·설명을 이미 있는 목록에 얹는다 (TASK-KL-128 ③).
     *
     * 도구 한 장짜리 화면은 처음에 **가벼운 목록**(이름·분류·불러올 곳)만 받는다 — 원본 93KB
     * 중 26KB. 아이콘 그림과 설명은 옆줄·찾기창이 실제로 그려질 때 필요한 것이라, 화면이 다
     * 그려진 뒤에 따라온다. 여기서 그 둘을 제자리에 꽂는다. 이미 그려진 아이콘 자리는 비어
     * 있으므로 DOM 을 다시 그리지 않고 그 자리만 채운다 — 화면이 안 흔들린다.
     */
    function upgradeMeta() {
        const full = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META) || [];
        const byId = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || null;
        for (const m of full) {
            if (!m || !m.id) continue;
            const tool = tools.find(x => x.id === m.id);
            if (tool) {
                if (m.icon) tool.icon = m.icon;
                if (m.desc) tool.desc = m.desc;
            }
            if (byId && byId[m.id]) {
                if (m.icon) byId[m.id].icon = m.icon;
                if (m.desc) byId[m.id].desc = m.desc;
            }
        }
        document.querySelectorAll('.nav-item[data-page]').forEach(function (a) {
            const el = a as HTMLElement;
            const tool = tools.find(x => x.id === el.dataset.page);
            const svg = el.querySelector('.nav-icon');
            if (tool && tool.icon && svg && !svg.innerHTML.trim()) svg.innerHTML = tool.icon;
        });
    }

    function rebuildToolPageIfInDom(pageId) {
        const toolPages = document.getElementById('tool-pages');
        if (!toolPages) return;
        const tool = tools.find(t => t.id === pageId);
        if (!tool || !tool.tabs) return;
        const old = document.getElementById('page-' + pageId);
        if (!old) return;
        // 다시 그리기 **직전**이 뒷정리 자리다. 재등록 말고 다른 길로 다시 그려도 여기를 지난다
        // — 한쪽에만 두면 그 길로 올 때마다 타이머가 쌓인다 (TASK-KL-100).
        disposeTool(pageId);
        const wasActive = old.classList.contains('active');
        const nu = buildToolPage(tool);
        if (wasActive) nu.classList.add('active');
        old.replaceWith(nu);
    }

    function getWidgetScriptBase() {
        const b = typeof window !== 'undefined' && window.KARMOLAB_WIDGET_SCRIPT_BASE;
        if (b) return b;
        try {
            const origin = location.origin || '';
            return origin + '/apps/karmolab/js/widgets/';
        } catch (_) {
            return '/apps/karmolab/js/widgets/';
        }
    }

    function getWorldScriptBase() {
        const b = typeof window !== 'undefined' && window.KARMOLAB_WORLD_SCRIPT_BASE;
        if (b) return b;
        try {
            const origin = location.origin || '';
            return origin + '/apps/karmolab/world/';
        } catch (_) {
            return '/apps/karmolab/world/';
        }
    }

    /** js 루트 (widgets/ 한 단계 위). vendor/root prefix 해석용 (KL-054). */
    function getJsScriptBase() {
        return getWidgetScriptBase().replace(/widgets\/$/, '');
    }

    /**
     * lazyScriptPaths / ensureScript 의 한 경로를 실제 URL 로 해석 (KL-054).
     * prefix 규약 (단일 해석기 — loadDeferredWidget·ensureScript 공용):
     * - `world/<x>`  → world 스크립트 base
     * - `vendor/<x>` → js/vendor/<x>.js  (예: `vendor/marked.min`)
     * - `root/<x>`   → js/<x>.js          (예: `root/gemini`)
     * - 그 외        → js/widgets/<x>.js  (기존 위젯 경로 — 무변경)
     */
    /**
     * 이 판(배포)의 표식 (TASK-KL-128 ②-b). `build.mjs` 가 빌드 시각으로 박는다.
     *
     * 왜 필요한가: 위젯 묶음(`js/widgets/…`)은 주소를 **실행 중에** 만들어 내므로 파일 이름에
     * 지문을 못 박는다(이름이 코드 안에 없다). 그래서 이름 대신 이 표식을 주소 뒤에 붙인다 —
     * 배포마다 값이 달라지니 옛 판을 물 일이 없고, 한 판 안에서는 주소가 고정이라
     * 서비스 워커가 「한 번 받은 것은 그대로」로 둘 수 있다. 지금은 매번 네트워크를 탄다.
     */
    const BUILD_TAG = typeof __KARMOLAB_BUILD__ === 'string' ? __KARMOLAB_BUILD__ : '';

    /** 위젯 묶음 주소에만 판 표식을 붙인다 (vendor·world·root 는 그대로 둔다). */
    function withBuildTag(url) {
        if (!BUILD_TAG || url.indexOf('/js/widgets/') === -1) return url;
        return url + (url.indexOf('?') === -1 ? '?b=' : '&b=') + BUILD_TAG;
    }

    function resolveScriptPath(rawPath) {
        if (typeof rawPath === 'string' && rawPath.startsWith('world/')) {
            return getWorldScriptBase() + rawPath.slice('world/'.length) + '.js';
        }
        if (typeof rawPath === 'string' && rawPath.startsWith('vendor/')) {
            return getJsScriptBase() + 'vendor/' + rawPath.slice('vendor/'.length) + '.js';
        }
        if (typeof rawPath === 'string' && rawPath.startsWith('root/')) {
            return getJsScriptBase() + rawPath.slice('root/'.length) + '.js';
        }
        return withBuildTag(getWidgetScriptBase() + rawPath + '.js');
    }

    /**
     * 단일 스크립트를 한 번만 주입 (load-once 캐시 = loadScriptOnce 재사용).
     * boot 위젯(docs/user 등)이 무거운 vendor lib(marked/Prism/Gemini)를
     * boot 가 아니라 *사용 직전* 로드하도록 — 발화 「버튼 눌렀을때 그제서야」.
     */
    function ensureScript(rawPath) {
        return loadScriptOnce(resolveScriptPath(rawPath));
    }

    const widgetScriptsLoaded = new Set();
    const widgetScriptsLoading = new Map();

    function loadScriptOnce(src) {
        if (widgetScriptsLoaded.has(src)) return Promise.resolve();
        if (widgetScriptsLoading.has(src)) return widgetScriptsLoading.get(src);
        const p = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = false;
            s.onload = () => {
                widgetScriptsLoaded.add(src);
                widgetScriptsLoading.delete(src);
                resolve();
            };
            s.onerror = () => {
                widgetScriptsLoading.delete(src);
                reject(new Error('load failed: ' + src));
            };
            document.body.appendChild(s);
        });
        widgetScriptsLoading.set(src, p);
        return p;
    }

    function loadDeferredWidget(pageId) {
        const tool = tools.find(t => t.id === pageId && t._deferred);
        if (!tool) return Promise.resolve();
        if (lazyLoadPromises.has(pageId)) return lazyLoadPromises.get(pageId);

        const paths = tool.lazyScriptPaths;
        if (!paths || !paths.length) {
            return Promise.resolve();
        }

        const p = (async () => {
            let waitIdx = (window.KARMOLAB_WIDGET_LOADER_WAIT || []).length;
            for (let i = 0; i < paths.length; i++) {
                const url = resolveScriptPath(paths[i]);
                await loadScriptOnce(url);
                const w = window.KARMOLAB_WIDGET_LOADER_WAIT || [];
                if (w.length > waitIdx) {
                    await Promise.allSettled(w.slice(waitIdx));
                    waitIdx = w.length;
                }
            }
        })()
            .finally(() => {
                lazyLoadPromises.delete(pageId);
            })
            .catch((err) => {
                try { showToast('도구 로드 실패', 'error', err); } catch (_) {}
                throw err;
            });

        lazyLoadPromises.set(pageId, p);
        return p;
    }

    function kickLazyLoad(pageId) {
        return loadDeferredWidget(pageId);
    }

    /** 지연 위젯용 — lazy-meta에 정의된 공개 필드만 (lazyScriptPaths 제외). 위젯 register 시 스프레드 */
    function getLazyWidgetPublicMeta(id) {
        const m = typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID && window.KARMOLAB_LAZY_META_BY_ID[id];
        if (!m) {
            console.warn('[KarmoLab] getLazyWidgetPublicMeta: 정의 없음 —', id);
            return { id };
        }
        const { lazyScriptPaths: _paths, ...rest } = m;
        return rest;
    }

    function setNotifyInvokeDebugPayload(payload) {
        if (typeof window.__karmolabSetNotifyInvokeDebug === 'function') {
            window.__karmolabSetNotifyInvokeDebug(payload);
            return;
        }
        try {
            const pre = document.getElementById('karmolab-notify-debug-pre');
            const sum = document.querySelector('.karmolab-notify-debug-summary');
            const det = document.querySelector('.karmolab-notify-debug');
            const line = JSON.stringify(payload);
            if (pre) pre.textContent = JSON.stringify(payload, null, 2);
            if (sum) sum.textContent = line.length > 100 ? line.slice(0, 97) + '…' : line;
            if (det) det.open = true;
        } catch (_) {}
    }

    const UPDATE_DISMISS_KEY = 'karmolab-update-dismissed-version';

    function setupUpdateBannerListener() {
        if (typeof window === 'undefined' || !window.__KARMOLAB_DESKTOP__) return;
        const listenFn = window.__TAURI__?.event?.listen;
        if (typeof listenFn !== 'function') return;
        listenFn('karmolab://update-available', (e) => {
            const payload = (e?.payload || {}) as { current?: string; new?: string };
            if (!payload.new) return;
            // 사용자가 이미 닫은 버전이면 다시 띄우지 않는다 (수동으로 트레이 메뉴 사용 가능).
            try {
                if (localStorage.getItem(UPDATE_DISMISS_KEY) === payload.new) return;
            } catch (_) { /* localStorage 차단 환경 무시 */ }
            showUpdateBanner(payload.current || '?', payload.new);
        }).catch(() => {});
    }

    function showUpdateBanner(current, newVer) {
        if (document.querySelector('.karmolab-update-banner')) return;
        const banner = document.createElement('div');
        banner.className = 'karmolab-update-banner';

        const body = document.createElement('div');
        body.className = 'karmolab-update-banner-body';

        const msg = document.createElement('div');
        msg.className = 'karmolab-update-banner-msg';
        msg.innerHTML = `새 버전: <code>${escapeHtml(current)}</code> → <code>${escapeHtml(newVer)}</code>`;

        const notesA = document.createElement('a');
        notesA.className = 'karmolab-update-banner-notes';
        notesA.href = `https://github.com/mascari4615/mascari4615.github.io/releases/tag/karmolab-v${encodeURIComponent(newVer)}`;
        notesA.target = '_blank';
        notesA.rel = 'noopener noreferrer';
        notesA.textContent = '변경사항 보기';

        const progress = document.createElement('progress');
        progress.className = 'karmolab-update-banner-progress';
        progress.value = 0;
        progress.max = 1;
        progress.hidden = true;

        body.appendChild(msg);
        body.appendChild(notesA);
        body.appendChild(progress);

        const installBtn = document.createElement('button');
        installBtn.type = 'button';
        installBtn.className = 'karmolab-update-banner-install';
        installBtn.textContent = '지금 설치';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'karmolab-update-banner-close';
        closeBtn.setAttribute('aria-label', '닫기');
        closeBtn.textContent = '×';

        banner.appendChild(body);
        banner.appendChild(installBtn);
        banner.appendChild(closeBtn);
        document.body.appendChild(banner);

        const formatBytes = (n: number): string => {
            if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
            if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
            return n + ' B';
        };

        const listenFn = window.__TAURI__?.event?.listen;
        let unlistenProgress: (() => void) | null = null;
        let unlistenFinish: (() => void) | null = null;

        const stopListeners = () => {
            try { unlistenProgress?.(); } catch (_) { /* ignore */ }
            try { unlistenFinish?.(); } catch (_) { /* ignore */ }
            unlistenProgress = null;
            unlistenFinish = null;
        };

        closeBtn.addEventListener('click', () => {
            try { localStorage.setItem(UPDATE_DISMISS_KEY, newVer); } catch (_) { /* ignore */ }
            stopListeners();
            banner.remove();
        });

        installBtn.addEventListener('click', () => {
            const invoke = window.__TAURI__?.core?.invoke;
            if (typeof invoke !== 'function') {
                msg.textContent = '설치 불가: Tauri invoke를 찾지 못했습니다.';
                return;
            }

            installBtn.disabled = true;
            installBtn.textContent = '준비 중…';
            progress.hidden = false;

            if (typeof listenFn === 'function') {
                listenFn('karmolab://update-progress', (e) => {
                    const p = (e?.payload || {}) as { downloaded?: number; total?: number };
                    if (typeof p.total === 'number' && p.total > 0 && typeof p.downloaded === 'number') {
                        progress.value = Math.min(p.downloaded, p.total);
                        progress.max = p.total;
                        installBtn.textContent = `${formatBytes(p.downloaded)} / ${formatBytes(p.total)}`;
                    } else if (typeof p.downloaded === 'number') {
                        progress.removeAttribute('value'); // indeterminate
                        installBtn.textContent = `${formatBytes(p.downloaded)} 받는 중`;
                    }
                }).then((un) => { unlistenProgress = un; }).catch(() => {});

                listenFn('karmolab://update-download-finished', () => {
                    progress.removeAttribute('value');
                    installBtn.textContent = '설치 중…';
                }).then((un) => { unlistenFinish = un; }).catch(() => {});
            }

            invoke('desktop_install_pending_update', {})
                .then((res) => {
                    stopListeners();
                    progress.hidden = true;
                    msg.textContent = typeof res === 'string' ? res : '설치 완료.';
                    installBtn.disabled = false;
                    installBtn.textContent = '재시작';
                    installBtn.classList.add('karmolab-update-banner-restart');
                    installBtn.onclick = () => {
                        installBtn.disabled = true;
                        installBtn.textContent = '재시작 중…';
                        void invoke('desktop_restart_app', {}).catch(() => {
                            installBtn.disabled = false;
                            installBtn.textContent = '재시작';
                        });
                    };
                })
                .catch((err) => {
                    stopListeners();
                    progress.hidden = true;
                    const errMsg = err instanceof Error ? err.message : String(err);
                    msg.textContent = `실패: ${errMsg}`;
                    installBtn.disabled = false;
                    installBtn.textContent = '다시 시도';
                });
        });
    }

    const UPDATE_COMPLETED_SEEN_KEY = 'karmolab_toolbox_seen_version';
    const UPDATE_COMPLETED_TOAST_TIMEOUT_MS = 6000;

    /** 데스크톱 자동 업데이트 직후 (NSIS quiet → 재시작) "v0.1.X 업데이트 완료" 토스트.
     *  init script 의 `karmolab_app_version_seen` 은 reload 전에 갱신되므로 별도 키로 추적. */
    function setupUpdateCompletedToast() {
        if (typeof window === 'undefined' || !window.__KARMOLAB_DESKTOP__) return;
        const current = window.__KARMOLAB_VERSION__;
        if (!current) return;
        let seen: string | null = null;
        try { seen = localStorage.getItem(UPDATE_COMPLETED_SEEN_KEY); } catch (_) { /* ignore */ }
        if (seen === current) return;
        try { localStorage.setItem(UPDATE_COMPLETED_SEEN_KEY, current); } catch (_) { /* ignore */ }
        if (!seen) return; // 최초 실행 — 업데이트가 아니므로 토스트 스킵
        showUpdateCompletedToast(seen, current);
    }

    function showUpdateCompletedToast(prevVer: string, newVer: string) {
        if (document.querySelector('.karmolab-update-completed-toast')) return;
        const toast = document.createElement('div');
        toast.className = 'karmolab-update-completed-toast';

        const msg = document.createElement('div');
        msg.className = 'karmolab-update-completed-toast-msg';
        msg.innerHTML = `✓ KarmoLab 업데이트 완료 <code>${escapeHtml(prevVer)}</code> → <code>${escapeHtml(newVer)}</code>`;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'karmolab-update-completed-toast-close';
        closeBtn.setAttribute('aria-label', '닫기');
        closeBtn.textContent = '×';

        toast.appendChild(msg);
        toast.appendChild(closeBtn);
        document.body.appendChild(toast);

        let dismissed = false;
        const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            toast.classList.add('karmolab-update-completed-toast-leaving');
            setTimeout(() => { toast.remove(); }, 200);
        };
        closeBtn.addEventListener('click', dismiss);
        setTimeout(dismiss, UPDATE_COMPLETED_TOAST_TIMEOUT_MS);
    }

    function injectDesktopBadge() {
        if (typeof window === 'undefined' || !window.__KARMOLAB_DESKTOP__) return;
        const left = document.querySelector('.header-bar-left');
        if (left && !left.querySelector('.karmolab-desktop-chrome')) {
            const row = document.createElement('span');
            row.className = 'karmolab-desktop-chrome';
            row.setAttribute('aria-label', '데스크톱 앱 모드');
            const span = document.createElement('span');
            span.className = 'karmolab-desktop-badge';
            const ver = window.__KARMOLAB_VERSION__;
            span.textContent = ver ? `앱 v${ver}` : '앱';
            span.title = ver
              ? `KarmoLab 데스크톱 앱 v${ver}`
              : 'Tauri 데스크톱 앱에서 실행 중입니다. 웹에서는 이 배지가 보이지 않습니다.';
            const browserA = document.createElement('a');
            browserA.className = 'karmolab-open-browser';
            browserA.href = 'https://mascari4615.github.io/karmolab/';
            browserA.target = '_blank';
            browserA.rel = 'noopener noreferrer';
            browserA.textContent = '브라우저';
            browserA.title = '기본 브라우저에서 KarmoLab 열기';
            row.appendChild(span);
            row.appendChild(browserA);
            left.appendChild(row);
        }
    }

    function isDesktopApp() {
        return typeof window !== 'undefined' && !!window.__KARMOLAB_DESKTOP__;
    }

    /** decorations:false 윈도우의 헤더 컨트롤(min/max/close)을 활성화. 데스크톱 외에는 noop. */
    function installWindowControls() {
        if (!isDesktopApp()) return;
        const controls = document.getElementById('windowControls');
        if (!controls) return;

        const tauriWin = window.__TAURI__?.window;
        const getCurrentWindow = tauriWin?.getCurrentWindow;
        if (typeof getCurrentWindow !== 'function') {
            console.warn('[Toolbox] Tauri window API 미주입 — 윈도우 컨트롤 비활성');
            return;
        }
        const win = getCurrentWindow();

        controls.style.display = 'flex';
        controls.removeAttribute('aria-hidden');

        document.getElementById('wcMinimize')?.addEventListener('click', () => {
            win.minimize().catch((e) => console.warn('minimize 실패', e));
        });
        document.getElementById('wcMaximize')?.addEventListener('click', () => {
            win.toggleMaximize().catch((e) => console.warn('toggleMaximize 실패', e));
        });
        document.getElementById('wcClose')?.addEventListener('click', () => {
            win.close().catch((e) => console.warn('close 실패', e));
        });

        async function syncMaximized() {
            try {
                const m = await win.isMaximized();
                controls!.setAttribute('data-maximized', m ? 'true' : 'false');
            } catch { /* ignore */ }
        }
        void syncMaximized();
        win.onResized?.(() => { void syncMaximized(); }).catch(() => {});
    }

    /** 데스크톱 전용(desktopOnly 플래그) 도구는 일반 브라우저에서 메뉴·페이지에 넣지 않음.
     *  레거시: category==='desktop' 도 데스크톱전용으로 취급 (마이그 안전망). */
    function isDesktopOnlyTool(tool) {
        return tool && (tool.desktopOnly === true || tool.category === 'desktop');
    }

    function mirrorToastToDesktop(msg, type, detailText) {
        if (!isDesktopApp()) return;
        const notifyLevel = localStorage.getItem('karmolab_os_notify_level') || 'important';
        if (notifyLevel === 'off') return;
        
        if (notifyLevel === 'important') {
            if (type !== 'error') return;
        } else {
            // 'all'
            if (type !== 'error' && type !== 'success') return;
            if (type === 'success') {
                const m = String(msg);
                if (m.includes('클립보드') || m.includes('코드 테마')) return;
            }
        }
        const invokeFn = window.__TAURI__?.core?.invoke;
        if (typeof invokeFn !== 'function') return;
        const title = String(msg).trim();
        if (!title) return;
        let body = typeof detailText === 'string' ? detailText.trim() : '';
        if (body.length > 240) body = body.slice(0, 237) + '…';
        const payload = { title: title.slice(0, 120), body: body || 'KarmoLab' };
        if (type === 'error') payload.sound = 'Mail';
        setNotifyInvokeDebugPayload(payload);
        invokeFn('desktop_notify', payload).catch(function () {});
    }

    function init() {
        const headerNav = document.getElementById('header-nav');
        const mobileNav = document.getElementById('mobile-nav');
        const toolPages = document.getElementById('tool-pages');
        const hiddenSet = new Set(tools.filter(t => t.hidden).map(t => t.id));

        function addNavItem(container, tool) {
            const a = document.createElement('a');
            a.className = 'nav-item';
            a.href = '#';
            a.dataset.page = tool.id;
            a.title = tool.title;
            a.innerHTML = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${tool.icon || ''}</svg><span class="nav-item-text">${tool.title}</span>`;
            a.onclick = (e) => {
                e.preventDefault();
                closeAllHeaderNav();
                switchPage(tool.id);
            };
            container.appendChild(a);
        }

        function addMobileNavItem(tool) {
            const m = document.createElement('a');
            m.className = 'nav-item';
            m.dataset.page = tool.id;
            m.textContent = tool.title;
            m.onclick = () => switchPage(tool.id);
            mobileNav.appendChild(m);
        }

        /* TASK-KL-099 — 손가락으로 쓰는 화면에는 ⌘K 가 없다. 팔레트를 부를 길이 아예
         * 없으면 좁은 화면 사람만 160개짜리 가로 목록에 남겨진다. 이미 있는 줄의 맨 앞에
         * 세워서 새 떠다니는 버튼을 만들지 않는다. */
        const mFind = document.createElement('a');
        mFind.className = 'nav-item nav-item-find';
        mFind.textContent = '찾기';
        mFind.setAttribute('role', 'button');
        mFind.onclick = () => window.KarmoPalette?.open();
        mobileNav.appendChild(mFind);

        // Mobile home button
        const mHome = document.createElement('a');
        mHome.className = 'nav-item active';
        mHome.dataset.page = 'home';
        mHome.textContent = '홈';
        mHome.onclick = () => switchPage('home');
        mobileNav.appendChild(mHome);

        /* 헤더의 바깥 링크(도구 목록·봇·오늘의·광장…)를 폰 내비로 옮겨 온다 (TASK-KL-101).
         *
         * 폰 헤더는 로고 + 아이콘 둘이 들어가면 꽉 찬다. 그런데 이 링크들이 하나씩 늘어
         * 넷이 되면서 로고 **위에 포개졌다** — 브랜드가 뭉개진 채로 나가고 있었다.
         * 그렇다고 헤더에서 숨기기만 하면 폰에서는 갈 길이 아예 사라진다(봇·오늘의는 위젯이
         * 아니라 딴 주소다). 그래서 숨기는 대신 여기로 옮긴다.
         *
         * 목록을 여기 다시 적지 않고 **헤더에서 읽는다** — 나중에 링크가 늘어도 저절로 따라온다.
         * 손으로 한 벌 더 적으면 그날부터 폰만 옛 목록을 보게 된다. */
        document.querySelectorAll('.header-bar-right .header-tools-link').forEach((link) => {
            const href = link.getAttribute('href') || '';
            const label = (link.textContent || '').replace(/^[^\w가-힣]+/, '').trim();
            if (!label) return;
            const m = document.createElement('a');
            m.className = 'nav-item nav-item-shell';
            m.textContent = label;
            if (href.startsWith('#')) {
                // 앱 안의 화면 — 주소로 튀지 않고 그 자리에서 연다
                const pageId = href.slice(1);
                m.href = '#';
                m.onclick = (e) => { e.preventDefault(); switchPage(pageId); };
            } else {
                m.href = href;
            }
            mobileNav.appendChild(m);
        });

        function buildHeaderNavGroup(label, catTools, navParent) {
            if (!catTools.length) return;

            const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

            const wrap = document.createElement('div');
            wrap.className = 'header-nav-group';
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'header-nav-trigger';
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-haspopup', 'true');
            const labelSpan = document.createElement('span');
            labelSpan.className = 'header-nav-trigger-label';
            labelSpan.textContent = label;

            const panel = document.createElement('div');
            panel.className = 'header-nav-panel header-nav-panel--mega';
            panel.hidden = true;
            const inner = document.createElement('div');
            inner.className = 'header-nav-panel-inner';
            /* 메뉴 속 항목은 **열 때 만든다** (TASK-KL-128 런타임).
             * 이 판은 마우스를 올려야 나온다 — 그런데 부팅 때 도구 43개 줄(각각 그림 하나)을
             * 미리 만들어 두고 있었다. 옆줄 차림까지 더하면 86줄이 안 보이는 채로 만들어졌다.
             * 안 보여도 브라우저는 스타일을 계산하고 자리를 잡는다. 한 번만 만들고 다음부터는 그대로 쓴다. */
            let innerFilled = false;
            function fillPanelOnce() {
                if (innerFilled) return;
                innerFilled = true;
                catTools.forEach(tool => addNavItem(inner, tool));
            }
            panel.appendChild(inner);

            trigger.appendChild(labelSpan);

            function openThis() {
                fillPanelOnce();
                clearMegaMenuTimer();
                closeAllHeaderNavExcept(wrap);
                wrap.classList.add('is-open');
                panel.hidden = false;
                trigger.setAttribute('aria-expanded', 'true');
            }

            function toggleClick(e) {
                e.stopPropagation();
                const wasOpen = wrap.classList.contains('is-open');
                if (wasOpen) {
                    wrap.classList.remove('is-open');
                    panel.hidden = true;
                    trigger.setAttribute('aria-expanded', 'false');
                } else {
                    openThis();
                }
            }

            if (canHover) {
                wrap.addEventListener('mouseenter', openThis);
                wrap.addEventListener('mouseleave', scheduleMegaMenuClose);
            } else {
                trigger.addEventListener('click', toggleClick);
            }

            wrap.appendChild(trigger);
            wrap.appendChild(panel);
            navParent.appendChild(wrap);
        }

        if (headerNav) {
            const headerNavScroll = document.createElement('div');
            headerNavScroll.className = 'header-nav-scroll';
            headerNav.appendChild(headerNavScroll);

            CATEGORIES.forEach(cat => {
                const catTools = tools
                    .filter(t => !hiddenSet.has(t.id) && t.category === cat.id && (!isDesktopOnlyTool(t) || isDesktopApp()))
                    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko-KR'));
                buildHeaderNavGroup(cat.label, catTools, headerNavScroll);
            });

            const uncategorized = tools
                .filter(t => !hiddenSet.has(t.id) && !t.category)
                .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko-KR'));
            if (uncategorized.length) {
                buildHeaderNavGroup('기타', uncategorized, headerNavScroll);
            }

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.header-nav')) closeAllHeaderNav();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') closeAllHeaderNav();
            });
        }

        // Build sidebar nav groups
        const sidebarNavEl = document.getElementById('sidebar-nav');
        if (sidebarNavEl) {
            function buildSidebarGroup(catId, label, catTools) {
                if (!catTools.length) return;
                // 「내 것」은 처음부터 펴 둔다 — 접어 두면 맨 위에 올린 뜻이 없다 (TASK-KL-129).
                const isOpen = getSidebarGroupState()[catId] !== undefined
                    ? getSidebarGroupState()[catId]
                    : (catId === 'tool' || catId === 'mine');
                const wrap = document.createElement('div');
                wrap.className = 'sidebar-group';
                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'sidebar-group-trigger' + (isOpen ? ' open' : '');
                trigger.setAttribute('aria-expanded', String(isOpen));
                trigger.innerHTML = '<span class="chevron" aria-hidden="true"></span>'
                    + '<span class="sidebar-group-label">' + label + '</span>';
                const body = document.createElement('div');
                body.className = 'sidebar-group-body' + (isOpen ? ' open' : '');
                /* 옆줄 항목도 **필요할 때 만든다** (TASK-KL-128 런타임).
                 * 머리띠 차림에서는 이 옆줄 자체가 안 보이는데, 부팅 때 도구 줄을 다 만들고
                 * 있었다. 접힌 무리는 열 때, 펴 둔 무리는 화면이 한가해진 뒤에 채운다 —
                 * 어느 쪽이든 사람이 보기 전에는 다 채워져 있다. */
                let bodyFilled = false;
                function fillBodyOnce() {
                    if (bodyFilled) return;
                    bodyFilled = true;
                    catTools.forEach(tool => addNavItem(body, tool));
                }
                if (isOpen) {
                    const idle = window.requestIdleCallback || function (f) { setTimeout(f, 200); };
                    idle(fillBodyOnce);
                }
                trigger.onclick = () => {
                    fillBodyOnce();
                    const open = body.classList.toggle('open');
                    trigger.classList.toggle('open', open);
                    trigger.setAttribute('aria-expanded', String(open));
                    setSidebarGroupState({ ...getSidebarGroupState(), [catId]: open });
                };
                wrap.appendChild(trigger);
                wrap.appendChild(body);
                sidebarNavEl.appendChild(wrap);
            }

            /* 내가 고른 것을 옆줄 맨 위에 (TASK-KL-129).
             *
             * 앱 안에서 도구를 갈아탈 때 제일 자주 보는 곳이 이 옆줄인데, 여기는 127개가
             * 분류로만 접혀 있었다 — 늘 쓰는 두세 개를 열려면 매번 그 분류를 펼쳐야 했다.
             * 목록 페이지에서 별로 꽂아 둔 것이 있으면 맨 위에 편다.
             * 하나도 없으면 이 칸은 아예 안 생긴다 — 빈 상자를 두지 않는다. */
            rebuildMineGroup = () => {
                // 순서는 사람이 꽂은 순서 그대로 — 가나다순으로 다시 세우면 「내가 놓은 자리」가 사라진다.
                const pinned = getPins()
                    .map(id => tools.find(t => t.id === id))
                    .filter(t => !!t && (!isDesktopOnlyTool(t) || isDesktopApp()));
                const old = sidebarNavEl.querySelector('[data-group="mine"]');
                if (old) old.remove();
                if (!pinned.length) return;
                buildSidebarGroup('mine', '내 것', pinned);
                // 새로 만든 칸은 맨 위로 — 별을 꽂자마자 그 자리에 보여야 한다.
                const made = sidebarNavEl.lastElementChild;
                if (made) {
                    made.dataset.group = 'mine';
                    sidebarNavEl.prepend(made);
                }
            };
            rebuildMineGroup();

            CATEGORIES.forEach(cat => {
                const catTools = tools
                    .filter(t => !hiddenSet.has(t.id) && t.category === cat.id && (!isDesktopOnlyTool(t) || isDesktopApp()))
                    .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko-KR'));
                buildSidebarGroup(cat.id, cat.label, catTools);
            });

            const sidebarUncategorized = tools
                .filter(t => !hiddenSet.has(t.id) && !t.category)
                .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko-KR'));
            buildSidebarGroup('misc', '기타', sidebarUncategorized);
        }

        /* TASK-KL-129: 본문이 이미 HTML 에 박혀 있는 페이지(도구 목록)에서는 화면을 앱이 안 그린다.
         * 첫 화면과 도구 126장의 빈 껍데기를 만들어 봐야 적혀 있던 목록 위에 덮이거나
         * 안 보이는 채로 쌓이기만 한다 — 여기서 고른 도구는 그 도구의 **제 주소로 옮겨 간다**. */
        const staticBody = typeof window !== 'undefined' && !!window.KARMOLAB_ENTRY_STATIC;

        // Build landing page
        if (!staticBody) toolPages.appendChild(buildLanding());

        // Build tool pages (가나다순)
        const sortedTools = [...tools].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko-KR'));
        /* 도구 화면은 **열 때 만든다** (TASK-KL-128 런타임).
         *
         * 예전에는 부팅할 때 도구 168개의 화면을 전부 만들어 붙였다. 그중 보이는 것은 하나다.
         * 재 보니 첫 화면의 DOM 이 3674개였고 그중 2509개가 안 보이는 것이었다 — 도구 화면
         * 껍데기(제목·설명·탭·패널)가 대부분이다. 브라우저는 안 보이는 것도 스타일을 계산하고
         * 자리를 잡는다. 느린 기기에서 주 스레드가 잡힌 시간의 대부분이 여기(브라우저 내부 일)였다.
         *
         * 지금은 `switchPage` 가 그 화면이 없으면 그때 만든다. 만드는 값은 같고, **한 번에
         * 하나만** 만든다. 옆줄 항목은 그대로 만든다 — 그건 실제로 보이는 것이다. */
        sortedTools.forEach(tool => {
            if (!hiddenSet.has(tool.id) && (!isDesktopOnlyTool(tool) || isDesktopApp())) addMobileNavItem(tool);
        });

        document.getElementById('userPageBtn')?.addEventListener('click', () => switchPage('user'));

        window.addEventListener('gemini-active-profile-changed', () => {
            const name = typeof Gemini !== 'undefined' ? (Gemini.getActiveProfileName() || '기본') : '-';
            const cb = document.getElementById('cbActiveProfileName');
            if (cb) cb.textContent = name;
            const ig = document.getElementById('igActiveProfileName');
            if (ig) ig.textContent = name;
        });

        const hashPage = location.hash ? location.hash.slice(1) : null;
        // TASK-KL-088: /karmolab/t/<id>/ 도구 상세 페이지가 심는 진입 위젯.
        // 있으면 해시·마지막 페이지보다 우선하고, URL 에 해시를 덧붙이지 않는다.
        const entryTool = (typeof window !== 'undefined' && window.KARMOLAB_ENTRY_TOOL) || null;
        const lastPage = (() => { try { return localStorage.getItem(LAST_PAGE_KEY); } catch (_) { return null; } })();
        const isValidPage = (id) => {
            if (id === 'home' || id === 'user') return true;
            const t = tools.find(x => x.id === id);
            if (!t) return false;
            if (isDesktopOnlyTool(t) && !isDesktopApp()) return false;
            return true;
        };
        /* TASK-KL-129: 본문이 **이미 HTML 에 박혀 있는** 페이지(도구 목록 등).
         * 셸의 머리띠·옆줄·테마·⌘K 는 그대로 쓰되, 화면은 앱이 그리지 않는다 —
         * 여기서 첫 화면을 그리면 적혀 있던 목록 위에 홈이 덮인다(실제로 그랬다). */
        if (staticBody) {
            injectDesktopBadge();
            setupUpdateBannerListener();
            setupUpdateCompletedToast();
            installWindowControls();
            installPaletteShortcut();
            return;
        }

        const initialPage = (entryTool && isValidPage(entryTool))
            ? entryTool
            : (hashPage && isValidPage(hashPage))
                ? hashPage
                : (lastPage && isValidPage(lastPage) ? lastPage : 'home');

        /* 도구 상세 페이지에는 제목이 **서버에서 미리 박혀** 있고 앱 히어로는 접혀 있다.
         * 별을 히어로에만 달면 그 127장에서는 꽂을 길이 없다 — 거기에도 단다. */
        if (entryTool) mountPinStar(document.querySelector('.tool-head'), entryTool);

        switchPage(initialPage, { pushHistory: false });
        if (!entryTool) {
            history.replaceState({ pageId: initialPage }, '', location.pathname + (location.search || '') + '#' + initialPage);
        }

        window.addEventListener('popstate', () => {
            const pageId = pageIdFromHash();
            if (isValidPage(pageId)) switchPage(pageId, { pushHistory: false });
        });

        injectDesktopBadge();
        setupUpdateBannerListener();
        setupUpdateCompletedToast();
        installWindowControls();
        installPaletteShortcut();
    }

    /* TASK-KL-099 — 어디서든 ⌘K / Ctrl+K 로 찾는 창을 부른다.
     * 헤더에 상시 검색창을 두지 않는 대신, 첫 화면에서 배운 그 표면을 다시 띄운다. */
    function installPaletteShortcut() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
                // 브라우저 기본(주소창 검색)을 뺏는다 — 이 앱 안에서는 이쪽이 맞는 동작이다.
                e.preventDefault();
                window.KarmoPalette?.toggle();
                return;
            }
            // 첫 화면에 이미 입력이 박혀 있다 — 거기서 또 창을 띄우면 같은 것이 두 겹이 된다.
            if (e.key === '/' && currentPageId !== 'home' && !window.KarmoPalette?.isOpen()) {
                const t = e.target;
                const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
                e.preventDefault();
                window.KarmoPalette?.open();
            }
        });
    }

    /* ===== Landing Page Builder ===== */

    /* ═══════ 첫 화면 장식 (Y2K 하프톤 도형) — TASK-KL-097 ═══════
     *
     * 페이지를 **열 때마다** 새로 뽑는다. 만들어 둔 그림을 박아 두면 백 번 들어와도 같은 화면이다.
     * 도형이 일곱 개뿐이라 열 때 계산해도 티가 안 난다. 바깥에서 받아 오는 그림 파일은 0 —
     * 전부 수식에서 나온 인라인 SVG 다.
     *
     * 규칙 셋(전부 실제로 어긋나 봤고 그래서 넣은 것들):
     *   ① 글 읽는 한가운데는 비운다 — 처음엔 제목 위에 얹혀 읽기 힘들었다.
     *   ② 화면을 구역으로 나눠 한 구역에 하나씩 — 그냥 무작위로 뿌리면 한쪽에 몰린다.
     *   ③ 멀수록 작고·뿌옇고·느리다. 그리고 **제일 가까운 것이 제일 흐리다**(렌즈 바로 앞).
     *
     * `?seed=숫자` = 그 배치를 그대로 재현 (마음에 든 화면을 붙잡거나 검사할 때).
     * `?px=4` = 표현 하나로 고정 · `?px=none` = 장식 끔.
     */
    const DECOR_FIELDS = {
        sparkle: (x, y) => 1 - (Math.sqrt(Math.abs(x)) + Math.sqrt(Math.abs(y))),
        flower: (x, y) => { const r = Math.hypot(x, y), t = Math.atan2(y, x); return .58 + .30 * Math.cos(6 * t) - r; },
        ring: (x, y) => .20 - Math.abs(Math.hypot(x, y) - .66),
        blob: (x, y) => { const r = Math.hypot(x, y), t = Math.atan2(y, x); return .70 + .14 * Math.sin(3 * t + 1) - r; },
        cross: (x, y) => { const a = Math.abs(x), b = Math.abs(y); return .78 - Math.max(a, b) - 1.1 * Math.min(a, b); },
        burst: (x, y) => { const r = Math.hypot(x, y), t = Math.atan2(y, x); return .44 + .34 * Math.abs(Math.cos(4 * t)) - r; },
    };
    const DECOR_ZONES = [
        { x: [2, 16], y: [8, 22], band: 'mid' },
        { x: [80, 93], y: [8, 22], band: 'far' },
        { x: [1, 12], y: [42, 58], band: 'near' },
        { x: [8, 22], y: [74, 88], band: 'far' },
        { x: [44, 58], y: [82, 92], band: 'far' },
    ];
    /** 거리 3단이 그대로 시차 배수가 된다 — 멀수록 조금 밀린다 (TASK-KL-101) */
    const DECOR_DEPTH = { far: 0.18, mid: 0.34, near: 0.55 };
    const DECOR_BANDS = {
        far: { z: [38, 58], blur: [2.4, 4.0], op: [.40, .52], dur: [54, 74], amp: [12, 22] },
        mid: { z: [62, 88], blur: [0.8, 1.6], op: [.62, .76], dur: [38, 52], amp: [18, 32] },
        near: { z: [100, 132], blur: [0, 0.3], op: [.88, 1.0], dur: [28, 38], amp: [24, 42] },
    };
    const DECOR_DEFS = `<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>
<linearGradient id="kdg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="var(--decor-a)"/><stop offset="45%" stop-color="var(--decor-b)"/><stop offset="100%" stop-color="var(--decor-c)"/></linearGradient>
<linearGradient id="kdg2" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="var(--decor-c)"/><stop offset="50%" stop-color="var(--decor-d)"/><stop offset="100%" stop-color="var(--decor-e)"/></linearGradient>
<linearGradient id="kdg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--decor-d)"/><stop offset="55%" stop-color="var(--decor-e)"/><stop offset="100%" stop-color="var(--decor-c)"/></linearGradient>
<linearGradient id="kdgloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity=".9"/><stop offset="45%" stop-color="#ffffff" stop-opacity=".12"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<pattern id="kdstripe" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4" height="8" fill="#ffffff" opacity=".8"/></pattern>
<filter id="kdgrain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 -0.55"/><feComposite operator="in" in2="SourceGraphic"/></filter>
<filter id="kdjelly" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#2a1d6b" flood-opacity=".35"/></filter>
</defs></svg>`;

    function buildHomeDecor() {
        const q = new URLSearchParams(location.search);
        const force = q.get('px');
        const wrap = document.createElement('div');
        wrap.className = 'home-decor';
        wrap.setAttribute('aria-hidden', 'true');
        if (force === 'none') return wrap;
        // 도구 상세 페이지에도 이 셸이 쓰인다. 거기선 첫 화면이 안 보이므로 그리지 않는다
        // (안 보이는 것을 계산하는 값은 그대로 나간다).
        if (typeof window !== 'undefined' && (window.KARMOLAB_ENTRY_TOOL || window.KARMOLAB_ENTRY_STATIC)) return wrap;

        /* 폰에서는 **만들 때부터** 작게·적게 만든다 (TASK-KL-101).
         * CSS 로 `transform: scale()` 를 걸어 줄이려 했더니 아무 일도 안 일어났다 —
         * 떠다니는 움직임이 같은 transform 을 쓰므로 애니메이션이 이긴다. 그래서 폰에서는
         * 데스크톱 크기 그대로 나와 큰 꽃 하나가 카드를 덮고 있었다. */
        const narrow = typeof window !== 'undefined' && window.innerWidth <= 768;
        const k = narrow ? 0.55 : 1;      // 크기 배수
        const seed0 = (q.get('seed') | 0) || (Date.now() % 2147483647);
    /** 앞서 단 손 감지를 끊는 손잡이 — 첫 화면을 다시 그릴 때 옛 것이 남지 않게 */
    let decorStop = null;

        let s = seed0;
        const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        const rng = (a, b) => a + rnd() * (b - a);
        const pick = (a) => a[Math.floor(rnd() * a.length)];
        const names = Object.keys(DECOR_FIELDS);
        const grads = ['kdg1', 'kdg2', 'kdg3'];
        const kinds = ['halftone', 'grain', 'jelly', 'stripe', 'outline', 'misprint'];

        const svg = (z, inner) => `<svg width="${z}" height="${z}">${inner}</svg>`;
        function halftone(n, z, g) {
            // 점 간격은 화면 기준으로 잡는다 — 크기에 비례해 늘리면 렌즈 앞 큰 것이 점 몇 개로 뭉개진다
            const N = Math.max(22, Math.min(70, Math.round(z / 5.5))), cell = z / N, o = [];
            for (let gy = 0; gy < N; gy++) for (let gx = 0; gx < N; gx++) {
                const x = (gx + .5) / N * 2 - 1, y = (gy + .5) / N * 2 - 1, v = DECOR_FIELDS[n](x, y);
                if (v <= 0) continue;
                const r = Math.min(1, v / 0.34) * cell * 0.58;
                if (r < cell * 0.10) continue;
                o.push(`<circle cx="${((gx + .5) * cell).toFixed(1)}" cy="${((gy + .5) * cell).toFixed(1)}" r="${r.toFixed(2)}"/>`);
            }
            return svg(z, `<g fill="url(#${g})">${o.join('')}</g>`);
        }
        function outlinePath(n, z) {
            const p = [], steps = 200;
            for (let i = 0; i < steps; i++) {
                const t = i / steps * Math.PI * 2;
                let lo = 0, hi = 1.6;
                for (let k = 0; k < 22; k++) {
                    const m = (lo + hi) / 2;
                    if (DECOR_FIELDS[n](Math.cos(t) * m, Math.sin(t) * m) > 0) lo = m; else hi = m;
                }
                p.push([(Math.cos(t) * lo * .5 + .5) * z, (Math.sin(t) * lo * .5 + .5) * z]);
            }
            return 'M' + p.map((c) => c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join('L') + 'Z';
        }
        let clipId = 0;
        function draw(kind, n, z, g) {
            const d = () => outlinePath(n, z);
            switch (kind) {
                case 'halftone': return halftone(n, z, g);
                case 'grain': { const p = d(); return svg(z, `<path d="${p}" fill="url(#${g})"/><path d="${p}" fill="#14121f" filter="url(#kdgrain)" opacity=".55"/>`); }
                case 'jelly': { const p = d(); return svg(z, `<path d="${p}" fill="url(#${g})" filter="url(#kdjelly)"/><path d="${p}" fill="url(#kdgloss)" opacity=".85" transform="translate(${z * .06},${z * .05}) scale(.86)"/>`); }
                case 'stripe': { const id = 'kdc' + (clipId++); return svg(z, `<defs><clipPath id="${id}"><path d="${d()}"/></clipPath></defs><g clip-path="url(#${id})"><rect width="${z}" height="${z}" fill="url(#${g})"/><rect width="${z}" height="${z}" fill="url(#kdstripe)"/></g>`); }
                case 'outline': { const p = d(); return svg(z, `<path d="${p}" fill="none" stroke="url(#${g})" stroke-width="4"/><path d="${p}" fill="none" stroke="url(#${g})" stroke-width="1.5" opacity=".6" transform="translate(${z * .5},${z * .5}) scale(.78) translate(${-z * .5},${-z * .5})"/>`); }
                default: { const p = d(); return svg(z, `<g style="mix-blend-mode:multiply"><path d="${p}" fill="#ec4899" opacity=".72" transform="translate(-3,-3)"/><path d="${p}" fill="#22d3ee" opacity=".72" transform="translate(3,3)"/><path d="${p}" fill="#6d5bd0" opacity=".55"/></g>`); }
            }
        }
        const KIND_BY_NUM = { '2': 'grain', '3': 'jelly', '4': 'halftone', '6': 'stripe', '7': 'outline', '8': 'misprint' };
        const kindOf = () => KIND_BY_NUM[force] || pick(kinds);

        const css = [], html = [];
        let idx = 0;
        /* depth = 손가락·커서를 따라 얼마나 밀릴지. **가까운 것이 많이** 밀린다 —
         * 창밖을 보며 지나갈 때 가까운 것이 빨리 흐르는 그 원리다 (TASK-KL-101).
         * 중요: 떠다니는 움직임과 **자리를 나눠 쓴다**. 둘 다 transform 이라 한 요소에 겹치면
         * 서로 덮어쓴다. 바깥 상자가 시차, 안쪽 상자가 떠다니기를 맡는다. */
        function add(z, blur, op, dur, amp, pos, extra, depth) {
            const cls = 'kd' + (idx++);
            const ax = rng(amp[0], amp[1]).toFixed(0), ay = rng(amp[0], amp[1]).toFixed(0);
            const rot = rng(5, 20).toFixed(0), dir = rnd() < .5 ? 1 : -1;
            const secs = rng(dur[0], dur[1]).toFixed(1), delay = (-rnd() * secs).toFixed(1);
            css.push(`@keyframes ${cls}{0%{transform:translate(0,0) rotate(0deg)}`
                + `25%{transform:translate(${ax}px,${-ay}px) rotate(${rot * dir}deg)}`
                + `50%{transform:translate(${ax / 2}px,${ay}px) rotate(0deg)}`
                + `75%{transform:translate(${-ax}px,${ay / 2}px) rotate(${-rot * dir}deg)}`
                + `100%{transform:translate(0,0) rotate(0deg)}}`);
            html.push(`<div class="home-decor-item${extra ? ' ' + extra : ''}" style="${pos};opacity:${op};`
                + `filter:blur(${blur}px);--depth:${depth}">`
                + `<div class="home-decor-float" style="animation:${cls} ${secs}s ease-in-out ${delay}s infinite">`
                + draw(kindOf(), pick(names), z, pick(grads)) + '</div></div>');
        }

        // 렌즈 바로 앞 — 화면보다 크고 잘리고 초점이 나갔다. 흐리므로 글을 안 가린다.
        const corners = ['left:-22%;top:34%', 'right:-24%;top:30%', 'left:-18%;top:-26%', 'right:-20%;top:-24%'];
        add(Math.round(rng(1050, 1320) * k), rng(13, 19).toFixed(0), rng(.40, .52).toFixed(2), [110, 130], [24, 40], pick(corners), 'home-decor-lens', 1);
        // 또렷한 닻 — 좌우 중 한쪽 바깥에 걸친다
        add(Math.round(rng(300, 380) * k), 0, rng(.86, .96).toFixed(2), [62, 76], [20, 34], rnd() < .5 ? 'right:-3%;top:26%' : 'left:-4%;top:22%', null, 0.62);
        // 폰은 화면이 좁아 같은 개수를 뿌리면 빽빽하다 — 구역을 줄인다
        for (const zn of (narrow ? DECOR_ZONES.slice(0, 3) : DECOR_ZONES)) {
            const b = DECOR_BANDS[zn.band];
            add(Math.round(rng(b.z[0], b.z[1]) * k), rng(b.blur[0], b.blur[1]).toFixed(2), rng(b.op[0], b.op[1]).toFixed(2),
                b.dur, b.amp, `left:${rng(zn.x[0], zn.x[1]).toFixed(1)}%;top:${rng(zn.y[0], zn.y[1]).toFixed(1)}%`,
                null, DECOR_DEPTH[zn.band]);
        }

        const style = document.createElement('style');
        style.textContent = css.join('\n');
        document.head.appendChild(style);
        wrap.innerHTML = DECOR_DEFS + html.join('');
        wrap.dataset.seed = String(seed0);

        /* 손가락·커서를 따라 도형이 조금 밀린다 (TASK-KL-101).
         *
         * 값은 **한 곳(감싸는 상자)에만** 쓴다. 도형마다 스타일을 건드리면 도형 수만큼 일이
         * 늘고, 그때마다 브라우저가 배치를 다시 잰다. 각 도형은 제 depth 를 곱해 알아서 밀린다.
         * 화면을 다시 그리는 일은 프레임당 한 번으로 묶는다(rAF) — 손가락 좌표는 그보다 훨씬
         * 자주 들어온다.
         *
         * 움직임을 줄여 달라고 한 사람에게는 아예 안 건다. 「덜 움직이게」가 아니라 안 움직인다. */
        const calm = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (!calm) {
            /* 시차는 **아주 약하게**만 남긴다. 세게 주면 화면 전체가 손을 따라 평행 이동해서
               「종이를 미는」 느낌이 된다 — 물에 뜬 것과 정반대다. 여기서는 멀리 있는 것이
               아주 조금 흐르는 정도로만 쓴다 (TASK-KL-101). */
            const reach = narrow ? 7 : 12;
            let tx = 0, ty = 0, queued = false;
            const apply = () => {
                queued = false;
                cx0 += (tx - cx0) * 0.12;
                cy0 += (ty - cy0) * 0.12;
                wrap.style.setProperty('--px', cx0.toFixed(1) + 'px');
                wrap.style.setProperty('--py', cy0.toFixed(1) + 'px');
                if (Math.abs(tx - cx0) > 0.2 || Math.abs(ty - cy0) > 0.2) {
                    if (!queued) { queued = true; requestAnimationFrame(apply); }
                }
            };
            const track = (x, y) => {
                tx = ((x / window.innerWidth) * 2 - 1) * -reach;
                ty = ((y / window.innerHeight) * 2 - 1) * -reach;
                if (!queued) { queued = true; requestAnimationFrame(apply); }
            };
            /* 첫 화면은 다시 그려질 수 있다(도구를 갔다 오면). 그때마다 듣는 귀를 새로 달면
             * 옛 귀가 남아 손을 한 번 움직여도 여러 번 계산한다 — 눈에는 안 보이고 느려지기만
             * 한다. 앞서 단 것을 끊고 새로 단다 (TASK-KL-101). */
            decorStop?.abort();
            decorStop = new AbortController();
            const bye = { signal: decorStop.signal, passive: true };
            /* 가까운 것은 **물에 뜬 꽃잎**처럼 군다 (TASK-KL-101).
             *
             * 시차만 주면 손가락 위치에 딱 붙어 같이 평행 이동한다 — 종이에 그려 놓고 종이를
             * 미는 느낌이다. 물 위의 꽃잎은 손이 **지나갈 때 밀려났다가 천천히 제자리로**
             * 돌아온다. 그래서 가까운 것에는 위치가 아니라 **힘**을 준다:
             *   지나가면 밀어내는 힘 → 매 프레임 제자리로 당기는 힘(용수철) + 물의 저항(감쇠).
             * 먼 것은 그대로 시차다 — 멀리 있는 것은 손이 닿지 않는다.
             */
            /* 부드러움은 **여기서** 만든다. 예전에는 CSS 전환에 맡겼는데, 모든 도형이
             * 밀림 계산을 받게 되면서 그 전환을 꺼 버려 규칙이 죽어 있었다(잰 값 0s).
             * 목표값으로 조금씩 따라가면 전환 없이도 같은 부드러움이 나온다. */
            let cx0 = 0, cy0 = 0;
            /* 깊이는 **인라인 값**에서 읽는다. 이 상자는 아직 화면에 안 붙어 있어서
             * 계산된 값을 물으면 빈 문자열이 온다 — 처음엔 그래서 한 개도 안 잡혔다. */
            const drifters = [...wrap.querySelectorAll('.home-decor-item')]
                .map((el) => {
                    el.classList.add('home-decor-drift');
                    /* 깊이가 밀리는 정도를 정한다 — 가까운 것이 많이, 먼 것은 거의 안 밀린다.
                       예전에는 가까운 것만 골라 놓고 그 안에서는 다 똑같이 밀었다. 그래서
                       「전체가 한 덩어리로 밀리는」 느낌이 났다 (TASK-KL-101). */
                    const depth = parseFloat(el.style.getPropertyValue('--depth')) || 0.2;
                    return { el, depth, ox: 0, oy: 0, vx: 0, vy: 0, cx: 0, cy: 0, r: 0 };
                });
            const measure = () => {
                for (const d of drifters) {
                    const b = d.el.getBoundingClientRect();
                    d.cx = d.el.offsetLeft + d.el.offsetWidth / 2;
                    d.cy = d.el.offsetTop + d.el.offsetHeight / 2;
                    d.r = Math.min(b.width, b.height) / 2;   // 도형의 반지름(표면까지)
                }
            };
            /* 자리는 **손이 처음 움직일 때** 잰다. 이 상자는 만들어질 때 아직 화면에 안 붙어
             * 있어서, 그때 재면 전부 0 이 나오고 「아무리 스쳐도 안 밀리는」 상태가 된다.
             * (실제로 그랬다 — 꽃잎은 잡혔는데 밀린 거리가 계속 0 이었다.) */
            let measured = false;
            window.addEventListener('resize', () => { measured = false; }, bye);

            /* 닿는 거리는 **도형 표면 기준**이다 (TASK-KL-101).
               중심까지의 거리로 재면 큰 도형은 화면 어디서 움직여도 걸린다 — 화면을 통째로
               잡아 끄는 느낌이 그래서 났다. 표면에서 이만큼 안으로 들어와야 밀린다. */
            const MARGIN = narrow ? 55 : 85;
            const PUSH = narrow ? 14 : 20;      // 바짝 붙었을 때 밀어내는 세기
            const VMAX = narrow ? 1.6 : 2.4;    // 한 프레임에 밀릴 수 있는 최대 (밀리는 속도의 천장)
                    /* 원래 자리는 **배치 좌표**로 잰다. 화면 좌표로 재면 그 순간의 떠다니는
                     * 움직임까지 섞여, 잰 시점에 따라 중심이 수십 px 씩 달라진다. */
            let alive = false;
            function step() {
                let moving = false;
                for (const d of drifters) {
                    /* **돌아오지도, 묶이지도 않는다.** 물에 밀린 것은 제자리로 안 오고
                     * 테두리에 걸리지도 않는다. 남은 것은 물의 저항뿐이라 미끄러지다 스스로 선다.
                     * 여기서 「제자리로 당기는 힘」과 「최대 거리」를 둘 다 뺐다 — 아무리 약해도
                     * 그 둘이 있으면 자리가 정해져 있다는 느낌이 난다. */
                    d.vx *= 0.93;   // 물의 저항. 높이면 오래 미끄러지고, 낮추면 금방 선다
                    d.vy *= 0.93;
                    d.ox += d.vx;
                    d.oy += d.vy;
                    /* 화면 밖으로 나가면 반대편에서 들어온다. 안 그러면 밀어낸 만큼 화면이
                     * 비어 간다 — 물속이라면 흘러간 자리를 다른 것이 채운다. */
                    const cx = d.cx + d.ox, cy = d.cy + d.oy, pad = d.r + 60;
                    if (cx < -pad) d.ox += innerWidth + pad * 2;
                    else if (cx > innerWidth + pad) d.ox -= innerWidth + pad * 2;
                    if (cy < -pad) d.oy += innerHeight + pad * 2;
                    else if (cy > innerHeight + pad) d.oy -= innerHeight + pad * 2;
                    // 값은 **0 으로 되돌리지 않는다** — 되돌리면 그 순간 원래 자리로 튄다.
                    if (Math.abs(d.vx) < 0.02 && Math.abs(d.vy) < 0.02) {
                        d.el.style.setProperty('--ox', d.ox.toFixed(2) + 'px');
                        d.el.style.setProperty('--oy', d.oy.toFixed(2) + 'px');
                        continue;
                    }
                    moving = true;
                    d.el.style.setProperty('--ox', d.ox.toFixed(2) + 'px');
                    d.el.style.setProperty('--oy', d.oy.toFixed(2) + 'px');
                }
                // 다 가라앉으면 멈춘다 — 가만히 있는 화면에서 프레임을 태우지 않는다
                if (moving) requestAnimationFrame(step);
                else alive = false;
            }
            const shove = (x, y) => {
                if (!measured) { measure(); measured = true; }
                for (const d of drifters) {
                    const dx = d.cx + d.ox - x, dy = d.cy + d.oy - y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 0.001) continue;
                    const surface = dist - d.r;              // 도형 표면까지 남은 거리
                    if (surface > MARGIN) continue;          // 아직 멀다 — 아무 일도 없다
                    const near = 1 - Math.max(0, surface) / MARGIN;
                    // 바짝 붙을수록 급격히 세게 × 가까운 것일수록 더 (깊이)
                    const power = near ** 2 * PUSH * 0.16 * d.depth;
                    d.vx += (dx / dist) * power;
                    d.vy += (dy / dist) * power;
                    /* 속도에 천장을 둔다. 손을 한 번 스쳐도 밀어내는 힘이 **프레임마다 쌓여서**,
                     * 천장이 없으면 한 번 지나갔을 뿐인데 수백 px 를 날아간다(그랬다).
                     * 여기서 「얼마나 빨리 밀리나」가 정해지고, 저항이 「얼마나 멀리 가나」를 정한다. */
                    const sp = Math.hypot(d.vx, d.vy);
                    const cap = VMAX * d.depth;   // 천장도 깊이를 따른다
                    if (sp > cap) { d.vx *= cap / sp; d.vy *= cap / sp; }
                }
                if (!alive) { alive = true; requestAnimationFrame(step); }
            };

            window.addEventListener('pointermove', (e) => { track(e.clientX, e.clientY); shove(e.clientX, e.clientY); }, bye);
            window.addEventListener('touchmove', (e) => {
                const t = e.touches && e.touches[0];
                if (t) { track(t.clientX, t.clientY); shove(t.clientX, t.clientY); }
            }, bye);
            // 손을 떼거나 창을 벗어나면 제자리로 — 안 그러면 마지막 자리에 굳는다
            const home = () => { tx = 0; ty = 0; if (!queued) { queued = true; requestAnimationFrame(apply); } };
            window.addEventListener('touchend', home, bye);
            window.addEventListener('pointerleave', home, bye);
        }
        return wrap;
    }

    /** 장식 한 장을 껍데기에 붙인다. 다시 부르면 앞의 것을 걷고 새로 뽑는다
     *  (도형은 열 때마다 새로 뽑히는 것이 원래 규칙이다). */
    function mountHomeDecor() {
        document.querySelector('.home-decor')?.remove();
        document.body.appendChild(buildHomeDecor());
    }

    function buildLanding() {
        const landing = document.createElement('div');
        landing.className = 'landing-page';
        landing.id = 'page-home';
        /* 장식은 **첫 화면 것이 아니라 이 앱의 것**이다 (TASK-KL-101).
           첫 화면 안에 넣어 두면 도구로 가는 순간 통째로 사라진다 — 도구를 여닫을 때마다
           세계가 바뀌는 셈이다. 껍데기(body) 에 한 장 붙여 두면 어느 화면에서나 그대로
           떠 있고, 화면 사이를 오가도 도형이 이어진다. 위치는 어차피 화면 기준이다. */
        mountHomeDecor();

        const hero = document.createElement('div');
        hero.className = 'landing-hero';
        hero.innerHTML = `
            <p class="landing-subtitle">KarmoLab</p>
            <h1 class="landing-title">KarmoLab</h1>
            <p class="landing-tagline">삶을 섞고 술을 바꿀 시간</p>
        `;
        landing.appendChild(hero);

        /* TASK-KL-099 — 첫 화면의 본체는 찾는 입력이다. 도구가 160개인데 예전에는 이 자리에
         * 카드 3장과 「상단 메뉴에서 카테고리를 열고 도구를 선택하세요」만 있었다 — 찾는 일을
         * 사람에게 떠넘기는 화면이었다. 카드는 그대로 두되(사용자 요청), 주인공 자리는 입력이
         * 갖는다: 카드 셋은 정해진 세 곳으로 가고, 입력은 160개 전부로 간다. */
        /* 자리를 만들어 두고 **카드 뒤에** 채운다 (TASK-KL-129, 사용자 요청).
         * 찾는 입력은 목록을 접고 있으므로 얇다 — 갈 곳 카드가 먼저 눈에 들어오는 편이 낫다.
         * 만드는 순서는 그대로 두고 화면 순서만 바꾼다: 팔레트가 먼저 붙어 있어야
         * 아래 카드가 그 자리를 기준으로 들어간다. */
        const palette = document.createElement('div');
        palette.className = 'landing-palette';

        /* TASK-KL-098 — 「사람이 있다」를 말이 아니라 **숫자**로 보여 주는 자리.
         * 서버는 도구가 열릴 때마다 세고 있었는데(지금까지 수천 번) 그 수를 화면 어디에도
         * 안 내놨다 — 모으기만 하고 안 쓰면 없는 것과 같다. 값은 전부 실측이고 지어낸 수는
         * 한 개도 없다. 서버에 못 닿거나 아직 0이면 이 자리는 통째로 안 그려진다. */
        const pulse = document.createElement('div');
        pulse.className = 'landing-pulse';
        pulse.id = 'homePulse';
        landing.appendChild(pulse);
        fillHomePulse(pulse);

        const cta = document.createElement('div');
        cta.className = 'landing-cta';
        cta.innerHTML = `
            <div class="landing-cta-grid">
                <button type="button" class="landing-cta-card" onclick="Toolbox.switchPage('favorites')">
                    <div class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></div>
                    <div class="landing-cta-card-title">즐겨찾기</div>
                    <div class="landing-cta-card-desc">자주 쓰는 도구를 모아봐요</div>
                </button>
                <a class="landing-cta-card" href="/karmolab/t/">
                    <div class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg></div>
                    <div class="landing-cta-card-title">도구 목록</div>
                    <div class="landing-cta-card-desc">도구마다 설명이 있는 페이지</div>
                </a>
                <button type="button" class="landing-cta-card" onclick="Toolbox.switchPage('community')">
                    <div class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v10H9l-4 3.5V16H4z"/><path d="M8 10h8M8 13h5"/></svg></div>
                    <div class="landing-cta-card-title">커뮤니티</div>
                    <div class="landing-cta-card-desc">이야기 나누고 도구를 요청해요</div>
                </button>
                <button type="button" class="landing-cta-card" onclick="Toolbox.switchPage('play')">
                    <div class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="11" rx="4"/><path d="M7.5 11v3M6 12.5h3"/><path d="M16 12h.01M18 14.5h.01"/></svg></div>
                    <div class="landing-cta-card-title">놀이터</div>
                    <div class="landing-cta-card-desc">하루 한 판씩 — 맞히기 · 고르기 · 풀기</div>
                </button>
                <button type="button" class="landing-cta-card" onclick="Toolbox.switchPage('docs')">
                    <div class="landing-cta-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
                    <div class="landing-cta-card-title">문서</div>
                    <div class="landing-cta-card-desc">API 레퍼런스 & 가이드</div>
                </button>
            </div>
            <p class="landing-cta-hint">찾는 것이 있으면 아래에 이름을 치세요 · 아무 화면에서나 <kbd>Ctrl</kbd>+<kbd>K</kbd></p>
        `;
        landing.appendChild(cta);

        // 갈 곳 카드가 먼저, 찾는 입력이 그 아래.
        landing.appendChild(palette);
        if (typeof window !== 'undefined' && window.KarmoPalette) {
            window.KarmoPalette.mountInline(palette);
        }

        /* TASK-KL-098 — 첫 화면에서 **사람이 보이는** 유일한 자리.
         * 도구만 늘어선 화면에는 아무도 없는 것처럼 보인다. 최근 이야기 몇 줄이 떠 있어야
         * 「누가 있구나」가 전해진다. 값은 전부 실측이고, 서버에 못 닿거나 글이 없으면
         * 이 자리는 통째로 안 그려진다 (빈 상자는 죽은 화면으로 읽힌다). */
        const feed = document.createElement('div');
        feed.className = 'landing-feed';
        feed.id = 'homeCommunityFeed';
        landing.appendChild(feed);
        fillHomeCommunityFeed(feed);

        return landing;
    }

    /**
     * 도구별 열린 횟수 — 한 화면에서 **한 번만** 받아 온다.
     * 도구를 옮길 때마다 새로 물으면, 그 요청 자체가 「도구를 열었다」를 세는 서버를 계속 두드린다.
     */
    let toolCountsPromise = null;
    function toolCountsOnce() {
        if (toolCountsPromise) return toolCountsPromise;
        const base = (typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase) || '';
        /* 계정 스크립트가 아직 안 왔을 수 있다 — 도구 상세 페이지에서 실제로 그랬다.
         * 그때 빈 답을 **기억해 두면** 그 화면에서는 영영 숫자가 안 뜬다(요소만 비어 있어
         * 아무도 못 알아챈다). 아직 모를 때는 기억하지 않고 다음에 다시 묻는다. */
        if (!base) return Promise.resolve({});
        toolCountsPromise = (async () => {
            try {
                const response = await fetch(base + '/kl/tools/stats');
                if (!response.ok) return {};
                const data = await response.json();
                const map = {};
                for (const row of data.tools || []) map[row.toolId] = row;
                return map;
            } catch (_) {
                return {};
            }
        })();
        return toolCountsPromise;
    }

    /**
     * 도구 이름 밑에 「지금까지 N번 열렸어요」 (사용자 요청 — "그냥 재밌잖아 그런거").
     *
     * 한 번도 안 열린 도구에는 아무것도 안 쓴다. 「0번 열렸어요」는 재미가 아니라 낙인이다.
     */
    /** 계정 스크립트를 기다린다 — 도구 화면은 그것보다 먼저 그려진다. 안 오면 그냥 포기한다. */
    function whenApiBase(timeoutMs = 6000) {
        const has = () => Boolean(typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase);
        if (has()) return Promise.resolve(true);
        return new Promise((resolve) => {
            const started = Date.now();
            const tick = () => {
                if (has()) return resolve(true);
                if (Date.now() - started > timeoutMs) return resolve(false);
                setTimeout(tick, 200);
            };
            tick();
        });
    }

    async function fillToolCount(slot, toolId) {
        if (!slot) return;
        if (!(await whenApiBase())) return;
        const counts = await toolCountsOnce();
        const row = counts[toolId];
        if (!row || !row.total || !slot.isConnected) return;
        const n = (value) => Number(value || 0).toLocaleString('ko-KR');
        slot.innerHTML = '지금까지 <b>' + n(row.total) + '</b>번 열렸어요'
            + (row.recent ? ' · 최근 7일 <b>' + n(row.recent) + '</b>번' : '');
    }

    /** 도구 id 로 사람이 읽는 이름 찾기. 등록된 것 우선, 없으면 지연 메타. 둘 다 없으면 null. */
    function toolTitleFor(id) {
        const registered = tools.find((t) => t.id === id);
        if (registered && registered.title) return registered.title;
        const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
        return (meta[id] && meta[id].title) || null;
    }

    /**
     * 첫 화면의 실사용 줄 — 오늘 몇 번 열렸나 + 이번 주에 많이 쓴 도구.
     *
     * 왜 실측만 쓰나: 이 자리에 한 번이라도 지어낸 수를 넣으면 옆의 진짜 수까지 못 믿을 것이
     * 된다. 그래서 서버에 못 닿거나 아직 한 번도 안 열렸으면 **아무것도 안 그린다** —
     * 「0번 열림」이 떠 있는 화면은 북적이는 게 아니라 죽은 화면으로 읽힌다.
     */
    async function fillHomePulse(slot) {
        const base = (typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase) || '';
        if (!base) return;
        let data;
        try {
            const response = await fetch(base + '/kl/tools/stats');
            if (!response.ok) return;
            data = await response.json();
        } catch (_) {
            return;
        }
        if (!slot.isConnected) return;

        const pulse = (data && data.pulse) || {};
        const visits = (data && data.visits) || {};
        if (!pulse.opensTotal && !visits.total) return;
        const n = (value) => Number(value || 0).toLocaleString('ko-KR');

        // 이름을 못 찾는 도구는 뺀다 — 화면에 id 가 그대로 뜨면 내부 사정이 새어 나온 것처럼 보인다.
        const top = (data.tools || [])
            .map((t) => ({ id: t.toolId, title: toolTitleFor(t.toolId), recent: t.recent, total: t.total }))
            .filter((t) => t.title && t.recent > 0)
            .slice(0, 6);

        /* 블로그의 Total / Today 와 같은 줄 (사용자 요청). 방문이 먼저고 도구 열림이 그다음이다 —
         * 첫 화면만 보고 간 사람도 다녀간 사람인데, 도구 열림만 세면 그 사람은 없는 셈이 된다. */
        const parts = [];
        if (visits.total) {
            // 「명」이라고 쓰면 안 된다 — 이 수는 방문 횟수지 사람 수가 아니다.
            // 사람 수는 하루 단위로만 셀 수 있고(오늘 열쇠만 들고 있으므로), 그 값은 광장에 있다.
            parts.push('지금까지 <b>' + n(visits.total) + '</b>번 다녀갔어요'
                + (visits.today ? ' · 오늘 <b>' + n(visits.today) + '</b>번' : ''));
        }
        if (pulse.opensTotal) {
            parts.push('도구는 <b>' + n(pulse.opensTotal) + '</b>번 열렸고요'
                + (pulse.toolsUsed ? ' (<b>' + n(pulse.toolsUsed) + '</b>개가 실제로 쓰였어요)' : ''));
        }

        const chips = top.map((t) =>
            '<button type="button" class="landing-pulse-chip" data-tool="' + escapeHtml(t.id) + '">'
            + '<span class="landing-pulse-chip-name">' + escapeHtml(t.title) + '</span>'
            + '<span class="landing-pulse-chip-n">' + n(t.recent) + '</span>'
            + '</button>').join('');

        slot.innerHTML = '<p class="landing-pulse-line">' + parts.join(' · ')
            + ' <button type="button" class="landing-pulse-all" data-open-plaza>전부 보기 →</button></p>'
            + (chips ? '<div class="landing-pulse-tools"><span class="landing-pulse-label">이번 주에 많이 쓴 도구</span>' + chips + '</div>' : '');

        const all = slot.querySelector('[data-open-plaza]');
        if (all) all.onclick = () => switchPage('plaza');
        slot.querySelectorAll('[data-tool]').forEach((button) => {
            button.onclick = () => switchPage(button.dataset.tool || 'home');
        });
    }

    /** 첫 화면의 커뮤니티 줄 — 최근 이야기 셋. 실패하면 아무것도 안 그린다 (fail-open). */
    async function fillHomeCommunityFeed(slot) {
        const base = (typeof window !== 'undefined' && window.KarmoAccount && window.KarmoAccount.apiBase) || '';
        if (!base) return;
        let posts = [];
        try {
            const response = await fetch(base + '/kl/recent', { credentials: 'include' });
            if (!response.ok) return;
            const data = await response.json();
            posts = data.posts || [];
        } catch (_) {
            return;
        }
        if (posts.length === 0 || !slot.isConnected) return;

        const rows = posts.slice(0, 3).map((p) => {
            const heading = p.title || String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
            const replies = p.replyCount
                ? '<span class="landing-feed-replies">답글 ' + p.replyCount + '</span>' : '';
            return '<button type="button" class="landing-feed-row" data-post="' + escapeHtml(p.id) + '">'
                + '<span class="landing-feed-title">' + escapeHtml(heading) + '</span>'
                + '<span class="landing-feed-meta">@' + escapeHtml(p.authorHandle) + ' ' + replies + '</span>'
                + '</button>';
        }).join('');

        slot.innerHTML = '<div class="landing-feed-head">'
            + '<span class="landing-feed-name">커뮤니티에서 오가는 이야기</span>'
            + '<button type="button" class="landing-feed-more" data-open-community>전체 보기 →</button>'
            + '</div><div class="landing-feed-rows">' + rows + '</div>';

        const more = slot.querySelector('[data-open-community]');
        if (more) more.onclick = () => switchPage('community');
        slot.querySelectorAll('[data-post]').forEach((button) => {
            button.onclick = () => {
                const search = new URLSearchParams(location.search);
                search.set('p', button.dataset.post || '');
                history.pushState({}, '', location.pathname + '?' + search.toString() + '#community');
                switchPage('community', { pushHistory: false });
            };
        });
    }

    /* ===== Navigation ===== */

    function pageIdFromHash() {
        const h = location.hash ? location.hash.slice(1) : '';
        return h || 'home';
    }

    /**
     * 이 도구가 어느 묶음의 탭으로 들어가 있는지 (없으면 null).
     *
     * 여러 도구를 탭으로 묶으면서 부분은 사이드바에서 숨겼다. 그런데 검색·즐겨찾기·안내 링크는
     * 여전히 부분 이름으로 부른다 — 그때 「없는 화면」 이 되면 안 된다. 묶음으로 보내고 그 탭을 연다.
     *
     * 소속은 매니페스트에서 읽는다. 묶음은 필요할 때 로드되므로 등록된 탭 목록으로는
     * 아직 안 연 묶음을 알 수 없다 (열어본 뒤에만 되는 반쪽 동작이 된다).
     * 도구 상세 페이지에서는 그 도구만 로드되고 묶음이 없으므로, 여기서 나온 묶음이
     * 실제로 로드돼 있을 때만 옮긴다.
     */
    function findBundleFor(id) {
        const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
        const bundleId = meta[id] && meta[id].bundle;
        if (!bundleId) return null;
        return tools.some((t) => t.id === bundleId) ? bundleId : null;
    }

    function switchPage(pageId, opts = {}) {
        closeAllHeaderNav();
        let { pushHistory = true, skipRecent = false } = opts;

        // TASK-KL-088: 도구 상세 페이지(/karmolab/t/<id>/)에서 다른 도구로 옮기면
        // 그 도구의 *자기 URL* 로 실제 이동한다. 같은 경로에 해시만 바꾸면 페이지 제목·
        // 설명이 이전 도구 것으로 남아 URL 과 내용이 어긋난다.
        const entryTool = (typeof window !== 'undefined' && window.KARMOLAB_ENTRY_TOOL) || null;
        /* TASK-KL-129: 도구 목록처럼 본문이 박혀 있는 페이지도 마찬가지다 — 여기엔 도구를 그릴
         * 자리가 없다(위젯을 하나도 안 실었다). 고른 도구의 제 주소로 실제로 옮겨 간다. */
        const entryStatic = (typeof window !== 'undefined' && window.KARMOLAB_ENTRY_STATIC) || null;
        if ((entryTool && pageId !== entryTool) || entryStatic) {
            const pages = (typeof window !== 'undefined' && window.KARMOLAB_TOOL_PAGES) || [];
            location.href = pageId === 'home'
                ? '/karmolab/'
                : (pages.indexOf(pageId) >= 0 ? '/karmolab/t/' + pageId + '/' : '/karmolab/#' + pageId);
            return;
        }
        // 묶음의 탭으로 들어간 도구를 이름으로 부르면, 묶음을 열고 그 탭을 편다.
        // 단 도구 상세 페이지는 그 도구 하나를 보여주는 자리다 - 여기서 묶음으로 튕기면 빈 화면이 된다.
        const bundleId = findBundleFor(pageId);
        if (bundleId && !entryTool) {
            // TASK-KL-099 — 「최근」 에는 *사람이 고른 이름* 이 남아야 한다.
            // 「글자수 세기」를 골랐는데 최근에 「텍스트 도구」가 뜨면, 다음에 그 이름을
            // 찾을 수 없다 (실제로 검사가 이걸 잡았다). 묶음으로 옮기기 **전에** 적고,
            // 뒤이은 묶음 호출은 안 적게 막는다.
            window.KarmoPalette?.noteOpen(pageId);
            switchPage(bundleId, { ...opts, skipRecent: true });
            /* 그 탭이 **아직 없을 수 있다** (TASK-KL-133).
             * 묶음 위젯은 열 때 받아 오므로, 주소로 바로 들어온 경우 여기서 탭 단추가 아직
             * 안 그려져 있다 — 그러면 이 호출이 조용히 아무 일도 안 하고 첫 탭이 열린 채로
             * 남는다. 실제로 `#크기 맞추기`·`#글 → PDF` 로 들어오면 늘 엉뚱한 탭이었다.
             * 받아 오는 것이 끝난 뒤 한 번 더 부른다 — 이미 열려 있으면 그대로다. */
            if (!switchTab(pageId)) {
                void Promise.resolve(kickLazyLoad(bundleId)).then(() => {
                    requestAnimationFrame(() => switchTab(pageId));
                });
            }
            return;
        }
        const base = location.pathname + (location.search || '');
        const denied = tools.find(t => t.id === pageId);
        if (denied && isDesktopOnlyTool(denied) && !isDesktopApp()) {
            history.replaceState({ pageId: 'home' }, '', base + '#home');
            pageId = 'home';
            pushHistory = false;
        }
        const urlWithHash = base + '#' + pageId;
        if (pushHistory) {
            history.pushState({ pageId }, '', urlWithHash);
        }
        /* 이 화면이 아직 없으면 지금 만든다 (TASK-KL-128 런타임 — 부팅 때 전부 안 만든다). */
        ensureToolPage(pageId);

        const landing = document.getElementById('page-home');
        const allPages = document.querySelectorAll('.tool-page');
        const allNav = document.querySelectorAll('.nav-item');
        const headerHomeBtn = document.getElementById('headerHomeBtn');
        const breadcrumb = document.getElementById('breadcrumb');

        const toolForPage = tools.find(t => t.id === pageId);
        if (toolForPage && toolForPage._deferred) {
            kickLazyLoad(pageId);
        }

        // TASK-KL-088: 도구 열림 = 페이지뷰. 도구 상세 페이지와 같은 경로로 기록해 합산되게 한다.
        currentPageId = pageId;
        /* 지금 어느 화면인지 뿌리에 적어 둔다 — 장식은 도구 화면에서 한 겹 물러난다.
           첫 화면에선 주인공이고, 도구 화면에선 읽는 것을 방해하면 안 된다 (TASK-KL-101). */
        document.documentElement.setAttribute('data-view', pageId === 'home' ? 'home' : 'tool');
        window.KarmoStat?.page(pageId, toolForPage ? toolForPage.title : undefined);
        // TASK-KL-099 — 「최근」 은 여기서 쌓인다. 도구를 여는 길이 이 함수 하나뿐이라
        // 화면마다 따로 적을 필요가 없다 (팔레트·메뉴·주소·즐겨찾기 전부 여기를 지난다).
        if (!skipRecent) window.KarmoPalette?.noteOpen(pageId);

        allPages.forEach(p => p.classList.remove('active'));
        allNav.forEach(n => n.classList.remove('active'));
        if (headerHomeBtn) headerHomeBtn.classList.remove('active');
        if (landing) landing.classList.remove('active');

        if (pageId === 'home') {
            if (landing) landing.classList.add('active');
            if (headerHomeBtn) headerHomeBtn.classList.add('active');
            document.querySelectorAll('[data-page="home"]').forEach(n => n.classList.add('active'));
            document.getElementById('pageTitle').textContent = 'KarmoLab';
            if (breadcrumb) breadcrumb.innerHTML = '';
            try { localStorage.setItem(LAST_PAGE_KEY, 'home'); } catch (_) {}
            // TASK-KL-099 — 첫 화면이 실제로 보이게 된 다음에 포커스를 준다. 그리기 전에
            // 주면 화면이 튄다. 최근 목록도 이때 다시 그린다 — 도구를 쓰고 돌아왔으면
            // 그것이 맨 위여야 한다.
            /* 첫 화면에 들어서자마자 찾는 칸을 잡지 않는다 (TASK-KL-129, 사용자 요청).
             * 잡으면 목록이 곧바로 펼쳐져, 접어 둔 뜻이 없어진다 — 아직 아무것도 안 물어봤는데
             * 답이 먼저 나와 화면 절반을 차지한다. 칠 마음이 있는 사람은 누르거나 ⌘K 를 쓴다. */
            requestAnimationFrame(() => {
                window.KarmoPalette?.refresh();
            });
            if (typeof Mdd !== 'undefined') {
                Mdd.linePreset('home_hub');
            }
            return;
        }

        const page = document.getElementById('page-' + pageId);
        if (page) {
            page.classList.add('active');
            try { localStorage.setItem(LAST_PAGE_KEY, pageId); } catch (_) {}
        }
        document.querySelectorAll(`[data-page="${pageId}"]`).forEach(n => n.classList.add('active'));

        const userBtn = document.getElementById('userPageBtn');
        if (userBtn) userBtn.classList.toggle('active', pageId === 'user');

        const tool = tools.find(t => t.id === pageId);
        if (tool) {
            document.getElementById('pageTitle').textContent = tool.title;
            if (breadcrumb && tool.category) {
                const cat = CATEGORIES.find(c => c.id === tool.category);
                breadcrumb.innerHTML = `
                    <button class="breadcrumb-link" onclick="Toolbox.switchPage('home')">KarmoLab</button>
                    <span class="breadcrumb-sep">/</span>
                    <span class="breadcrumb-current">${cat ? cat.label : ''}</span>
                `;
            } else if (breadcrumb) {
                breadcrumb.innerHTML = `<button class="breadcrumb-link" onclick="Toolbox.switchPage('home')">KarmoLab</button>`;
            }
        }
    }

    function switchTab(btn, tabId?) {
        if (typeof btn === 'string') {
            tabId = btn;
            btn = document.querySelector(`[data-tab-id="${tabId}"]`);
            /* 그 탭 단추가 아직 없으면 **못 열었다고 알린다** — 부르는 쪽이 다시 시도할 수 있게.
             * 묶음 위젯을 아직 받아 오는 중이면 이런 일이 생긴다 (TASK-KL-133). */
            if (!btn) return false;
        }
        const tabRow = btn.closest('.tab-row');
        const page = btn.closest('.tool-page');
        tabRow.querySelectorAll('.tab-btn').forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        page.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        // 탭 줄은 좁은 화면에서 옆으로 밀린다 — 고른 탭이 화면 밖이면 끌어다 보여준다.
        btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        // 패널을 문서 전체에서 id 로 찾으면 안 된다 — 탭 이름은 위젯마다 겹칠 수 있어서
        // (여러 도구를 탭으로 묶으면 특히) 다른 도구 페이지의 패널을 열어 버린다. 이 페이지 안에서 찾는다.
        const panel = page.querySelector('[data-tab-panel="' + tabId + '"]');
        buildLazyPanel(panel);
        panel?.classList.add('active');
        return true;
    }

    /** lazyTabs 위젯의 아직 안 그린 탭 — 처음 열릴 때 그린다 (buildToolPage 참고). */
    function buildLazyPanel(panel) {
        if (!panel || !panel._lazyBuild) return;
        const build = panel._lazyBuild;
        const owner = panel._lazyOwner;
        panel._lazyBuild = null;
        runBuild(owner, () => build(panel));
    }

    /* ===== Page Builder ===== */

    /**
     * 그 도구의 화면이 DOM 에 없으면 만들어 붙인다 (TASK-KL-128 런타임).
     *
     * 부팅 때 전부 만들지 않으므로, **여는 길이라면 어디로 오든** 여기를 지나야 한다.
     * 지금 그 길은 `switchPage` 하나다 (팔레트·메뉴·주소·즐겨찾기 전부 그리로 온다).
     */
    function ensureToolPage(pageId) {
        if (!pageId || pageId === 'home') return null;
        const host = document.getElementById('tool-pages');
        if (!host) return null;
        const existing = document.getElementById('page-' + pageId);
        if (existing) return existing;
        const tool = tools.find(t => t.id === pageId);
        if (!tool || !tool.tabs) return null;
        if (isDesktopOnlyTool(tool) && !isDesktopApp()) return null;
        const built = buildToolPage(tool);
        host.appendChild(built);
        return built;
    }

    function buildToolPage(tool) {
        const div = document.createElement('div');
        div.className = 'tool-page';
        if (tool.layout) div.classList.add('layout-' + tool.layout);
        div.id = 'page-' + tool.id;

        if (tool.noHero !== true) {
            const hero = document.createElement('div');
            hero.className = 'tool-page-hero';
            hero.innerHTML =
                `<h1 class="tool-page-hero-title">${tool.title}</h1>` +
                (tool.desc ? `<p class="tool-page-hero-desc">${tool.desc}</p>` : '') +
                `<p class="tool-page-hero-count" data-count-for="${escapeHtml(tool.id)}"></p>`;
            div.appendChild(hero);
            fillToolCount(hero.querySelector('[data-count-for]'), tool.id);
            mountPinStar(hero, tool.id);
        }

        let panelsHost: HTMLElement = div;

        if (tool.tabs.length > 1) {
            const tabRow = document.createElement('div');
            tabRow.className = 'tab-row';
            if (tool.tabLayout === 'sidebar') {
                tabRow.classList.add('tab-row--sidebar');
                tabRow.setAttribute('role', 'tablist');
                tabRow.setAttribute('aria-orientation', 'vertical');
            }
            tool.tabs.forEach((tab, i) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
                btn.dataset.tabId = tab.id;
                btn.textContent = tab.label;
                btn.setAttribute('role', 'tab');
                btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
                btn.onclick = function () { switchTab(this, tab.id); };
                tabRow.appendChild(btn);
            });

            if (tool.tabLayout === 'sidebar') {
                const wrap = document.createElement('div');
                wrap.className = 'tool-tab-sidebar-layout';
                wrap.appendChild(tabRow);
                const col = document.createElement('div');
                col.className = 'tab-panels-column';
                wrap.appendChild(col);
                div.appendChild(wrap);
                panelsHost = col;
            } else {
                div.appendChild(tabRow);
            }
        }

        tool.tabs.forEach((tab, i) => {
            const panel = document.createElement('div');
            panel.className = 'tab-panel' + (i === 0 ? ' active' : '');
            panel.id = 'panel-' + tool.id + '-' + tab.id;
            panel.dataset.tabPanel = tab.id;
            panel.setAttribute('role', 'tabpanel');
            // 여러 도구를 탭으로 묶은 위젯은 전부 미리 그리면 안 본 탭까지 만들어진다
            // (무거운 화면·타이머·저장소 접근이 헛돈다). lazyTabs 면 처음 열릴 때 그린다.
            if (tool.lazyTabs === true && i > 0) {
                panel._lazyBuild = tab.build;
                panel._lazyOwner = tool.id;
            } else {
                runBuild(tool.id, () => tab.build(panel));
            }
            panelsHost.appendChild(panel);
        });

        appendToolFooter(div, tool);
        return div;
    }

    /**
     * 도구를 다 쓴 사람에게 **다음 자리**를 알려 준다 (TASK-KL-098).
     *
     * 도구 상세 페이지 128장은 검색으로 들어오는 정문인데, 거기서 이 사이트의 나머지로 가는
     * 길이 하나도 없었다 — 도구 하나 쓰고 닫으면 끝이다. 그 사람은 커뮤니티가 있는 줄도,
     * 숫자를 다 열어 둔 줄도 모른다.
     *
     * 도구 화면 맨 아래에만 둔다. 위쪽은 도구의 자리다 — 일하러 온 사람을 붙잡지 않는다.
     */
    function appendToolFooter(page, tool) {
        if (tool.noHero === true) return;
        const footer = document.createElement('div');
        footer.className = 'tool-page-next';
        footer.innerHTML =
            '<div class="tool-page-next-head">여기도 있어요</div>' +
            '<div class="tool-page-next-links">' +
            '<button type="button" class="tool-page-next-link" data-next="community">' +
            '<b>커뮤니티</b><span>안 되는 것·있었으면 하는 도구를 남기는 곳</span></button>' +
            '<button type="button" class="tool-page-next-link" data-next="plaza">' +
            '<b>광장</b><span>이 사이트의 숫자를 전부 열어 둔 곳</span></button>' +
            '<a class="tool-page-next-link" href="/karmolab/t/">' +
            '<b>도구 전체</b><span>비슷한 일을 하는 다른 도구들</span></a>' +
            '</div>';
        footer.querySelectorAll('[data-next]').forEach((button) => {
            button.onclick = () => switchPage(button.dataset.next);
        });
        page.appendChild(footer);
    }

    /* ===== Shared Helpers ===== */

    function showToast(msg: string, type = 'success', detail?: unknown) {
        const t = document.getElementById('statusToast');
        if (!t) return;
        const hasDetail = detail !== undefined && detail !== null && detail !== '';
        const detailText = typeof detail === 'string' ? detail : (detail && detail.message) ? detail.message + (detail.stack ? '\n' + detail.stack : '') : '';
        if (hasDetail && detailText) {
            t.className = 'status-toast visible has-detail ' + type;
            const fullText = msg + '\n\n' + detailText;
            t.innerHTML = '<span class="status-toast-msg">' + escapeHtml(msg) + '</span><button type="button" class="status-toast-copy" title="복사">📋</button>';
            t.onclick = null;
            const copyBtn = t.querySelector('.status-toast-copy');
            if (copyBtn) {
                copyBtn.onclick = function (ev) {
                    ev.stopPropagation();
                    if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(fullText).then(() => showToast('클립보드에 복사됨'));
                    } else {
                        const ta = document.createElement('textarea');
                        ta.value = fullText;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        showToast('클립보드에 복사됨');
                    }
                };
            }
            t.style.pointerEvents = 'auto';
            clearTimeout(t._toastHide);
            t._toastHide = setTimeout(() => {
                t.classList.remove('visible');
                t.onclick = null;
                t.style.pointerEvents = '';
            }, 5000);
            mirrorToastToDesktop(msg, type, detailText);
        } else {
            t.textContent = msg;
            t.className = 'status-toast visible ' + type;
            t.onclick = null;
            t.style.pointerEvents = '';
            clearTimeout(t._toastHide);
            t._toastHide = setTimeout(() => t.classList.remove('visible'), 2500);
            mirrorToastToDesktop(msg, type, '');
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatTimestamp(ts) {
        const d = new Date(ts);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function showLightbox(imageUrl) {
        let overlay = document.querySelector('.tb-lightbox-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'tb-lightbox-overlay';
            overlay.onclick = () => overlay.remove();
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="확대 이미지">`;
    }

    function displayResult(prefix, title, content, timeTaken, isError = false) {
        const box = document.getElementById(prefix + 'Result');
        const label = document.getElementById(prefix + 'ResultLabel');
        const area = document.getElementById(prefix + 'ResultContent');
        if (label) label.textContent = title + (timeTaken ? ` · ${timeTaken.toFixed(2)}s` : '');
        if (label) label.className = 'result-label ' + (isError ? 'error' : 'success');
        if (area) area.textContent = content;
        if (box) box.classList.add('visible');
    }

    function copyResult(contentId) {
        const text = document.getElementById(contentId).textContent;
        copyText(text);
    }

    /**
     * 복사 단일 seam (TASK-KL-088) — 클립보드 API + 구형 fallback + 토스트 + 계측을 한 곳에.
     * 위젯마다 클립보드 코드를 복제하면 「실제로 결과를 얻었다」 신호가 20 갈래로 흩어진다.
     * 보내는 것은 현재 도구 id 와 동작 이름뿐 — 복사한 내용은 절대 싣지 않는다.
     */
    function copyText(text, opts = {}) {
        if (!text) return Promise.resolve(false);
        const { message = '클립보드에 복사됨', action = 'copy', toolId = currentPageId } = opts;
        const done = (ok) => {
            if (ok) {
                showToast(message);
                if (toolId && toolId !== 'home') window.KarmoStat?.use(toolId, action);
            }
            return ok;
        };
        if (navigator.clipboard?.writeText) {
            return navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return Promise.resolve(done(true));
        } catch (_) {
            return Promise.resolve(done(false));
        }
    }

    /** 복사 외의 「결과를 얻었다」 신호 (생성·변환·저장 등) */
    function trackUse(action, toolId = null) {
        const id = toolId || currentPageId;
        if (id && id !== 'home') window.KarmoStat?.use(id, action);
    }

    function toggleCollapsible(trigger) {
        trigger.classList.toggle('open');
        trigger.nextElementSibling.classList.toggle('open');
    }

    function field(container, { tag = 'textarea', id, label, placeholder, type, topRight, mono }) {
        const g = document.createElement('div');
        g.className = 'field-group';
        if (topRight) {
            const row = document.createElement('div');
            row.className = 'field-row';
            row.style.marginBottom = '6px';
            const lbl = document.createElement('label');
            lbl.className = 'field-label'; lbl.style.marginBottom = '0';
            lbl.htmlFor = id; lbl.textContent = label;
            row.appendChild(lbl); row.appendChild(topRight);
            g.appendChild(row);
        } else {
            const lbl = document.createElement('label');
            lbl.className = 'field-label'; lbl.htmlFor = id; lbl.textContent = label;
            g.appendChild(lbl);
        }
        const el = document.createElement(tag);
        el.id = id; el.placeholder = placeholder || '';
        if (type) el.type = type;
        if (mono) el.className = 'mono-input';
        g.appendChild(el);
        container.appendChild(g);
        return el;
    }

    function resultBox(container, prefix) {
        const box = document.createElement('div');
        box.className = 'result-box'; box.id = prefix + 'Result';
        box.innerHTML = `<div class="result-header"><span class="result-label" id="${prefix}ResultLabel">결과</span><button class="btn-ghost" onclick="Toolbox.copyResult('${prefix}ResultContent')">복사</button></div><pre class="result-content" id="${prefix}ResultContent"></pre>`;
        container.appendChild(box);
    }

    function button(container, { text, onclick, style }) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary'; btn.textContent = text; btn.onclick = onclick;
        if (style) btn.setAttribute('style', style);
        container.appendChild(btn);
    }

    function select(container, { id, label, options, onChange }) {
        const g = document.createElement('div');
        g.className = 'field-group';
        const lbl = document.createElement('label');
        lbl.className = 'field-label'; lbl.htmlFor = id; lbl.textContent = label;
        g.appendChild(lbl);
        const sel = document.createElement('select');
        sel.id = id;
        options.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value; opt.textContent = o.label;
            sel.appendChild(opt);
        });
        if (onChange) sel.onchange = onChange;
        g.appendChild(sel);
        container.appendChild(g);
        return sel;
    }

    /* ===== 테마 (라이트/다크) ===== */
    const THEME_KEY = 'toolbox_theme';

    function getTheme() { return localStorage.getItem(THEME_KEY) || 'dark'; }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
        syncThemeColor();
    }

    function toggleTheme() {
        const next = getTheme() === 'dark' ? 'light' : 'dark';
        setTheme(next);
    }

    /* ===== 배경 테마 (mesh/gradient) ===== */
    const BG_THEME_KEY = 'toolbox_bg_theme';
    const BG_THEMES = [
        { id: 'observatory', label: '관측실' },
        { id: 'blue-magenta', label: '블루 매젠타' },
        { id: 'mesh-dots', label: '메쉬 도트' },
        { id: 'aurora', label: '오로라' },
        { id: 'subtle', label: '은은한' },
        { id: 'minimal', label: '미니멀' },
    ];

    function getBgTheme() {
        const saved = localStorage.getItem(BG_THEME_KEY);
        if (saved && BG_THEMES.some(t => t.id === saved)) return saved;
        return 'observatory';
    }

    /** 주소창·넘겨 스크롤한 자리의 색을 **지금 바탕색 그대로** 맞춘다 (TASK-KL-101).
     *  값을 손으로 적지 않고 CSS 에서 읽는다 — 두 벌로 적으면 테마를 손볼 때 한쪽만 바뀐다.
     *  안 맞추면 밝은 테마에서 스크롤 끝에 검은 띠가 보인다(폰에서 그렇게 나가고 있었다). */
    function syncThemeColor() {
        const meta = document.getElementById('themeColorMeta');
        if (!meta) return;
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-void').trim();
        if (bg) meta.setAttribute('content', bg);
    }

    function setBgTheme(bgId) {
        document.documentElement.setAttribute('data-bg', bgId);
        localStorage.setItem(BG_THEME_KEY, bgId);
    }

    function getBgThemes() { return [...BG_THEMES]; }

    /* ===== Prism 코드 테마 ===== */
    const PRISM_THEME_KEY = 'toolbox_prism_theme';
    const PRISM_BASE = '/apps/karmolab/js/vendor/prism/themes-cdn';
    const PRISM_EXT = '/apps/karmolab/js/vendor/prism/themes-ext';

    const PRISM_THEMES = [
        { id: 'tomorrow', label: 'Tomorrow Night', url: `${PRISM_BASE}/prism-tomorrow.min.css` },
        { id: 'dracula', label: 'Dracula', url: `${PRISM_EXT}/prism-dracula.min.css` },
        { id: 'one-dark', label: 'One Dark', url: `${PRISM_EXT}/prism-one-dark.min.css` },
        { id: 'nord', label: 'Nord', url: `${PRISM_EXT}/prism-nord.min.css` },
        { id: 'material-dark', label: 'Material Dark', url: `${PRISM_EXT}/prism-material-dark.min.css` },
        { id: 'vsc-dark-plus', label: 'VS Dark+', url: `${PRISM_EXT}/prism-vsc-dark-plus.min.css` },
        { id: 'okaidia', label: 'Okaidia', url: `${PRISM_BASE}/prism-okaidia.min.css` },
        { id: 'twilight', label: 'Twilight', url: `${PRISM_BASE}/prism-twilight.min.css` },
        { id: 'prism', label: 'Default (라이트)', url: `${PRISM_BASE}/prism.min.css` },
        { id: 'ghcolors', label: 'GitHub', url: `${PRISM_EXT}/prism-ghcolors.min.css` },
        { id: 'one-light', label: 'One Light', url: `${PRISM_EXT}/prism-one-light.min.css` },
        { id: 'material-light', label: 'Material Light', url: `${PRISM_EXT}/prism-material-light.min.css` },
        { id: 'coy', label: 'Coy', url: `${PRISM_BASE}/prism-coy.min.css` },
    ];

    function getPrismTheme() {
        const saved = localStorage.getItem(PRISM_THEME_KEY);
        if (saved && PRISM_THEMES.some(t => t.id === saved)) return saved;
        return getTheme() === 'light' ? 'ghcolors' : 'tomorrow';
    }

    function setPrismTheme(themeId: string, silent = false) {
        const t = PRISM_THEMES.find(x => x.id === themeId);
        if (!t) return;
        localStorage.setItem(PRISM_THEME_KEY, themeId);
        document.getElementById('prism-theme-inject')?.remove();
        const oldLink = document.getElementById('prism-css');

        // 이미 그 테마가 걸려 있으면 다시 받지 않는다 (TASK-KL-089).
        // 시작할 때도 이 함수를 부르는데, 그때마다 주소 끝에 시각을 붙여 새로 받는 바람에
        // 셸이 부른 것과 합쳐 같은 파일을 두 번 받고 있었다.
        const already = (oldLink as HTMLLinkElement | null)?.getAttribute('href') || '';
        if (already.split('?')[0].endsWith(t.url.split('/').pop() || ' ')) {
            if (!silent) showToast('코드 테마: ' + t.label);
            return;
        }

        // 주소 뒤에 시각을 붙이지 않는다 (TASK-KL-088, slot-D 지적).
        // 이 파일들은 우리가 직접 담아 둔 것이라 우리가 바꿀 때만 바뀐다. 그런데 시각을 붙이면
        // 브라우저가 저장해 둔 것을 못 써서 방문마다 다시 받았다. 빌드 번호도 마찬가지다 —
        // 파일은 그대로인데 배포할 때마다 새 주소가 된다. 떼면 평범한 캐시가 그대로 듣는다.
        const url = t.url;
        const newLink = document.createElement('link');
        newLink.rel = 'stylesheet';
        newLink.href = url;
        newLink.onload = () => {
            if (oldLink) oldLink.remove();
            newLink.id = 'prism-css';
            if (!silent) showToast('코드 테마: ' + t.label);
        };
        newLink.onerror = () => {
            newLink.remove();
            if (oldLink) oldLink.href = t.url;
            showToast('코드 테마 로드 실패', 'error');
        };
        (oldLink ? oldLink.parentNode : document.head).appendChild(newLink);
    }

    function initTheme() {
        setTheme(getTheme());
        setBgTheme(getBgTheme());
        setNavLayout(getNavLayout());
        const btn = document.getElementById('themeToggle');
        if (btn) btn.onclick = toggleTheme;
        setPrismTheme(getPrismTheme(), true);
    }

    /* ===== 설정 저장소 ===== */
    const PREFS_KEY = 'toolbox_widget_prefs';

    function getPrefs() {
        try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
        catch (_) { return {}; }
    }

    function setPref(key, value) {
        const prefs = getPrefs();
        prefs[key] = value;
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    }

    function getPref(key, fallback) {
        syncThemeColor();   // 첫 화면이 그려질 때도 한 번 맞춘다
        const v = getPrefs()[key];
        return v !== undefined ? v : fallback;
    }

    /* ===== 사용량 추적 ===== */
    const USAGE_KEY = 'toolbox_usage_stats';

    function getUsageStats() {
        try { return JSON.parse(localStorage.getItem(USAGE_KEY)) || {}; }
        catch (_) { return {}; }
    }

    function saveUsageStats(stats) {
        localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
    }

    const DAILY_WARN_THRESHOLDS = { chat: 50, image: 20, tokens: 500000 };

    function recordUsage(type, tokens) {
        const stats = getUsageStats();
        const today = new Date().toISOString().slice(0, 10);
        if (!stats[today]) stats[today] = { chatCount: 0, chatTokens: 0, imageCount: 0, imageTokens: 0 };
        let totalChat = 0, totalImage = 0;
        Object.values(stats).forEach(s => { totalChat += s.chatCount || 0; totalImage += s.imageCount || 0; });
        if (type === 'chat') {
            stats[today].chatCount++;
            stats[today].chatTokens += (tokens || 0);
            if (totalChat === 0) completeAchievement('first_chat', { title: '첫 대화' });
        } else if (type === 'image') {
            stats[today].imageCount++;
            stats[today].imageTokens += (tokens || 0);
            if (totalImage === 0) completeAchievement('first_image', { title: '첫 이미지 생성' });
        }
        saveUsageStats(stats);

        const d = stats[today];
        const totalDailyTokens = (d.chatTokens || 0) + (d.imageTokens || 0);
        if (type === 'chat' && d.chatCount === DAILY_WARN_THRESHOLDS.chat) {
            showToast(`오늘 채팅 ${DAILY_WARN_THRESHOLDS.chat}회 도달. API 사용량에 유의하세요.`, 'error');
        } else if (type === 'image' && d.imageCount === DAILY_WARN_THRESHOLDS.image) {
            showToast(`오늘 이미지 ${DAILY_WARN_THRESHOLDS.image}회 도달. API 사용량에 유의하세요.`, 'error');
        } else if (totalDailyTokens >= DAILY_WARN_THRESHOLDS.tokens && (totalDailyTokens - (tokens || 0)) < DAILY_WARN_THRESHOLDS.tokens) {
            showToast(`오늘 총 토큰 ${(DAILY_WARN_THRESHOLDS.tokens / 1000).toFixed(0)}K 도달. API 사용량에 유의하세요.`, 'error');
        }
    }

    /* ===== 유저 데이터 (도전과제, 뱃지, 진행도) ===== */
    const USER_DATA_KEY = 'toolbox_user_data';
    const ACHIEVEMENT_REGISTRY = {};
    const BADGE_REGISTRY = {};

    function getUserData() {
        try {
            const raw = localStorage.getItem(USER_DATA_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (!data.streaks || typeof data.streaks !== 'object') data.streaks = {};
                return data;
            }
        } catch (_) {}
        return { achievements: [], badges: [], progress: {}, streaks: {} };
    }

    function getStreaks() {
        const data = getUserData();
        return (data.streaks && typeof data.streaks === 'object') ? data.streaks : {};
    }

    function saveUserData(data) {
        try { localStorage.setItem(USER_DATA_KEY, JSON.stringify(data)); } catch (_) {}
    }

    function getProgress(key) {
        const data = getUserData();
        return (data.progress && data.progress[key]) || 0;
    }

    function setProgress(key, value) {
        const data = getUserData();
        if (!data.progress) data.progress = {};
        data.progress[key] = value;
        saveUserData(data);
        return value;
    }

    function incrementProgress(key, amount = 1) {
        return setProgress(key, getProgress(key) + amount);
    }

    function completeAchievement(id, meta = {}) {
        const data = getUserData();
        if (!data.achievements) data.achievements = [];
        if (data.achievements.includes(id)) return false;
        data.achievements.push(id);
        saveUserData(data);
        const title = meta.title || ACHIEVEMENT_REGISTRY[id]?.title || id;
        showToast('도전과제 달성: ' + title, 'success');
        return true;
    }

    function unlockBadge(id, meta = {}) {
        const data = getUserData();
        if (!data.badges) data.badges = [];
        if (data.badges.includes(id)) return false;
        data.badges.push(id);
        saveUserData(data);
        const title = meta.title || BADGE_REGISTRY[id]?.title || id;
        showToast('뱃지 획득: ' + title, 'success');
        return true;
    }

    function registerAchievement(id, def) { ACHIEVEMENT_REGISTRY[id] = def; }
    function registerBadge(id, def) { BADGE_REGISTRY[id] = def; }
    function hasAchievement(id) { return (getUserData().achievements || []).includes(id); }
    function hasBadge(id) { return (getUserData().badges || []).includes(id); }

    function getTools() { return [...tools]; }

    /**
     * 다른 위젯의 첫 탭을 이 자리에 그린다 — 여러 도구를 한 위젯의 탭으로 묶을 때 쓰는 통로.
     * 묶음 위젯이 부분의 화면을 복제하지 않게 해서, 고칠 곳이 언제나 한 군데로 남는다.
     * (부분 위젯은 hidden 으로 두되 자기 주소는 유지하는 것이 기본 — 검색 유입을 잃지 않는다.)
     */
    function mountTool(id, container) {
        const tool = tools.find((t) => t.id === id);
        const tab = tool && tool.tabs && tool.tabs[0];
        if (!tab) {
            container.innerHTML = '<div class="tool-status error">「' + id + '」 를 불러오지 못했어요.</div>';
            return false;
        }
        runBuild(id, () => tab.build(container));
        return true;
    }

    return {
        register, registerDeferred, init, initTheme, switchPage, switchTab, getTools, mountTool, findBundleFor,
        onDispose,
        // 결과를 옆 도구로 넘기기 (TASK-KL-133)
        offerNext, offerResult, takeResult, peekResult, toolsAccepting, onHandoff,
        getCategories,
        isDesktopApp,
        kickLazyLoad, ensureScript, getLazyWidgetPublicMeta, renderInline, upgradeMeta,
        // 로더도 이 해석기를 쓴다 (KL-103). 예전에는 로더가 제 규칙으로 주소를 만들어서
        // 앞머리(vendor/·root/·world/)를 모른 채 늘 js/widgets/ 밑을 찾았다 — 실서비스에서
        // 도구 셋이 라이브러리를 못 받고 있었다. 규칙을 두 벌 두지 않는다.
        resolveScriptPath,
        showToast, displayResult, copyResult, copyText, trackUse, toggleCollapsible,
        field, resultBox, button, select,
        escapeHtml, formatTimestamp, showLightbox,
        recordUsage, getUsageStats,
        getPref, setPref,
        getNavLayout, setNavLayout,
        getTheme, setTheme, toggleTheme,
        getBgTheme, setBgTheme, getBgThemes,
        getPrismTheme, setPrismTheme, getPrismThemes: () => [...PRISM_THEMES],
        getUserData, getStreaks, getProgress, setProgress, incrementProgress,
        completeAchievement, unlockBadge, hasAchievement, hasBadge,
        registerAchievement, registerBadge,
        getAchievementRegistry: () => ({ ...ACHIEVEMENT_REGISTRY }),
        getBadgeRegistry: () => ({ ...BADGE_REGISTRY }),
        getToolMeta, CATEGORIES,
    };
})();

/* ===== Bootstrap ===== */
/* widgets-loader.js가 위젯 로드 후 init 호출 */
