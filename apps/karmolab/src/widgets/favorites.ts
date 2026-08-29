/**
 * 즐겨찾기 모음. 사이트 파비콘/아이콘으로 빠른 접속
 * - icon 미지정: 공개 URL은 Google s2/favicons / 로컬, 사설은 지구본만(요청 없음)
 * - icon에 지구본 data URL(FAVICON_FALLBACK): Google이 404만 내는 항목만 수동 지정
 * - 그 외 명시 icon(Simple Icons 등): 그대로 사용
 * - 사용자 추가/삭제 (localStorage)
 * - 기본 목록: favorites-defaults.ts
 */
import { DEFAULT_ITEMS, FAVICON_FALLBACK, type FavoriteGroup, type FavoriteItem } from './favorites-defaults';
import {
    APP_CATALOG,
    appIconUrl,
    checkInstalled,
    launchApp,
    letterIcon,
    listInstalled,
    watchLaunch,
    type InstalledApp,
    type LaunchSpec
} from './favorites-apps';
import {
    DECK_CSS,
    getKeySize,
    getLayout,
    arrange,
    getSkin,
    emptyHtml,
    keyHtml,
    loadSlots,
    registerDeckProps,
    renderDeckHtml,
    setKeySize,
    setLayout,
    setSkin,
    SIZE_MAX,
    SIZE_MIN,
    SKINS,
    wireDeck,
    wireKeys,
    type FavLayout,
    type FavSkin
} from './favorites-deck';
import { isDesktop } from '../tauri-bridge';
import { registerContextMenu, type MenuEntry } from '../lib/context-menu';
import { t, loadNamespace } from '../lib/i18n';

