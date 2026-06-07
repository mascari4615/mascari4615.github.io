/* Tierlist 위젯 공유 타입 정본 — TASK-KL-101 (KL-078 follow-up).
 * 3 파일(storage / publish / render)이 `const T: any = window.Tierlist` 와 다수 `: any` 파라미터로
 * 가지고 있던 type 누수를 제거. script-mode IIFE 파일이라 top-level interface 가 카르몰랩 컴파일
 * 단위 안에서 전역으로 노출된다. */

interface TlMetaBag {
    source?: string;
    publishedId?: string;
    publishedUrl?: string;
    catalogUrl?: string;
    dirty?: boolean;
    dirtyReason?: string;
    [k: string]: unknown;
}

interface TlItem {
    id: string;
    name?: string;
    imageKey?: string | null;
    tlOrigin?: 'catalog' | 'custom';
    tlEdited?: boolean;
    userLabelIds?: string[];
    [k: string]: unknown;
}

interface TlTierDef {
    id: string;
    label: string;
    color: string;
}

interface TlUserLabelDef {
    id: string;
    name: string;
    color: string;
}

/** 티어 id → 카드 id 배열. `_pool` 은 미배치 트레이. */
type TlRankingMap = Record<string, string[]>;

interface TlListInstance {
    id: string;
    title: string;
    category?: string;
    catalogId?: string;
    createdAt: number;
    updatedAt: number;
    tiers: TlTierDef[];
    rankings: TlRankingMap;
    items: Record<string, TlItem>;
    userLabels: Record<string, TlUserLabelDef>;
    meta?: TlMetaBag;
}

interface TlCatalogInstance {
    id: string;
    title: string;
    category?: string;
    updatedAt: number;
    items: Record<string, TlItem>;
}

interface TlPublishedMeta {
    id?: string;
    title?: string;
    url?: string;
    tierlistGroup?: string;
    group?: string;
    [k: string]: unknown;
}

/** state.openPublished 에 들어오는 raw data — catalog · slim instance · full list 모두 가능. */
interface TlPublishedData {
    kind?: string;
    version?: number;
    title?: string;
    items?: Record<string, TlItem>;
    images?: Record<string, string>;
    list?: TlListInstance;
    catalogRef?: { id?: string; url?: string };
    itemOverrides?: Record<string, Partial<TlItem>>;
    [k: string]: unknown;
}

interface TlPublishedCurrent {
    meta: TlPublishedMeta;
    data: TlPublishedData;
}

interface TlCurrentMetaView {
    id: string;
    title: string;
    source: string;
    dirty: boolean;
    url: string;
    catalogUrl: string;
    tierlistGroup: string;
}

interface TlState {
    catalogs: Record<string, TlCatalogInstance>;
    instances: Record<string, TlListInstance>;
    currentInstanceId: string | null;
    datasets?: Record<string, { lists?: Record<string, TlListInstance> }>;
    currentDatasetId?: string;
    lists?: Record<string, TlListInstance>;
    currentListId?: string;
}

interface TlPublishedIndexItem {
    id?: string;
    title?: string;
    url?: string;
    tierlistGroup?: string;
    group?: string;
    updatedAt?: string;
    [k: string]: unknown;
}

interface TlDbAPI {
    save: (id: string, dataUrl: string) => Promise<void>;
    get: (id: string) => Promise<string | null>;
    remove: (id: string) => Promise<void>;
    getMany: (ids: string[]) => Promise<Record<string, string>>;
}

