/**
 * 밖에서 찾아보는 손 — **모르는 걸 그 자리에서 찾아본다.**
 *
 * 뉴로사마가 매 방송에서 쓰는 게 이것이다(검색 기록이 만든 사람 로그에 남을 만큼 자주).
 * 우리 얘는 손이 하나뿐이었고(적어 둔 것 보기), 모르는 게 나오면 「나도 잘 모르는데…」로
 * 넘겼다 — 14회차에 회피로 잡아냈던 그 벽의 절반은 **알 방법이 없어서**였다.
 *
 * 규칙 셋:
 * - **읽기만 한다.** 검색과 페이지 읽기뿐이다. 밖에 뭔가를 보내거나 바꾸지 않는다.
 * - **열쇠가 필요 없어야 한다.** 키를 받아 두면 그게 만료되는 날 조용히 손이 죽는다.
 *   DuckDuckGo 의 html 판은 키 없이 답한다.
 * - **못 찾으면 못 찾았다고 한다.** 빈손으로 돌아오면 두뇌가 지어낸다(「made-up」에서
 *   이미 본 실패다).
 */

/** 검색 결과 한 줄. */
export interface 찾은것 {
  제목: string;
  주소: string;
  요약: string;
}

export interface WebSearchOptions {
  /** 몇 개까지. */
  몇개?: number;
  /** 이 시간 안에 못 받으면 포기 — 곁에 있는 존재가 검색 때문에 굳으면 안 된다. */
  기다림ms?: number;
  /** 시험에서 갈아끼운다. */
  가져오기?: (url: string, signal: AbortSignal) => Promise<string>;
  log?: (message: string) => void;
}

const 기본가져오기 = async (url: string, signal: AbortSignal): Promise<string> => {
  const res = await fetch(url, {
    signal,
    headers: {
      // 사람이 쓰는 브라우저처럼 보여야 답을 준다. 거짓 정보를 담지는 않는다.
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) companion/0.1',
      'accept-language': 'ko,en;q=0.8',
    },
  });
  if (res.ok === false) throw new Error(`HTTP ${res.status}`);
  return await res.text();
};

/** 태그를 걷어내고 사람이 읽는 글만 남긴다. */
export function 글만(html: string): string {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * DuckDuckGo html 판에서 결과를 뽑는다.
 *
 * 남의 화면 생김새에 기대는 일이라 언젠가 어긋난다. 그래서 **못 뽑으면 빈 배열**이고,
 * 부르는 쪽이 「못 찾았다」고 말한다 — 조용히 그럴듯한 걸 지어내는 것보다 낫다.
 */
export function 결과뽑기(html: string, 몇개 = 5): 찾은것[] {
  const 나온것: 찾은것[] = [];
  const 덩이 = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,600}?)(?=<a[^>]+class="[^"]*result__a|$)/g;
  let m: RegExpExecArray | null;
  while ((m = 덩이.exec(html)) !== null && 나온것.length < 몇개) {
    const 제목 = 글만(m[2] ?? '');
    if (제목 === '') continue;
    const 요약칸 = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(m[3] ?? '');
    나온것.push({
      제목,
      주소: 주소풀기(m[1] ?? ''),
      요약: 글만(요약칸?.[1] ?? '').slice(0, 200),
    });
  }
  return 나온것;
}

/** DuckDuckGo 가 감싸 둔 주소를 원래대로. 못 풀면 온 그대로 둔다. */
export function 주소풀기(raw: string): string {
  try {
    const 안쪽 = /[?&]uddg=([^&]+)/.exec(raw);
    if (안쪽 !== null) return decodeURIComponent(안쪽[1] as string);
  } catch {
    // 못 풀면 원래 것을 쓴다
  }
  return raw.startsWith('//') ? `https:${raw}` : raw;
}

/** 검색해서 사람이 읽는 글로 돌려준다. 못 찾으면 그렇게 말한다. */
export async function 웹에서찾기(무엇: string, options: WebSearchOptions = {}): Promise<string> {
  const 물음 = 무엇.trim();
  if (물음 === '') return '무엇을 찾을지 안 왔다.';

  const 몇개 = options.몇개 ?? 5;
  const 기다림 = options.기다림ms ?? 8000;
  const 가져오기 = options.가져오기 ?? 기본가져오기;
  const controller = new AbortController();
  const 시계 = setTimeout(() => controller.abort(), 기다림);
  try {
    const html = await 가져오기(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(물음)}`,
      controller.signal,
    );
    const 것들 = 결과뽑기(html, 몇개);
    if (것들.length === 0) {
      options.log?.(`「${물음}」 — 찾은 게 없다 (결과를 못 뽑았을 수도)`);
      return `「${물음}」 으로는 못 찾았다.`;
    }
    options.log?.(`「${물음}」 — ${것들.length}개 찾았다`);
    return 것들.map((r, i) => `${i + 1}. ${r.제목}\n   ${r.요약}\n   ${r.주소}`).join('\n');
  } catch (e) {
    const 왜 = e instanceof Error && e.name === 'AbortError' ? `${기다림 / 1000}초 안에 답이 없었다` : String(e);
    options.log?.(`「${물음}」 — 못 찾았다: ${왜}`);
    return `못 찾았다 (${왜}).`;
  } finally {
    clearTimeout(시계);
  }
}

/** 주소 하나를 열어 글만 읽어 온다. */
export async function 읽어오기(주소: string, options: WebSearchOptions & { 몇자?: number } = {}): Promise<string> {
  const 곳 = 주소.trim();
  if (/^https?:\/\//.test(곳) === false) return '주소가 아니다 (http 로 시작해야 한다).';

  const 기다림 = options.기다림ms ?? 8000;
  const 가져오기 = options.가져오기 ?? 기본가져오기;
  const controller = new AbortController();
  const 시계 = setTimeout(() => controller.abort(), 기다림);
  try {
    const html = await 가져오기(곳, controller.signal);
    // 대본·모양자는 글이 아니다 — 걷어내야 읽을 게 남는다.
    const 본문 = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const 글 = 글만(본문).slice(0, options.몇자 ?? 1500);
    return 글 === '' ? '읽을 게 없다.' : 글;
  } catch (e) {
    const 왜 = e instanceof Error && e.name === 'AbortError' ? `${기다림 / 1000}초 안에 답이 없었다` : String(e);
    return `못 열었다 (${왜}).`;
  } finally {
    clearTimeout(시계);
  }
}
