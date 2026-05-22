import type {
  ChatbotCharactersAPI,
  ChatbotKarmoImageAPI,
  ChatbotMarkdownAPI,
  ChatbotPromptAPI,
  GeminiImageResult,
  KarmoLabImageBatchAPI,
  KarmoLabImageConvertAPI,
  KarmoLabImageGenNamespace,
  KarmoLabLazyWidgetStub,
  KarmoWorldNamespace,
  RandomGenTopic
} from './karmolab';

export {};

declare global {
  interface Window {
    KarmoLabImageConvert?: KarmoLabImageConvertAPI;
    KarmoLabImageBatch?: KarmoLabImageBatchAPI;
    KarmoWorld?: KarmoWorldNamespace;
    /**
     * tierlist 네임스페이스 — `namespace.js`.
     * IIFE 들 (storage/publish/render/dialogs/dnd/index 등) 이 T.state·T.db·T.publish 등
     * 동적으로 채우는 구조라 정적 타입 narrow 가 어렵다 (KL-078). 멤버는 일단 any 로 두고
     * KL-069 의 `as any` 정리 흐름에서 점진 narrow.
     */
    Tierlist?: {
      state?: any;
      db?: any;
      publish?: any;
      render?: any;
      dialogs?: any;
      dnd?: any;
      ui?: any;
      [k: string]: any;
    };
    RANDOMGEN_TOPICS?: RandomGenTopic[];
    KARMOLAB_WIDGET_LOADER_WAIT?: Promise<unknown>[];
    KARMOLAB_WIDGET_SCRIPT_BASE?: string;
    KARMOLAB_LAZY_META_BY_ID?: Record<string, KarmoLabLazyWidgetStub>;
    KARMOLAB_WIDGETS_BOOT?: string[];
    KARMOLAB_LAZY_META?: KarmoLabLazyWidgetStub[];

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
  }

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
      };

  /** toolbox.js — global lexical binding (not necessarily window.Toolbox) */
  var Toolbox: {
    registerDeferred?: (stub: KarmoLabLazyWidgetStub) => void;
    getLazyWidgetPublicMeta?: (id: string) => Record<string, unknown>;
    /** KL-054 — vendor/root/widgets 스크립트 1회 주입(load-once 캐시). boot 위젯이 무거운 lib 을 사용 직전 로드. */
    ensureScript?: (path: string) => Promise<void>;
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
    isDesktopApp?: () => boolean;
    escapeHtml?: (s: string) => string;
    getToolMeta?: (id: string) => Record<string, unknown> | undefined;
    switchPage?: (id: string, opts?: Record<string, unknown>) => void;
    switchTab?: (id: string) => void;
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
