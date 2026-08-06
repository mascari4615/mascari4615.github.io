/** Shared types for KarmoLab TS sources (imported by src/; erased at build) */

export interface ImageConvertOptions {
  outputMime: string;
  quality?: number;
  maxLongSide?: number;
  background?: string;
  fillAlpha?: boolean;
  smoothing?: 'low' | 'medium' | 'high';
}

export interface KarmoLabImageConvertAPI {
  MIME_PNG: string;
  MIME_JPEG: string;
  MIME_WEBP: string;
  extFromMime: (mime: string) => string;
  isRasterImageFile: (file: File) => boolean;
  isSvgFile: (file: File) => boolean;
  supportsWebpOutput: () => boolean;
  computeDimensions: (nw: number, nh: number, maxLong: number) => { w: number; h: number };
  imageToCanvas: (img: HTMLImageElement, opts: ImageConvertOptions) => HTMLCanvasElement | null;
  canvasToBlob: (canvas: HTMLCanvasElement, mime: string, quality?: number) => Promise<Blob>;
  convertImage: (img: HTMLImageElement, opts: ImageConvertOptions) => Promise<Blob>;
  loadImageFromFile: (file: File) => Promise<{
    img: HTMLImageElement;
    objectUrl: string;
    file: File;
  }>;
  baseNameFromFile: (file: File) => string;
  revokeObjectUrl: (u: string | undefined) => void;
}

export interface RandomGenTopic {
  id: string;
  label: string;
  group: string;
  items?: string[];
  generator?: () => string | { name: string; sub?: string };
}

/** Lazy-load widget stub; paths are under `widgets/` without `.js` */
export interface KarmoLabLazyWidgetStub {
  id: string;
  title: string;
  category: string;
  desc: string;
  layout: string;
  icon: string;
  lazyScriptPaths?: string[];
}

export interface KarmoLabImageBatchRecipe {
  steps: Array<{ type: string; opts?: ImageConvertOptions }>;
}

export interface KarmoLabImageBatchHooks {
  signal?: AbortSignal;
  onItemStart?: (i: number, file: File, total: number) => void;
  onItemDone?: (i: number, file: File, blob: Blob, total: number) => void;
  onItemError?: (i: number, file: File, err: Error, total: number) => void;
}

/** KarmoWorld — `world.js` / `parse-md.js` / `load-characters-from-wiki.js` */
export interface KarmoWorldParseMdAPI {
  splitFrontmatter: (md: string) => { frontmatter: string; body: string };
  parseYamlSimple: (yaml: string) => Record<string, unknown>;
  parseCharacterWikiMarkdown: (md: string) => { meta: Record<string, unknown>; body: string };
  parseCharacterWikiFromSplitFiles: (
    yamlText: string,
    mdText: string
  ) => { meta: Record<string, unknown>; body: string };
}

export interface KarmoWorldAdventureEntity {
  id: string;
  slug: string;
  title: string;
  oneLine: string;
  tags: string[];
  npcs: string[];
  places: string[];
  events: string[];
  startedAt: string;
  endedAt: string;
  summary: string;
}

export interface KarmoWorldNamespace {
  parseMd?: KarmoWorldParseMdAPI;
  entities?: {
    characters?: Record<string, Record<string, unknown>>;
    adventures?: Record<string, KarmoWorldAdventureEntity>;
  };
  bindings?: {
    imagegen?: Record<string, unknown> & { characters?: unknown };
    chatbot?: Record<string, unknown> & { characters?: unknown };
    adventure?: { adventures: KarmoWorldAdventureEntity[] };
  };
}

export interface KarmoLabImageBatchAPI {
  StepType: { CONVERT: string };
  recipeConvert: (opts: ImageConvertOptions) => KarmoLabImageBatchRecipe;
  processFile: (
    IC: KarmoLabImageConvertAPI,
    file: File,
    recipe: KarmoLabImageBatchRecipe,
    signal?: AbortSignal
  ) => Promise<Blob>;
  processFilesSequential: (
    IC: KarmoLabImageConvertAPI,
    files: File[],
    recipe: KarmoLabImageBatchRecipe,
    hooks?: KarmoLabImageBatchHooks
  ) => Promise<{
    results: Array<{ ok: boolean; file: File; blob?: Blob; error?: unknown }>;
    aborted: boolean;
  }>;
  downloadResultsSequential: (
    results: Array<{ ok: boolean; file: File; blob?: Blob }>,
    IC: KarmoLabImageConvertAPI,
    outputMime: string,
    delayMs?: number
  ) => Promise<void>;
}

/** 챗봇 캐릭터 — `chatbot/characters.ts` 가 노출. 타입드 소비자에서 쓰는 필드만 명시(나머지는 인덱스). */
export interface ChatbotCharacter {
  id: string;
  name?: string;
  userName?: string;
  userNote?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  visualDescription?: string;
  referenceImageDataUrl?: string;
  [key: string]: unknown;
}