interface TlStateAPI {
    uid: () => string;
    loadState: () => void;
    saveState: () => void;
    getState: () => TlState;
    isCatalogPayload: (data: unknown) => boolean;
    iterAllInstances: () => Array<{ list: TlListInstance; catalogTitle: string | null }>;
    currentList: () => TlListInstance | null;
    currentMeta: () => TlCurrentMetaView;
    isPublishedMode: () => boolean;
    isPublishedCatalogMode: () => boolean;
    getPublishedCatalogSnapshot: () => TlPublishedCurrent | null;
    getPublishedEmbeddedImages: () => Record<string, string>;
    openPublished: (meta: TlPublishedMeta | null | undefined, data: TlPublishedData) => void;
    closePublished: () => void;
    ensureWritableList: (reason: string) => TlListInstance | null;
    forkInstanceFromCatalogData: (catalogData: TlPublishedData, meta: TlPublishedMeta | undefined) => TlListInstance;
    switchToInstance: (instanceId: string) => void;
    createCatalog: (title: string, category: string) => string;
    deleteCatalog: (catalogId: string) => void;
    addCatalogItem: (catalogId: string, name: string, imageKey: string | null) => string | null;
    removeCatalogItem: (catalogId: string, itemId: string) => void;
    createInstanceFromLocalCatalog: (catalogId: string) => string | null;
    createList: (title: string, category: string) => string;
    duplicateList: (listId: string) => string | null;
    deleteList: (listId: string) => void;
    addItem: (name: string, imageKey: string | null) => string | null;
    removeItem: (itemId: string) => boolean;
    moveItem: (itemId: string, targetTier: string, insertIdx: number | undefined) => boolean;
    applyTiers: (list: TlListInstance, tiersInOrder: TlTierDef[]) => boolean;
    getDefaultTiers: () => TlTierDef[];
    promoteCatalogMissingToCustom: (list: TlListInstance, catalogItemIdSet: Set<string>) => boolean;
    pruneStaleCatalogBindings: (list: TlListInstance, catalogItems: Record<string, TlItem>) => boolean;
    canResetItemFromPool: (list: TlListInstance, itemId: string) => boolean;
    applyCatalogEntryToItem: (list: TlListInstance, itemId: string, catalogEntry: TlItem) => boolean;
    reconcileListWithCatalogPayload: (list: TlListInstance, catalogItems: Record<string, TlItem>) => boolean;
    isItemRemovable: (list: TlListInstance, itemId: string) => boolean;
    persistList: (list: TlListInstance | null) => void;
    repairOrphanRankings: () => boolean;
    repairDeleteItemsByIds: (itemIds: string[]) => number;
    repairMarkStaleAsLocalItems: (itemIds: string[]) => number;
    ensureListUserLabels: (list: TlListInstance | null) => void;
    countCardsUsingUserLabel: (labelId: string) => number;
    addUserLabelDef: (name: string, color: string) => string | null;
    updateUserLabelDef: (labelId: string, name: string, color: string) => void;
    removeUserLabelDef: (labelId: string) => void;
    setItemUserLabelIds: (itemId: string, ids: string[]) => void;
    processImageFile: (file: File) => Promise<string>;
}

interface TlPublishAPI {
    getPublishedIndex: () => Promise<TlPublishedIndexItem[]>;
    getPublishedJsonByUrl: (relUrl: string) => Promise<TlPublishedData>;
    getPublishedPreviewCountLine: (relUrl: string) => Promise<string>;
    openPublishedDirect: (relUrl: string, meta: TlPublishedMeta | null | undefined) => Promise<void>;
    buildExportPayload: () => Promise<unknown>;
    exportAsImage: () => Promise<void>;
    showJsonPreview: () => Promise<void>;
    forkPublishedCatalogToLocal: () => Promise<TlListInstance | null>;
    importFromJSONFilePicker: () => Promise<void>;
    syncInstanceItemOriginsWithCatalogIfNeeded: () => Promise<boolean>;
    resetItemToCatalogDefault: (itemId: string) => Promise<boolean>;
}

interface TlRenderAPI {
    setContainers: (c: {
        editor?: HTMLElement | null;
        list?: HTMLElement | null;
        stats?: HTMLElement | null;
    }) => void;
    renderEditor: () => Promise<void>;
    renderAll: () => Promise<void>;
    renderListTab: () => void;
    renderStats: () => void;
    publishedIndexGroup: (it: TlPublishedIndexItem) => string;
}

interface TlUiAPI {
    showContextMenu: (
        x: number,
        y: number,
        actions: Array<{ label: string; danger?: boolean; action: () => void } | 'sep'>
    ) => void;
    hideContextMenu: () => void;
    openDialog: (opts: {
        title: string;
        bodyHtml?: string;
        wide?: boolean;
        onMount?: (api: { overlay: HTMLDivElement; dialog: HTMLDivElement; close: () => void }) => void;
    }) => { overlay: HTMLDivElement; dialog: HTMLDivElement; close: () => void };
}

interface TlDndAPI {
    initDnD: (
        root: HTMLElement,
        opts: {
            onDrop?: (payload: { itemId: string; tierId: string | undefined; insertIdx: number }) => void;
            shouldBlockDragStart?: (e: PointerEvent) => boolean;
        }
    ) => void;
}

interface TlDialogsAPI {
    showAddItemDialog?: () => void;
    showEditItemDialog?: (itemId: string) => void;
    showNewListDialog?: () => void;
    showNewCatalogDialog?: () => void;
    showAddCatalogItemDialog?: (catalogId: string) => void;
    showTierSettingsDialog?: () => void;
    showUserLabelsManagerDialog?: () => void;
    showAssignUserLabelsDialog?: (itemId: string) => void;
}

/** namespace.ts 부트스트랩 이후 — index.ts 진입 시점엔 모든 sub-API 가 채워져 있다고 본다. */
interface TierlistNamespace {
    injectStyles?: () => void;
    db: TlDbAPI;
    state: TlStateAPI;
    publish: TlPublishAPI;
    render: TlRenderAPI;
    ui: TlUiAPI;
    dnd: TlDndAPI;
    dialogs: TlDialogsAPI;
}
