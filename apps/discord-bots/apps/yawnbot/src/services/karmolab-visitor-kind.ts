/**
 * 누가 왔나 가려내기 — 사람 · 검색봇 · AI · 알 수 없음 (TASK-KL-098).
 *
 * 왜 있나: 방문 수를 **공개해 놨기 때문에** 정확도가 곧 신뢰다. 검색엔진 크롤러와 AI 가
 * 긁어 간 것을 사람으로 세면 그 수는 자랑이 아니라 거짓말이 된다. 그런데 그 방문을 아예
 * 버리는 것도 사실 왜곡이다 — 실제로 일어난 일이니까. 그래서 **버리지 않고 나눠서 센다.**
 * 사이트에 뜨는 「사람」 수에는 사람만 들어가고, 나머지도 어디서 왔는지 같이 공개된다.
 *
 * 어떻게: 브라우저가 스스로 밝히는 이름(User-Agent)만 본다. 이건 **자기 신고**라서 감추려면
 * 얼마든지 감출 수 있다 — 그래서 이 값을 「진실」이라 부르지 않고 아래 `unknown` 칸을 남긴다.
 * 감추고 들어온 것을 잡아내겠다고 손가락 지문 같은 걸 뜨지는 않는다. 그건 여기서 지키려는
 * 것(주소도 저장 안 함)과 정반대 방향이다.
 *
 * 목록은 손으로 유지한다. 새 AI 크롤러는 계속 생기고, 못 알아본 것은 `unknown` 으로 가
 * **사람 수를 부풀리지 않는다** — 모르는 것을 사람 쪽에 넣지 않는 게 이 설계의 핵심이다.
 */

export type VisitorKind = 'human' | 'search' | 'ai' | 'unknown';

/**
 * AI 쪽 — 학습·검색·에이전트가 페이지를 가져가는 것들.
 * (사람이 AI 도구를 켜 두고 직접 브라우저로 오는 건 여기 안 잡힌다. 그건 사람이 맞다.)
 */
const AI_MARKS = [
  'gptbot',
  'oai-searchbot',
  'chatgpt-user',
  'claudebot',
  'claude-web',
  'anthropic-ai',
  'perplexitybot',
  'perplexity-user',
  'google-extended',
  'googleother',
  'applebot-extended',
  'bytespider',
  'ccbot',
  'cohere-ai',
  'diffbot',
  'facebookbot',
  'meta-externalagent',
  'imagesiftbot',
  'omgili',
  'timpibot',
  'youbot',
  'amazonbot',
  'mistralai-user',
  'duckassistbot',
];

/** 검색엔진 쪽 — 색인해서 사람을 보내 주는 것들. 우리에게 손해가 아니라 통로다. */
const SEARCH_MARKS = [
  'googlebot',
  'bingbot',
  'yeti', // 네이버
  'daum',
  'duckduckbot',
  'baiduspider',
  'yandex',
  'sogou',
  'exabot',
  'seznambot',
  'applebot',
  'petalbot',
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'slurp',
];

/** 사람 브라우저라면 거의 반드시 들고 오는 표식. 없으면 사람이라고 부르지 않는다. */
const BROWSER_MARKS = ['mozilla/', 'applewebkit', 'gecko/', 'chrome/', 'safari/', 'firefox/', 'edg/', 'opr/'];

/** 사람 브라우저 흉내를 내더라도 이게 들어 있으면 사람이 아니다. */
const GENERIC_BOT_MARKS = [
  'bot',
  'crawler',
  'spider',
  'scraper',
  'crawl',
  'headlesschrome',
  'phantomjs',
  'python-requests',
  'httpx',
  'aiohttp',
  'curl/',
  'wget/',
  'go-http-client',
  'java/',
  'okhttp',
  'axios/',
  'node-fetch',
  'libwww-perl',
  'monitoring',
  'uptime',
  'pingdom',
  'lighthouse',
  'playwright',
  'puppeteer',
];

/**
 * 자기 신고(User-Agent)로 가려낸다.
 *
 * 순서가 중요하다: **AI → 검색 → 일반 봇 → 사람**. 요즘 AI 크롤러는 검색엔진 이름을 같이
 * 달고 오는 것이 많아서(예: `Googlebot` 계열 확장), 검색을 먼저 보면 AI 가 검색으로 세어진다.
 */
export function classifyVisitor(userAgent: unknown): VisitorKind {
  const ua = String(userAgent ?? '').toLowerCase().trim();
  if (!ua) return 'unknown';

  if (AI_MARKS.some((mark) => ua.includes(mark))) return 'ai';
  if (SEARCH_MARKS.some((mark) => ua.includes(mark))) return 'search';
  if (GENERIC_BOT_MARKS.some((mark) => ua.includes(mark))) return 'unknown';

  // 사람이라고 부르려면 브라우저 표식이 있어야 한다. 없으면 모르는 것이다 —
  // 모르는 것을 사람 쪽에 넣기 시작하면 공개한 수 전체가 못 믿을 것이 된다.
  if (BROWSER_MARKS.some((mark) => ua.includes(mark))) return 'human';
  return 'unknown';
}

/** 화면에 뭐라고 적을지. 코드 이름을 그대로 내보내지 않는다. */
export const VISITOR_KIND_LABEL: Record<VisitorKind, string> = {
  human: '사람',
  search: '검색엔진',
  ai: 'AI',
  unknown: '알 수 없음',
};