/** `[[KARMO_IMAGE:{...}]]` 태그 파싱 결과 스펙 */
export interface KarmoImageSpec {
  show?: boolean;
  prompt?: string;
  [key: string]: unknown;
}

/** `gemini.ts` 이미지 생성 함수 반환 */
export interface GeminiImageResult {
  dataUrl: string;
  usage?: { totalTokenCount?: number; [key: string]: unknown };
  [key: string]: unknown;
}

/** `gemini.ts` MODEL_CATALOG 재노출 — 위젯에서 `Gemini.MODELS.gemini` 등으로 사용 */
export interface GeminiModelEntry {
  id: string;
  name: string;
  isDefault?: boolean;
}
export type GeminiModelsCatalog = Record<'gemini' | 'geminiImage' | 'imagen' | 'embedding', GeminiModelEntry[]>;

/** `gemini.ts` ImageDB — IndexedDB 이미지 라이브러리 공유 모듈 */
export interface ImageDBItem {
  id: string;
  url: string;
  prompt?: string;
  model?: string;
  modelName?: string;
  timestamp: number;
  tokens?: number;
  elapsed?: number | string;
  [key: string]: unknown;
}
export interface ImageDBAPI {
  save: (item: ImageDBItem) => Promise<void>;
  getAll: () => Promise<ImageDBItem[]>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
}

/** `chatbot/characters.ts` → `window.ChatbotCharacters` */
export interface ChatbotCharactersAPI {
  getCharacterById: (id: string) => ChatbotCharacter | null;
  buildCharacterSystemBlock: (char: ChatbotCharacter | null) => string;
  syncAfterSessionLoad: (sessionCharacterId: string | null | undefined) => void;
  initCharacterUi: (deps: {
    saveSession?: () => void;
    getChatHistoryLength?: () => number;
    appendBotFirstMes?: (m: string) => void;
    getLastLoadedSessionCharacterId?: () => string | null | undefined;
  }) => void;
}

/** `chatbot/prompt.ts` → `window.ChatbotPrompt` */
export interface ChatbotPromptAPI {
  SYSTEM_PROMPT_PRESETS: Record<string, string>;
  KARMO_IMAGE_INSTRUCTION: string;
  getAdditionalSystemPromptText: () => string;
  assembleSystemPrompt: (options?: {
    useMemory?: boolean;
    conversationSummary?: string;
  }) => string;
}

/** `chatbot/markdown.ts` → `window.ChatbotMarkdown` */
export interface ChatbotMarkdownAPI {
  renderMarkdown: (text: string) => string;
}

/** `chatbot/karmo-image.ts` → `window.ChatbotKarmoImage` */
export interface ChatbotKarmoImageAPI {
  KARMO_IMAGE_RE: RegExp;
  displayTextForStream: (s: string) => string;
  extractKarmoImage: (text: string) => {
    cleanText: string;
    spec: KarmoImageSpec | null;
  };
  appendCharacterImageAfterMessage: (
    wrap: HTMLElement | null,
    char: ChatbotCharacter | null,
    spec: KarmoImageSpec | null
  ) => Promise<void>;
}

/** `imagegen/*` 공용 네임스페이스 백 — config.ts 가 세션/히스토리 키를 채움 */
export interface KarmoLabImageGenNamespace {
  GALLERY_SESSION_KEY?: string;
  GALLERY_SESSION_MAX?: number;
  PROMPT_HISTORY_KEY?: string;
  PROMPT_HISTORY_MAX?: number;
  CHARACTER_PRESETS?: {
    char?: Array<{ id: string; label: string; icon?: string; prompt: string; shortLabel?: string }>;
  };
  /** imagegen/* 위젯 (config/presets/queue/utils) 이 동적으로 채우는 면 — narrow 미완 (KL-078). */
  [key: string]: any;
}

/** 자료표(ref/*) 공용 렌더러 — `widgets/ref/reftable.ts` (TASK-KL-088) */
export interface RefTableItem {
  copy: string;
  glyph: string;
  label: string;
  sub?: string;
  keywords?: string;
  group: string;
  color?: string;
}

export interface RefTableSpec {
  items: RefTableItem[];
  placeholder: string;
  copyNoun: string;
  layout?: 'grid' | 'list';
  note?: string;
}

export interface RefTableAPI {
  build: (container: HTMLElement, spec: RefTableSpec) => void;
  /** 표 정의를 이름표로 보관 — 문자표 탭과 개별 페이지가 같은 정의를 나눠 쓴다 */
  define: (id: string, spec: RefTableSpec) => void;
  get: (id: string) => RefTableSpec | undefined;
}
