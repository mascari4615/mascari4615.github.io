import { t } from '../../lib/i18n';

(function () {
    const T = ((window.Tierlist = window.Tierlist || {}) as unknown) as TierlistNamespace;

    const STORAGE_KEY = 'toolbox_tierlists';

    const DEFAULT_TIERS: TlTierDef[] = [
        { id: 's', label: 'S', color: '#ff7f7f' },
        { id: 'a', label: 'A', color: '#ffbf7f' },
        { id: 'b', label: 'B', color: '#ffdf7f' },
        { id: 'c', label: 'C', color: '#ffff7f' },
        { id: 'd', label: 'D', color: '#bfff7f' },
        { id: 'f', label: 'F', color: '#7fbfff' },
    ];

    const TierDB: TlDbAPI = (() => {
        const DB_NAME = 'toolbox_tierlist_images';
        const STORE = 'images';
        const VER = 1;
        const cache = new Map<string, string>();

        function open(): Promise<IDBDatabase> {
            return new Promise<IDBDatabase>((resolve, reject) => {
                const r = indexedDB.open(DB_NAME, VER);
                r.onupgradeneeded = () => {
                    const db = r.result;
                    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
                };
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error);
            });
        }

        async function save(id: string, dataUrl: string): Promise<void> {
            const db = await open();
            try {
                await new Promise<void>((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readwrite');
                    tx.objectStore(STORE).put({ id, dataUrl });
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                cache.set(id, dataUrl);
            } finally { db.close(); }
        }

        async function get(id: string): Promise<string | null> {
            const cached = cache.get(id);
            if (cached !== undefined) return cached;
            const db = await open();
            try {
                const item = await new Promise<{ id: string; dataUrl?: string } | undefined>((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readonly');
                    const req = tx.objectStore(STORE).get(id);
                    req.onsuccess = () => resolve(req.result as { id: string; dataUrl?: string } | undefined);
                    req.onerror = () => reject(req.error);
                });
                if (item?.dataUrl) { cache.set(id, item.dataUrl); return item.dataUrl; }
                return null;
            } finally { db.close(); }
        }

        async function remove(id: string): Promise<void> {
            cache.delete(id);
            const db = await open();
            try {
                await new Promise<void>((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readwrite');
                    tx.objectStore(STORE).delete(id);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            } finally { db.close(); }
        }

        async function getMany(ids: string[]): Promise<Record<string, string>> {
            const results: Record<string, string> = {};
            const missing = ids.filter((id) => {
                const c = cache.get(id);
                if (c !== undefined) { results[id] = c; return false; }
                return true;
            });
            if (!missing.length) return results;

            const db = await open();
            try {
                const tx = db.transaction(STORE, 'readonly');
                const store = tx.objectStore(STORE);
                await Promise.all(missing.map((id) => new Promise<void>((resolve, reject) => {
                    const req = store.get(id);
                    req.onsuccess = () => {
                        const row = req.result as { dataUrl?: string } | undefined;
                        if (row?.dataUrl) {
                            cache.set(id, row.dataUrl);
                            results[id] = row.dataUrl;
                        }
                        resolve();
                    };
                    req.onerror = () => reject(req.error);
                })));
            } finally { db.close(); }
            return results;
        }

        return { save, get, remove, getMany };
    })();

    let state: TlState = { catalogs: {}, instances: {}, currentInstanceId: null };
    let publishedCurrent: TlPublishedCurrent | null = null;

    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

    function isCatalogPayload(data: unknown): boolean {
        if (!data || typeof data !== 'object') return false;
        const d = data as TlPublishedData;
        if (d.kind === 'catalog') return true;
        if ((d.version ?? 0) >= 2 && d.items && typeof d.items === 'object' && !d.list) return true;
        return false;
    }

    function migrateIfNeeded() {
        state.catalogs = state.catalogs || {};
        state.instances = state.instances || {};

        const pickCurrentId = (preserved: string | null | undefined) => {
            if (preserved && state.instances[preserved]) state.currentInstanceId = preserved;
            else if (!state.currentInstanceId) {
                const first = Object.values(state.instances).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
                state.currentInstanceId = first?.id || null;
            }
        };

        const ingestList = (list: TlListInstance | undefined) => {
            if (!list || !list.id) return;
            state.instances[list.id] = JSON.parse(JSON.stringify(list)) as TlListInstance;
        };

        if (state.datasets && typeof state.datasets === 'object' && Object.keys(state.datasets).length) {
            const preserved = state.currentListId || state.currentInstanceId;
            Object.values(state.datasets).forEach((ds) => {
                Object.values(ds.lists || {}).forEach(ingestList);
            });
            delete state.datasets;
            delete state.currentDatasetId;
            delete state.lists;
            delete state.currentListId;
            pickCurrentId(preserved);
            return;
        }

        if (state.lists && typeof state.lists === 'object' && Object.keys(state.lists).length) {
            const preserved = state.currentListId || state.currentInstanceId;
            Object.values(state.lists).forEach(ingestList);
            delete state.lists;
            delete state.currentListId;
            pickCurrentId(preserved);
        }
    }

    function catalogEntryToListItem(entry: TlItem | undefined | null): TlItem | null {
        if (!entry || typeof entry !== 'object') return null;
        const it = JSON.parse(JSON.stringify(entry)) as TlItem;
        it.id = entry.id;
        it.tlOrigin = 'catalog';
        delete it.tlEdited;
        return it;
    }

    /** 후보 풀 기준 되돌리기 가능 여부(로컬 풀·URL 풀·풀 출처 카드) */
    function canResetItemFromPool(list: TlListInstance, itemId: string): boolean {
        const it = list?.items?.[itemId];
        if (!it) return false;
        if (list.catalogId && state.catalogs[list.catalogId]?.items?.[itemId]) return true;
        if (String(list.meta?.catalogUrl || '').trim()) return true;
        return it.tlOrigin === 'catalog';
    }

    /** 연결된 후보 풀 항목으로 덮어쓰기(이름·이미지·라벨·수정 표시 제거). catalogEntry 는 풀 items[id] 원본 */
    function applyCatalogEntryToItem(list: TlListInstance, itemId: string, catalogEntry: TlItem): boolean {
        if (!list?.items?.[itemId] || !catalogEntry) return false;
        const old = list.items[itemId];
        const oldKey = old.imageKey ?? null;
        const stamped = catalogEntryToListItem(catalogEntry);
        if (!stamped) return false;
        list.items[itemId] = stamped;
        const newKey = stamped.imageKey ?? null;
        if (oldKey && oldKey !== newKey) {
            try { TierDB.remove(oldKey); } catch (_) {}
        }
        touchInstance(list);
        saveState();
        return true;
    }

    /**
     * 카탈로그에 있는 id는 list.items에 없으면 채우고, 어떤 티어·_pool에도 없으면 _pool 끝에 추가.
     * @returns {boolean} 변경 여부
     */
    function ensureAllCatalogItemsOnBoard(list: TlListInstance, catalogItems: Record<string, TlItem>): boolean {
        if (!list || !catalogItems || typeof catalogItems !== 'object') return false;
        list.items = list.items || {};
        list.rankings = list.rankings || {};
        list.rankings._pool = list.rankings._pool || [];

        const seenRank = new Set<string>();
        Object.values(list.rankings).forEach((arr) => {
            (arr || []).forEach((id) => { if (id) seenRank.add(id); });
        });

        let changed = false;
        Object.keys(catalogItems).forEach((id) => {
            const src = catalogItems[id];
            if (!src || typeof src !== 'object') return;
            if (!list.items[id]) {
                const stamped = catalogEntryToListItem(src);
                if (stamped) {
                    list.items[id] = stamped;
                    changed = true;
                }
            }
            if (!seenRank.has(id)) {
                if (!list.rankings._pool.includes(id)) list.rankings._pool.push(id);
                seenRank.add(id);
                changed = true;
            }
        });
        return changed;
    }

    /** 동일 id가 여러 줄에 있으면 티어 표시 순·_pool 순으로 한 곳만 남김 */
    function dedupeRankingPlacements(list: TlListInstance): boolean {
        if (!list?.rankings) return false;
        const seen = new Set<string>();
        const order: string[] = [];
        (list.tiers || []).forEach((t) => order.push(t.id));
        order.push('_pool');
        Object.keys(list.rankings).forEach((k) => {
            if (!order.includes(k)) order.push(k);
        });
        let changed = false;
        order.forEach((tid) => {
            const arr = list.rankings[tid];
            if (!Array.isArray(arr)) return;
            const next: string[] = [];
            arr.forEach((id) => {
                if (!id) return;
                if (seen.has(id)) {
                    changed = true;
                    return;
                }
                seen.add(id);
                next.push(id);
            });
            if (next.length !== arr.length) changed = true;
            list.rankings[tid] = next;
        });
        return changed;
    }

    /**
     * 카탈로그 items 맵과 순위 판 동기화(누락 항목·배치·중복·떠 있는 custom 정리).
     * @returns {boolean} 변경 여부
     */
    function reconcileListWithCatalogPayload(list: TlListInstance, catalogItems: Record<string, TlItem>): boolean {
        if (!list || !catalogItems || typeof catalogItems !== 'object') return false;
        let ch = ensureAllCatalogItemsOnBoard(list, catalogItems);
        ch = dedupeRankingPlacements(list) || ch;
        ch = ensureFloatingItemsInPool(list) || ch;
        if (ch) touchInstance(list);
        return ch;
    }

    function isItemRemovable(list: TlListInstance, itemId: string): boolean {
        const it = list?.items?.[itemId];
        return !!(it && it.tlOrigin === 'custom');
    }

    /**
     * items에는 있는데 티어·미배치 어디에도 없는 id → _pool에 한 번만 추가.
     * @returns {boolean} 변경 여부
     */
    function ensureFloatingItemsInPool(list: TlListInstance): boolean {
        if (!list?.items) return false;
        const seen = new Set<string>();
        Object.values(list.rankings || {}).forEach((arr) => {
            (arr || []).forEach((id) => { if (id) seen.add(id); });
        });
        const pool = list.rankings._pool = list.rankings._pool || [];
        let changed = false;
        Object.keys(list.items).forEach((id) => {
            if (seen.has(id)) return;
            if (!pool.includes(id)) {
                pool.push(id);
                changed = true;
            }
        });
        return changed;
    }

    /**
     * 로컬 후보 풀(catalogId)이 삭제된 뒤에도 인스턴스가 가리키는 경우: 연결 해제,
     * 풀 출처 카드는 직접 추가로 간주하고 티어에서만 제거해 미배치(_pool)로 모음.
     */
    function migrateDetachedCatalogInstances() {
        const catalogs = state.catalogs || {};
        const instances = state.instances || {};
        let any = false;
        Object.values(instances).forEach((list) => {
            if (!list?.id) return;
            let changed = false;
            const cid = list.catalogId;
            if (cid && !catalogs[cid]) {
                delete list.catalogId;
                changed = true;
                const pool = list.rankings._pool = list.rankings._pool || [];
                Object.keys(list.items || {}).forEach((itemId) => {
                    const it = list.items[itemId];
                    if (!it || it.tlOrigin !== 'catalog') return;
                    it.tlOrigin = 'custom';
                    delete it.tlEdited;
                    Object.keys(list.rankings || {}).forEach((tid) => {
                        if (tid === '_pool') return;
                        const arr = list.rankings[tid];
                        if (!Array.isArray(arr)) return;
                        const ix = arr.indexOf(itemId);
                        if (ix !== -1) arr.splice(ix, 1);
                    });
                    if (!pool.includes(itemId)) pool.push(itemId);
                });
            }
            if (ensureFloatingItemsInPool(list)) changed = true;
            if (changed) {
                touchInstance(list);
                any = true;
            }
        });
        if (any) saveState();
    }

    /** 로컬 catalogId 가 유효한 인스턴스: 카탈로그 전 항목이 판에 반드시 나타나게 */
    function reconcileInstancesWithLinkedCatalogs() {
        const catalogs = state.catalogs || {};
        let any = false;
        Object.values(state.instances || {}).forEach((list) => {
            if (!list?.catalogId || !catalogs[list.catalogId]) return;
            const catItems = catalogs[list.catalogId].items || {};
            let ch = false;
            if (reconcileListWithCatalogPayload(list, catItems)) ch = true;
            if (pruneStaleCatalogBindings(list, catItems)) ch = true;
            if (ch) {
                touchInstance(list);
                any = true;
            }
        });
        if (any) saveState();
    }

    function touchInstance(list: TlListInstance | null | undefined) {
        if (list) list.updatedAt = Date.now();
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) state = JSON.parse(raw) as TlState;
        } catch (_) {}
        migrateIfNeeded();
        state.catalogs = state.catalogs || {};
        state.instances = state.instances || {};
        migrateDetachedCatalogInstances();
        reconcileInstancesWithLinkedCatalogs();
        if (state.currentInstanceId && !state.instances[state.currentInstanceId]) {
            const next = Object.values(state.instances).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
            state.currentInstanceId = next?.id || null;
        }
    }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    }

    function iterAllInstances(): Array<{ list: TlListInstance; catalogTitle: string | null }> {
        return Object.values(state.instances || {}).map((list) => ({ list, catalogTitle: null }));
    }

    function isPublishedMode(): boolean { return !!publishedCurrent; }

    function isPublishedCatalogMode(): boolean {
        return !!publishedCurrent && isCatalogPayload(publishedCurrent.data);
    }

    function currentList(): TlListInstance | null {
        if (publishedCurrent?.data?.list) return publishedCurrent.data.list;
        return state.instances[state.currentInstanceId ?? ''] || null;
    }

    function currentMeta(): TlCurrentMetaView {
        const list = currentList();
        if (isPublishedCatalogMode() && publishedCurrent) {
            const d = publishedCurrent.data;
            return {
                id: publishedCurrent.meta?.id || '',
                title: publishedCurrent.meta?.title || d.title || '',
                source: 'published-catalog',
                dirty: false,
                url: publishedCurrent.meta?.url || '',
                catalogUrl: (d as { meta?: { catalogUrl?: string } }).meta?.catalogUrl || '',
                tierlistGroup: String(publishedCurrent.meta?.tierlistGroup || publishedCurrent.meta?.group || 'catalog'),
            };
        }
        if (!list) return { title: '', id: '', source: 'none', dirty: false, url: '', catalogUrl: '', tierlistGroup: '' };
        if (publishedCurrent?.data?.list) {
            return {
                id: publishedCurrent.meta?.id || list.id,
                title: publishedCurrent.meta?.title || list.title,
                source: 'published',
                dirty: false,
                url: publishedCurrent.meta?.url || '',
                catalogUrl: publishedCurrent.data.list.meta?.catalogUrl || '',
                tierlistGroup: String(publishedCurrent.meta?.tierlistGroup || publishedCurrent.meta?.group || ''),
            };
        }
        const local = state.instances[state.currentInstanceId ?? ''];
        return {
            id: local?.id || list.id,
            title: local?.title || list.title,
            source: local?.meta?.source || 'local',
            dirty: !!local?.meta?.dirty,
            url: local?.meta?.publishedUrl || '',
            catalogUrl: local?.meta?.catalogUrl || '',
            tierlistGroup: '',
        };
    }

    function openPublished(meta: TlPublishedMeta | null | undefined, data: TlPublishedData) {
        publishedCurrent = { meta: meta || {}, data };
    }
    function closePublished() { publishedCurrent = null; }

    function getPublishedCatalogSnapshot(): TlPublishedCurrent | null {
        if (!isPublishedCatalogMode()) return null;
        return publishedCurrent;
    }

    /** 블로그 JSON 루트의 images 맵(data URL 등). 순위(list) 열람 시 IDB에 없어도 표시용 */
    function getPublishedEmbeddedImages(): Record<string, string> {
        if (!publishedCurrent?.data?.list) return {};
        return publishedCurrent.data.images || {};
    }

    function ensureWritableList(reason: string): TlListInstance | null {
        if (!isPublishedMode()) return currentList();
        if (isPublishedCatalogMode()) return null;

        const data = publishedCurrent?.data;
        if (!data?.list) return null;

        const src = data.list;
        const newId = 'draft-' + uid();
        const now = Date.now();
        state.instances[newId] = {
            ...(JSON.parse(JSON.stringify(src)) as TlListInstance),
            id: newId,
            createdAt: now,
            updatedAt: now,
            meta: {
                ...(src.meta || {}),
                source: 'published-draft',
                publishedId: publishedCurrent?.meta?.id || '',
                publishedUrl: publishedCurrent?.meta?.url || '',
                dirty: true,
                dirtyReason: reason || '',
            },
        };
        state.currentInstanceId = newId;
        saveState();
        closePublished();
        return state.instances[newId];
    }

    /** 후보 풀에서 복사한 항목에 tlOrigin= catalog (뱃지용) */
    function stampItemsFromCatalog(itemsRaw: Record<string, TlItem> | undefined): Record<string, TlItem> {
        const items = JSON.parse(JSON.stringify(itemsRaw || {})) as Record<string, TlItem>;
        Object.values(items).forEach((it) => {
            if (it && typeof it === 'object') {
                it.tlOrigin = 'catalog';
                delete it.tlEdited;
            }
        });
        return items;
    }

    /** 블로그 등에서 연 순수 후보 풀 → 로컬 순위 인스턴스 1개 생성(이미지는 publish에서 주입) */
    function forkInstanceFromCatalogData(catalogData: TlPublishedData, meta: TlPublishedMeta | undefined): TlListInstance {
        closePublished();
        const id = 'tl-' + uid();
        const now = Date.now();
        const tiers: TlTierDef[] = DEFAULT_TIERS.map((t) => ({ ...t }));
        const rankings: TlRankingMap = {};
        tiers.forEach((t) => { rankings[t.id] = []; });
        rankings._pool = [];
        const items = stampItemsFromCatalog(catalogData.items);
        Object.keys(items).forEach((k) => rankings._pool.push(k));
        state.instances[id] = {
            id,
            title: `${meta?.title || catalogData.title || '순위'} · 순위`,
            category: typeof catalogData.category === 'string' ? catalogData.category : '',
            createdAt: now,
            updatedAt: now,
            tiers,
            rankings,
            items,
            userLabels: {},
            meta: {
                source: 'from-catalog',
                catalogUrl: meta?.url || '',
                dirty: true,
            },
        };
        state.currentInstanceId = id;
        saveState();
        return state.instances[id];
    }

    function switchToInstance(instanceId: string) {
        closePublished();
        if (!state.instances[instanceId]) return;
        state.currentInstanceId = instanceId;
        saveState();
    }

    function createCatalog(title: string, category: string): string {
        closePublished();
        const id = 'cat-' + uid();
        const now = Date.now();
        state.catalogs[id] = {
            id,
            title: title || '새 후보 풀',
            category: category || '',
            updatedAt: now,
            items: {},
        };
        saveState();
        return id;
    }

    function deleteCatalog(catalogId: string) {
        closePublished();
        const c = state.catalogs[catalogId];
        if (!c) return;
        try {
            Object.values(c.items || {}).forEach((it) => {
                if (it?.imageKey) TierDB.remove(it.imageKey);
            });
        } catch (_) {}
        delete state.catalogs[catalogId];
        saveState();
        migrateDetachedCatalogInstances();
        reconcileInstancesWithLinkedCatalogs();
    }

    function addCatalogItem(catalogId: string, name: string, imageKey: string | null): string | null {
        closePublished();
        const c = state.catalogs[catalogId];
        if (!c) return null;
        const id = 'ti-' + uid();
        c.items[id] = { id, name: name || '', imageKey: imageKey || null };
        c.updatedAt = Date.now();
        saveState();
        reconcileInstancesWithLinkedCatalogs();
        return id;
    }

    function removeCatalogItem(catalogId: string, itemId: string) {
        closePublished();
        const c = state.catalogs[catalogId];
        if (!c?.items?.[itemId]) return;
        const imgKey = c.items[itemId].imageKey;
        if (imgKey) TierDB.remove(imgKey);
        delete c.items[itemId];
        c.updatedAt = Date.now();
        saveState();
    }

    function createInstanceFromLocalCatalog(catalogId: string): string | null {
        closePublished();
        const c = state.catalogs[catalogId];
        if (!c) return null;
        const id = 'tl-' + uid();
        const now = Date.now();
        const tiers: TlTierDef[] = DEFAULT_TIERS.map((t) => ({ ...t }));
        const rankings: TlRankingMap = {};
        tiers.forEach((t) => { rankings[t.id] = []; });
        rankings._pool = [];
        const items = stampItemsFromCatalog(c.items || {});
        Object.keys(items).forEach((k) => rankings._pool.push(k));
        state.instances[id] = {
            id,
            title: `${c.title || '순위'} · 순위`,
            category: c.category || '',
            catalogId,
            createdAt: now,
            updatedAt: now,
            tiers,
            rankings,
            items,
            userLabels: {},
            meta: { source: 'from-local-catalog', dirty: true },
        };
        state.currentInstanceId = id;
        saveState();
        return id;
    }

    function createList(title: string, category: string): string {
        closePublished();
        const id = 'tl-' + uid();
        const now = Date.now();
        const tiers: TlTierDef[] = DEFAULT_TIERS.map((t) => ({ ...t }));
        const rankings: TlRankingMap = {};
        tiers.forEach((t) => { rankings[t.id] = []; });
        rankings._pool = [];
        state.instances[id] = {
            id,
            title: title || '새 티어리스트',
            category: category || '',
            createdAt: now,
            updatedAt: now,
            tiers,
            rankings,
            items: {},
            userLabels: {},
            meta: { source: 'local', dirty: true },
        };
        state.currentInstanceId = id;
        saveState();
        return id;
    }

    function addItem(name: string, imageKey: string | null): string | null {
        const list = ensureWritableList('addItem') || currentList();
        if (!list) return null;
        const id = 'ti-' + uid();
        list.items[id] = { id, name: name || '', imageKey: imageKey || null, tlOrigin: 'custom' };
        list.rankings._pool = list.rankings._pool || [];
        list.rankings._pool.push(id);
        list.updatedAt = Date.now();
        saveState();
        return id;
    }

    function removeItem(itemId: string): boolean {
        const list = ensureWritableList('removeItem') || currentList();
        if (!list?.items?.[itemId]) return false;
        if (list.items[itemId].tlOrigin !== 'custom') return false;
        const imgKey = list.items[itemId].imageKey;
        if (imgKey) TierDB.remove(imgKey);
        delete list.items[itemId];
        Object.values(list.rankings || {}).forEach((arr) => {
            const idx = arr.indexOf(itemId);
            if (idx !== -1) arr.splice(idx, 1);
        });
        list.updatedAt = Date.now();
        saveState();
        return true;
    }

    /** @returns {boolean} */
    function moveItem(itemId: string, targetTier: string, insertIdx: number | undefined): boolean {
        const list = ensureWritableList('moveItem') || currentList();
        if (!list) return false;
        const target = list.rankings[targetTier];
        if (!Array.isArray(target)) return false;
        Object.values(list.rankings || {}).forEach((arr) => {
            const idx = arr.indexOf(itemId);
            if (idx !== -1) arr.splice(idx, 1);
        });
        if (insertIdx === undefined || insertIdx >= target.length) target.push(itemId);
        else target.splice(insertIdx, 0, itemId);
        list.updatedAt = Date.now();
        saveState();
        return true;
    }

    /**
     * 티어 행(라벨·색·순서·개수) 변경. 사라진 티어에 있던 카드는 미배치로 이동.
     */
    function applyTiers(list: TlListInstance, tiersInOrder: TlTierDef[]): boolean {
        if (!list || !Array.isArray(tiersInOrder) || tiersInOrder.length === 0) return false;
        const maxTiers = 16;
        const raw = tiersInOrder.slice(0, maxTiers).map((t) => ({
            id: String(t.id || '').trim(),
            label: String(t.label || '').trim() || '?',
            color: String(t.color || '#999999').trim() || '#999999',
        }));
        const used = new Set<string>();
        const clean: TlTierDef[] = [];
        for (const t of raw) {
            let id = t.id || ('tr-' + uid());
            while (!id || used.has(id)) id = 'tr-' + uid();
            used.add(id);
            clean.push({ id, label: t.label, color: t.color });
        }
        const newIdSet = new Set(clean.map((t) => t.id));
        const oldR = list.rankings || {};
        const pool = [...(oldR._pool || [])];
        Object.keys(oldR).forEach((tid) => {
            if (tid === '_pool' || newIdSet.has(tid)) return;
            pool.push(...(oldR[tid] || []));
        });
        const newR: TlRankingMap = { _pool: pool };
        clean.forEach((t) => {
            newR[t.id] = [...(oldR[t.id] || [])];
        });
        list.tiers = clean;
        list.rankings = newR;
        touchInstance(list);
        saveState();
        return true;
    }

    /**
     * 카탈로그 items에 id가 없으면(삭제·동기화 등) 직접 추가(custom)로만 취급.
     * itemOverrides만 있던·tlOrigin 미표기 등도 포함해 catalog 잔존 표시를 걷어냄.
     */
    function promoteCatalogMissingToCustom(list: TlListInstance, catalogItemIdSet: Set<string>): boolean {
        if (!list?.items || !(catalogItemIdSet instanceof Set)) return false;
        let changed = false;
        Object.keys(list.items).forEach((id) => {
            const it = list.items[id];
            if (!it || it.tlOrigin === 'custom' || catalogItemIdSet.has(id)) return;
            it.tlOrigin = 'custom';
            delete it.tlEdited;
            changed = true;
        });
        return changed;
    }

    /**
     * 카탈로그가 갱신·축소된 뒤: 풀에 없는 id는 후보 풀 출처가 아닌 것으로 보고 제거.
     * tlOrigin === 'custom' 인 항목(직접 추가)만 풀 밖 id를 유지한다.
     */
    function pruneStaleCatalogBindings(list: TlListInstance, catalogItems: Record<string, TlItem>): boolean {
        if (!list?.items || !catalogItems || typeof catalogItems !== 'object') return false;
        const catIds = new Set(Object.keys(catalogItems));
        let changed = false;
        const toDrop: string[] = [];
        Object.keys(list.items).forEach((id) => {
            const it = list.items[id];
            if (!it) return;
            if (it.tlOrigin === 'custom') return;
            if (catIds.has(id)) return;
            toDrop.push(id);
        });
        toDrop.forEach((id) => {
            const it = list.items[id];
            const imgKey = it?.imageKey;
            if (imgKey) {
                try { TierDB.remove(imgKey); } catch (_) {}
            }
            delete list.items[id];
            Object.values(list.rankings || {}).forEach((arr) => {
                if (!Array.isArray(arr)) return;
                for (let i = arr.length - 1; i >= 0; i--) {
                    if (arr[i] === id) {
                        arr.splice(i, 1);
                        changed = true;
                    }
                }
            });
            changed = true;
        });
        const valid = new Set(Object.keys(list.items || {}));
        Object.keys(list.rankings || {}).forEach((tid) => {
            const arr = list.rankings[tid];
            if (!Array.isArray(arr)) return;
            const next = arr.filter((x) => valid.has(x));
            if (next.length !== arr.length) changed = true;
            list.rankings[tid] = next;
        });
        if (changed) dedupeRankingPlacements(list);
        return changed;
    }

    function persistList(list: TlListInstance | null) {
        if (!list) return;
        touchInstance(list);
        saveState();
    }

    function repairOrphanRankings(): boolean {
        const list = ensureWritableList('integrityRepair') || currentList();
        if (!list) return false;
        const valid = new Set(Object.keys(list.items || {}));
        let changed = false;
        Object.keys(list.rankings || {}).forEach((k) => {
            const arr = list.rankings[k] || [];
            const next = arr.filter((id) => valid.has(id));
            if (next.length !== arr.length) changed = true;
            list.rankings[k] = next;
        });
        if (changed) {
            touchInstance(list);
            saveState();
        }
        return changed;
    }

    function repairDeleteItemsByIds(itemIds: string[]): number {
        if (!itemIds?.length) return 0;
        ensureWritableList('integrityRepair') || currentList();
        let n = 0;
        itemIds.forEach((id) => {
            if (removeItem(id)) n++;
        });
        return n;
    }

    function repairMarkStaleAsLocalItems(itemIds: string[]): number {
        if (!itemIds?.length) return 0;
        const list = ensureWritableList('integrityRepair') || currentList();
        if (!list) return 0;
        let n = 0;
        itemIds.forEach((id) => {
            if (!list.items[id]) return;
            list.items[id].tlOrigin = 'custom';
            list.items[id].tlEdited = true;
            n++;
        });
        touchInstance(list);
        saveState();
        return n;
    }

    function ensureListUserLabels(list: TlListInstance | null) {
        if (!list || typeof list !== 'object') return;
        if (!list.userLabels || typeof list.userLabels !== 'object') list.userLabels = {};
    }

    function countCardsUsingUserLabel(labelId: string): number {
        const list = currentList();
        if (!list) return 0;
        let n = 0;
        Object.values(list.items || {}).forEach((it) => {
            if (Array.isArray(it.userLabelIds) && it.userLabelIds.includes(labelId)) n++;
        });
        return n;
    }

    function addUserLabelDef(name: string, color: string): string | null {
        const list = ensureWritableList('addUserLabel') || currentList();
        if (!list) return null;
        ensureListUserLabels(list);
        const id = 'ul-' + uid();
        list.userLabels[id] = {
            id,
            name: String(name || '').trim() || '라벨',
            color: String(color || '#5c6bc0').trim() || '#5c6bc0',
        };
        touchInstance(list);
        saveState();
        return id;
    }

    function updateUserLabelDef(labelId: string, name: string, color: string) {
        const list = ensureWritableList('updateUserLabel') || currentList();
        if (!list?.userLabels?.[labelId]) return;
        list.userLabels[labelId].name = String(name || '').trim() || '라벨';
        list.userLabels[labelId].color = String(color || '#5c6bc0').trim() || '#5c6bc0';
        touchInstance(list);
        saveState();
    }

    function removeUserLabelDef(labelId: string) {
        const list = ensureWritableList('removeUserLabel') || currentList();
        if (!list?.userLabels?.[labelId]) return;
        delete list.userLabels[labelId];
        Object.values(list.items || {}).forEach((it) => {
            if (!Array.isArray(it.userLabelIds)) return;
            it.userLabelIds = it.userLabelIds.filter((x) => x !== labelId);
            if (!it.userLabelIds.length) delete it.userLabelIds;
        });
        touchInstance(list);
        saveState();
    }

    function setItemUserLabelIds(itemId: string, ids: string[]) {
        const list = ensureWritableList('setItemUserLabels') || currentList();
        if (!list?.items?.[itemId]) return;
        const it = list.items[itemId];
        const uniq = [...new Set((ids || []).filter(Boolean))];
        if (uniq.length) it.userLabelIds = uniq;
        else delete it.userLabelIds;
        if (it.tlOrigin === 'catalog' && uniq.length) it.tlEdited = true;
        touchInstance(list);
        saveState();
    }

    function duplicateList(listId: string): string | null {
        closePublished();
        const src = state.instances[listId];
        if (!src) return null;
        const now = Date.now();
        const id = 'tl-' + uid();
        const copied = JSON.parse(JSON.stringify(src)) as TlListInstance;
        copied.id = id;
        copied.title = (src.title || '티어리스트') + t('tierlist.t138');
        copied.createdAt = now;
        copied.updatedAt = now;
        copied.meta = { ...(copied.meta || {}), source: 'duplicate', dirty: true };
        delete copied.catalogId;
        state.instances[id] = copied;
        state.currentInstanceId = id;
        saveState();
        return id;
    }

    function deleteList(listId: string) {
        closePublished();
        const l = state.instances[listId];
        if (!l) return;
        try {
            Object.values(l.items || {}).forEach((it) => {
                if (it?.imageKey) TierDB.remove(it.imageKey);
            });
        } catch (_) {}
        delete state.instances[listId];
        if (state.currentInstanceId === listId) {
            const next = Object.values(state.instances).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
            state.currentInstanceId = next?.id || null;
        }
        saveState();
    }

    function fileToDataUrl(file: File): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result ?? ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    function createThumbnail(dataUrl: string, maxSize: number): Promise<string> {
        return new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxSize || h > maxSize) {
                    const ratio = Math.min(maxSize / w, maxSize / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/webp', 0.85));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    async function processImageFile(file: File): Promise<string> {
        const dataUrl = await fileToDataUrl(file);
        const thumb = await createThumbnail(dataUrl, 200);
        const imgKey = 'tl-img-' + uid();
        await TierDB.save(imgKey, thumb);
        return imgKey;
    }

    T.db = TierDB;
    T.state = {
        uid,
        loadState,
        saveState,
        getState: () => state,
        isCatalogPayload,
        iterAllInstances,
        currentList,
        currentMeta,
        isPublishedMode,
        isPublishedCatalogMode,
        getPublishedCatalogSnapshot,
        getPublishedEmbeddedImages,
        openPublished,
        closePublished,
        ensureWritableList,
        forkInstanceFromCatalogData,
        switchToInstance,
        createCatalog,
        deleteCatalog,
        addCatalogItem,
        removeCatalogItem,
        createInstanceFromLocalCatalog,
        createList,
        duplicateList,
        deleteList,
        addItem,
        removeItem,
        moveItem,
        applyTiers,
        getDefaultTiers: () => DEFAULT_TIERS.map((t) => ({ ...t })),
        promoteCatalogMissingToCustom,
        pruneStaleCatalogBindings,
        canResetItemFromPool,
        applyCatalogEntryToItem,
        reconcileListWithCatalogPayload,
        isItemRemovable,
        persistList,
        repairOrphanRankings,
        repairDeleteItemsByIds,
        repairMarkStaleAsLocalItems,
        ensureListUserLabels,
        countCardsUsingUserLabel,
        addUserLabelDef,
        updateUserLabelDef,
        removeUserLabelDef,
        setItemUserLabelIds,
        processImageFile,
    };
})();
