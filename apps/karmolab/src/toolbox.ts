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
    /** 도구가 아니라 **사이트 자신**인 화면 (TASK-KL-139). 도구용 장치(다음 자리 안내 등)를 안 붙인다. */
    const SYSTEM_PAGES = new Set(['user', 'settings', 'status']);

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
    /* 누르는 것이 **불러오는 것보다 빠를 때** 그 화면을 살린다 (TASK-KL-139).
     *
     * 실측: 첫 화면에서 부팅 3초 안에 「내 정보」로 옮기면 그 화면은 껍데기(제목만)로 남고
     * 15초를 기다려도 안 채워졌다. `switchPage` 가 화면을 만들려 한 시점에 그 위젯이 아직
     * 등록 전이라 만들 것이 없었고, 뒤늦게 등록돼도 **아무도 다시 만들지 않았다**.
     * 등록은 늦게 와도 되지만, 그때 보고 있는 화면이 자기 것이면 그 자리는 자기가 채워야 한다. */
    function buildLatePageIfShowing(id) {
        if (currentPageId !== id || document.getElementById('page-' + id)) return;
        const page = ensureToolPage(id);
        if (!page) return;
        document.querySelectorAll('.tool-page').forEach(p => p.classList.remove('active'));
        page.classList.add('active');
    }

    function register(config) {
        const idx = tools.findIndex(t => t.id === config.id);
        if (idx < 0) {
            tools.push(config);
            /* 처음 등록이어도 **그 자리에 화면이 이미 있을 수 있다** — 빌드 때 미리 그려 둔
               그림이다 (TASK-KL-135). 그건 HTML 을 떠 온 것이라 어떤 단추에도 손이 안 달려 있다.
               여기서 안 갈아 끼우면 그 도구는 **영영 죽은 채로 남는다** — 보이는데 눌러도 아무
               일이 안 난다. 실제로 로컬에서 미리 그린 대출 상환표가 8초가 지나도 죽어 있었다.
               (목록에 미리 올라와 있는 도구는 아래 갈래로 가서 여태 이 문제가 안 보였다.) */
            rebuildToolPageIfInDom(config.id);
            buildLatePageIfShowing(config.id);
            return;
        }

        const wasDeferred = !!tools[idx]._deferred;
        // 옛 것이 걸어 둔 타이머·리스너를 먼저 거둔다. 순서가 뒤면 새 것이 건 것까지 거둔다.
        if (!wasDeferred) disposeTool(config.id);
        tools[idx] = wasDeferred ? { ...config, _deferred: false } : config;
        rebuildToolPageIfInDom(config.id);
        buildLatePageIfShowing(config.id);
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
        const 손댄것 = takeUserState(old);
        const nu = buildToolPage(tool);
        if (wasActive) nu.classList.add('active');
        old.replaceWith(nu);
        putUserState(nu, 손댄것);
    }

    /* ── 갈아 끼울 때 사람이 손댄 것을 옮긴다 (TASK-KL-135) ────────────────
     *
     * 도구 화면은 두 번 그려진다 — 빌드 때 미리 그려 둔 그림이 먼저 오고(빠르다), 위젯이
     * 도착하면 그 자리를 제 화면으로 갈아 끼운다. 실사이트 실측으로 76ms 와 127ms 였다.
     * 그 사이 51ms 에 사람이 뭘 적으면 **교체와 함께 그 글이 사라진다**. 느린 회선에서는
     * 이 틈이 더 벌어진다. 실제로 검사 하나가 그 틈에 걸려 두 번 헛돌았다.
     *
     * 「기존 DOM 을 그대로 두고 손만 붙인다」(모핑)는 여기서 못 쓴다 — 위젯이 만든 손은
     * **자기가 만든 노드**를 붙들고 있어서, 옛 노드를 살려 두면 그 손이 딴 데를 만지게 된다.
     * 그래서 반대로 한다: 새 화면을 쓰되 **사람이 손댄 것만 옮겨 온다**.
     *
     * 옮기는 것 = 사람이 바꾼 입력값·고른 것·켠 것 + 커서가 있던 자리. 기본값 그대로인 칸은
     * 안 옮긴다(그건 사람의 것이 아니라 그 도구의 것이고, 새 화면이 더 맞다). */
    function takeUserState(root) {
        const 값 = [];
        let 커서 = null;
        root.querySelectorAll('input, textarea, select').forEach(el => {
            if (!el.id) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                if (el.checked !== el.defaultChecked) 값.push({ id: el.id, checked: el.checked });
                return;
            }
            if (el.type === 'file' || el.type === 'button' || el.type === 'submit') return;
            const 기본 = el.tagName === 'SELECT'
                ? [...el.options].find(o => o.defaultSelected)?.value ?? el.options[0]?.value ?? ''
                : el.defaultValue;
            if (el.value !== 기본) 값.push({ id: el.id, value: el.value });
        });
        const active = document.activeElement;
        if (active && active !== document.body && root.contains(active) && active.id) {
            커서 = { id: active.id, start: active.selectionStart ?? null, end: active.selectionEnd ?? null };
        }
        return 값.length || 커서 ? { 값, 커서 } : null;
    }

    function putUserState(root, state) {
        if (!state) return;
        state.값.forEach(v => {
            const el = root.querySelector('#' + CSS.escape(v.id));
            if (!el) return;
            if ('checked' in v) el.checked = v.checked;
            else el.value = v.value;
            /* 값만 넣으면 도구는 모른다 — 사람이 친 것과 같은 신호를 보낸다. */
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        if (state.커서) {
            const el = root.querySelector('#' + CSS.escape(state.커서.id));
            if (el && typeof el.focus === 'function') {
                el.focus();
                if (state.커서.start != null && typeof el.setSelectionRange === 'function') {
                    try { el.setSelectionRange(state.커서.start, state.커서.end); } catch (_) { /* 커서를 못 두는 칸도 있다 */ }
                }
            }
        }
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

    /* 데스크톱 앱 껍데기(창 단추·배지·업데이트 알림)는 **데스크톱일 때만** 데려온다
     * (TASK-KL-128 ①-c). 웹에서는 첫 줄에서 돌아서는 코드 11KB 를 화면마다 받고 있었다.
     * 판단을 여기서 하므로 웹 사용자는 파일 자체를 안 받는다. 실제 코드 = `src/desktop-chrome.ts`. */
    function installDesktopChrome() {
        if (!isDesktopApp()) return;
        void ensureScript('root/desktop-chrome')
            .then(() => window.KarmoDesktopChrome?.install())
            .catch(() => { /* 껍데기가 없다고 앱이 멈출 이유는 없다 */ });
    }

    function isDesktopApp() {
        return typeof window !== 'undefined' && !!window.__KARMOLAB_DESKTOP__;
    }

    /** decorations:false 윈도우의 헤더 컨트롤(min/max/close)을 활성화. 데스크톱 외에는 noop. */
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
        /* 첫 화면 본문은 **첫 화면에만** 실린다 (TASK-KL-128 ①-c 3차) — 도구 화면에서는
           원래도 안 불렸는데 코드만 따라왔다. `index.html` 이 부르는 `home-page.js` 가 그것이다. */
        if (!staticBody) {
            const home = window.KarmoHomePage?.build();
            if (home) toolPages.appendChild(home);
        }

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
        document.getElementById('settingsPageBtn')?.addEventListener('click', () => switchPage('settings'));

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
            if (id === 'home' || SYSTEM_PAGES.has(id)) return true;
            const t = tools.find(x => x.id === id);
            if (!t) return false;
            if (isDesktopOnlyTool(t) && !isDesktopApp()) return false;
            return true;
        };
        /* TASK-KL-129: 본문이 **이미 HTML 에 박혀 있는** 페이지(도구 목록 등).
         * 셸의 머리띠·옆줄·테마·⌘K 는 그대로 쓰되, 화면은 앱이 그리지 않는다 —
         * 여기서 첫 화면을 그리면 적혀 있던 목록 위에 홈이 덮인다(실제로 그랬다). */
        if (staticBody) {
            installDesktopChrome();
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

        installDesktopChrome();
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

    /* 첫 화면 배경 장식은 **첫 화면에서만** 데려온다 (TASK-KL-128 ①-c).
     *
     * 22KB 짜리 코드가 셸에 박혀 있어서 도구 화면 129장이 매번 같이 받고 있었다. 거기엔
     * 붙을 자리도 없다. 이제 첫 화면을 그릴 때 그때 받는다 — 도구만 쓰는 사람은 평생 안 받는다.
     *
     * 늦게 와도 괜찮은 것이라 기다리지 않는다(장식이다). 못 받아도 화면은 그대로 돈다.
     * 실제 코드는 `src/home-scene.ts`.
     */
    function mountHomeDecor() {
        /* 미리 찍어 둔 화면(도구 상세·목록)에서는 장식을 **아예 안 그린다** — 원래도 안 그렸다.
           그 판단이 받아 온 코드 **안**에 있으면 안 쓸 파일을 받고 나서야 돌아선다.
           여기서 먼저 갈라야 22KB 를 진짜로 안 받는다 (TASK-KL-128 ①-c). */
        if (typeof window !== 'undefined' && (window.KARMOLAB_ENTRY_TOOL || window.KARMOLAB_ENTRY_STATIC)) return;
        void ensureScript('root/home-scene')
            .then(() => window.KarmoHomeScene?.mount())
            .catch(() => { /* 장식이 없다고 앱이 멈출 이유는 없다 */ });
    }

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

        /* 계정 캡슐이 곧 「내 정보」 단추다 (통합). account.js 가 그 안을 갈아 끼우므로
         * id 가 아니라 **자리**로 찾는다 — 갈아 끼운 뒤에도 같은 자리다. */
        const userBtn = document.querySelector('#headerAccount .header-account-btn');
        if (userBtn) userBtn.classList.toggle('active', pageId === 'user');
        const settingsBtn = document.getElementById('settingsPageBtn');
        if (settingsBtn) settingsBtn.classList.toggle('active', pageId === 'settings');

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
        /* 시스템 화면에는 안 붙인다 (TASK-KL-139). 여기 온 사람은 도구를 쓰러 온 게 아니라
         * 자기 것·자기 설정을 보러 왔다 — 계정 아래에 「여기도 있어요」를 깔면 자기 화면이
         * 아니라 광고판이 된다. (`hidden` 으로 거르면 안 된다: base64 처럼 **검색 유입 주소를
         * 살려 둔 채 목록에서만 숨긴** 진짜 도구가 같이 걸린다.) */
        if (SYSTEM_PAGES.has(tool.id)) return;
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
        // 첫 화면 본문(`home-page.js`)이 부른다 — 그쪽은 셸 안을 못 보므로 전역으로 준다.
        mountHomeDecor, toolCountsOnce, whenApiBase,
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
