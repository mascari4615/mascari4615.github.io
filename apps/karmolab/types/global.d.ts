import type {
  ChatbotCharacter as _ChatbotCharacter,
  ChatbotCharactersAPI,
  ChatbotKarmoImageAPI,
  ChatbotMarkdownAPI,
  ChatbotPromptAPI,
  GeminiImageResult,
  GeminiModelsCatalog,
  ImageDBAPI,
  ImageDBItem as _ImageDBItem,
  KarmoLabImageBatchAPI,
  KarmoLabImageConvertAPI,
  KarmoLabImageGenNamespace,
  KarmoLabLazyWidgetStub,
  KarmoWorldNamespace,
  RefTableAPI,
  RandomGenTopic as _RandomGenTopic
} from './karmolab';

export {};

declare global {
  interface Window {
    KarmoLabImageConvert?: KarmoLabImageConvertAPI;
    KarmoLabImageBatch?: KarmoLabImageBatchAPI;
    KarmoWorld?: KarmoWorldNamespace;
    /** tierlist 네임스페이스 — `namespace.js` */
    Tierlist?: Record<string, unknown>;
    RANDOMGEN_TOPICS?: _RandomGenTopic[];
    /** randomgen.ts — `id → label` 매핑. tab UI 가 채움. */
    RANDOMGEN_TOPIC_LABELS?: Record<string, string>;
    KARMOLAB_WIDGET_LOADER_WAIT?: Promise<unknown>[];
    KARMOLAB_WIDGET_SCRIPT_BASE?: string;
    KARMOLAB_LAZY_META_BY_ID?: Record<string, KarmoLabLazyWidgetStub>;
    KARMOLAB_WIDGETS_BOOT?: string[];
    KARMOLAB_LAZY_META?: KarmoLabLazyWidgetStub[];

    /** 도구 상세 페이지(/karmolab/t/&lt;id&gt;/)가 심는 진입 위젯 id — toolbox.init 이 첫 페이지로 연다 (TASK-KL-088) */
    KARMOLAB_ENTRY_TOOL?: string;
    /** 본문이 HTML 에 이미 박혀 있는 정적 페이지 표식(예: 도구 목록 `hub`) — 셸의 머리띠·옆줄·
     *  테마·⌘K 는 그대로 쓰되 화면은 앱이 그리지 않는다 (TASK-KL-129) */
    KARMOLAB_ENTRY_STATIC?: string;
    /** 상세 페이지가 존재하는 도구 id 목록 — 도구 간 이동 시 각자의 URL 로 보내기 위해 (TASK-KL-088) */
    KARMOLAB_TOOL_PAGES?: string[];
    /** 계측 — analytics.ts (TASK-KL-088). 입력 내용은 절대 싣지 않는다. */
    KarmoStat?: { page: (toolId: string, title?: string) => void; use: (toolId: string, action: string) => void; disabled: boolean };
    /** GoatCounter 카운터 (count.js 가 주입) */
    goatcounter?: { count?: (opts: { path?: string; title?: string; event?: boolean }) => void };
    /** 자료표 공용 렌더러 — widgets/ref/reftable.ts (TASK-KL-088) */
    RefTable?: RefTableAPI;
    /** tools/hangulkey.ts — 변환 함수 노출 (스모크 테스트 + 다른 위젯 재사용) */
    KarmoHangulKey?: { engToKor: (s: string) => string; korToEng: (s: string) => string };
    KarmoMorse?: { encode: (text: string, korean: boolean) => string; decode: (code: string, korean: boolean) => string };

    /** imagegen/* 공용 네임스페이스 — config.ts 가 세션/히스토리 키를 채움 */
    ImageGen?: KarmoLabImageGenNamespace;

    /** chatbot/markdown.ts */
    ChatbotMarkdown?: ChatbotMarkdownAPI;
    /** chatbot/prompt.ts */
    ChatbotPrompt?: ChatbotPromptAPI;
    /** chatbot/karmo-image.ts */
    ChatbotKarmoImage?: ChatbotKarmoImageAPI;
    /** chatbot/characters.ts */
    ChatbotCharacters?: ChatbotCharactersAPI;

    /** apps/karmolab-react-src 내 React 마운트 */
    mountKarmoPlanner?: (rootId: string) => void;

    /** dashboard.ts — 내 정보 탭에서 호출 */
    DashboardBuild?: (container: HTMLElement) => void;

    /** imagegen 위젯 내부 함수 — HTML onclick 핸들러에서 사용 */
    _ig?: {
      generate: () => void;
      cancel: () => void;
      download: () => void;
      toggleCompare: () => void;
      toggleHistory: () => void;
      enhancePrompt: () => Promise<void>;
      openContextPreset: () => void;
      showApiHistory: () => void;
    };

    /** KarmoLab Tauri 셸에서 주입 */
    __KARMOLAB_DESKTOP__?: boolean;
    /** KarmoLab Tauri 셸에서 주입 — Cargo.toml 패키지 버전 */
    __KARMOLAB_VERSION__?: string;
    /** Tauri 데스크톱 셸 (devtools 알림 테스트) */
    __TAURI__?: {
      core?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
      event?: {
        listen?: (
          event: string,
          cb: (e: { payload: unknown }) => void
        ) => Promise<() => void>;
      };
      /** Tauri 2 window plugin — `decorations: false`인 윈도우의 컨트롤(min/max/close)에 사용 */
      window?: {
        getCurrentWindow?: () => {
          minimize: () => Promise<void>;
          toggleMaximize: () => Promise<void>;
          close: () => Promise<void>;
          isMaximized: () => Promise<boolean>;
          onResized?: (cb: () => void) => Promise<() => void>;
        };
      };
    };
    __karmolabSetNotifyInvokeDebug?: (payload: unknown) => void;

    /** crypto.ts — 위젯 내부 함수를 onclick 핸들러에서 호출하기 위해 게재 */
    loadFromTxt?: () => Promise<void>;
    toggleCryptoFields?: () => void;
    swapResultToInput?: () => void;
    doCrypto?: () => void;
  }

  /** crypto-js (vendor script-mode) — 위젯에서 사용하는 면만 명시. 그 외 면은 도구 차원에서 점진 확장. */
  var CryptoJS: {
    lib: { WordArray: { random: (nBytes: number) => unknown }; CipherParams: { create: (cfg: { ciphertext: unknown }) => unknown } };
    enc: { Hex: { parse: (s: string) => { toString: (encoder?: unknown) => string } }; Base64: { parse: (s: string) => { toString: (encoder?: unknown) => string } }; Utf8: unknown };
    algo: { SHA256: unknown };
    mode: { CBC: unknown };
    pad: { Pkcs7: unknown };
    PBKDF2: (pass: string, salt: unknown, opts: { keySize: number; iterations: number; hasher: unknown }) => unknown;
    AES: {
      encrypt: (text: string, key: unknown, opts: { iv: unknown; mode: unknown; padding: unknown }) => { ciphertext: { toString: (encoder?: unknown) => string } };
      decrypt: (cipher: unknown, key: unknown, opts: { iv: unknown; mode: unknown; padding: unknown }) => { toString: (encoder?: unknown) => string };
    };
  } | undefined;

  /** 페이지 스크립트로 주입된 marked / Prism */
  var marked: { parse: (src: string) => string; setOptions: (opts: Record<string, unknown>) => void } | undefined;
  var Prism: { highlightElement: (el: Element) => void } | undefined;

  /**
   * `gemini.js` 번들이 노출하는 전역 — `user.ts` 설정 탭 등에서 `typeof Gemini` 가드와 함께 사용.
   * (전체 API는 `gemini.ts`가 크므로 필요한 면만 점진적으로 확장)
   */
  var Gemini:
    | undefined
    | {
        buildApiKeyUI: (idPrefix: string) => {
          html: string;
          init: (container?: HTMLElement | Document | null) => void;
        };
        getDefaultModel?: (provider?: string) => string;
        requireVertexApiKey?: () => string | null;
        callGeminiImage?: (
          prompt: string,
          modelId: string,
          options?: Record<string, unknown>
        ) => Promise<GeminiImageResult>;
        callVertexGeminiImage?: (
          prompt: string,
          modelId: string,
          options?: Record<string, unknown>
        ) => Promise<GeminiImageResult>;
        /** Imagen (AI Studio) — N 장 반환 (dataUrl 배열) */
        callImagen?: (
          prompt: string,
          modelId: string,
          count: number,
          options?: Record<string, unknown>
        ) => Promise<string[]>;
        /** Imagen (Vertex) — N 장 반환 */
        callVertexImagen?: (
          prompt: string,
          modelId: string,
          count: number,
          options?: Record<string, unknown>
        ) => Promise<string[]>;
        getApiKey: (id?: string | null) => string;
        requireApiKey: () => string | null;
        fetchWithRetry: (url: string, body: unknown, options?: RequestInit) => Promise<Response>;
        /** `packages/karmolab-ai` MODEL_CATALOG 재노출 — `Gemini.MODELS.gemini` 등으로 위젯이 사용 */
        MODELS: GeminiModelsCatalog;
        GEMINI_SAFETY_LEVELS?: Array<{ value: string; label: string }>;
        DEFAULT_GEMINI_SAFETY_THRESHOLD?: string;
        getApiHistory?: () => Array<{
          status: number;
          type?: string;
          ts?: string;
          url?: string;
          requestBody?: Record<string, unknown>;
          responseBody?: Record<string, unknown>;
        }>;
        clearApiHistory?: () => void;
        getActiveProfileName?: () => string;
        enhancePrompt?: (prompt: string) => Promise<string>;
      };

  /** `gemini.ts` 내부 정의 — IndexedDB 이미지 라이브러리 공유 모듈 */
  var ImageDB: ImageDBAPI | undefined;

  /** `gemini.ts` ImageDB 항목 — script-mode 위젯이 타입으로 사용 */
  type ImageDBItem = _ImageDBItem;

  /** randomgen 위젯 주제 — script-mode 에서 타입으로 사용 */
  type RandomGenTopic = _RandomGenTopic;

  /** chatbot/characters.ts → 위젯 내부에서 타입으로 사용 (script-mode) */
  type ChatbotCharacter = _ChatbotCharacter;

  /** toolbox.js — global lexical binding (not necessarily window.Toolbox) */
  var Toolbox: {
    /** 결과를 옆 도구로 넘기기 (TASK-KL-133) — 놓아두기 · 건네받기 · 「이어서」 줄 */
    offerNext?: (anchor: HTMLElement | null, item: { blob: Blob; name?: string; from?: string }) => void;
    offerResult?: (item: { blob: Blob; name?: string; from?: string }) => void;
    takeResult?: () => { blob: Blob; name?: string; from?: string } | null;
    peekResult?: () => { blob: Blob; name?: string; from?: string } | null;
    toolsAccepting?: (type: string, exceptId?: string) => Array<{ id: string; title?: string }>;
    /**
     * 놓인 것이 이 도구가 받을 수 있는 것이면 건네준다 — 한 번만. 화면을 옮겨 와도 받는다.
     *
     * 첫 인자는 **도구 이름**이다 (TASK-KL-191) — 형식은 등록 메타의 `accepts` 에서 읽는다.
     * 형식을 두 군데 적으면 갈라진다(실제로 갈라져 있었다). 배열도 받지만 그건 우리 도구
     * 밖의 것(모래상자·외부)만 쓴다 — `check-format-contract` 게이트가 이름을 강제한다.
     */
    onHandoff?: (toolIdOrKinds: string | string[], cb: (file: File) => void) => void;
    /** 이 도구가 받는다고 **선언한** 형식 (TASK-KL-191 — 선언이 정본) */
    declaredAccepts?: (id: string) => string[];
    /** 이 도구가 내놓는다고 **선언한** 형식 */
    declaredProduces?: (id: string) => string[];
    /** `image/*` 별표를 푼 한 쌍 맞춰 보기 — 이어서·흐름·공유대상이 같은 자를 쓴다 */
    kindMatches?: (pattern: string, type: string) => boolean;
    registerDeferred?: (stub: KarmoLabLazyWidgetStub) => void;
    getLazyWidgetPublicMeta?: (id: string) => Record<string, unknown>;
    /** KL-054 — vendor/root/widgets 스크립트 1회 주입(load-once 캐시). boot 위젯이 무거운 lib 을 사용 직전 로드. */
    ensureScript?: (path: string) => Promise<void>;
    /** KL-103 — 앞머리(world/·vendor/·root/) 규약을 실제 URL 로 푸는 **단일** 해석기. 로더도 이걸 쓴다. */
    resolveScriptPath?: (rawPath: string) => string;
    register: (config: {
      id: string;
      title: string;
      /** tool | play | lab | desktop | undefined(기타) */
      category?: string;
      desc?: string;
      layout?: string;
      icon?: string;
      hidden?: boolean;
      noHero?: boolean;
      tabs: Array<{
        id: string;
        label: string;
        build: (container: HTMLElement) => void;
      }>;
    } & Record<string, unknown>) => void;
    initTheme: () => void;
    init: () => void;
    getTools: () => Array<{ id: string; hidden?: boolean; category?: string; title?: string; icon?: string }>;
    /** 다른 위젯의 첫 탭을 이 자리에 그린다 (묶음 위젯이 부분을 재사용) */
    mountTool: (id: string, container: HTMLElement) => boolean;
    /** 이 도구가 들어간 묶음 위젯 id (없으면 null) */
    findBundleFor: (id: string) => string | null;
    /** 갈래 목록 (id·label·icon) — 라벨의 단일 출처 */
    getCategories?: () => Array<{ id: string; label: string; icon: string }>;
    /**
     * 위젯이 건 타이머·전역 리스너를 거두는 뒷정리 (TASK-KL-100).
     * `build(container)` **안에서** 부른다 — 그때만 누구 것인지 알 수 있다.
     * 도구를 다시 그리거나 같은 id 로 다시 등록하면(핫 교체) 그 직전에 불린다.
     * DOM 리스너는 노드가 갈리며 같이 죽으므로 적을 필요 없다. 타이머가 진짜 대상이다.
     */
    onDispose?: (fn: () => void) => void;
    showToast?: (msg: string, type?: string, detail?: unknown) => void;
    getProgress?: (key: string) => number;
    setProgress?: (key: string, value: number) => void;
    completeAchievement?: (id: string, meta?: { title?: string } & Record<string, unknown>) => void;
    incrementProgress?: (key: string, amount?: number) => number;
    unlockBadge?: (id: string, meta?: { title?: string } & Record<string, unknown>) => boolean | void;
    getUsageStats?: () => Record<
      string,
      { chatCount?: number; imageCount?: number; chatTokens?: number; imageTokens?: number }
    >;
    recordUsage?: (type: string, tokens: number) => void;
    getPref?: (key: string, fallback?: string) => string;
    setPref?: (key: string, value: string) => void;
    field?: (container: HTMLElement, opts: Record<string, unknown>) => HTMLElement;
    /** 결과 박스 (id={prefix}Result) 에 제목/내용/소요시간 표시. isError true 면 에러 스타일 */
    displayResult?: (prefix: string, title: string, content: string, timeTaken: number | null, isError?: boolean) => void;
    /** 컨테이너 안에 결과 박스 (`<pre>` + 복사 버튼) 생성 */
    resultBox?: (container: HTMLElement, prefix: string) => void;
    /** 복사 단일 seam (TASK-KL-088) — 클립보드 + 토스트 + 사용 계측. 복사한 내용은 계측에 안 실린다. */
    copyText?: (text: string, opts?: { message?: string; action?: string; toolId?: string }) => Promise<boolean>;
    /** 복사 외의 「결과를 얻었다」 신호 (생성·변환·저장 등) */
    trackUse?: (action: string, toolId?: string) => void;
    /** id 의 textContent 를 클립보드로 복사 + 토스트 */
    copyResult?: (contentId: string) => void;
    /** trigger.classList.toggle('open') + 다음 형제도 토글 */
    toggleCollapsible?: (trigger: HTMLElement) => void;
    isDesktopApp?: () => boolean;
    escapeHtml?: (s: string) => string;
    formatTimestamp?: (ts: number | string | Date) => string;
    getToolMeta?: (id: string) => Record<string, unknown> | undefined;
    switchPage?: (id: string, opts?: { pushHistory?: boolean }) => void;
    /** btn === 'string' → tabId 로 해석해 selector 로 해당 tab-btn 자동 매칭 (toolbox.ts:948). */
    switchTab?: (btnOrTabId: HTMLElement | string, tabId?: string) => void;
    getNavLayout?: () => string;
    setNavLayout?: (v: string) => void;
    getTheme?: () => string;
    setTheme?: (v: string) => void;
    getPrismTheme?: () => string;
    setPrismTheme?: (v: string) => void;
    getPrismThemes?: () => Array<{ id: string; label: string }>;
    getBgTheme?: () => string;
    setBgTheme?: (v: string) => void;
    getBgThemes?: () => Array<{ id: string; label: string }>;
  };


}