(function (): void {
    const STORAGE_KEY = 'toolbox_favorites';
    /** 즐겨찾기에 **직접 담은** 도구 id 목록. 없으면 도구는 한 칸도 안 뜬다 (기본 = 빈 목록). */
    const TOOLS_KEY = 'toolbox_fav_tools';
    /** 즐겨찾기에 담은 **프로그램**. 사이트와 따로 둔다. 그룹 이름이 언어 따라 바뀌는
     *  자리에 섞으면 언어를 바꿨을 때 담은 것이 다른 칸으로 흩어진다 (도구가 이미 그래서
     *  따로 산다). */
    const APPS_KEY = 'toolbox_fav_apps';
    const FAVICON_IMG_ONERROR = 'this.onerror=null;this.src=' + JSON.stringify(FAVICON_FALLBACK);
    const FAVICON_API = 'https://www.google.com/s2/favicons?domain=';
    const KARMOLAB_FAVICON = '/apps/karmolab/img/favicon.ico';
    const FAVICON_SZ = '64';

    function isPrivateOrLocalHostname(host: string | null | undefined): boolean {
        if (!host) return true;
        const h = host.toLowerCase();
        if (h === 'localhost' || h === '::1' || h.endsWith('.localhost')) return true;
        if (h === '127.0.0.1' || h.startsWith('127.')) return true;
        if (h.startsWith('10.')) return true;
        if (h.startsWith('192.168.')) return true;
        const m = /^172\.(\d+)\./.exec(h);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n >= 16 && n <= 31) return true;
        }
        return false;
    }

    /**
     * 도구를 **주제별로** 나눈다 (TASK-KL-096).
     *
     * 예전에는 백 개가 넘는 도구를 Toolbox 한 덩어리에 통째로 쏟아 놨다. 이름을 이미 아는
     * 사람만 쓸 수 있는 화면이다. 도구 전체 목록(/t/)은 같은 도구를 열다섯 주제로
     * 나눠 보여 주는데 즐겨찾기만 안 나뉘어 있었다.
     *
     * **분류를 여기서 새로 적지 않는다.** 목록 페이지가 쓰는 것과 같은 두 곳에서 읽는다:
     *   ① 묶음 위젯 소속 (지연 메타의 `bundle`). PDF 도구, 소리 도구 같은 주제
     *   ② 묶음이 없으면 도구가 등록할 때 밝힌 갈래 (`category` → Toolbox.getCategories 의 이름)
     * 손으로 한 벌 더 적어 두면 그날부터 목록과 즐겨찾기가 서로 다른 분류를 말하게 된다.
     *
     * 묶음 자신(예: `pdf`)은 항목에서 뺀다. 소제목이 그 자리이고, 부분을 누르면 어차피
     * 묶음이 그 탭으로 열린다. 남겨 두면 같은 것이 제목과 항목에 두 번 나온다.
     */
    function getToolboxToolGroups(picked: Set<string>): FavoriteGroup[] {
        if (!picked.size) return [];
        const tools = (typeof Toolbox !== 'undefined' && Toolbox.getTools ? Toolbox.getTools() : [])
            .filter((tool) => picked.has(tool.id));
        const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
        /* 묶음 소속은 **지연 메타**에서 직접 읽는다. Toolbox.findBundleFor 는 그 묶음이 이미
         * 로드됐을 때만 답하는데, 즐겨찾기는 첫 화면이라 대부분 아직 안 로드돼 있다 . 
         * 그걸 쓰면 거의 다 그 밖에로 떨어져 나뉜 척만 하는 화면이 된다. */
        const bundleOf = (id: string): string | null => meta[id]?.bundle || null;
        const isBundleParent = new Set(
            Object.keys(meta)
                .map((id) => bundleOf(id))
                .filter((b): b is string => !!b)
        );

        const cats = Toolbox.getCategories?.() || [];
        const catLabel = new Map<string, string>(cats.map((c) => [c.id, c.label] as [string, string]));
        const catOrder = cats.map((c) => c.id);
        const ETC = t('favorites.t08');

        type Bucket = { title: string; fromBundle: boolean; catRank: number; items: FavoriteItem[] };
        const buckets = new Map<string, Bucket>();

        tools
            .filter((tool) => {
                // 묶음의 탭으로 들어간 도구는 사이드바에선 숨겼지만 검색에서는 찾을 수 있어야 한다
                // (부르면 묶음의 그 탭이 열린다).
                if (tool.hidden && !bundleOf(tool.id)) return false;
                // 데스크톱 전용 (desktopOnly 또는 legacy category=desktop) = 브라우저 hide
                if ((tool.desktopOnly === true || tool.category === 'desktop') && !Toolbox.isDesktopApp?.()) return false;
                if (isBundleParent.has(tool.id)) return false;
                return true;
            })
            .forEach((tool) => {
                const b = bundleOf(tool.id);
                const key = b ? `b:${b}` : `c:${tool.category || ''}`;
                let bucket = buckets.get(key);
                if (!bucket) {
                    const title = b
                        ? meta[b]?.title || tools.find((x) => x.id === b)?.title || b
                        : catLabel.get(tool.category || '') || ETC;
                    bucket = {
                        title,
                        fromBundle: !!b,
                        catRank: b ? -1 : catOrder.indexOf(tool.category || ''),
                        items: []
                    };
                    buckets.set(key, bucket);
                }
                bucket.items.push({ type: 'tool' as const, toolId: tool.id, label: tool.title || tool.id, icon: tool.icon || '' });
            });

        // 순서: 주제 묶음이 먼저(큰 것부터. 목록 페이지와 같은 규칙), 그다음 갈래, 그 밖에는 맨 끝.
        return [...buckets.values()]
            .sort((a, b) => {
                if (a.fromBundle !== b.fromBundle) return a.fromBundle ? -1 : 1;
                if (a.fromBundle) return b.items.length - a.items.length;
                const ra = a.catRank < 0 ? 99 : a.catRank;
                const rb = b.catRank < 0 ? 99 : b.catRank;
                return ra - rb;
            })
            .map((b) => ({ group: b.title, items: b.items }));
    }

    type PickableTool = { id: string; title: string; icon: string; desc: string; group: string };

    /**
     * 도구 담기 고르는 칸에 뿌릴 목록. 화면에 뜨는 규칙은 위 그룹 만들기와 **같은 필터**를
     * 쓴다. 여기서만 보이고 담으면 안 뜨는 도구가 생기지 않게.
     */
    function listPickableTools(): PickableTool[] {
        const tools = typeof Toolbox !== 'undefined' && Toolbox.getTools ? Toolbox.getTools() : [];
        const meta = (typeof window !== 'undefined' && window.KARMOLAB_LAZY_META_BY_ID) || {};
        const bundleOf = (id: string): string | null => meta[id]?.bundle || null;
        const isBundleParent = new Set(
            Object.keys(meta)
                .map((id) => bundleOf(id))
                .filter((b): b is string => !!b)
        );
        const cats = Toolbox.getCategories?.() || [];
        const catLabel = new Map<string, string>(cats.map((c) => [c.id, c.label] as [string, string]));
        return tools
            .filter((tool) => {
                if (tool.id === 'favorites') return false;
                if (tool.hidden && !bundleOf(tool.id)) return false;
                if ((tool.desktopOnly === true || tool.category === 'desktop') && !Toolbox.isDesktopApp?.()) return false;
                if (isBundleParent.has(tool.id)) return false;
                return true;
            })
            .map((tool) => {
                const b = bundleOf(tool.id);
                return {
                    id: tool.id,
                    title: tool.title || tool.id,
                    icon: tool.icon || '',
                    desc: String(Toolbox.getToolMeta?.(tool.id)?.desc || ''),
                    group: b
                        ? meta[b]?.title || b
                        : catLabel.get(tool.category || '') || '그 밖에'
                };
            })
            .sort((a, b) => a.group.localeCompare(b.group, 'ko') || a.title.localeCompare(b.title, 'ko'));
    }

    /** 담아 둔 프로그램 한 칸. scheme, exec 중 최소 하나는 있다. */
    type FavApp = { scheme?: string; exec?: string; args?: string[]; label: string };

    /** 이 칸을 다른 칸과 구분하는 열쇠. 스킴이 있으면 스킴, 없으면 실행 파일 경로. */
    function appKey(a: { scheme?: string; exec?: string }): string {
        return (a.scheme || a.exec || '').toLowerCase();
    }

    function loadApps(): FavApp[] {
        try {
            const raw = localStorage.getItem(APPS_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) {
                    return arr.filter(
                        (x): x is FavApp =>
                            !!x && typeof x.label === 'string' && (!!x.scheme || !!x.exec)
                    );
                }
            }
        } catch (_) {}
        return [];
    }

    function saveApps(list: FavApp[]): void {
        try { localStorage.setItem(APPS_KEY, JSON.stringify(list)); } catch (_) {}
    }

    function appSpec(a: { scheme?: string; exec?: string; args?: string[] }): LaunchSpec {
        return { scheme: a.scheme, exec: a.exec, args: a.args };
    }

    /** 담은 프로그램을 한 칸(앱)으로 묶는다. 없으면 칸 자체를 안 만든다. */
    function getAppGroups(apps: FavApp[]): FavoriteGroup[] {
        if (!apps.length) return [];
        return [
            {
                group: t('favorites.group.apps'),
                items: apps.map((a) => ({
                    type: 'app' as const,
                    label: a.label,
                    icon: appIconUrl(a.scheme, a.label),
                    scheme: a.scheme,
                    exec: a.exec,
                    args: a.args
                }))
            }
        ];
    }

    function loadPickedTools(): Set<string> {
        try {
            const raw = localStorage.getItem(TOOLS_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
            }
        } catch (_) {}
        return new Set();
    }

    function savePickedTools(ids: Set<string>): void {
        try { localStorage.setItem(TOOLS_KEY, JSON.stringify([...ids])); } catch (_) {}
    }

    function getFaviconUrl(item: FavoriteItem): string {
        if (item.icon) return item.icon;
        const base = typeof location !== 'undefined' ? location.href : 'https://example.org/';
        let u: URL;
        try {
            u = new URL(item.url ?? '', base);
        } catch (_) {
            return FAVICON_FALLBACK;
        }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return FAVICON_FALLBACK;
        const host = u.hostname;
        const currentHost = typeof location !== 'undefined' ? location.hostname : '';
        if (currentHost && host === currentHost) return KARMOLAB_FAVICON;
        if (host === 'mascari4615.github.io') return KARMOLAB_FAVICON;
        if (isPrivateOrLocalHostname(host)) return FAVICON_FALLBACK;
        return FAVICON_API + encodeURIComponent(host) + '&sz=' + FAVICON_SZ;
    }

    function loadFavorites(): FavoriteGroup[] | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw) as FavoriteGroup[];
        } catch (_) {}
        return null;
    }

    function saveFavorites(data: FavoriteGroup[]): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (_) {}
    }

    /* 보기는 **세 축**이다 (사용자 결정 2026-08-19). 레이아웃 2, 살결 4, 크기 슬라이더.
     * 정본은 favorites-deck.ts (옛 `toolbox_fav_view` 는 거기서 한 번 옮기고 지운다). */

    function buildGroups(defaultGroups: FavoriteGroup[], customGroups: FavoriteGroup[] | null): FavoriteGroup[] {
        const merged: FavoriteGroup[] = [];
        /* 도구는 **담은 것만** 뜬다 (TASK-KL-147). 예전엔 등록된 도구 전부를 자동으로 부어
         * 넣어서, 자주 가는 곳이 도구 127개 밑으로 밀려 있었다. 즐겨찾기 = 고른 것.
         * (TASK-KL-147) */
        /* 프로그램이 맨 앞이다. 손이 제일 자주 가는 칸이고, 도구, 사이트와 달리
         * 담은 개수가 적어 위에 둬도 화면을 안 밀어낸다. */
        merged.push(...getAppGroups(loadApps()));
        merged.push(...getToolboxToolGroups(loadPickedTools()));
        /* 같은 이름이면 한 칸에 합친다. 도구 갈래 이름(도구)과 즐겨찾기 기본 그룹 이름이
         * 겹치는데, 그냥 밀어 넣으면 같은 제목의 칸이 화면에 두 번 뜬다 (TASK-KL-096). */
        const into = (name: string, items: FavoriteItem[]): void => {
            const existing = merged.find((m) => m.group === name);
            if (existing) existing.items.push(...items);
            else merged.push({ group: name, items });
        };
        defaultGroups.forEach((g) => into(g.group, g.items.map((it) => ({ ...it, isCustom: false }))));
        if (customGroups && Array.isArray(customGroups)) {
            customGroups.forEach((cg) => into(cg.group, (cg.items || []).map((it) => ({ ...it, isCustom: true }))));
        }
        return merged;
    }


    Mdd.injectCSS('favorites', `
        .fav-layout { display:flex; flex-direction:column; gap:24px; }
        .fav-group { display:flex; flex-direction:column; gap:12px; }
        .fav-group-title { font-size:var(--font-size-xs); font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.06em; }
        .fav-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(72px, 1fr)); gap:12px; }
        .fav-item { display:flex; flex-direction:column; align-items:center; gap:6px; padding:12px 8px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:var(--radius-md); cursor:pointer; transition:all var(--transition); text-decoration:none; color:inherit; }
        .fav-item:hover { background:var(--bg-hover); border-color:var(--border-hover); transform:translateY(-12px); box-shadow:var(--shadow-float); }
        .fav-item:active { transform:translateY(0); }
        .fav-icon { width:52px; height:52px; border-radius:10px; object-fit:contain; background:var(--bg-secondary); }
        .fav-icon-svg { display:flex; align-items:center; justify-content:center; padding:6px; }
        .fav-icon-svg svg { width:32px; height:32px; stroke:var(--text-secondary); }
        .fav-label { font-size:var(--font-size-2xs); color:var(--text-secondary); text-align:center; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fav-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
        .fav-add-form { display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; padding:16px; background:var(--bg-tertiary); border:1px dashed var(--border); border-radius:var(--radius-md); }
        .fav-add-form input, .fav-add-form select { flex:1; min-width:180px; padding:8px 12px; font-size:var(--font-size-xs); background:var(--bg-primary); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); }
        .fav-add-form .form-group { display:flex; flex-direction:column; gap:4px; }
        .fav-add-form label { font-size:var(--font-size-2xs); color:var(--text-tertiary); }
        .fav-item-wrap { position:relative; }
        .fav-item-wrap .fav-remove { position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; background:var(--error); color:#fff; border:none; cursor:pointer; font-size:12px; line-height:1; opacity:0; transition:opacity var(--transition); display:flex; align-items:center; justify-content:center; z-index:1; }
        .fav-item-wrap:hover .fav-remove { opacity:1; }
        .fav-remove:hover { background:#dc2626; }
        .fav-view-toggle-btn { padding:8px; background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; transition:var(--transition); border-radius:4px; display:flex; align-items:center; justify-content:center; }
        .fav-view-toggle-btn:hover { background:var(--bg-hover); color:var(--text-primary); }
        .fav-view-toggle-btn.active { background:var(--accent-subtle); border-color:var(--accent); color:var(--accent); }
        .fav-view-toggle-btn svg { width:18px; height:18px; }
        .fav-view-toggle-btn .fav-view-icon-card { display:none; }
        .fav-view-toggle-btn .fav-view-icon-grid { display:block; }
        .fav-view-toggle-btn[data-view="card"] .fav-view-icon-card { display:block; }
        .fav-view-toggle-btn[data-view="card"] .fav-view-icon-grid { display:none; }
        /* 한 줄 툴바. 좁아지면 줄바꿈만 하고, 순서는 그대로 (검색 → 담기 → 배치 → 살결 → 크기). */
        .fav-bar { display:flex; justify-content:center; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:var(--space-md); }
        .fav-bar .landing-search-wrap { flex:0 1 240px; min-width:150px; margin:0; position:relative; }
        .fav-bar-sep { width:1px; height:20px; background:var(--border); flex:none; }
        /* 담기 칸. **크기는 다른 칸과 같게**, 대신 옅게. 눈에 먼저 들어오면 안 되지만
           자리는 격자를 흐트러뜨리지 않아야 한다 (사용자 결정 2026-08-19). */
        .fav-add-tile {
            display:flex; align-items:center; justify-content:center; width:100%; height:100%;
            /* 바탕은 **옅게라도 있어야** 한다. 완전히 비우면 칸이 아니라 빈틈으로 읽힌다. */
            background:var(--bg-tertiary); border:1px dashed var(--border-hover); border-radius:var(--radius-md);
            color:var(--text-tertiary); cursor:pointer; padding:12px 8px; opacity:0.55;
            transition:var(--transition);
        }
        .fav-add-tile:hover { opacity:1; border-color:var(--accent); color:var(--accent); background:var(--accent-subtle); }
        .fav-add-plus { font-size:20px; line-height:1; }
        .fav-add-btn { padding:8px; background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; transition:var(--transition); border-radius:4px; display:flex; align-items:center; justify-content:center; }
        .fav-add-btn:hover { background:var(--bg-hover); color:var(--accent); }
        .fav-add-btn svg { width:18px; height:18px; }
        .fav-add-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9998; display:flex; align-items:center; justify-content:center; padding:20px; opacity:0; pointer-events:none; transition:opacity var(--transition); }
        .fav-add-modal-backdrop.open { opacity:1; pointer-events:auto; }
        .fav-add-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-lg); padding:var(--space-lg); max-width:360px; width:100%; box-shadow:var(--shadow-float); }
        .fav-add-modal h3 { font-size:var(--font-size-sm); margin-bottom:var(--space-md); color:var(--text-primary); }
        .fav-add-modal .fav-add-form { display:flex; flex-direction:column; gap:12px; padding:0; border:none; background:none; align-items:stretch; }
        .fav-add-modal .fav-add-form .form-group { display:flex; flex-direction:column; gap:4px; width:100%; }
        .fav-add-modal .fav-add-form label { font-size:var(--font-size-2xs); color:var(--text-tertiary); }
        .fav-add-modal .fav-add-form input, .fav-add-modal .fav-add-form select { width:100%; min-width:0; box-sizing:border-box; padding:8px 12px; font-size:var(--font-size-xs); background:var(--bg-primary); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); }
        .fav-add-modal .fav-add-form .btn { width:100%; margin-top:4px; }
        .fav-bar .landing-search-wrap .landing-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--text-tertiary); pointer-events:none; flex-shrink:0; }
        .fav-bar .landing-search-wrap .landing-search { width:100%; padding:9px 12px 9px 36px; font-size:var(--font-size-xs); background:var(--bg-tertiary); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); }
        .fav-bar .landing-search-wrap .landing-search:focus { outline:none; border-color:var(--accent); }
        .fav-bar .landing-search-wrap .landing-search::placeholder { color:var(--text-tertiary); }
        .fav-add-kind { display:flex; gap:6px; margin-bottom:var(--space-md); }
        .fav-add-kind .fav-kind-btn { flex:1; padding:7px 10px; font-size:var(--font-size-xs); background:var(--bg-tertiary); border:1px solid var(--border); color:var(--text-secondary); border-radius:4px; cursor:pointer; transition:var(--transition); }
        .fav-add-kind .fav-kind-btn:hover { background:var(--bg-hover); color:var(--text-primary); }
        .fav-add-kind .fav-kind-btn.active { background:var(--accent-subtle); border-color:var(--accent); color:var(--accent); }
        .fav-add-pane[data-pane="tool"] { display:flex; flex-direction:column; gap:10px; }
        /* display:flex 는 hidden 속성을 이긴다. 안 적으면 두 갈래가 동시에 뜬다 */
        .fav-add-modal [data-pane][hidden] { display:none; }
        .fav-tool-search { width:100%; box-sizing:border-box; padding:8px 12px; font-size:var(--font-size-xs); background:var(--bg-primary); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); }
        .fav-tool-list { display:flex; flex-direction:column; gap:4px; max-height:min(46vh, 340px); overflow-y:auto; }
        .fav-tool-row { display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:4px; cursor:pointer; text-align:left; transition:var(--transition); color:var(--text-primary); }
        .fav-tool-row:hover { background:var(--bg-hover); border-color:var(--border-hover); }
        .fav-tool-row.on { border-color:var(--accent); background:var(--accent-subtle); }
        .fav-tool-ico svg { width:18px; height:18px; stroke:var(--text-secondary); display:block; }
        .fav-tool-row.on .fav-tool-ico svg { stroke:var(--accent); }
        .fav-tool-text { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
        .fav-tool-name { font-size:var(--font-size-xs); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .fav-tool-group { font-size:var(--font-size-2xs); color:var(--text-tertiary); }
        .fav-tool-mark { font-size:var(--font-size-sm); color:var(--text-tertiary); flex-shrink:0; }
        .fav-tool-row.on .fav-tool-mark { color:var(--accent); }
        .fav-tool-empty { padding:16px; text-align:center; font-size:var(--font-size-xs); color:var(--text-tertiary); }
        /* 이 PC 에 있나 표시. **데스크톱에서만 단다**. 브라우저는 설치 여부를 알
           방법이 없어서, 웹에서 회색 점을 달면 그냥 거짓말이 된다. */
        .fav-app-badge { position:absolute; left:6px; top:6px; width:8px; height:8px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 2px var(--bg-tertiary); pointer-events:none; }
        .fav-app-badge.off { background:var(--text-tertiary); }
        .fav-item.fav-app-missing { opacity:0.5; }
        .fav-add-pane[data-pane="app"] { display:flex; flex-direction:column; gap:10px; }
        .fav-app-note { font-size:var(--font-size-2xs); color:var(--text-tertiary); line-height:1.6; }
        .fav-app-custom { display:flex; gap:6px; align-items:stretch; }
        .fav-app-custom input { flex:1; min-width:0; padding:8px 12px; font-size:var(--font-size-xs); background:var(--bg-primary); border:1px solid var(--border); border-radius:4px; color:var(--text-primary); }
        .fav-app-custom .btn { flex:none; }
        .fav-tool-row .fav-app-ico { width:18px; height:18px; border-radius:4px; object-fit:contain; flex-shrink:0; }
        .fav-grid.fav-grid-card { grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:16px; }
        .fav-grid.fav-grid-card .fav-item { padding:16px 12px; }
        .fav-grid.fav-grid-card .fav-icon { width:60px; height:60px; border-radius:12px; }
        .fav-grid.fav-grid-card .fav-icon-svg svg { width:40px; height:40px; }
        .fav-grid.fav-grid-card .fav-label { font-size:var(--font-size-xs); }
    ` + DECK_CSS);

    /** 담기 칸의 갈래. */
    type FavKind = 'site' | 'tool' | 'app';

    function buildFavorites(container: HTMLElement): void {
        Mdd.linePreset('home_hub', { msg: t('favorites.t09') });

        /* 도구를 담고 빼면 화면을 통째로 다시 그린다. 그리면 열려 있던 창이 같이 사라지므로,
         * 어느 갈래를 보고 있었나, 뭘 치고 있었나를 여기 적어 뒀다가 그린 뒤 되돌린다. */
        let pendingOpen: { kind: FavKind; q: string } | null = null;
        /** 덱 배선을 되돌리는 함수. 다시 그리기 전에 꼭 부른다. */
        let disposeDeck: (() => void) | null = null;
        /** 키 배선(손 닿음, 상태점)을 되돌리는 함수. 살결이 기존이 아니면 늘 쓴다. */
        let disposeKeys: (() => void) | null = null;
        registerDeckProps();
        Toolbox.onDispose?.(() => {
            disposeDeck?.(); disposeDeck = null;
            disposeKeys?.(); disposeKeys = null;
        });
        /** 담기 칸이 앱일 때 뿌릴 목록. 데스크톱은 레지스트리 실물, 웹은 카탈로그. */
        let appChoices: InstalledApp[] | null = null;

        function renderToolPicker(query: string): string {
            const esc = Toolbox.escapeHtml ?? ((s: string) => s);
            const picked = loadPickedTools();
            const q = query.trim().toLowerCase();
            const rows = listPickableTools().filter(
                (tool) => !q || (tool.title + ' ' + tool.group + ' ' + tool.desc + ' ' + tool.id).toLowerCase().includes(q)
            );
            if (!rows.length) return `<div class="fav-tool-empty">${esc(t('favorites.t04'))}</div>`;
            return rows
                .map((tool) => {
                    const on = picked.has(tool.id);
                    return `
                    <button type="button" class="fav-tool-row ${on ? 'on' : ''}" data-pick="${esc(tool.id)}">
                        <span class="fav-tool-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${tool.icon}</svg></span>
                        <span class="fav-tool-text">
                            <span class="fav-tool-name">${esc(tool.title)}</span>
                            <span class="fav-tool-group">${esc(tool.group)}</span>
                        </span>
                        <span class="fav-tool-mark">${on ? '✓' : '+'}</span>
                    </button>`;
                })
                .join('');
        }

        /**
         * 앱 담기 목록. 데스크톱이면 이 PC 에 **실제로 등록된 것**(`appChoices`),
         * 웹이면 고를 수 있는 카탈로그를 뿌린다. 웹은 설치 여부를 못 보므로 카탈로그가
         * 최선이고, 없는 앱은 아래 직접 넣기로 담는다.
         */
        function renderAppPicker(query: string): string {
            const esc = Toolbox.escapeHtml ?? ((s: string) => s);
            const q = query.trim().toLowerCase();
            const picked = new Set(loadApps().map(appKey));
            const rows: { key: string; label: string; sub: string; scheme?: string; exec?: string }[] =
                appChoices
                    ? appChoices.map((a) => ({ key: appKey(a), label: a.label, sub: a.scheme, scheme: a.scheme, exec: a.exec }))
                    : APP_CATALOG.map((a) => ({ key: a.scheme, label: a.label, sub: `${a.scheme}://`, scheme: a.scheme }));
            const shown = rows.filter((r) => !q || (r.label + ' ' + r.sub).toLowerCase().includes(q));
            if (!shown.length) {
                return `<div class="fav-tool-empty">${esc(appChoices ? t('favorites.app.none') : t('favorites.app.noneWeb'))}</div>`;
            }
            return shown
                .map((r) => {
                    const on = picked.has(r.key);
                    return `
                    <button type="button" class="fav-tool-row ${on ? 'on' : ''}" data-app-pick="${esc(r.key)}" data-scheme="${esc(r.scheme || '')}" data-exec="${esc(r.exec || '')}" data-label="${esc(r.label)}">
                        <img class="fav-app-ico" src="${esc(appIconUrl(r.scheme, r.label))}" alt="" decoding="async" onerror="this.onerror=null;this.src=${esc(JSON.stringify(letterIcon(r.label)))}">
                        <span class="fav-tool-text">
                            <span class="fav-tool-name">${esc(r.label)}</span>
                            <span class="fav-tool-group">${esc(r.sub)}</span>
                        </span>
                        <span class="fav-tool-mark">${on ? '✓' : '+'}</span>
                    </button>`;
                })
                .join('');
        }

        /**
         * 이 칸을 즐겨찾기에서 빼기로 지울 수 있으면 지우는 일을, 아니면 `null`.
         *
         * 뺄 수 없는 칸이 있다. 기본으로 깔린 사이트다. 그건 담은 적이 없어 뺄 것도 없다
         * (그 칸에는 × 단추도 원래 안 달린다). 메뉴에 회색으로 남겨 두지 않고 아예 빼는 이유 =
         * 왜 안 눌리지를 설명할 자리가 우클릭 메뉴에는 없다.
         */
        function removerFor(hit: { toolId: string; appKey: string; url: string }): (() => void) | null {
            if (hit.toolId) {
                return () => {
                    const picked = loadPickedTools();
                    if (!picked.delete(hit.toolId)) return;
                    savePickedTools(picked);
                    Toolbox.showToast?.(t('favorites.t16'));
                    render();
                };
            }
            if (hit.appKey) {
                return () => {
                    const apps = loadApps();
                    const left = apps.filter((x) => appKey(x) !== hit.appKey);
                    if (left.length === apps.length) return;
                    saveApps(left);
                    Toolbox.showToast?.(t('favorites.t16'));
                    render();
                };
            }
            if (!hit.url) return null;
            /* 직접 담은 사이트만. 기본 목록은 저장된 적이 없어서 여기서 안 걸린다. */
            const data = loadFavorites() || [];
            const g = data.find((d) => d.items.some((it) => it.url === hit.url && it.isCustom));
            if (!g) return null;
            return () => {
                const now = loadFavorites() || [];
                const grp = now.find((d) => d.group === g.group);
                if (!grp) return;
                grp.items = grp.items.filter((it) => it.url !== hit.url);
                if (!grp.items.length) now.splice(now.indexOf(grp), 1);
                saveFavorites(now);
                Toolbox.showToast?.(t('favorites.t16'));
                render();
            };
        }

        function render(): void {
            const customNow = loadFavorites();
            const groupsNow = buildGroups(DEFAULT_ITEMS, customNow);
            /* 자리표는 **덱 기준 정본**이다. 목록 배치는 같은 표를 읽어 빈 칸만 걷어내고
             * 순서대로 늘어놓는다 (사용자 결정 2026-08-19). */
            const slotsNow = loadSlots();
            const esc = Toolbox.escapeHtml ?? ((s: string) => s);
            const layout = getLayout();
            const skin = getSkin();
            const keySize = getKeySize();
            const isDeck = layout === 'deck';
            const reopen = pendingOpen;
            pendingOpen = null;
            const openKind: FavKind = reopen?.kind ?? 'site';
            const openQuery = reopen?.q ?? '';

            container.innerHTML = `
                <div class="fav-layout skin-${skin}" style="--fk-size:${keySize}px">
                    <!-- 툴바 한 줄. 검색, 담기, 배치, 살결, 크기가 **한 자리**에 있다.
                         전에는 검색줄과 살결/크기가 두 줄로 갈려, 크기 조절이 어디 있는지
                         찾게 됐다 (사용자 결정 2026-08-19). -->
                    <div class="fav-bar">
                        <div class="landing-search-wrap">
                            <svg class="landing-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                            <input type="text" class="landing-search" placeholder="${esc(t('favorites.t01'))}" id="favSearch" autocomplete="off">
                        </div>
                        <button type="button" class="fav-view-toggle-btn ${isDeck ? 'active' : ''}" id="fav-layout-btn" title="${esc(t('favorites.layout.toggle'))}">
                            ${isDeck
                                ? '<svg class="fav-view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="2"/><rect x="5" y="9" width="4" height="4" rx="1"/><rect x="10" y="9" width="4" height="4" rx="1"/><rect x="15" y="9" width="4" height="4" rx="1"/></svg>'
                                : '<svg class="fav-view-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'}
                        </button>
                        <span class="fav-bar-sep"></span>
                        <span class="fav-skins">
                            ${SKINS.map((k) => `<button type="button" class="fav-skin ${k === skin ? 'on' : ''}" data-skin="${k}">${esc(t('favorites.skin.' + k))}</button>`).join('')}
                        </span>
                        <span class="fav-sizer">
                            <input type="range" min="${SIZE_MIN}" max="${SIZE_MAX}" step="4" value="${keySize}"
                                   id="fav-size" aria-label="${esc(t('favorites.deck.size'))}">
                            <output id="fav-size-out">${keySize}</output>
                        </span>
                    </div>

                    ${isDeck ? renderDeckHtml(
                        groupsNow,
                        esc,
                        getFaviconUrl,
                        (it) => String((it.toolId && Toolbox.getToolMeta?.(it.toolId)?.desc) || '')
                    ) : ''}
                    ${isDeck ? '' : groupsNow.map((g) => `
                        <div class="fav-group" data-fav-group="${esc(g.group)}">
                            <div class="fav-group-title">${esc(g.group)}</div>
                            <div class="fav-grid">
                                ${arrange(g.items, g.group, slotsNow, 0).filter((x): x is FavoriteItem => !!x).map((it) => {
                                    /* 살결이 기존이 아니면 **덱과 같은 키**를 목록 배치에도 쓴다 . 
                                     * 살결은 배치와 다른 축이라, 어디에 놓든 같은 얼굴이어야 한다. */
                                    if (skin !== 'plain') {
                                        return keyHtml(
                                            it,
                                            g.group,
                                            esc,
                                            getFaviconUrl,
                                            String((it.toolId && Toolbox.getToolMeta?.(it.toolId)?.desc) || '')
                                        );
                                    }
                                    const isTool = it.type === 'tool';
                                const isApp = it.type === 'app';
                                    const metaDesc = (it.toolId && Toolbox.getToolMeta?.(it.toolId)?.desc) || '';
                                    const searchable = [it.label, g.group, it.url || '', it.toolId || '', it.scheme || '', it.exec || '', metaDesc].join(' ').toLowerCase();
                                    const removeBtn = isTool
                                        ? `<button type="button" class="fav-remove" data-tool="${esc(it.toolId || '')}" title="${esc(t('favorites.t02'))}">×</button>`
                                        : isApp
                                        ? `<button type="button" class="fav-remove" data-app-remove="${esc(appKey(it))}" title="${esc(t('favorites.t03'))}">×</button>`
                                        : it.isCustom && it.url
                                        ? `<button type="button" class="fav-remove" data-group="${esc(g.group)}" data-url="${esc(it.url)}" title="${esc(t('favorites.t03'))}">×</button>`
                                        : '';
                                    const iconHtml = isTool
                                        ? `<div class="fav-icon fav-icon-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.icon || ''}</svg></div>`
                                        : isApp
                                        /* 로고 CDN 에 없는 앱(레지스트리에서 주운 것들)이 X 표시로
                                         * 남지 않게 첫 글자 동그라미로 떨어뜨린다. */
                                        ? `<img class="fav-icon" src="${esc(it.icon || '')}" alt="" decoding="async" onerror="this.onerror=null;this.src=${esc(JSON.stringify(letterIcon(it.label)))}">`
                                        // 늦은 로딩(lazy)을 쓰지 않는다. 아이콘은 52px 짜리 70장 . 
                                        // 미뤄서 아낄 게 없는데, 브라우저가 미뤘다며 자리표시자로
                                        // 바꿔 놓으면 아이콘이 통째로 빈칸으로 보인다 (2026-08-08 제보).
                                        /* width/height 를 **속성으로** 박는다. CSS 가 아직
                                         * 안 붙은 순간에도 브라우저가 이 크기로 자리를 잡아,
                                         * 파비콘이 화면을 꽉 채우는 첫 깜빡임이 안 생긴다. */
                                        : `<img class="fav-icon" width="52" height="52" src="${esc(getFaviconUrl(it))}" alt="" decoding="async" onerror="${FAVICON_IMG_ONERROR.replace(/"/g, '&quot;')}">`;
                                    /* 앱 칸의 href 에도 스킴을 적는다. 눌러서 여는 것은
                                     * 아래 클릭 처리가 맡지만, 가운데 클릭, 마우스 올렸을 때
                                     * 뜨는 주소 같은 브라우저 기본 동작이 살아 있어야 한다.
                                     * `target=_blank` 는 안 쓴다. 프로토콜로 넘어가는 데
                                     * 새 탭이 필요 없고, 쓰면 빈 탭이 하나 남는다. */
                                    const linkAttrs = isTool
                                        ? `href="#" class="fav-item" title="${esc(it.label)}" data-tool-id="${esc(it.toolId || '')}"`
                                        : isApp
                                        ? `href="${esc(it.scheme ? it.scheme + '://' : '#')}" class="fav-item" title="${esc(it.label)}" data-app-key="${esc(appKey(it))}"`
                                        : `href="${esc(it.url || '')}" class="fav-item" target="_blank" rel="noopener noreferrer" title="${esc(it.label)}"`;
                                    return `
                                    <div class="fav-item-wrap" data-searchable="${esc(searchable)}">
                                        ${removeBtn}
                                        ${isApp && isDesktop() ? `<span class="fav-app-badge off" data-app-badge="${esc(appKey(it))}" title="${esc(t('favorites.app.checking'))}"></span>` : ''}
                                        <a ${linkAttrs}>
                                            ${iconHtml}
                                            <span class="fav-label">${esc(it.label)}</span>
                                        </a>
                                    </div>`;
                                }).join('')}
                                ${/* 그룹 끝에 담기 칸. 덱 배치는 빈 칸이 이미 그 일을 하므로
                                      목록 배치에만 붙인다 (사용자 결정 2026-08-19). */
                                  skin === 'plain'
                                    ? `<div class="fav-item-wrap">
                                           <button type="button" class="fav-add-tile" data-add-slot="-1" data-add-group="${esc(g.group)}" title="${esc(t('favorites.title.favaddopen'))}">
                                               <span class="fav-add-plus">+</span>
                                           </button>
                                       </div>`
                                    : emptyHtml(g.group, -1, esc)}
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="fav-add-modal-backdrop" id="fav-add-modal">
                    <div class="fav-add-modal" onclick="event.stopPropagation()">
                        <h3>${esc(t('favorites.t05'))}</h3>
                        <div class="fav-add-kind">
                            <button type="button" class="fav-kind-btn ${openKind === 'site' ? 'active' : ''}" data-kind="site">${esc(t('favorites.t06'))}</button>
                            <button type="button" class="fav-kind-btn ${openKind === 'tool' ? 'active' : ''}" data-kind="tool">${esc(t('favorites.t07'))}</button>
                            <button type="button" class="fav-kind-btn ${openKind === 'app' ? 'active' : ''}" data-kind="app">${esc(t('favorites.t17'))}</button>
                        </div>
                        <div class="fav-add-pane" data-pane="app" ${openKind === 'app' ? '' : 'hidden'}>
                            <div class="fav-app-note">${esc(isDesktop() ? t('favorites.app.noteDesktop') : t('favorites.app.noteWeb'))}</div>
                            <input type="text" class="input fav-tool-search" id="fav-app-search" placeholder="${esc(t('favorites.app.searchPh'))}" autocomplete="off" value="${esc(openKind === 'app' ? openQuery : '')}">
                            <div class="fav-tool-list" id="fav-app-list">${renderAppPicker(openKind === 'app' ? openQuery : '')}</div>
                            <div class="fav-app-custom">
                                <input type="text" id="fav-app-custom" placeholder="${esc(isDesktop() ? t('favorites.app.customPhDesktop') : t('favorites.app.customPhWeb'))}" autocomplete="off">
                                <button type="button" class="btn" id="fav-app-custom-add">${esc(t('favorites.btn.favaddbtn'))}</button>
                            </div>
                        </div>
                        <div class="fav-add-pane" data-pane="tool" ${openKind === 'tool' ? '' : 'hidden'}>
                            <input type="text" class="input fav-tool-search" id="fav-tool-search" placeholder="${esc(t('favorites.ph.favtoolsearch'))}" autocomplete="off" value="${esc(openQuery)}">
                            <div class="fav-tool-list" id="fav-tool-list">${renderToolPicker(openQuery)}</div>
                        </div>
                        <div class="fav-add-form" data-pane="site" ${openKind === 'site' ? '' : 'hidden'}>
                            <div class="form-group">
                                <label for="fav-url">URL</label>
                                <input type="url" id="fav-url" placeholder="https://example.com" class="input">
                            </div>
                            <div class="form-group">
                                <label for="fav-label">${esc(t('favorites.label.favlabel'))}</label>
                                <input type="text" id="fav-label" placeholder="${esc(t('favorites.ph.favlabel'))}" class="input">
                            </div>
                            <div class="form-group">
                                <label for="fav-icon">${esc(t('favorites.label.favicon'))}</label>
                                <input type="url" id="fav-icon" placeholder="https://example.com/favicon.ico" class="input">
                            </div>
                            <div class="form-group">
                                <label for="fav-group">${esc(t('favorites.label.favgroup'))}</label>
                                <select id="fav-group" class="input">
                                    <option value="개발">${esc(t('favorites.group.dev'))}</option>
                                    <option value="채용, 커리어">${esc(t('favorites.group.career'))}</option>
                                    <option value="메이플">${esc(t('favorites.group.maple'))}</option>
                                    <option value="검색, AI">${esc(t('favorites.group.searchAi'))}</option>
                                    <option value="AI 아트">${esc(t('favorites.group.aiArt'))}</option>
                                    <option value="소셜, 미디어">${esc(t('favorites.group.social'))}</option>
                                    <option value="서로이웃">${esc(t('favorites.group.neighbours'))}</option>
                                    <option value="짝이웃">${esc(t('favorites.group.friends'))}</option>
                                    <option value="도구">${esc(t('favorites.group.tools'))}</option>
                                    <option value="기타">${esc(t('favorites.opt.null7'))}</option>
                                </select>
                            </div>
                            <button type="button" class="btn btn-primary" id="fav-add-btn">${esc(t('favorites.btn.favaddbtn'))}</button>
                        </div>
                    </div>
                </div>`;

            const modal = container.querySelector<HTMLElement>('#fav-add-modal');
            if (modal) {
                modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };
            }

            const toolSearch = container.querySelector<HTMLInputElement>('#fav-tool-search');
            const toolList = container.querySelector<HTMLElement>('#fav-tool-list');

            function showKind(kind: FavKind): void {
                container.querySelectorAll<HTMLButtonElement>('.fav-kind-btn').forEach((b) => {
                    b.classList.toggle('active', b.dataset.kind === kind);
                });
                container.querySelectorAll<HTMLElement>('.fav-add-modal [data-pane]').forEach((p) => {
                    p.hidden = p.dataset.pane !== kind;
                });
            }
            container.querySelectorAll<HTMLButtonElement>('.fav-kind-btn').forEach((b) => {
                b.onclick = () => showKind((b.dataset.kind as FavKind) || 'site');
            });

            function wireToolRows(): void {
                container.querySelectorAll<HTMLButtonElement>('.fav-tool-row').forEach((row) => {
                    row.onclick = () => {
                        const id = row.dataset.pick;
                        if (!id) return;
                        const picked = loadPickedTools();
                        if (picked.has(id)) picked.delete(id);
                        else picked.add(id);
                        savePickedTools(picked);
                        Toolbox.showToast?.(picked.has(id) ? t('favorites.t12') : t('favorites.t13'));
                        pendingOpen = { kind: 'tool', q: toolSearch?.value ?? '' };
                        render();
                    };
                });
            }
            wireToolRows();

            if (toolSearch && toolList) {
                toolSearch.oninput = () => {
                    toolList.innerHTML = renderToolPicker(toolSearch.value);
                    wireToolRows();
                };
            }

            // ── 앱 담기 ──────────────────────────────────────────────────────
            const appSearch = container.querySelector<HTMLInputElement>('#fav-app-search');
            const appList = container.querySelector<HTMLElement>('#fav-app-list');

            function redrawAppList(): void {
                if (!appList) return;
                appList.innerHTML = renderAppPicker(appSearch?.value ?? '');
                wireAppRows();
            }

            function toggleApp(entry: FavApp): void {
                const key = appKey(entry);
                if (!key) return;
                const apps = loadApps();
                const at = apps.findIndex((a) => appKey(a) === key);
                if (at >= 0) apps.splice(at, 1);
                else apps.push(entry);
                saveApps(apps);
                Toolbox.showToast?.(at >= 0 ? t('favorites.t13') : t('favorites.t12'));
                pendingOpen = { kind: 'app', q: appSearch?.value ?? '' };
                render();
            }

            function wireAppRows(): void {
                container.querySelectorAll<HTMLButtonElement>('.fav-tool-row[data-app-pick]').forEach((row) => {
                    row.onclick = () => {
                        toggleApp({
                            label: row.dataset.label || row.dataset.scheme || '',
                            scheme: row.dataset.scheme || undefined,
                            exec: row.dataset.exec || undefined
                        });
                    };
                });
            }
            wireAppRows();

            if (appSearch) appSearch.oninput = redrawAppList;

            /* 데스크톱에서는 담기 칸을 **레지스트리 실물**로 바꾼다. 한 번 읽어 두고
             * (`appChoices`) 다시 그릴 때는 재사용한다. 창을 여닫을 때마다 수천 칸을
             * 훑을 이유가 없다. */
            if (isDesktop() && appChoices === null) {
                void listInstalled().then((list) => {
                    if (!list.length) return;
                    appChoices = list;
                    redrawAppList();
                });
            }

            const customInput = container.querySelector<HTMLInputElement>('#fav-app-custom');
            const customAdd = container.querySelector<HTMLButtonElement>('#fav-app-custom-add');
            if (customAdd && customInput) {
                const addCustom = (): void => {
                    const raw = customInput.value.trim();
                    if (!raw) return;
                    /* **스킴인지 먼저 본다.** `discord://` 에도 슬래시가 들어 있어서
                     * 슬래시가 있으면 경로로 판정하면 스킴이 전부 경로로 잡힌다
                     * (그래서 웹에서 스킴을 못 담던 버그). 스킴 = `이름:` 으로 시작하는 것,
                     * 그 밖에 구분자, 확장자가 있는 것만 실행 파일로 본다. */
                    /* 스킴 이름은 **두 글자 이상**만 인정한다. 한 글자를 허용하면
                     * `C:\GoogleDrive\...\ScreenToGif.exe` 의 `C:` 가 스킴으로 잡혀
                     * c:// 라는 열 수 없는 칸이 담긴다 (2026-08-20 제보).
                     * 윈도우 드라이브 문자와 겹치는 한 글자 스킴은 실제로 쓰이지 않는다. */
                    const schemeMatch = /^([a-z][a-z0-9+.-]+):/i.exec(raw);
                    const looksPath =
                        !schemeMatch && (/[\\/]/.test(raw) || /\.(exe|cmd|bat|app|sh)$/i.test(raw));
                    /* 웹에서는 실행 파일을 못 켠다. 담기 전에 막는다. 담아 두고 눌러야
                     * 안 되는 것을 알게 하면 그게 더 나쁘다. */
                    if (looksPath && !isDesktop()) {
                        Toolbox.showToast?.(t('favorites.app.pathWebOnly'), 'error');
                        return;
                    }
                    const scheme = looksPath
                        ? undefined
                        : (schemeMatch ? schemeMatch[1] : raw).toLowerCase();
                    const label = looksPath
                        ? (raw.split(/[\\/]/).pop() || raw).replace(/\.[^.]+$/, '')
                        : (scheme || raw);
                    toggleApp({ label, scheme, exec: looksPath ? raw : undefined });
                    customInput.value = '';
                };
                customAdd.onclick = addCustom;
                customInput.onkeydown = (e: KeyboardEvent) => {
                    if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
                };
            }

            if (reopen) {
                modal?.classList.add('open');
                const box = reopen.kind === 'tool' ? toolSearch : reopen.kind === 'app' ? appSearch : null;
                if (box) {
                    box.focus();
                    box.setSelectionRange(box.value.length, box.value.length);
                }
            }

            container.querySelector<HTMLButtonElement>('#fav-add-btn')!.onclick = () => {
                const urlInput = container.querySelector<HTMLInputElement>('#fav-url');
                const labelInput = container.querySelector<HTMLInputElement>('#fav-label');
                const iconInput = container.querySelector<HTMLInputElement>('#fav-icon');
                const groupSelect = container.querySelector<HTMLSelectElement>('#fav-group');
                if (!urlInput || !labelInput || !groupSelect) return;
                const url = (urlInput.value || '').trim();
                if (!url) {
                    Toolbox.showToast?.(t('favorites.t14'), 'error');
                    return;
                }
                let label = (labelInput.value || '').trim();
                if (!label) {
                    try {
                        label = new URL(url).hostname.replace(/^www\./, '');
                    } catch (_) {
                        label = url;
                    }
                }
                const iconUrl = (iconInput?.value || '').trim() || null;
                const group = groupSelect.value || '기타';
                const data = loadFavorites() || [];
                let g = data.find((d) => d.group === group);
                if (!g) {
                    g = { group, items: [] };
                    data.push(g);
                }
                g.items.push({ url, label, icon: iconUrl });
                saveFavorites(data);
                urlInput.value = '';
                labelInput.value = '';
                if (iconInput) iconInput.value = '';
                modal?.classList.remove('open');
                Toolbox.showToast?.(t('favorites.t15'));
                render();
            };

            container.querySelectorAll<HTMLButtonElement>('.fav-remove').forEach((btn) => {
                btn.onclick = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const appRemove = btn.dataset.appRemove;
                    if (appRemove) {
                        saveApps(loadApps().filter((a) => appKey(a) !== appRemove));
                        Toolbox.showToast?.(t('favorites.t16'));
                        render();
                        return;
                    }
                    const toolId = btn.dataset.tool;
                    if (toolId) {
                        const picked = loadPickedTools();
                        picked.delete(toolId);
                        savePickedTools(picked);
                        Toolbox.showToast?.(t('favorites.t13'));
                        render();
                        return;
                    }
                    const group = btn.dataset.group;
                    const url = btn.dataset.url;
                    const data = loadFavorites() || [];
                    const g = data.find((d) => d.group === group);
                    if (g) {
                        g.items = g.items.filter((it) => it.url !== url);
                        if (!g.items.length) data.splice(data.indexOf(g), 1);
                        saveFavorites(data);
                        Toolbox.showToast?.(t('favorites.t16'));
                        render();
                    }
                };
            });

            container.querySelectorAll<HTMLAnchorElement>('.fav-item[data-app-key]').forEach((a) => {
                a.onclick = (e: MouseEvent) => {
                    e.preventDefault();
                    const key = a.dataset.appKey;
                    const app = loadApps().find((x) => appKey(x) === key);
                    if (!app) return;
                    /* 웹에서는 열렸나를 확실히 알 수 없다. 그래서 *누르기 전에* 지켜보기를
                     * 걸어 둔다. 창이 흐려지면 열린 것, 그대로면 안 열린 것으로 본다.
                     * 미등록 스킴은 브라우저가 아무 말 없이 삼키므로, 이 짐작이라도 없으면
                     * 사용자는 자기가 잘못 눌렀다고 생각한다. */
                    const watching = watchLaunch();
                    void launchApp(appSpec(app))
                        .then(() => watching)
                        .then((opened) => {
                            if (!opened) Toolbox.showToast?.(t('favorites.app.maybeNotOpened', { name: app.label }));
                        })
                        .catch((err: unknown) => {
                            const msg = err instanceof Error ? err.message : String(err);
                            Toolbox.showToast?.(
                                msg === 'web-no-scheme'
                                    ? t('favorites.app.webNeedsScheme', { name: app.label })
                                    : t('favorites.app.launchFail', { name: app.label, why: msg }),
                                'error'
                            );
                        });
                };
            });

            /* 칸 우클릭 메뉴. 데스크톱 앱에서만 뜬다(웹은 브라우저 메뉴가 그대로 산다).
             * 지금까지 마우스를 올려야 나타나는 작은 × 하나에 빼기를 우겨넣고 있었는데,
             * 그건 손가락이 굵은 날이나 덱 살결에서는 사실상 못 누르는 단추였다.
             * 선택자로 걸므로 다시 그려도 살아 있다. 같은 선택자 재등록은 덮어쓴다. */
            registerContextMenu('.fav-item', (el): MenuEntry[] | null => {
                const a = el as HTMLAnchorElement;
                const toolId = a.dataset.toolId || '';
                const appK = a.dataset.appKey || '';
                const href = a.getAttribute('href') || '';
                /* 사이트 칸만 주소가 뜻이 있다. 도구는 화면 전환, 앱은 스킴이라 복사해도 쓸 데가 없다. */
                const url = !toolId && !appK && href && href !== '#' ? href : '';
                const entries: MenuEntry[] = [
                    { label: t('ctxmenu.open'), onSelect: () => a.click() }
                ];
                if (url) {
                    entries.push({
                        label: t('ctxmenu.copyUrl'),
                        onSelect: () => {
                            /* 상대 주소로 담은 칸(도구 장 등)이 있어 절대 주소로 펴서 준다. 붙여 넣은 곳에서 열려야 한다. */
                            const abs = (() => { try { return new URL(url, location.href).href; } catch (_) { return url; } })();
                            void navigator.clipboard?.writeText(abs).catch(() => {});
                        }
                    });
                }
                const remove = removerFor({ toolId, appKey: appK, url });
                if (remove) entries.push('-', { label: t('ctxmenu.removeFav'), danger: true, onSelect: remove });
                return entries;
            });

            /* 뱃지 = 이 PC 에 있나. 데스크톱만 답할 수 있으므로 웹에서는 아예 안 단다
             * (회색 점 = 없음이라는 뜻인데, 웹은 그걸 모른다. 달면 거짓말이 된다). */
            if (isDesktop()) {
                container.querySelectorAll<HTMLElement>('[data-app-badge]').forEach((dot) => {
                    const app = loadApps().find((x) => appKey(x) === dot.dataset.appBadge);
                    if (!app) return;
                    void checkInstalled(appSpec(app)).then((ok) => {
                        if (ok === null) { dot.remove(); return; }
                        dot.classList.toggle('off', !ok);
                        dot.title = ok ? t('favorites.app.installed') : t('favorites.app.missing');
                        const link = dot.parentElement?.querySelector('.fav-item');
                        link?.classList.toggle('fav-app-missing', !ok);
                    });
                });
            }

            container.querySelectorAll<HTMLAnchorElement>('.fav-item[data-tool-id]').forEach((a) => {
                a.onclick = (e: MouseEvent) => {
                    e.preventDefault();
                    const id = a.dataset.toolId;
                    if (id && typeof Toolbox !== 'undefined' && Toolbox.switchPage) Toolbox.switchPage(id);
                };
            });

            const searchInput = container.querySelector<HTMLInputElement>('#favSearch');
            if (searchInput) {
                searchInput.oninput = () => {
                    const q = searchInput.value.toLowerCase().trim();
                    container.querySelectorAll<HTMLElement>('.fav-item-wrap').forEach((wrap) => {
                        const searchable = wrap.dataset.searchable ?? '';
                        const match = !q || searchable.includes(q);
                        wrap.style.display = match ? '' : 'none';
                    });
                    container.querySelectorAll<HTMLElement>('.fav-group').forEach((grp) => {
                        const visible = grp.querySelectorAll('.fav-item-wrap:not([style*="display: none"])');
                        grp.style.display = visible.length ? '' : 'none';
                    });
                };
            }

            /* 빈 칸을 누르면 그 자리에 담으라고 추가창을 연다. */
            container.querySelectorAll<HTMLButtonElement>('[data-add-slot]').forEach((btn) => {
                btn.onclick = () => {
                    modal?.classList.add('open');
                    showKind('site');
                    /* 누른 칸이 속한 그룹을 미리 골라 둔다. 어디에 담을지 다시 고르게 하면
                     * 그 자리에 담는다는 뜻이 흐려진다. */
                    const g = btn.dataset.addGroup;
                    const sel = container.querySelector<HTMLSelectElement>('#fav-group');
                    if (g && sel && [...sel.options].some((o) => o.value === g)) sel.value = g;
                    container.querySelector<HTMLInputElement>('#fav-url')?.focus();
                };
            });

            const layoutBtn = container.querySelector<HTMLButtonElement>('#fav-layout-btn');
            if (layoutBtn) {
                layoutBtn.onclick = () => {
                    setLayout(getLayout() === 'deck' ? 'list' : 'deck');
                    render();
                };
            }

            /* 살결. 뼈대는 그대로, 겉만 갈린다. 그래도 항목 마크업이 갈래별로 달라
             * (기존 살결은 옛 마크업) 다시 그린다. */
            container.querySelectorAll<HTMLButtonElement>('.fav-skin').forEach((b) => {
                b.onclick = () => {
                    setSkin((b.dataset.skin as FavSkin) || 'plain');
                    render();
                };
            });

            /* 크기. 다시 그리지 않는다. 뿌리의 값 하나만 바꾸면 격자가 따라온다. */
            const sizeInput = container.querySelector<HTMLInputElement>('#fav-size');
            const sizeOut = container.querySelector<HTMLElement>('#fav-size-out');
            const root = container.querySelector<HTMLElement>('.fav-layout');
            if (sizeInput && root) {
                sizeInput.oninput = () => {
                    const px = Number(sizeInput.value);
                    root.style.setProperty('--fk-size', px + 'px');
                    if (sizeOut) sizeOut.textContent = String(px);
                    setKeySize(px);
                };
            }

            /* 덱은 그린 뒤에 배선한다. 되돌리는 함수를 받아 다음 그림 전에 푼다 . 
             * 안 풀면 다시 그릴 때마다 리스너가 쌓인다. */
            /* 키 배선은 **배치와 무관**하다. 살결이 기존이 아니면 목록에서도 키를 쓴다. */
            disposeKeys?.();
            disposeKeys = skin === 'plain' ? null : wireKeys(container);

            disposeDeck?.();
            disposeDeck = isDeck ? wireDeck(container, render) : null;
        }

        render();
    }

    /* 메타는 `widgets-lazy-meta.ts` 한 곳에 산다. 두 곳에 적으면 목록 이름과 화면 이름이 갈라진다. */
    Toolbox.register({
        ...Toolbox.getLazyWidgetPublicMeta('favorites'),
        tabs: [
            {
                id: 'fav-main',
                label: t('favorites.tab.main', undefined, '즐겨찾기'),
                /* 그리기 전에 말 묶음을 받는다. 화면 글자가 전부 이 안에서 만들어진다. */
                build: function (container: HTMLElement): void {
                    /* 우클릭 메뉴 글도 같이 받는다. 칸 메뉴 항목(열기, 주소 복사, 빼기)이
                     * `ctxmenu` 열쇠를 쓴다. 안 받으면 열쇠 이름이 그대로 뜬다. */
                    void Promise.all([loadNamespace('favorites'), loadNamespace('ctxmenu')]).then(function () {
                        buildFavorites(container);
                    });
                }
            }
        ]
    });
})();
